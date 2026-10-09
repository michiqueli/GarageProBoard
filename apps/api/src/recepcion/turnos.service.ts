import type { EstadoTurno } from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull, lt, sql } from '@gpb/db'
import {
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

type Codigo = 'NO_ENCONTRADO' | 'TURNO_CERRADO' | 'RANGO_INVALIDO'

export class ErrorTurnos extends Error {
  constructor(readonly codigo: Codigo) {
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
      return { datos: await completar(tx, filas) }
    })
  }

  crear(entrada: EntradaTurno) {
    return this.datos.transaccion(async (tx, sesion) => {
      await verificar(tx, sesion, entrada)
      const [creado] = await tx
        .insert(turno)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          ...valores(entrada),
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
      const [cambiado] = await tx
        .update(turno)
        .set({ ...valores(entrada), actualizadoEn: new Date() })
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
  }))
}
