import { contrato } from '@gpb/contracts'
import {
  armarServices,
  claveDeService,
  erroresDeFilas,
  type FilaImportacion,
  hayProblemas,
  type ProblemasDeFila,
} from '@gpb/core'
import { and, asc, count, type Db, eq, ilike, inArray, isNull, ne, or, sql } from '@gpb/db'
import { repuesto, serviceCatalogo, serviceCatalogoItem } from '@gpb/db/schema'
import { Controller, Inject, Injectable, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'

type Codigo = 'NO_ENCONTRADO' | 'DUPLICADO' | 'REPUESTO_INVALIDO' | 'FILAS_INVALIDAS'

class ErrorServices extends Error {
  constructor(readonly codigo: Codigo) {
    super(codigo)
  }
}

interface RenglonEntrada {
  tipo: 'trabajo' | 'repuesto'
  repuestoId?: string | null | undefined
  codigo?: string | null | undefined
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: number
  minutos?: number | null | undefined
}

interface DatosService {
  marca: string | null
  modelo: string | null
  nombre: string
  kilometros?: number | null | undefined
  renglones: RenglonEntrada[]
}

/**
 * El catálogo de services. Sin baja: uno que no se usa más se apaga. Importar es todo o nada, y
 * vuelve a validar aunque el preview haya dado bien: el navegador puede mentir y la base pudo
 * cambiar desde que se armó.
 */
@Injectable()
export class ServicioCatalogoServices {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    marca?: string | undefined
    estado: 'activos' | 'todos'
  }) {
    return this.datos.transaccion(async (tx) => {
      const texto = filtro.buscar?.trim()
      const donde = and(
        filtro.estado === 'activos' ? eq(serviceCatalogo.activo, true) : undefined,
        filtro.marca
          ? or(
              isNull(serviceCatalogo.marca),
              sql`lower(${serviceCatalogo.marca}) = lower(${filtro.marca})`,
            )
          : undefined,
        texto
          ? or(
              ilike(serviceCatalogo.nombre, `%${texto}%`),
              ilike(serviceCatalogo.marca, `%${texto}%`),
              ilike(serviceCatalogo.modelo, `%${texto}%`),
            )
          : undefined,
      )
      const [total] = await tx.select({ n: count() }).from(serviceCatalogo).where(donde)
      const filas = await tx
        .select()
        .from(serviceCatalogo)
        .where(donde)
        // Los de la marca primero: el genérico es el último recurso.
        .orderBy(
          sql`${serviceCatalogo.marca} is null`,
          asc(serviceCatalogo.marca),
          asc(serviceCatalogo.modelo),
          sql`${serviceCatalogo.kilometros} nulls last`,
          asc(serviceCatalogo.nombre),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina)
      return { total: total?.n ?? 0, datos: await this.resumenes(tx, filas) }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.armarFicha(tx, id))
  }

  crear(d: DatosService, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.controlar(tx, d, null)
      const [s] = await tx
        .insert(serviceCatalogo)
        .values({
          tenantId: sesion.tenantId,
          marca: d.marca,
          modelo: d.modelo,
          nombre: d.nombre,
          kilometros: d.kilometros ?? null,
        })
        .returning({ id: serviceCatalogo.id })
      const id = s?.id as string
      await this.guardarRenglones(tx, sesion, id, d.renglones)
      await this.anotar(tx, sesion, id, 'alta', `Cargó el service «${d.nombre}»`, ip)
      return this.armarFicha(tx, id)
    })
  }

  editar(id: string, d: DatosService & { activo: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.controlar(tx, d, id)
      const cambiados = await tx
        .update(serviceCatalogo)
        .set({
          marca: d.marca,
          modelo: d.modelo,
          nombre: d.nombre,
          kilometros: d.kilometros ?? null,
          activo: d.activo,
          actualizadoEn: new Date(),
        })
        .where(eq(serviceCatalogo.id, id))
        .returning({ id: serviceCatalogo.id })
      if (!cambiados.length) throw new ErrorServices('NO_ENCONTRADO')
      await tx.delete(serviceCatalogoItem).where(eq(serviceCatalogoItem.serviceId, id))
      await this.guardarRenglones(tx, sesion, id, d.renglones)
      await this.anotar(tx, sesion, id, 'modificacion', `Modificó el service «${d.nombre}»`, ip)
      return this.armarFicha(tx, id)
    })
  }

  previsualizar(filas: FilaImportacion[]) {
    return this.datos.transaccion(async (tx) => {
      const a = await this.analizar(tx, filas)
      return {
        filas: filas.map((_, i) => ({ errores: a.errores[i] ?? {}, avisos: a.avisos[i] ?? {} })),
        services: a.services.map((s) => ({
          marca: s.marca,
          modelo: s.modelo,
          nombre: s.nombre,
          accion: a.existentes.has(claveDeService(s.marca, s.modelo, s.nombre))
            ? ('reemplaza' as const)
            : ('nuevo' as const),
          trabajos: s.renglones.filter((r) => r.tipo === 'trabajo').length,
          repuestos: s.renglones.filter((r) => r.tipo === 'repuesto').length,
          minutos: s.renglones.reduce((total, r) => total + (r.minutos ?? 0), 0),
        })),
      }
    })
  }

  importar(filas: FilaImportacion[], ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const a = await this.analizar(tx, filas)
      if (hayProblemas(a.errores)) throw new ErrorServices('FILAS_INVALIDAS')

      let creados = 0
      let reemplazados = 0
      for (const s of a.services) {
        const existente = a.existentes.get(claveDeService(s.marca, s.modelo, s.nombre))
        let id: string
        if (existente) {
          id = existente
          reemplazados++
          await tx
            .update(serviceCatalogo)
            .set({ kilometros: s.kilometros, activo: true, actualizadoEn: new Date() })
            .where(eq(serviceCatalogo.id, id))
          await tx.delete(serviceCatalogoItem).where(eq(serviceCatalogoItem.serviceId, id))
        } else {
          creados++
          const [nuevo] = await tx
            .insert(serviceCatalogo)
            .values({
              tenantId: sesion.tenantId,
              marca: s.marca,
              modelo: s.modelo,
              nombre: s.nombre,
              kilometros: s.kilometros,
            })
            .returning({ id: serviceCatalogo.id })
          id = nuevo?.id as string
        }
        await this.guardarRenglones(
          tx,
          sesion,
          id,
          s.renglones.map((r) => {
            const pieza =
              r.tipo === 'repuesto' && r.codigo
                ? a.repuestos.get(r.codigo.toUpperCase())
                : undefined
            return {
              tipo: r.tipo,
              repuestoId: pieza?.id ?? null,
              codigo: pieza?.codigo ?? r.codigo,
              descripcion: r.descripcion || (pieza?.descripcion as string),
              cantidad: r.cantidad,
              precioUnitario: r.precio ?? '0',
              codigoAlicuota: pieza?.codigoAlicuota ?? 5,
              minutos: r.minutos,
            }
          }),
        )
        await auditar(tx, sesion, {
          tabla: 'service_catalogo',
          registroId: id,
          accion: existente ? 'modificacion' : 'alta',
          despues: { texto: `Importó el service «${s.nombre}» de una planilla` },
          ip,
        })
      }
      return { creados, reemplazados }
    })
  }

  /** Los errores de formato, más lo que sólo se sabe mirando la base. */
  private async analizar(tx: Db, filas: FilaImportacion[]) {
    const errores: ProblemasDeFila[] = erroresDeFilas(filas)
    const avisos: ProblemasDeFila[] = filas.map(() => ({}))

    const codigos = [...new Set(filas.map((f) => f.codigo.trim().toUpperCase()).filter(Boolean))]
    const piezas = codigos.length
      ? await tx.select().from(repuesto).where(inArray(repuesto.codigo, codigos))
      : []
    const repuestos = new Map(piezas.map((p) => [p.codigo, p]))

    filas.forEach((f, i) => {
      const error = errores[i] as ProblemasDeFila
      const aviso = avisos[i] as ProblemasDeFila
      const esRepuesto = /^(repuesto|pieza|r)$/i.test(f.tipo.trim())
      if (esRepuesto && !error.tipo) {
        const codigo = f.codigo.trim().toUpperCase()
        const pieza = codigo ? repuestos.get(codigo) : undefined
        if (!codigo) aviso.codigo = 'Sin código: se carga como texto y no descuenta stock'
        else if (!pieza && !f.descripcion.trim()) {
          error.codigo = 'Ese código no está en repuestos: corregilo o escribí la descripción'
        } else if (!pieza) aviso.codigo = 'No está en repuestos: se carga como texto'
        else if (f.precio.trim()) aviso.precio = 'Va el precio de repuestos, el de ese día'
      } else if (!esRepuesto && !error.tipo && !f.minutos.trim()) {
        aviso.minutos = 'Sin tiempo: no se va a poder comparar con el real'
      }
    })

    const actuales = await tx
      .select({
        id: serviceCatalogo.id,
        marca: serviceCatalogo.marca,
        modelo: serviceCatalogo.modelo,
        nombre: serviceCatalogo.nombre,
      })
      .from(serviceCatalogo)
    const existentes = new Map(
      actuales.map((s) => [claveDeService(s.marca, s.modelo, s.nombre), s.id]),
    )

    return { errores, avisos, repuestos, existentes, services: armarServices(filas, errores) }
  }

  private async controlar(tx: Db, d: DatosService, propio: string | null) {
    const [repetido] = await tx
      .select({ id: serviceCatalogo.id })
      .from(serviceCatalogo)
      .where(
        and(
          propio ? ne(serviceCatalogo.id, propio) : undefined,
          sql`lower(coalesce(${serviceCatalogo.marca}, '')) = lower(${d.marca ?? ''})`,
          sql`lower(coalesce(${serviceCatalogo.modelo}, '')) = lower(${d.modelo ?? ''})`,
          sql`lower(${serviceCatalogo.nombre}) = lower(${d.nombre})`,
        ),
      )
    if (repetido) throw new ErrorServices('DUPLICADO')

    const ids = [...new Set(d.renglones.map((r) => r.repuestoId).filter(Boolean))] as string[]
    if (ids.length) {
      const hallados = await tx
        .select({ id: repuesto.id })
        .from(repuesto)
        .where(inArray(repuesto.id, ids))
      if (hallados.length !== ids.length) throw new ErrorServices('REPUESTO_INVALIDO')
    }
  }

  private async guardarRenglones(
    tx: Db,
    sesion: Sesion,
    serviceId: string,
    renglones: RenglonEntrada[],
  ) {
    await tx.insert(serviceCatalogoItem).values(
      renglones.map((r, n) => ({
        tenantId: sesion.tenantId,
        serviceId,
        orden: n + 1,
        tipo: r.tipo,
        repuestoId: r.repuestoId ?? null,
        codigo: r.codigo ?? null,
        descripcion: r.descripcion,
        cantidad: r.cantidad,
        precioUnitario: r.precioUnitario,
        codigoAlicuota: r.codigoAlicuota,
        minutos: r.tipo === 'trabajo' ? (r.minutos ?? null) : null,
      })),
    )
  }

  private anotar(
    tx: Db,
    sesion: Sesion,
    id: string,
    accion: 'alta' | 'modificacion',
    texto: string,
    ip?: string,
  ) {
    return auditar(tx, sesion, {
      tabla: 'service_catalogo',
      registroId: id,
      accion,
      despues: { texto },
      ip,
    })
  }

  private async resumenes(tx: Db, filas: Array<typeof serviceCatalogo.$inferSelect>) {
    const ids = filas.map((s) => s.id)
    const cuentas = ids.length
      ? await tx
          .select({
            serviceId: serviceCatalogoItem.serviceId,
            trabajos: sql<number>`count(*) filter (where ${serviceCatalogoItem.tipo} = 'trabajo')::int`,
            repuestos: sql<number>`count(*) filter (where ${serviceCatalogoItem.tipo} = 'repuesto')::int`,
            minutos: sql<number>`coalesce(sum(${serviceCatalogoItem.minutos}), 0)::int`,
          })
          .from(serviceCatalogoItem)
          .where(inArray(serviceCatalogoItem.serviceId, ids))
          .groupBy(serviceCatalogoItem.serviceId)
      : []
    return filas.map((s) => {
      const c = cuentas.find((x) => x.serviceId === s.id)
      return {
        id: s.id,
        marca: s.marca,
        modelo: s.modelo,
        nombre: s.nombre,
        kilometros: s.kilometros,
        activo: s.activo,
        trabajos: c?.trabajos ?? 0,
        repuestos: c?.repuestos ?? 0,
        minutos: c?.minutos ?? 0,
      }
    })
  }

  private async armarFicha(tx: Db, id: string) {
    const [s] = await tx.select().from(serviceCatalogo).where(eq(serviceCatalogo.id, id))
    if (!s) throw new ErrorServices('NO_ENCONTRADO')
    const [resumen] = await this.resumenes(tx, [s])
    const renglones = await tx
      .select({ r: serviceCatalogoItem, pieza: repuesto })
      .from(serviceCatalogoItem)
      .leftJoin(repuesto, eq(repuesto.id, serviceCatalogoItem.repuestoId))
      .where(eq(serviceCatalogoItem.serviceId, id))
      .orderBy(asc(serviceCatalogoItem.orden))
    return {
      ...(resumen as NonNullable<typeof resumen>),
      renglones: renglones.map(({ r, pieza }) => ({
        id: r.id,
        tipo: r.tipo as 'trabajo' | 'repuesto',
        repuestoId: r.repuestoId,
        codigo: pieza?.codigo ?? r.codigo,
        descripcion: r.descripcion,
        cantidad: r.cantidad,
        precioUnitario: pieza?.precioVenta ?? r.precioUnitario,
        codigoAlicuota: pieza?.codigoAlicuota ?? r.codigoAlicuota,
        minutos: r.minutos,
      })),
    }
  }
}

const c = contrato.services

function traducir(e: unknown, errors: object): never {
  if (e instanceof ErrorServices) {
    const crear = (errors as Record<string, (() => Error) | undefined>)[e.codigo]
    if (crear) throw crear()
  }
  throw e
}

@Controller()
export class ControladorCatalogoServices {
  constructor(
    @Inject(ServicioCatalogoServices) private readonly servicio: ServicioCatalogoServices,
  ) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.ficha)
  ficha() {
    return implement(c.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(c.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input, errors }) =>
      this.servicio.editar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.previsualizar)
  previsualizar() {
    return implement(c.previsualizar).handler(({ input }) =>
      this.servicio.previsualizar(input.filas),
    )
  }

  @Operacion(c.importar)
  importar(@Req() pedido: FastifyRequest) {
    return implement(c.importar).handler(({ input, errors }) =>
      this.servicio.importar(input.filas, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
