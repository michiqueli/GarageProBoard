import { LETRA_VISITA, type MotivoVisita, numeroVisita } from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull, notInArray, or, sql } from '@gpb/db'
import {
  empleado,
  entidadComercial,
  turno,
  usuario,
  vehiculo,
  visita,
  visitaSecuencia,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { diaArgentino } from '../fichaje/fichaje.service.ts'

type Codigo = 'NO_ENCONTRADA' | 'NO_ENCONTRADO' | 'YA_CERRADA' | 'YA_LA_TIENE' | 'NO_ES_RECEPTOR'

export class ErrorRecepcion extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

type Fila = typeof visita.$inferSelect

/**
 * Los puestos a los que no se les deriva a nadie desde la puerta: trabajan en el piso, y
 * ofrecerlos alarga la lista con treinta mecánicos que nadie va a elegir.
 */
const NO_RECIBEN = ['mecanico', 'lavador', 'chofer']

/** «Jorge Pérez», o la razón social si no tiene nombre de persona. */
export function nombreDe(e: {
  nombre: string | null
  apellido: string | null
  razonSocial: string
}) {
  return `${e.nombre ?? ''} ${e.apellido ?? ''}`.trim() || e.razonSocial
}

export interface EntradaVisita {
  motivo: MotivoVisita
  entidadId?: string | null | undefined
  nombre?: string | null | undefined
  telefono?: string | null | undefined
  derivadaA?: string | null | undefined
  nota?: string | null | undefined
}

/**
 * La puerta de la concesionaria: quién llegó, a quién se le derivó, quién lo atiende y cómo
 * terminó. Todo en la sucursal en la que está parado quien pide.
 */
@Injectable()
export class ServicioRecepcion {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  hoy() {
    return this.datos.transaccion(async (tx, sesion) => {
      const filas = await tx
        .select()
        .from(visita)
        .where(and(eq(visita.sucursalId, sesion.sucursalId), eq(visita.fecha, diaArgentino())))
        .orderBy(asc(visita.llegoEn))
      return { datos: await conNombres(tx, filas) }
    })
  }

  /**
   * Las abiertas de hoy que le derivaron —a su legajo— o que agarró. Una cuenta sin legajo
   * sólo tiene las que agarró: a ella no se le puede derivar nada.
   */
  mias() {
    return this.datos.transaccion(async (tx, sesion) => {
      const [yo] = await tx
        .select({ empleadoId: usuario.empleadoId })
        .from(usuario)
        .where(eq(usuario.id, sesion.usuarioId))
      const filas = await tx
        .select()
        .from(visita)
        .where(
          and(
            eq(visita.sucursalId, sesion.sucursalId),
            eq(visita.fecha, diaArgentino()),
            isNull(visita.cerradaEn),
            yo?.empleadoId
              ? or(eq(visita.derivadaA, yo.empleadoId), eq(visita.atendidaPor, sesion.usuarioId))
              : eq(visita.atendidaPor, sesion.usuarioId),
          ),
        )
        .orderBy(asc(visita.llegoEn))
      return { datos: await conNombres(tx, filas) }
    })
  }

  receptores() {
    return this.datos.transaccion(async (tx, sesion) => ({
      datos: await receptoresDe(tx, sesion),
    }))
  }

  anotar(entrada: EntradaVisita) {
    return this.datos.transaccion(async (tx, sesion) =>
      una(tx, await nuevaVisita(tx, sesion, entrada)),
    )
  }

  derivar(id: string, derivadaA: string | null) {
    return this.datos.transaccion(async (tx, sesion) => {
      const v = await abierta(tx, id)
      if (derivadaA) await verificarReceptor(tx, sesion, derivadaA)
      const [cambiada] = await tx
        .update(visita)
        .set({ derivadaA, actualizadoEn: new Date() })
        .where(eq(visita.id, v.id))
        .returning()
      return una(tx, cambiada ?? v)
    })
  }

  /**
   * Agarrarla. Si ya la tiene otro, no se la saca: dos tablets que tocan el mismo auto a la
   * vez no lo reciben dos veces. Si ya la tiene quien pide, no pasa nada —un segundo toque
   * no le cambia la hora en que empezó—.
   */
  atender(id: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const v = await abierta(tx, id)
      if (v.atendidaPor === sesion.usuarioId) return una(tx, v)
      if (v.atendidaPor) {
        const [quien] = await tx
          .select({ nombre: usuario.nombre, apellido: usuario.apellido })
          .from(usuario)
          .where(eq(usuario.id, v.atendidaPor))
        throw new ErrorRecepcion('YA_LA_TIENE', {
          nombre: quien ? `${quien.nombre} ${quien.apellido}`.trim() : 'otra persona',
        })
      }
      const [cambiada] = await tx
        .update(visita)
        .set({ atendidaPor: sesion.usuarioId, atendidaEn: new Date(), actualizadoEn: new Date() })
        .where(eq(visita.id, v.id))
        .returning()
      return una(tx, cambiada ?? v)
    })
  }

  /** Devolverla a la cola. La espera se sigue contando desde que llegó, no desde ahora. */
  soltar(id: string) {
    return this.datos.transaccion(async (tx) => {
      const v = await abierta(tx, id)
      const [cambiada] = await tx
        .update(visita)
        .set({ atendidaPor: null, atendidaEn: null, actualizadoEn: new Date() })
        .where(eq(visita.id, v.id))
        .returning()
      return una(tx, cambiada ?? v)
    })
  }

  /**
   * Terminarla. Cerrar como atendida una que nadie había agarrado la deja a nombre de quien la
   * cierra: es la recepcionista que resolvió la consulta en el mostrador, y esa espera también
   * terminó en ese momento.
   */
  cerrar(id: string, resultado: 'atendida' | 'se_fue', nota: string | null | undefined) {
    return this.datos.transaccion(async (tx, sesion) => {
      const v = await abierta(tx, id)
      const ahora = new Date()
      const sinAtender = resultado === 'atendida' && !v.atendidaEn
      const [cambiada] = await tx
        .update(visita)
        .set({
          resultado,
          cerradaEn: ahora,
          ...(sinAtender ? { atendidaPor: sesion.usuarioId, atendidaEn: ahora } : {}),
          ...(nota !== undefined ? { nota } : {}),
          actualizadoEn: ahora,
        })
        .where(eq(visita.id, v.id))
        .returning()
      return una(tx, cambiada ?? v)
    })
  }
}

/**
 * Anota una visita con el número siguiente de su letra en el día. La usan la puerta y el turno
 * que llega, que es la misma visita con el turno al lado.
 */
export async function nuevaVisita(
  tx: Db,
  sesion: Sesion,
  entrada: EntradaVisita & { turnoId?: string | null },
): Promise<Fila> {
  let { nombre, telefono } = entrada
  if (entrada.entidadId) {
    const [quien] = await tx
      .select()
      .from(entidadComercial)
      .where(eq(entidadComercial.id, entrada.entidadId))
    if (!quien) throw new ErrorRecepcion('NO_ENCONTRADO')
    // Lo que dijo manda; lo que no dijo sale de su ficha.
    nombre = nombre || nombreDe(quien)
    telefono = telefono || quien.telefono
  }
  if (entrada.derivadaA) await verificarReceptor(tx, sesion, entrada.derivadaA)

  const fecha = diaArgentino()
  const letra = LETRA_VISITA[entrada.motivo]
  // El siguiente de la letra en el día, atómico: dos anotadas a la vez no comparten número.
  const [secuencia] = await tx
    .insert(visitaSecuencia)
    .values({ tenantId: sesion.tenantId, sucursalId: sesion.sucursalId, fecha, letra, ultimo: 1 })
    .onConflictDoUpdate({
      target: [visitaSecuencia.sucursalId, visitaSecuencia.fecha, visitaSecuencia.letra],
      set: { ultimo: sql`${visitaSecuencia.ultimo} + 1` },
    })
    .returning({ ultimo: visitaSecuencia.ultimo })
  if (!secuencia) throw new Error('No se pudo numerar la visita.')

  const [creada] = await tx
    .insert(visita)
    .values({
      tenantId: sesion.tenantId,
      sucursalId: sesion.sucursalId,
      fecha,
      letra,
      numero: secuencia.ultimo,
      origen: 'recepcion',
      motivo: entrada.motivo,
      entidadId: entrada.entidadId ?? null,
      nombre: nombre ?? null,
      telefono: telefono ?? null,
      derivadaA: entrada.derivadaA ?? null,
      turnoId: entrada.turnoId ?? null,
      nota: entrada.nota ?? null,
      creadaPor: sesion.usuarioId,
    })
    .returning()
  if (!creada) throw new Error('No se pudo anotar la visita.')
  return creada
}

/** La visita para cambiarla, trabada hasta el final de la transacción. */
async function abierta(tx: Db, id: string): Promise<Fila> {
  const [v] = await tx.select().from(visita).where(eq(visita.id, id)).for('update')
  if (!v) throw new ErrorRecepcion('NO_ENCONTRADA')
  if (v.cerradaEn) throw new ErrorRecepcion('YA_CERRADA')
  return v
}

async function receptoresDe(tx: Db, sesion: Sesion) {
  const filas = await tx
    .select({
      id: empleado.id,
      puesto: empleado.puesto,
      nombre: entidadComercial.nombre,
      apellido: entidadComercial.apellido,
      razonSocial: entidadComercial.razonSocial,
      usuarioId: usuario.id,
    })
    .from(empleado)
    .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
    .leftJoin(usuario, and(eq(usuario.empleadoId, empleado.id), eq(usuario.activo, true)))
    .where(
      and(
        eq(empleado.activo, true),
        notInArray(empleado.puesto, NO_RECIBEN),
        // Sin sucursal es que trabaja en todas.
        or(isNull(empleado.sucursalId), eq(empleado.sucursalId, sesion.sucursalId)),
      ),
    )
  return filas
    .map((f) => ({
      id: f.id,
      nombre: nombreDe(f),
      puesto: f.puesto as never,
      conUsuario: f.usuarioId !== null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function verificarReceptor(tx: Db, sesion: Sesion, id: string) {
  const posibles = await receptoresDe(tx, sesion)
  if (!posibles.some((p) => p.id === id)) throw new ErrorRecepcion('NO_ES_RECEPTOR')
}

export async function una(tx: Db, fila: Fila) {
  const [v] = await conNombres(tx, [fila])
  if (!v) throw new Error('No se pudo leer la visita.')
  return v
}

/** Las visitas como las ve la pantalla, con el nombre de quién la tiene y de quién la agarró. */
async function conNombres(tx: Db, filas: Fila[]) {
  const empleados = [...new Set(filas.flatMap((f) => (f.derivadaA ? [f.derivadaA] : [])))]
  const usuarios = [...new Set(filas.flatMap((f) => (f.atendidaPor ? [f.atendidaPor] : [])))]
  const turnos = [...new Set(filas.flatMap((f) => (f.turnoId ? [f.turnoId] : [])))]

  const deTurno = new Map(
    turnos.length
      ? (
          await tx
            .select({
              id: turno.id,
              fechaHora: turno.fechaHora,
              pedido: turno.pedido,
              vehiculoId: turno.vehiculoId,
              // La patente del auto cargado, o la que dijo por teléfono.
              dominio: sql<string | null>`coalesce(${vehiculo.dominio}, ${turno.dominio})`,
            })
            .from(turno)
            .leftJoin(vehiculo, eq(vehiculo.id, turno.vehiculoId))
            .where(inArray(turno.id, turnos))
        ).map((t) => [t.id, { ...t, fechaHora: t.fechaHora.toISOString() }])
      : [],
  )

  const nombresEmpleado = new Map(
    empleados.length
      ? (
          await tx
            .select({
              id: entidadComercial.id,
              nombre: entidadComercial.nombre,
              apellido: entidadComercial.apellido,
              razonSocial: entidadComercial.razonSocial,
            })
            .from(entidadComercial)
            .where(inArray(entidadComercial.id, empleados))
        ).map((e) => [e.id, nombreDe(e)])
      : [],
  )
  const nombresUsuario = new Map(
    usuarios.length
      ? (
          await tx
            .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
            .from(usuario)
            .where(inArray(usuario.id, usuarios))
        ).map((u) => [u.id, `${u.nombre} ${u.apellido}`.trim()])
      : [],
  )

  return filas.map((f) => ({
    id: f.id,
    numero: numeroVisita(f.letra, f.numero),
    motivo: f.motivo as MotivoVisita,
    origen: f.origen as 'recepcion' | 'totem',
    entidadId: f.entidadId,
    nombre: f.nombre,
    telefono: f.telefono,
    derivadaA: f.derivadaA
      ? { id: f.derivadaA, nombre: nombresEmpleado.get(f.derivadaA) ?? '' }
      : null,
    atendidaPor: f.atendidaPor
      ? { id: f.atendidaPor, nombre: nombresUsuario.get(f.atendidaPor) ?? '' }
      : null,
    llegoEn: f.llegoEn.toISOString(),
    atendidaEn: f.atendidaEn?.toISOString() ?? null,
    cerradaEn: f.cerradaEn?.toISOString() ?? null,
    resultado: f.resultado as 'atendida' | 'se_fue' | 'orden' | null,
    ordenId: f.ordenId,
    nota: f.nota,
    turno: (f.turnoId && deTurno.get(f.turnoId)) || null,
  }))
}
