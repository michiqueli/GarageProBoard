import { LETRA_TOTEM, type MotivoVisita, numeroVisita } from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull, or, sql } from '@gpb/db'
import { entidadComercial, titularidad, turno, visita, visitaSecuencia } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDeLaEstacion, type Estacion } from '../fichaje/estacion.ts'
import { diaArgentino } from '../fichaje/fichaje.service.ts'
import { nombreDe, verificarReceptor } from './recepcion.service.ts'

export class ErrorTotem extends Error {
  constructor(readonly codigo: 'NO_ES_TOTEM') {
    super(codigo)
  }
}

export interface EntradaTotem {
  id: string
  motivo: MotivoVisita
  documento?: string | null | undefined
  numero: number
  llegoEn: string
}

const ZONA = 'America/Argentina/Buenos_Aires'

/**
 * El tótem de la puerta: el cliente se anota solo. El porqué de sus tres cuidados, en
 * `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * **No devuelve nombres nunca.** Cualquiera puede tipear el documento de otro; si el tótem
 * contestara «Hola, Juan», se enteraría de quién es cliente. La visita sale con la persona y
 * es la recepcionista la que ve el nombre.
 */
@Injectable()
export class ServicioTotem {
  constructor(@Inject(DatosDeLaEstacion) private readonly datos: DatosDeLaEstacion) {}

  estado() {
    return this.datos.transaccion(async (tx, estacion) => {
      soloTotem(estacion)
      const fecha = diaArgentino()
      const [s] = await tx
        .select({ ultimo: visitaSecuencia.ultimo })
        .from(visitaSecuencia)
        .where(
          and(
            eq(visitaSecuencia.sucursalId, estacion.sucursalId),
            eq(visitaSecuencia.fecha, fecha),
            eq(visitaSecuencia.letra, LETRA_TOTEM),
          ),
        )
      return { fecha, ultimo: s?.ultimo ?? 0 }
    })
  }

  anotar(entrada: EntradaTotem) {
    return this.datos.transaccion(async (tx, estacion) => {
      soloTotem(estacion)

      // Ya llegó: es un reintento de cuando no había red. Se contesta lo mismo.
      const [ya] = await tx.select().from(visita).where(eq(visita.id, entrada.id))
      if (ya)
        return {
          numero: numeroVisita(ya.letra, ya.numero),
          turnoHora: await horaDelTurno(tx, ya.turnoId),
        }

      // La hora del tótem, salvo que venga del futuro: un reloj mal puesto no anota mañana.
      const llegoEn = new Date(Math.min(Date.parse(entrada.llegoEn), Date.now()))
      const fecha = diaArgentino(llegoEn)

      const persona = entrada.documento ? await porDocumento(tx, entrada.documento) : null
      const elTurno =
        persona && entrada.motivo === 'servicio' ? await turnoDeHoy(tx, estacion, persona.id) : null

      // El número que dio el tótem, salvo que ya esté: si se le borró la cuenta, el siguiente.
      const [ocupado] = await tx
        .select({ id: visita.id })
        .from(visita)
        .where(
          and(
            eq(visita.sucursalId, estacion.sucursalId),
            eq(visita.fecha, fecha),
            eq(visita.letra, LETRA_TOTEM),
            eq(visita.numero, entrada.numero),
          ),
        )
      const [secuencia] = await tx
        .insert(visitaSecuencia)
        .values({
          tenantId: estacion.tenantId,
          sucursalId: estacion.sucursalId,
          fecha,
          letra: LETRA_TOTEM,
          ultimo: entrada.numero,
        })
        .onConflictDoUpdate({
          target: [visitaSecuencia.sucursalId, visitaSecuencia.fecha, visitaSecuencia.letra],
          set: {
            ultimo: ocupado
              ? sql`${visitaSecuencia.ultimo} + 1`
              : sql`greatest(${visitaSecuencia.ultimo}, ${entrada.numero})`,
          },
        })
        .returning({ ultimo: visitaSecuencia.ultimo })
      const numero = ocupado ? (secuencia?.ultimo ?? entrada.numero) : entrada.numero

      const derivadaA =
        elTurno?.asesorId && (await recibe(tx, estacion, elTurno.asesorId))
          ? elTurno.asesorId
          : null

      await tx.insert(visita).values({
        id: entrada.id,
        tenantId: estacion.tenantId,
        sucursalId: estacion.sucursalId,
        fecha,
        letra: LETRA_TOTEM,
        numero,
        origen: 'totem',
        motivo: entrada.motivo,
        entidadId: persona?.id ?? null,
        nombre: persona ? nombreDe(persona) : null,
        telefono: persona?.telefono ?? null,
        derivadaA,
        turnoId: elTurno?.id ?? null,
        llegoEn,
      })
      if (elTurno) {
        await tx
          .update(turno)
          .set({ estado: 'llego', actualizadoEn: new Date() })
          .where(eq(turno.id, elTurno.id))
      }

      return {
        numero: numeroVisita(LETRA_TOTEM, numero),
        turnoHora: elTurno ? hora(elTurno.fechaHora) : null,
      }
    })
  }
}

function soloTotem(estacion: Estacion) {
  if (estacion.tipo !== 'totem') throw new ErrorTotem('NO_ES_TOTEM')
}

function hora(d: Date) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

async function horaDelTurno(tx: Db, turnoId: string | null) {
  if (!turnoId) return null
  const [t] = await tx
    .select({ fechaHora: turno.fechaHora })
    .from(turno)
    .where(eq(turno.id, turnoId))
  return t ? hora(t.fechaHora) : null
}

/**
 * La persona de un DNI: la que lo tiene como documento, o la que tiene un CUIL o CUIT que lo
 * lleva adentro —los ocho del medio—. Si hay más de una, la primera: el que se equivoca es la
 * recepcionista quien lo corrige, con el nombre adelante.
 */
async function porDocumento(tx: Db, documento: string) {
  const dni = documento.padStart(8, '0')
  const [p] = await tx
    .select()
    .from(entidadComercial)
    .where(
      or(
        and(
          eq(entidadComercial.tipoDocumento, 96),
          inArray(entidadComercial.numeroDocumento, [documento, dni]),
        ),
        and(
          inArray(entidadComercial.tipoDocumento, [80, 86]),
          sql`substring(${entidadComercial.numeroDocumento} from 3 for 8) = ${dni}`,
        ),
      ),
    )
    .orderBy(asc(entidadComercial.creadoEn))
    .limit(1)
  return p ?? null
}

/** El turno agendado de hoy de esa persona: a su nombre, o de un auto del que es titular. */
async function turnoDeHoy(tx: Db, estacion: Estacion, entidadId: string) {
  const autos = tx
    .select({ id: titularidad.vehiculoId })
    .from(titularidad)
    .where(and(eq(titularidad.clienteId, entidadId), isNull(titularidad.hasta)))
  const [t] = await tx
    .select()
    .from(turno)
    .where(
      and(
        eq(turno.sucursalId, estacion.sucursalId),
        eq(turno.estado, 'agendado'),
        sql`(${turno.fechaHora} at time zone ${ZONA})::date = (now() at time zone ${ZONA})::date`,
        or(eq(turno.entidadId, entidadId), inArray(turno.vehiculoId, autos)),
      ),
    )
    .orderBy(asc(turno.fechaHora))
    .limit(1)
    .for('update')
  return t ?? null
}

/** Si el asesor del turno todavía recibe en la sucursal del tótem. */
async function recibe(tx: Db, estacion: Estacion, empleadoId: string) {
  try {
    await verificarReceptor(tx, { sucursalId: estacion.sucursalId } as Sesion, empleadoId)
    return true
  } catch {
    return false
  }
}
