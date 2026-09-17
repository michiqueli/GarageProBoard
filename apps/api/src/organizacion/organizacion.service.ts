import { and, asc, count, type Db, eq, inArray, ne } from '@gpb/db'
import {
  condicionIva,
  empresa,
  provincia,
  puntoVenta,
  sucursal,
  usuario,
  usuarioSucursal,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorOrganizacion extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADA'
      | 'REFERENCIA_INVALIDA'
      | 'CUIT_DUPLICADO'
      | 'PUNTO_VENTA_DUPLICADO'
      | 'SUCURSAL_CON_USUARIOS',
    readonly datos?: { usuarios: string[] },
  ) {
    super(codigo)
  }
}

type Uso = 'facturacion' | 'remito' | 'otro'
type Modo = 'CAE' | 'CAEA'

interface DatosEmpresa {
  razonSocial: string
  nombreFantasia: string | null
  condicionIva: number
  inicioActividades: string | null
  domicilioFiscal: string | null
  provinciaCodigo: number | null
  convenioMultilateral: boolean
  numeroIibb: string | null
}

interface DatosSucursal {
  nombre: string
  domicilio: string | null
  provinciaCodigo: number | null
  localidad: string | null
  telefono: string | null
}

/** Qué índice único saltó, o `null` si el error es otro. */
function indiceDuplicado(error: unknown): string | null {
  let actual = error as { cause?: unknown; code?: string; constraint?: string } | undefined
  while (actual) {
    if (actual.code === '23505') return actual.constraint ?? ''
    actual = actual.cause as typeof actual
  }
  return null
}

/**
 * Razones sociales, sucursales y puntos de venta.
 *
 * Una concesionaria puede tener varias razones sociales —una SAS por sucursal es un caso
 * real— y cada sucursal pertenece a una. Lo que impide que una sucursal facture con el
 * punto de venta de otra razón social no está acá: es una FK compuesta en la base.
 *
 * Nada se borra: las sucursales y los puntos de venta se desactivan. Un comprobante
 * emitido tiene que poder decir desde dónde salió dentro de diez años.
 */
@Injectable()
export class ServicioOrganizacion {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  catalogos() {
    return this.datos.transaccion(async (tx) => ({
      condicionesIva: await tx
        .select({ codigo: condicionIva.codigo, descripcion: condicionIva.descripcion })
        .from(condicionIva)
        .orderBy(asc(condicionIva.codigo)),
      provincias: await tx
        .select({ codigo: provincia.codigo, nombre: provincia.nombre })
        .from(provincia)
        .orderBy(asc(provincia.nombre)),
    }))
  }

  listar() {
    return this.datos.transaccion((tx) => this.armar(tx))
  }

  crearEmpresa(entrada: DatosEmpresa & { cuit: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)

      const [creada] = await tx
        .insert(empresa)
        .values({ tenantId: sesion.tenantId, ...entrada })
        .returning()
        .catch((error: unknown) => {
          if (indiceDuplicado(error) === 'empresa_tenant_cuit_uq') {
            throw new ErrorOrganizacion('CUIT_DUPLICADO')
          }
          throw error
        })
      if (!creada) throw new Error('No se pudo crear la empresa.')

      await this.auditar(tx, sesion, 'empresa', creada.id, 'alta', null, entrada, ip)
      return this.una(tx, creada.id)
    })
  }

  editarEmpresa(id: string, entrada: DatosEmpresa, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await tx.select().from(empresa).where(eq(empresa.id, id)).limit(1)
      if (!antes) throw new ErrorOrganizacion('NO_ENCONTRADA')
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)

      await tx
        .update(empresa)
        .set({ ...entrada, actualizadoEn: new Date() })
        .where(eq(empresa.id, id))

      await this.auditar(
        tx,
        sesion,
        'empresa',
        id,
        'modificacion',
        antes,
        { ...antes, ...entrada },
        ip,
      )
      return this.una(tx, id)
    })
  }

  crearSucursal(empresaId: string, entrada: DatosSucursal, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [duenia] = await tx.select().from(empresa).where(eq(empresa.id, empresaId)).limit(1)
      if (!duenia) throw new ErrorOrganizacion('NO_ENCONTRADA')
      await this.verificarReferencias(tx, null, entrada.provinciaCodigo)

      const [creada] = await tx
        .insert(sucursal)
        .values({ tenantId: sesion.tenantId, empresaId, ...entrada })
        .returning()
      if (!creada) throw new Error('No se pudo crear la sucursal.')

      // Quien la da de alta entra a ella: si no, la acaba de crear y no puede ni abrirla
      // para cargarle los puntos de venta.
      await tx
        .insert(usuarioSucursal)
        .values({ tenantId: sesion.tenantId, usuarioId: sesion.usuarioId, sucursalId: creada.id })

      await this.auditar(
        tx,
        sesion,
        'sucursal',
        creada.id,
        'alta',
        null,
        { ...entrada, empresa: duenia.razonSocial },
        ip,
      )
      return this.una(tx, empresaId)
    })
  }

  editarSucursal(id: string, entrada: DatosSucursal & { activa: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await tx.select().from(sucursal).where(eq(sucursal.id, id)).limit(1)
      if (!antes) throw new ErrorOrganizacion('NO_ENCONTRADA')
      await this.verificarReferencias(tx, null, entrada.provinciaCodigo)

      if (antes.activa && !entrada.activa) {
        const varados = await this.usuariosSoloDe(tx, id)
        if (varados.length > 0) {
          throw new ErrorOrganizacion('SUCURSAL_CON_USUARIOS', { usuarios: varados })
        }
      }

      await tx
        .update(sucursal)
        .set({ ...entrada, actualizadoEn: new Date() })
        .where(eq(sucursal.id, id))

      await this.auditar(
        tx,
        sesion,
        'sucursal',
        id,
        antes.activa && !entrada.activa ? 'baja' : 'modificacion',
        antes,
        { ...antes, ...entrada },
        ip,
      )
      return this.una(tx, antes.empresaId)
    })
  }

  crearPuntoVenta(
    sucursalId: string,
    entrada: { numero: number; uso: Uso; modo: Modo; predeterminado: boolean },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [lugar] = await tx.select().from(sucursal).where(eq(sucursal.id, sucursalId)).limit(1)
      if (!lugar) throw new ErrorOrganizacion('NO_ENCONTRADA')

      if (entrada.predeterminado) await this.desmarcar(tx, sucursalId, entrada.uso)

      const [creado] = await tx
        .insert(puntoVenta)
        .values({
          tenantId: sesion.tenantId,
          // La empresa sale de la sucursal, no del pedido: así no hay forma de pedir un punto
          // de venta de la SAS B para una sucursal de la SAS A.
          empresaId: lugar.empresaId,
          sucursalId,
          ...entrada,
        })
        .returning()
        .catch((error: unknown) => {
          if (indiceDuplicado(error) === 'punto_venta_empresa_numero_uq') {
            throw new ErrorOrganizacion('PUNTO_VENTA_DUPLICADO')
          }
          throw error
        })
      if (!creado) throw new Error('No se pudo crear el punto de venta.')

      await this.auditar(
        tx,
        sesion,
        'punto_venta',
        creado.id,
        'alta',
        null,
        { ...entrada, sucursal: lugar.nombre },
        ip,
      )
      return this.una(tx, lugar.empresaId)
    })
  }

  editarPuntoVenta(
    id: string,
    entrada: { uso: Uso; modo: Modo; predeterminado: boolean; activo: boolean },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await tx.select().from(puntoVenta).where(eq(puntoVenta.id, id)).limit(1)
      if (!antes) throw new ErrorOrganizacion('NO_ENCONTRADA')

      // Uno desactivado no puede ser el que toma la sucursal para facturar.
      const predeterminado = entrada.activo && entrada.predeterminado
      if (predeterminado) await this.desmarcar(tx, antes.sucursalId, entrada.uso, id)

      await tx
        .update(puntoVenta)
        .set({ ...entrada, predeterminado, actualizadoEn: new Date() })
        .where(eq(puntoVenta.id, id))

      await this.auditar(
        tx,
        sesion,
        'punto_venta',
        id,
        antes.activo && !entrada.activo ? 'baja' : 'modificacion',
        antes,
        { ...antes, ...entrada, predeterminado },
        ip,
      )
      return this.una(tx, antes.empresaId)
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /** Deja a la sucursal sin predeterminado para ese uso, salvo el que se está marcando. */
  private async desmarcar(tx: Db, sucursalId: string, uso: Uso, excepto?: string) {
    await tx
      .update(puntoVenta)
      .set({ predeterminado: false, actualizadoEn: new Date() })
      .where(
        and(
          eq(puntoVenta.sucursalId, sucursalId),
          eq(puntoVenta.uso, uso),
          eq(puntoVenta.predeterminado, true),
          ...(excepto ? [ne(puntoVenta.id, excepto)] : []),
        ),
      )
  }

  /** Los usuarios activos que no entran a ninguna otra sucursal activa. */
  private async usuariosSoloDe(tx: Db, sucursalId: string): Promise<string[]> {
    const deEsta = await tx
      .select({ id: usuario.id, email: usuario.email })
      .from(usuarioSucursal)
      .innerJoin(usuario, eq(usuario.id, usuarioSucursal.usuarioId))
      .where(and(eq(usuarioSucursal.sucursalId, sucursalId), eq(usuario.activo, true)))
    if (deEsta.length === 0) return []

    const conOtra = await tx
      .select({ usuarioId: usuarioSucursal.usuarioId })
      .from(usuarioSucursal)
      .innerJoin(sucursal, eq(sucursal.id, usuarioSucursal.sucursalId))
      .where(
        and(
          inArray(
            usuarioSucursal.usuarioId,
            deEsta.map((u) => u.id),
          ),
          ne(usuarioSucursal.sucursalId, sucursalId),
          eq(sucursal.activa, true),
        ),
      )
    const tienenOtra = new Set(conOtra.map((c) => c.usuarioId))
    return deEsta.filter((u) => !tienenOtra.has(u.id)).map((u) => u.email)
  }

  private async verificarReferencias(
    tx: Db,
    condicion: number | null,
    provinciaCodigo: number | null,
  ) {
    if (condicion !== null) {
      const [existe] = await tx
        .select({ codigo: condicionIva.codigo })
        .from(condicionIva)
        .where(eq(condicionIva.codigo, condicion))
      if (!existe) throw new ErrorOrganizacion('REFERENCIA_INVALIDA')
    }
    if (provinciaCodigo !== null) {
      const [existe] = await tx
        .select({ codigo: provincia.codigo })
        .from(provincia)
        .where(eq(provincia.codigo, provinciaCodigo))
      if (!existe) throw new ErrorOrganizacion('REFERENCIA_INVALIDA')
    }
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    tabla: 'empresa' | 'sucursal' | 'punto_venta',
    registroId: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosAntes: unknown,
    datosDespues: unknown,
    ip?: string,
  ) {
    await auditar(tx, sesion, {
      tabla,
      registroId,
      accion,
      antes: datosAntes,
      despues: datosDespues,
      ip,
    })
  }

  private async una(tx: Db, empresaId: string) {
    const [encontrada] = await this.armar(tx, empresaId)
    if (!encontrada) throw new ErrorOrganizacion('NO_ENCONTRADA')
    return encontrada
  }

  /** Cada empresa con sus sucursales, y cada sucursal con sus puntos de venta. */
  private async armar(tx: Db, soloEmpresa?: string) {
    const empresas = await tx
      .select()
      .from(empresa)
      .where(soloEmpresa ? eq(empresa.id, soloEmpresa) : undefined)
      .orderBy(asc(empresa.razonSocial))
    if (empresas.length === 0) return []
    const ids = empresas.map((e) => e.id)

    const sucursales = await tx
      .select()
      .from(sucursal)
      .where(inArray(sucursal.empresaId, ids))
      .orderBy(asc(sucursal.nombre))
    const puntos = await tx
      .select()
      .from(puntoVenta)
      .where(inArray(puntoVenta.empresaId, ids))
      .orderBy(asc(puntoVenta.numero))
    const usuarios = sucursales.length
      ? await tx
          .select({ sucursalId: usuarioSucursal.sucursalId, cantidad: count() })
          .from(usuarioSucursal)
          .where(
            inArray(
              usuarioSucursal.sucursalId,
              sucursales.map((s) => s.id),
            ),
          )
          .groupBy(usuarioSucursal.sucursalId)
      : []

    return empresas.map((e) => ({
      id: e.id,
      razonSocial: e.razonSocial,
      nombreFantasia: e.nombreFantasia,
      cuit: e.cuit,
      condicionIva: e.condicionIva,
      inicioActividades: e.inicioActividades,
      domicilioFiscal: e.domicilioFiscal,
      provinciaCodigo: e.provinciaCodigo,
      convenioMultilateral: e.convenioMultilateral,
      numeroIibb: e.numeroIibb,
      sucursales: sucursales
        .filter((s) => s.empresaId === e.id)
        .map((s) => ({
          id: s.id,
          nombre: s.nombre,
          domicilio: s.domicilio,
          provinciaCodigo: s.provinciaCodigo,
          localidad: s.localidad,
          telefono: s.telefono,
          activa: s.activa,
          usuarios: usuarios.find((u) => u.sucursalId === s.id)?.cantidad ?? 0,
          puntosVenta: puntos
            .filter((p) => p.sucursalId === s.id)
            .map((p) => ({
              id: p.id,
              numero: p.numero,
              uso: p.uso as Uso,
              modo: p.modo as Modo,
              predeterminado: p.predeterminado,
              activo: p.activo,
            })),
        })),
    }))
  }
}
