/**
 * Capa de datos de la demo — estado en memoria.
 *
 * Es la única pieza que sabe de dónde salen los datos. Cuando exista
 * `apps/api`, se reemplaza el cuerpo de estas funciones por `fetch` y ninguna
 * pantalla cambia. Por eso todo devuelve Promise aunque hoy resuelva al toque.
 */

import { holds as holdsIniciales, mechanics, sessions as sesionesIniciales, workOrders } from './fixtures'
import type { Hold, Mechanic, Session, WorkOrder } from './fixtures'
import type { HoldReason } from '@garagetick/shared'

export type { Mechanic, Session, WorkOrder }

let sessions: Session[] = [...sesionesIniciales]
let secuencia = 100

const oyentes = new Set<() => void>()

/** El tablero se refresca solo. En producción esto es el SSE. */
export function suscribir(fn: () => void): () => void {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

function avisar() {
  for (const fn of oyentes) fn()
}

export function listarMecanicos(): Mechanic[] {
  return mechanics
}

export function listarOrdenes(): WorkOrder[] {
  return workOrders
}

export function buscarMecanicoPorCodigo(code: string): Mechanic | undefined {
  return mechanics.find((m) => m.code === code)
}

export function buscarOrdenPorCodigo(code: string): WorkOrder | undefined {
  return workOrders.find((o) => o.code === code)
}

/** Fallback numérico: el mecánico tipea el legajo o el número de OT. */
export function buscarMecanicoPorLegajo(legajo: string): Mechanic | undefined {
  return mechanics.find((m) => m.employeeNumber === legajo)
}

export function buscarOrdenPorNumero(numero: string): WorkOrder | undefined {
  return workOrders.find((o) => o.number === numero)
}

export function sesionesAbiertas(): Session[] {
  return sessions.filter((s) => s.endedAt === null)
}

export function sesionesAbiertasDe(userId: string): Session[] {
  return sessions.filter((s) => s.userId === userId && s.endedAt === null)
}

export function todasLasSesiones(): Session[] {
  return sessions
}

export interface ResultadoFichaje {
  accion: 'abierta' | 'cerrada'
  session: Session
}

/**
 * Idempotente y orden-agnóstico, igual que la regla del kiosco: si el mecánico
 * ya tenía esa OT abierta, la cierra. Si no, la abre.
 */
export function fichar(userId: string, workOrderId: string): ResultadoFichaje {
  const abierta = sessions.find(
    (s) => s.userId === userId && s.workOrderId === workOrderId && s.endedAt === null,
  )

  if (abierta) {
    abierta.endedAt = new Date().toISOString()
    abierta.closedBy = 'mechanic'
    avisar()
    return { accion: 'cerrada', session: abierta }
  }

  // work_order_concurrency = 'single': abrir una cierra la anterior.
  for (const s of sessions) {
    if (s.userId === userId && s.endedAt === null) {
      s.endedAt = new Date().toISOString()
      s.closedBy = 'mechanic'
    }
  }

  const nueva: Session = {
    id: `s${++secuencia}`,
    workOrderId,
    userId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    closedBy: null,
  }
  sessions = [...sessions, nueva]
  avisar()
  return { accion: 'abierta', session: nueva }
}

// ─── Helpers de presentación ──────────────────────────────────────────────────

export function nombreCompleto(m: Mechanic): string {
  return `${m.firstName} ${m.lastName}`
}

export function duracionMin(desde: string, hasta: string | null): number {
  const fin = hasta ? new Date(hasta).getTime() : Date.now()
  return Math.max(0, Math.round((fin - new Date(desde).getTime()) / 60_000))
}

/** 83 → "1 h 23 m". El jefe lee de un vistazo, no hace cuentas. */
export function formatearDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} m`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

/**
 * Quién más está fichado en esa orden ahora mismo.
 *
 * Dos mecánicos en la misma OT es legítimo —una caja, un motor, van dos— así
 * que no se bloquea. Pero se avisa: si nadie lo ve, las horas se suman contra
 * esa orden y la comparación contra el baremo queda mal sin explicación.
 * Si el jefe define que no se puede, pasa a ser regla por tenant.
 */
export function otrosEnLaOrden(workOrderId: string, exceptoUserId: string): Mechanic[] {
  return sessions
    .filter((s) => s.workOrderId === workOrderId && s.endedAt === null && s.userId !== exceptoUserId)
    .map((s) => mechanics.find((m) => m.id === s.userId))
    .filter((m): m is Mechanic => m !== undefined)
}

/**
 * El jefe declara terminada una orden desde su tablero.
 *
 * Va acá y no en el kiosco a propósito: que el mecánico termine lo suyo no
 * quiere decir que el auto esté listo — falta el lavado, la prueba en ruta, el
 * OK del asesor. Y preguntárselo en el puesto sería una pantalla intermedia
 * entre los dos escaneos, que es lo que mató al módulo del DMS.
 */
export function cerrarOrden(workOrderId: string): void {
  const o = workOrders.find((x) => x.id === workOrderId)
  if (!o) return
  o.status = 'finished'
  avisar()
}

// ─── Esperas ──────────────────────────────────────────────────────────────────

let holds: Hold[] = [...holdsIniciales]
export type { Hold }

/** La espera vigente de una orden, si la hay. */
export function esperaDe(workOrderId: string): Hold | undefined {
  return holds.find((h) => h.workOrderId === workOrderId && h.endedAt === null)
}

/** El último que trabajó en la orden: es quien la dejó como está. */
export function ultimoEn(workOrderId: string): { mecanico: Mechanic; cuando: string } | null {
  const cerradas = sessions
    .filter((s) => s.workOrderId === workOrderId && s.endedAt !== null)
    .sort((a, b) => (a.endedAt ?? '').localeCompare(b.endedAt ?? ''))
  const ultima = cerradas.at(-1)
  if (!ultima) return null
  const mecanico = mechanics.find((m) => m.id === ultima.userId)
  if (!mecanico) return null
  return { mecanico, cuando: ultima.endedAt! }
}

export function marcarEspera(workOrderId: string, reason: HoldReason, porUserId: string): void {
  const vigente = esperaDe(workOrderId)
  if (vigente) vigente.endedAt = new Date().toISOString()

  holds = [
    ...holds,
    {
      id: `h${Date.now()}`,
      workOrderId,
      reason,
      startedAt: new Date().toISOString(),
      endedAt: null,
      recordedBy: porUserId,
    },
  ]
  const o = workOrders.find((x) => x.id === workOrderId)
  if (o) o.status = 'on_hold'
  avisar()
}

export function quitarEspera(workOrderId: string): void {
  const vigente = esperaDe(workOrderId)
  if (vigente) vigente.endedAt = new Date().toISOString()
  const o = workOrders.find((x) => x.id === workOrderId)
  if (o && o.status === 'on_hold') o.status = 'open'
  avisar()
}
