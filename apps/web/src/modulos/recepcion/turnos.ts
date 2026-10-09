import type { EstadoTurno } from '@gpb/core'
import type { api } from '../../sesion/cliente.ts'

export type Turno = Awaited<ReturnType<typeof api.turnos.listar>>['datos'][number]

const ZONA = 'America/Argentina/Buenos_Aires'

/** «2026-10-09»: el día de Argentina de un instante, que es lo que pide la API. */
export function diaDe(instante: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(instante))
}

/** «09:30», en hora de Argentina. */
export function horaDe(instante: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instante))
}

/** El instante de un día y una hora de Argentina. Argentina no cambia la hora en verano. */
export function instante(dia: string, hora: string): string {
  return `${dia}T${hora}:00-03:00`
}

/** Sumarle días a un día, sin pasar por la zona del navegador. */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** El lunes de la semana de un día. */
export function lunesDe(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay()
  return sumarDias(dia, -((semana + 6) % 7))
}

export const ESTADO_TURNO_NOMBRE: Record<EstadoTurno, string> = {
  agendado: 'Agendado',
  llego: 'Llegó',
  ausente: 'No vino',
  cancelado: 'Cancelado',
}

/** Cómo se lee el auto de un turno: la patente, y si está cargado, qué es. */
export function autoDe(t: Turno): string {
  if (t.vehiculo) return [t.vehiculo.dominio, t.vehiculo.descripcion].filter(Boolean).join(' · ')
  return t.dominio ?? 'Sin patente'
}
