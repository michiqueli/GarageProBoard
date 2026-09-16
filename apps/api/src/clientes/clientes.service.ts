import { and, asc, count, type Db, eq, ilike, or, sql } from '@gpb/db'
import {
  auditoria,
  cliente,
  condicionIva,
  entidadComercial,
  proveedor,
  provincia,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorClientes extends Error {
  constructor(
    readonly codigo: 'NO_ENCONTRADO' | 'REFERENCIA_INVALIDA' | 'CLIENTE_DUPLICADO',
    readonly datos?: { id: string; razonSocial: string },
  ) {
    super(codigo)
  }
}

type CondicionIibb = 'local' | 'convenio' | 'exento' | 'no_inscripto'

interface DatosCliente {
  razonSocial: string
  condicionIva: number
  domicilio: string | null
  provinciaCodigo: number | null
  localidad: string | null
  codigoPostal: string | null
  email: string | null
  telefono: string | null
  numeroIibb: string | null
  condicionIibb: CondicionIibb
  observaciones: string | null
}

/** Lo que va a la identidad fiscal compartida, y lo que es sólo del rol de cliente. */
function separar({ observaciones, ...identidad }: DatosCliente) {
  return { identidad, observaciones }
}

/**
 * Persona jurídica o física, por el prefijo del CUIT. 30, 33 y 34 son de sociedades; 20,
 * 23, 24 y 27, de personas. Un DNI o un CUIL es siempre una persona.
 */
export function tipoPersonaDe(tipoDocumento: number, numero: string): 'fisica' | 'juridica' {
  if (tipoDocumento !== 80) return 'fisica'
  return ['30', '33', '34'].includes(numero.slice(0, 2)) ? 'juridica' : 'fisica'
}

/**
 * Los clientes de la concesionaria.
 *
 * Un cliente es un **rol** de una identidad fiscal, no una ficha propia. Si el mismo CUIT
 * ya está cargado como proveedor, el alta no lo duplica: le agrega el rol. Con dos fichas,
 * el domicilio fiscal se desincroniza en silencio y la administración pierde la
 * compensación de saldos entre lo que debe y lo que le deben.
 *
 * Nada se borra: un cliente se desactiva. Tiene comprobantes que se guardan diez años.
 */
@Injectable()
export class ServicioClientes {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(entrada: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: 'activos' | 'todos'
  }) {
    return this.datos.transaccion(async (tx) => {
      const texto = entrada.buscar?.trim()
      // «30-71234567-1» y «30712345671» son el mismo; y un DNI se encuentra adentro del CUIL.
      const digitos = texto?.replace(/[\s.-]/g, '')
      const filtro = and(
        entrada.estado === 'activos' ? eq(cliente.activo, true) : undefined,
        texto
          ? or(
              ilike(entidadComercial.razonSocial, `%${texto}%`),
              digitos && /^[0-9]+$/.test(digitos)
                ? ilike(entidadComercial.numeroDocumento, `%${digitos}%`)
                : undefined,
            )
          : undefined,
      )

      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(cliente)
        .innerJoin(entidadComercial, eq(entidadComercial.id, cliente.id))
        .where(filtro)

      const filas = await this.consulta(tx)
        .where(filtro)
        .orderBy(asc(entidadComercial.razonSocial))
        .limit(entrada.porPagina)
        .offset((entrada.pagina - 1) * entrada.porPagina)

      return { datos: filas.map(aSalida), total }
    })
  }

  crear(entrada: DatosCliente & { tipoDocumento: number; numeroDocumento: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)
      const { tipoDocumento, numeroDocumento, ...resto } = entrada
      const { identidad, observaciones } = separar(resto)

      const [existente] = await tx
        .select()
        .from(entidadComercial)
        .where(
          and(
            eq(entidadComercial.tipoDocumento, tipoDocumento),
            eq(entidadComercial.numeroDocumento, numeroDocumento),
          ),
        )
        .limit(1)

      let id: string
      if (existente) {
        // Ya existe la identidad —como proveedor, o como empleado—: se le suma el rol, con
        // los datos que se acaban de revisar.
        id = existente.id
        await tx
          .update(entidadComercial)
          .set({ ...identidad, actualizadoEn: new Date() })
          .where(eq(entidadComercial.id, id))
      } else {
        const [creada] = await tx
          .insert(entidadComercial)
          .values({
            tenantId: sesion.tenantId,
            tipoDocumento,
            numeroDocumento,
            tipoPersona: tipoPersonaDe(tipoDocumento, numeroDocumento),
            ...identidad,
          })
          // Dos altas del mismo documento a la vez: la segunda se entera abajo, al ver que
          // el rol de cliente ya está.
          .onConflictDoNothing()
          .returning({ id: entidadComercial.id })
        id = creada?.id ?? (await this.idPorDocumento(tx, tipoDocumento, numeroDocumento))
      }

      const [rol] = await tx
        .insert(cliente)
        .values({ id, tenantId: sesion.tenantId, observaciones })
        .onConflictDoNothing()
        .returning({ id: cliente.id })
      if (!rol) {
        throw new ErrorClientes('CLIENTE_DUPLICADO', {
          id,
          razonSocial: existente?.razonSocial ?? identidad.razonSocial,
        })
      }

      await this.auditar(
        tx,
        sesion,
        id,
        'alta',
        existente ? fotoIdentidad(existente) : null,
        {
          tipoDocumento,
          numeroDocumento,
          ...identidad,
          observaciones,
          yaExistia: Boolean(existente),
        },
        ip,
      )
      return this.uno(tx, id)
    })
  }

  editar(id: string, entrada: DatosCliente & { activo: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await this.consulta(tx).where(eq(cliente.id, id)).limit(1)
      if (!antes) throw new ErrorClientes('NO_ENCONTRADO')
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)

      const { activo, ...datos } = entrada
      const { identidad, observaciones } = separar(datos)

      await tx
        .update(entidadComercial)
        .set({ ...identidad, actualizadoEn: new Date() })
        .where(eq(entidadComercial.id, id))
      await tx.update(cliente).set({ observaciones, activo }).where(eq(cliente.id, id))

      const previo = aSalida(antes)
      await this.auditar(
        tx,
        sesion,
        id,
        previo.activo && !activo ? 'baja' : 'modificacion',
        previo,
        { ...previo, ...entrada },
        ip,
      )
      return this.uno(tx, id)
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private consulta(tx: Db) {
    return tx
      .select({
        entidad: entidadComercial,
        observaciones: cliente.observaciones,
        activo: cliente.activo,
        esProveedor: sql<boolean>`${proveedor.id} is not null`,
      })
      .from(cliente)
      .innerJoin(entidadComercial, eq(entidadComercial.id, cliente.id))
      .leftJoin(proveedor, eq(proveedor.id, cliente.id))
      .$dynamic()
  }

  private async uno(tx: Db, id: string) {
    const [fila] = await this.consulta(tx).where(eq(cliente.id, id)).limit(1)
    if (!fila) throw new ErrorClientes('NO_ENCONTRADO')
    return aSalida(fila)
  }

  private async idPorDocumento(tx: Db, tipoDocumento: number, numeroDocumento: string) {
    const [fila] = await tx
      .select({ id: entidadComercial.id })
      .from(entidadComercial)
      .where(
        and(
          eq(entidadComercial.tipoDocumento, tipoDocumento),
          eq(entidadComercial.numeroDocumento, numeroDocumento),
        ),
      )
      .limit(1)
    if (!fila) throw new Error('No se pudo crear la identidad fiscal del cliente.')
    return fila.id
  }

  private async verificarReferencias(tx: Db, condicion: number, provinciaCodigo: number | null) {
    const [iva] = await tx
      .select({ codigo: condicionIva.codigo })
      .from(condicionIva)
      .where(eq(condicionIva.codigo, condicion))
    if (!iva) throw new ErrorClientes('REFERENCIA_INVALIDA')
    if (provinciaCodigo !== null) {
      const [existe] = await tx
        .select({ codigo: provincia.codigo })
        .from(provincia)
        .where(eq(provincia.codigo, provinciaCodigo))
      if (!existe) throw new ErrorClientes('REFERENCIA_INVALIDA')
    }
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    registroId: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosAntes: unknown,
    datosDespues: unknown,
    ip?: string,
  ) {
    await tx.insert(auditoria).values({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: 'cliente',
      registroId,
      accion,
      datosAntes,
      datosDespues,
      ip: ip ?? null,
    })
  }
}

type Entidad = typeof entidadComercial.$inferSelect

function fotoIdentidad(e: Entidad) {
  return {
    razonSocial: e.razonSocial,
    condicionIva: e.condicionIva,
    domicilio: e.domicilio,
    provinciaCodigo: e.provinciaCodigo,
    localidad: e.localidad,
    codigoPostal: e.codigoPostal,
    email: e.email,
    telefono: e.telefono,
    numeroIibb: e.numeroIibb,
    condicionIibb: e.condicionIibb,
  }
}

function aSalida(fila: {
  entidad: Entidad
  observaciones: string | null
  activo: boolean
  esProveedor: boolean
}) {
  const e = fila.entidad
  return {
    id: e.id,
    tipoDocumento: e.tipoDocumento,
    numeroDocumento: e.numeroDocumento,
    tipoPersona: e.tipoPersona as 'fisica' | 'juridica',
    ...fotoIdentidad(e),
    condicionIibb: e.condicionIibb as CondicionIibb,
    observaciones: fila.observaciones,
    activo: fila.activo,
    esProveedor: fila.esProveedor,
  }
}
