import type { EstadoTurno } from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull, lt, sql } from '@gpb/db'
import {
  agendaCupo,
  empleado,
  entidadComercial,
  marca,
  modelo,
  titularidad,
  turno,
  vehiculo,
  visita,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { nombreDe, nuevaVisita, una, verificarReceptor } from './recepcion.service.ts'

type Codigo = 'NO_ENCONTRADO' | 'TURNO_CERRADO' | 'RANGO_INVALIDO' | 'FRANJA_LLENA'

export class ErrorTurnos extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: { desde: string; hasta: string; cupo: number; ocupados: number },
  ) {
    super(codigo)
  }
}

type Fila = typeof turno.$inferSelect

export interface EntradaTurno {
  fechaHora: string
  vehiculoId?: string | null | undefined
  dominio?: string | null | undefined
  entidadId?: string | null | undefined
  nombre?: string | null | undefined
  telefono?: string | null | undefined
  pedido: string
  asesorId?: string | null | undefined
  sobreturno?: boolean | undefined
}

const ZONA = 'America/Argentina/Buenos_Aires'

/** Las 0 hs de un día de Argentina, como instante. */
const inicioDelDia = (dia: string) => sql`(${dia}::date::timestamp at time zone ${ZONA})`

/** Cuántos días se pueden pedir de una vez: seis semanas, que es lo que muestra un mes. */
const MAXIMO_DIAS = 42

/**
 * La agenda del taller: quién va a venir, cuándo y a qué. El porqué, en
 * `docs/tecnicos/recepcion-y-turnos.md`.
 */
@Injectable()
export class ServicioTurnos {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(desde: string, hasta: string) {
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000
    if (!(dias >= 0 && dias < MAXIMO_DIAS)) throw new ErrorTurnos('RANGO_INVALIDO')

    return this.datos.transaccion(async (tx, sesion) => {
      // Los de días pasados que nadie marcó como llegados no vinieron. Colgado del pedido y no
      // de un proceso nocturno, como el auto-cierre del fichaje: RLS no deja a un proceso
      // recorrer todas las concesionarias, y el que mira la agenda es el que lo necesita.
      await tx
        .update(turno)
        .set({ estado: 'ausente', actualizadoEn: new Date() })
        .where(
          and(
            eq(turno.sucursalId, sesion.sucursalId),
            eq(turno.estado, 'agendado'),
            lt(
              turno.fechaHora,
              sql`(date_trunc('day', now() at time zone ${ZONA}) at time zone ${ZONA})`,
            ),
          ),
        )

      const filas = await tx
        .select()
        .from(turno)
        .where(
          and(
            eq(turno.sucursalId, sesion.sucursalId),
            sql`${turno.fechaHora} >= ${inicioDelDia(desde)}`,
            sql`${turno.fechaHora} < (${inicioDelDia(hasta)} + interval '1 day')`,
          ),
        )
        .orderBy(asc(turno.fechaHora), asc(turno.creadoEn))
      return { datos: await completar(tx, filas), cupo: await cupoDe(tx, sesion.sucursalId) }
    })
  }

  crear(entrada: EntradaTurno) {
    return this.datos.transaccion(async (tx, sesion) => {
      await verificar(tx, sesion, entrada)
      const sobreturno = await enFranjaLlena(tx, sesion, entrada)
      const [creado] = await tx
        .insert(turno)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          ...valores(entrada),
          sobreturno,
          creadoPor: sesion.usuarioId,
        })
        .returning()
      if (!creado) throw new Error('No se pudo agendar el turno.')
      return uno(tx, creado)
    })
  }

  editar(id: string, entrada: EntradaTurno) {
    return this.datos.transaccion(async (tx, sesion) => {
      await agendado(tx, id)
      await verificar(tx, sesion, entrada)
      const sobreturno = await enFranjaLlena(tx, sesion, entrada, id)
      const [cambiado] = await tx
        .update(turno)
        .set({ ...valores(entrada), sobreturno, actualizadoEn: new Date() })
        .where(eq(turno.id, id))
        .returning()
      if (!cambiado) throw new ErrorTurnos('NO_ENCONTRADO')
      return uno(tx, cambiado)
    })
  }

  cancelar(id: string) {
    return this.cambiarEstado(id, 'cancelado')
  }

  noVino(id: string) {
    return this.cambiarEstado(id, 'ausente')
  }

  /**
   * Llegó: se anota como visita de servicio y entra a la cola de las tablets. Va con el
   * nombre que se dio al agendar o, si no se dio, con el del titular del auto.
   */
  llego(id: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const t = await agendado(tx, id)
      let { nombre, telefono } = t
      if (!nombre && !t.entidadId && t.vehiculoId) {
        const [titular] = await tx
          .select({
            nombre: entidadComercial.nombre,
            apellido: entidadComercial.apellido,
            razonSocial: entidadComercial.razonSocial,
            telefono: entidadComercial.telefono,
          })
          .from(titularidad)
          .innerJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
          .where(and(eq(titularidad.vehiculoId, t.vehiculoId), isNull(titularidad.hasta)))
        if (titular) {
          nombre = nombreDe(titular)
          telefono = telefono || titular.telefono
        }
      }
      const nueva = await nuevaVisita(tx, sesion, {
        motivo: 'servicio',
        entidadId: t.entidadId,
        nombre,
        telefono,
        // Si el asesor ya no recibe —se fue, cambió de sucursal—, llega igual, sin asignar.
        derivadaA: t.asesorId && (await recibe(tx, sesion, t.asesorId)) ? t.asesorId : null,
        turnoId: t.id,
      })
      await tx
        .update(turno)
        .set({ estado: 'llego', actualizadoEn: new Date() })
        .where(eq(turno.id, t.id))
      return una(tx, nueva)
    })
  }

  /** El cupo de la sucursal en la que se está. Pisa el que había: es uno por sucursal. */
  fijarCupo(entrada: { minutosFranja: 15 | 30 | 60 | 120; cupo: number }) {
    return this.datos.transaccion(async (tx, sesion) => {
      await tx
        .insert(agendaCupo)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          minutosFranja: entrada.minutosFranja,
          cupo: entrada.cupo,
          actualizadoPor: sesion.usuarioId,
        })
        .onConflictDoUpdate({
          target: [agendaCupo.tenantId, agendaCupo.sucursalId],
          set: {
            minutosFranja: entrada.minutosFranja,
            cupo: entrada.cupo,
            actualizadoPor: sesion.usuarioId,
            actualizadoEn: new Date(),
          },
        })
      return entrada
    })
  }

  quitarCupo() {
    return this.datos.transaccion(async (tx, sesion) => {
      await tx.delete(agendaCupo).where(eq(agendaCupo.sucursalId, sesion.sucursalId))
      return { hecho: true as const }
    })
  }

  private cambiarEstado(id: string, estado: EstadoTurno) {
    return this.datos.transaccion(async (tx) => {
      await agendado(tx, id)
      const [cambiado] = await tx
        .update(turno)
        .set({ estado, actualizadoEn: new Date() })
        .where(eq(turno.id, id))
        .returning()
      if (!cambiado) throw new ErrorTurnos('NO_ENCONTRADO')
      return uno(tx, cambiado)
    })
  }
}

async function recibe(tx: Db, sesion: Sesion, empleadoId: string) {
  try {
    await verificarReceptor(tx, sesion, empleadoId)
    return true
  } catch {
    return false
  }
}

function valores(e: EntradaTurno) {
  return {
    fechaHora: new Date(e.fechaHora),
    vehiculoId: e.vehiculoId ?? null,
    dominio: e.dominio ? e.dominio.toUpperCase().replace(/\s+/g, '') : null,
    entidadId: e.entidadId ?? null,
    nombre: e.nombre ?? null,
    telefono: e.telefono ?? null,
    pedido: e.pedido,
    asesorId: e.asesorId ?? null,
  }
}

/** Que lo que se nombra exista, y que el asesor pedido reciba en esta sucursal. */
async function verificar(tx: Db, sesion: Sesion, e: EntradaTurno) {
  if (e.vehiculoId) {
    const [v] = await tx
      .select({ id: vehiculo.id })
      .from(vehiculo)
      .where(eq(vehiculo.id, e.vehiculoId))
    if (!v) throw new ErrorTurnos('NO_ENCONTRADO')
  }
  if (e.entidadId) {
    const [p] = await tx
      .select({ id: entidadComercial.id })
      .from(entidadComercial)
      .where(eq(entidadComercial.id, e.entidadId))
    if (!p) throw new ErrorTurnos('NO_ENCONTRADO')
  }
  if (e.asesorId) await verificarReceptor(tx, sesion, e.asesorId)
}

/** El turno para cambiarlo, trabado, y sólo si todavía está agendado. */
async function agendado(tx: Db, id: string): Promise<Fila> {
  const [t] = await tx.select().from(turno).where(eq(turno.id, id)).for('update')
  if (!t) throw new ErrorTurnos('NO_ENCONTRADO')
  if (t.estado !== 'agendado') throw new ErrorTurnos('TURNO_CERRADO')
  return t
}

async function uno(tx: Db, fila: Fila) {
  const [t] = await completar(tx, [fila])
  if (!t) throw new Error('No se pudo leer el turno.')
  return t
}

/** Los turnos como los ve la agenda: el auto con su nombre, el asesor y la visita. */
async function completar(tx: Db, filas: Fila[]) {
  const autos = [...new Set(filas.flatMap((f) => (f.vehiculoId ? [f.vehiculoId] : [])))]
  const asesores = [...new Set(filas.flatMap((f) => (f.asesorId ? [f.asesorId] : [])))]
  const ids = filas.map((f) => f.id)

  const deAuto = new Map(
    autos.length
      ? (
          await tx
            .select({
              id: vehiculo.id,
              dominio: vehiculo.dominio,
              chasis: vehiculo.chasis,
              marca: marca.nombre,
              modelo: modelo.nombre,
            })
            .from(vehiculo)
            .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
            .leftJoin(marca, eq(marca.id, modelo.marcaId))
            .where(inArray(vehiculo.id, autos))
        ).map((v) => [
          v.id,
          {
            id: v.id,
            dominio: v.dominio,
            descripcion: [v.marca, v.modelo].filter(Boolean).join(' ') || v.chasis,
          },
        ])
      : [],
  )
  const deAsesor = new Map(
    asesores.length
      ? (
          await tx
            .select({
              id: empleado.id,
              nombre: entidadComercial.nombre,
              apellido: entidadComercial.apellido,
              razonSocial: entidadComercial.razonSocial,
            })
            .from(empleado)
            .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
            .where(inArray(empleado.id, asesores))
        ).map((a) => [a.id, { id: a.id, nombre: nombreDe(a) }])
      : [],
  )
  const deVisita = new Map(
    ids.length
      ? (
          await tx
            .select({ id: visita.id, turnoId: visita.turnoId })
            .from(visita)
            .where(inArray(visita.turnoId, ids))
        ).map((v) => [v.turnoId, v.id])
      : [],
  )

  return filas.map((f) => ({
    id: f.id,
    fechaHora: f.fechaHora.toISOString(),
    estado: f.estado as EstadoTurno,
    pedido: f.pedido,
    entidadId: f.entidadId,
    nombre: f.nombre,
    telefono: f.telefono,
    vehiculo: (f.vehiculoId && deAuto.get(f.vehiculoId)) || null,
    dominio: f.dominio,
    asesor: (f.asesorId && deAsesor.get(f.asesorId)) || null,
    visitaId: deVisita.get(f.id) ?? null,
    sobreturno: f.sobreturno,
  }))
}

/** El cupo de la agenda de la sucursal, o `null` si no tiene. */
async function cupoDe(tx: Db, sucursalId: string) {
  const [c] = await tx
    .select({ minutosFranja: agendaCupo.minutosFranja, cupo: agendaCupo.cupo })
    .from(agendaCupo)
    .where(eq(agendaCupo.sucursalId, sucursalId))
  return c ? { minutosFranja: c.minutosFranja as 15 | 30 | 60 | 120, cupo: c.cupo } : null
}

/**
 * Si el turno cae en una franja llena. Llena y sin pedir sobreturno, es un error que dice cuál
 * franja y cuántos tiene: el que atiende decide. Llena y pedido, el turno queda marcado.
 *
 * La franja se calcula en la hora de Argentina: la de las 10 a las 10:30 es la de las 10 del
 * taller, no la de las 13 del servidor. `editando` es el turno que se mueve, que no se cuenta a
 * sí mismo.
 */
async function enFranjaLlena(
  tx: Db,
  sesion: Sesion,
  e: EntradaTurno,
  editando?: string,
): Promise<boolean> {
  const cupo = await cupoDe(tx, sesion.sucursalId)
  if (!cupo) return false

  const franja = sql`date_bin(${`${cupo.minutosFranja} minutes`}::interval, ${new Date(e.fechaHora)}::timestamptz at time zone ${ZONA}, '2000-01-01')`
  const [fila] = await tx
    .select({
      ocupados: sql<number>`count(*)::int`,
      desde: sql<string>`to_char(${franja}, 'HH24:MI')`,
      hasta: sql<string>`to_char(${franja} + ${`${cupo.minutosFranja} minutes`}::interval, 'HH24:MI')`,
    })
    .from(turno)
    .where(
      and(
        eq(turno.sucursalId, sesion.sucursalId),
        inArray(turno.estado, ['agendado', 'llego']),
        editando ? sql`${turno.id} <> ${editando}` : undefined,
        sql`date_bin(${`${cupo.minutosFranja} minutes`}::interval, ${turno.fechaHora} at time zone ${ZONA}, '2000-01-01') = ${franja}`,
      ),
    )
  const ocupados = fila?.ocupados ?? 0
  if (ocupados < cupo.cupo) return false
  if (!e.sobreturno) {
    throw new ErrorTurnos('FRANJA_LLENA', {
      desde: fila?.desde ?? '',
      hasta: fila?.hasta ?? '',
      cupo: cupo.cupo,
      ocupados,
    })
  }
  return true
}
