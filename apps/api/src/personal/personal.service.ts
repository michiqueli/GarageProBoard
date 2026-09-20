import type { Puesto } from '@gpb/contracts'
import { and, asc, count, type Db, eq, ilike, inArray, isNotNull, isNull, or, sql } from '@gpb/db'
import { credencial, empleado, empresa, entidadComercial, sucursal, usuario } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { generarCodigoQr } from '../comun/qr.ts'

export class ErrorPersonal extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADO'
      | 'REFERENCIA_INVALIDA'
      | 'LEGAJO_DUPLICADO'
      | 'EMPLEADO_DUPLICADO'
      | 'EMPLEADO_INACTIVO'
      | 'FALTA_MOTIVO'
      | 'SIN_CREDENCIAL'
      | 'NINGUNA_VIGENTE',
    readonly datos?: Record<string, string>,
  ) {
    super(codigo)
  }
}

/**
 * Consumidor final. Un empleado no nos factura: su identidad fiscal existe para tenerlo
 * identificado con su CUIL, que es lo que va a pedir la liquidación de sueldos.
 */
const CONSUMIDOR_FINAL = 5

interface DatosEmpleado {
  nombre: string
  apellido: string
  legajo: string
  puesto: Puesto
  sucursalId: string | null
  convenio: string | null
  categoria: string | null
  fechaIngreso: string | null
  email: string | null
  telefono: string | null
}

/** «Pérez, Jorge»: la denominación de una persona física, como la escribe AFIP. */
function razonSocialDe(apellido: string, nombre: string): string {
  return `${apellido.trim()}, ${nombre.trim()}`
}

/**
 * El personal de la concesionaria.
 *
 * Un empleado es un **rol** de una identidad fiscal, igual que un cliente o un proveedor: el
 * mecánico que le compra un usado a la concesionaria es la misma persona y el mismo CUIL, y
 * con dos fichas el domicilio se desincroniza en silencio.
 *
 * Lo que vive acá y no en `usuario` es la parte que no depende de entrar al sistema: **la
 * mayoría de los que fichan no tienen cuenta**. El que además entra tiene su `usuario`
 * apuntando a este mismo empleado, y es lo que hace que «mis órdenes» signifique una sola
 * cosa.
 *
 * Nada se borra: un empleado se da de baja y su credencial se revoca. Su trabajo quedó en
 * órdenes que se guardan diez años.
 */
@Injectable()
export class ServicioPersonal {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(entrada: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: 'activos' | 'todos'
    puesto?: Puesto | undefined
    credencial: 'todos' | 'con' | 'sin'
  }) {
    return this.datos.transaccion(async (tx) => {
      const texto = entrada.buscar?.trim()
      const digitos = texto?.replace(/[\s.-]/g, '')
      const filtro = and(
        entrada.estado === 'activos' ? eq(empleado.activo, true) : undefined,
        entrada.puesto ? eq(empleado.puesto, entrada.puesto) : undefined,
        entrada.credencial === 'con' ? isNotNull(credencial.id) : undefined,
        entrada.credencial === 'sin' ? isNull(credencial.id) : undefined,
        texto
          ? or(
              ilike(entidadComercial.razonSocial, `%${texto}%`),
              ilike(empleado.legajo, `%${texto}%`),
              digitos && /^[0-9]+$/.test(digitos)
                ? ilike(entidadComercial.numeroDocumento, `%${digitos}%`)
                : undefined,
            )
          : undefined,
      )

      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(empleado)
        .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
        .leftJoin(credencial, this.credencialVigente())
        .where(filtro)

      const filas = await this.consulta(tx)
        .where(filtro)
        .orderBy(asc(entidadComercial.razonSocial))
        .limit(entrada.porPagina)
        .offset((entrada.pagina - 1) * entrada.porPagina)

      return { datos: filas.map(aSalida), total }
    })
  }

  opciones() {
    return this.datos.transaccion(async (tx) => {
      const sucursales = await tx
        .select({ id: sucursal.id, nombre: sucursal.nombre })
        .from(sucursal)
        .orderBy(asc(sucursal.nombre))
      return { sucursales }
    })
  }

  crear(entrada: DatosEmpleado & { tipoDocumento: number; numeroDocumento: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { tipoDocumento, numeroDocumento, ...resto } = entrada
      await this.verificarSucursal(tx, resto.sucursalId)
      await this.verificarLegajo(tx, resto.legajo, null)

      const razonSocial = razonSocialDe(resto.apellido, resto.nombre)
      const identidad = {
        razonSocial,
        nombre: resto.nombre,
        apellido: resto.apellido,
        email: resto.email,
        telefono: resto.telefono,
      }

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
        // Ya está cargado como cliente o como proveedor: se le suma el rol de empleado en
        // vez de duplicar el CUIL.
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
            tipoPersona: 'fisica',
            condicionIva: CONSUMIDOR_FINAL,
            ...identidad,
          })
          .onConflictDoNothing()
          .returning({ id: entidadComercial.id })
        id = creada?.id ?? (await this.idPorDocumento(tx, tipoDocumento, numeroDocumento))
      }

      const [rol] = await tx
        .insert(empleado)
        .values({
          id,
          tenantId: sesion.tenantId,
          legajo: resto.legajo,
          puesto: resto.puesto,
          sucursalId: resto.sucursalId,
          convenio: resto.convenio,
          categoria: resto.categoria,
          fechaIngreso: resto.fechaIngreso,
        })
        .onConflictDoNothing()
        .returning({ id: empleado.id })

      if (!rol) {
        const [ya] = await tx
          .select({ legajo: empleado.legajo })
          .from(empleado)
          .where(eq(empleado.id, id))
          .limit(1)
        throw new ErrorPersonal('EMPLEADO_DUPLICADO', {
          id,
          razonSocial: existente?.razonSocial ?? razonSocial,
          legajo: ya?.legajo ?? '',
        })
      }

      await auditar(tx, sesion, {
        tabla: 'empleado',
        registroId: id,
        accion: 'alta',
        despues: {
          texto: `Lo dio de alta con el legajo ${resto.legajo}, como ${resto.puesto}`,
          legajo: resto.legajo,
          puesto: resto.puesto,
          razonSocial,
        },
        ip,
      })

      return this.uno(tx, id)
    })
  }

  editar(
    id: string,
    entrada: DatosEmpleado & { activo: boolean; fechaEgreso: string | null },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const antes = await this.uno(tx, id)
      await this.verificarSucursal(tx, entrada.sucursalId)
      await this.verificarLegajo(tx, entrada.legajo, id)

      const razonSocial = razonSocialDe(entrada.apellido, entrada.nombre)
      await tx
        .update(entidadComercial)
        .set({
          razonSocial,
          nombre: entrada.nombre,
          apellido: entrada.apellido,
          email: entrada.email,
          telefono: entrada.telefono,
          actualizadoEn: new Date(),
        })
        .where(eq(entidadComercial.id, id))

      await tx
        .update(empleado)
        .set({
          legajo: entrada.legajo,
          puesto: entrada.puesto,
          sucursalId: entrada.sucursalId,
          convenio: entrada.convenio,
          categoria: entrada.categoria,
          fechaIngreso: entrada.fechaIngreso,
          fechaEgreso: entrada.fechaEgreso,
          activo: entrada.activo,
        })
        .where(eq(empleado.id, id))

      const daDeBaja = antes.activo && !entrada.activo
      // El que se fue no tiene que poder fichar el lunes. No es una cortesía de la pantalla:
      // si la baja no revocara, la tarjeta sigue abriendo sesiones de trabajo a su nombre.
      if (daDeBaja && antes.credencial) {
        await this.revocarVigente(tx, id, 'Dado de baja')
      }

      await auditar(tx, sesion, {
        tabla: 'empleado',
        registroId: id,
        accion: daDeBaja ? 'baja' : 'modificacion',
        antes: { legajo: antes.legajo, puesto: antes.puesto, razonSocial: antes.razonSocial },
        despues: {
          texto: daDeBaja
            ? `Lo dio de baja${antes.credencial ? ' y le revocó la credencial' : ''}`
            : 'Modificó su legajo',
          legajo: entrada.legajo,
          puesto: entrada.puesto,
          razonSocial,
        },
        ip,
      })

      return this.uno(tx, id)
    })
  }

  // ── credenciales ────────────────────────────────────────────────────────────

  /**
   * Emitir la credencial. Si ya tenía una vigente, se revoca con el motivo y se emite otra:
   * las dos cosas en la misma transacción, o el índice parcial de «una sola vigente» rebota.
   */
  emitirCredencial(id: string, motivo: string | undefined, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const actual = await this.uno(tx, id)
      if (!actual.activo) throw new ErrorPersonal('EMPLEADO_INACTIVO')
      if (actual.credencial && !motivo?.trim()) throw new ErrorPersonal('FALTA_MOTIVO')

      if (actual.credencial) await this.revocarVigente(tx, id, motivo?.trim() ?? '')

      // El código se guarda pelado: la firma la agrega el servidor al imprimir, así que rotar
      // QR_SECRET es reimprimir tarjetas y no reescribir la tabla.
      const [nueva] = await tx
        .insert(credencial)
        .values({ tenantId: sesion.tenantId, empleadoId: id, codigo: generarCodigoQr() })
        .returning({ id: credencial.id })

      await auditar(tx, sesion, {
        tabla: 'credencial',
        registroId: nueva?.id ?? id,
        accion: 'alta',
        despues: {
          texto: actual.credencial
            ? `Le emitió una credencial nueva a ${actual.razonSocial}: ${motivo?.trim()}`
            : `Le emitió la credencial a ${actual.razonSocial}`,
          empleado: actual.razonSocial,
          legajo: actual.legajo,
        },
        ip,
      })

      return this.uno(tx, id)
    })
  }

  revocarCredencial(id: string, motivo: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const actual = await this.uno(tx, id)
      if (!actual.credencial) throw new ErrorPersonal('SIN_CREDENCIAL')

      await this.revocarVigente(tx, id, motivo)

      await auditar(tx, sesion, {
        tabla: 'credencial',
        registroId: actual.credencial.id,
        accion: 'baja',
        antes: { empleado: actual.razonSocial, legajo: actual.legajo },
        despues: { texto: `Le revocó la credencial a ${actual.razonSocial}: ${motivo}` },
        ip,
      })

      return this.uno(tx, id)
    })
  }

  /**
   * Los datos de las tarjetas a imprimir. Al que no tiene credencial vigente se lo saltea: una
   * tarjeta sin QR termina apoyada contra el lector hasta que alguien se cansa.
   */
  paraImprimir(ids: readonly string[]) {
    return this.datos.transaccion(async (tx) => {
      const filas = await this.consulta(tx)
        .where(and(inArray(empleado.id, [...ids]), isNotNull(credencial.id)))
        .orderBy(asc(entidadComercial.razonSocial))

      if (filas.length === 0) throw new ErrorPersonal('NINGUNA_VIGENTE')

      // El nombre que va en la tarjeta es el de la **concesionaria**, no el de la sucursal: la
      // credencial es de la empresa y se usa en cualquiera de sus bocas.
      const [quienes] = await tx
        .select({ razonSocial: empresa.razonSocial, nombreFantasia: empresa.nombreFantasia })
        .from(empresa)
        .orderBy(asc(empresa.creadoEn))
        .limit(1)

      return {
        concesionaria: quienes?.nombreFantasia ?? quienes?.razonSocial ?? '',
        credenciales: filas.map((f) => ({
          nombre:
            `${f.entidad.nombre ?? ''} ${f.entidad.apellido ?? ''}`.trim() || f.entidad.razonSocial,
          legajo: f.legajo,
          puesto: f.puesto,
          sucursal: f.sucursal,
          // biome-ignore lint/style/noNonNullAssertion: el where exige credencial vigente
          codigo: f.credencialCodigo!,
        })),
      }
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /** La condición del `leftJoin`: sólo la credencial que todavía no se revocó. */
  private credencialVigente() {
    return and(eq(credencial.empleadoId, empleado.id), isNull(credencial.revocadaEn))
  }

  private consulta(tx: Db) {
    return tx
      .select({
        entidad: entidadComercial,
        legajo: empleado.legajo,
        puesto: empleado.puesto,
        sucursalId: empleado.sucursalId,
        sucursal: sucursal.nombre,
        convenio: empleado.convenio,
        categoria: empleado.categoria,
        fechaIngreso: empleado.fechaIngreso,
        fechaEgreso: empleado.fechaEgreso,
        activo: empleado.activo,
        credencialId: credencial.id,
        credencialCodigo: credencial.codigo,
        credencialEmitidaEn: credencial.emitidaEn,
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
      })
      .from(empleado)
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .leftJoin(sucursal, eq(sucursal.id, empleado.sucursalId))
      .leftJoin(credencial, this.credencialVigente())
      .leftJoin(usuario, eq(usuario.empleadoId, empleado.id))
      .$dynamic()
  }

  private async uno(tx: Db, id: string) {
    const [fila] = await this.consulta(tx).where(eq(empleado.id, id)).limit(1)
    if (!fila) throw new ErrorPersonal('NO_ENCONTRADO')
    return aSalida(fila)
  }

  private async revocarVigente(tx: Db, empleadoId: string, motivo: string) {
    await tx
      .update(credencial)
      .set({ revocadaEn: new Date(), motivoRevocacion: motivo || 'Sin motivo anotado' })
      .where(and(eq(credencial.empleadoId, empleadoId), isNull(credencial.revocadaEn)))
  }

  private async verificarSucursal(tx: Db, sucursalId: string | null) {
    if (sucursalId === null) return
    const [existe] = await tx
      .select({ id: sucursal.id })
      .from(sucursal)
      .where(eq(sucursal.id, sucursalId))
      .limit(1)
    if (!existe) throw new ErrorPersonal('REFERENCIA_INVALIDA')
  }

  /**
   * El legajo es único por concesionaria. Se revisa acá y no sólo con el índice porque el
   * error tiene que decir de quién es: «ya lo tiene otro» a secas obliga a buscarlo a mano.
   */
  private async verificarLegajo(tx: Db, legajo: string, exceptoId: string | null) {
    const [choca] = await tx
      .select({ razonSocial: entidadComercial.razonSocial })
      .from(empleado)
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .where(
        and(
          eq(empleado.legajo, legajo),
          exceptoId ? sql`${empleado.id} <> ${exceptoId}` : undefined,
        ),
      )
      .limit(1)
    if (choca) throw new ErrorPersonal('LEGAJO_DUPLICADO', { razonSocial: choca.razonSocial })
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
    if (!fila) throw new Error('No se pudo crear la identidad fiscal del empleado.')
    return fila.id
  }
}

type Fila = {
  entidad: typeof entidadComercial.$inferSelect
  legajo: string
  puesto: string
  sucursalId: string | null
  sucursal: string | null
  convenio: string | null
  categoria: string | null
  fechaIngreso: string | null
  fechaEgreso: string | null
  activo: boolean
  credencialId: string | null
  credencialCodigo: string | null
  credencialEmitidaEn: Date | null
  usuarioId: string | null
  usuarioEmail: string | null
}

function aSalida(f: Fila) {
  return {
    id: f.entidad.id,
    tipoDocumento: f.entidad.tipoDocumento,
    numeroDocumento: f.entidad.numeroDocumento,
    nombre: f.entidad.nombre ?? '',
    apellido: f.entidad.apellido ?? '',
    razonSocial: f.entidad.razonSocial,
    legajo: f.legajo,
    puesto: f.puesto as Puesto,
    sucursalId: f.sucursalId,
    sucursal: f.sucursal,
    convenio: f.convenio,
    categoria: f.categoria,
    fechaIngreso: f.fechaIngreso,
    fechaEgreso: f.fechaEgreso,
    email: f.entidad.email,
    telefono: f.entidad.telefono,
    activo: f.activo,
    credencial:
      f.credencialId && f.credencialCodigo && f.credencialEmitidaEn
        ? {
            id: f.credencialId,
            codigo: f.credencialCodigo,
            emitidaEn: f.credencialEmitidaEn.toISOString(),
          }
        : null,
    usuario: f.usuarioId && f.usuarioEmail ? { id: f.usuarioId, email: f.usuarioEmail } : null,
  }
}
