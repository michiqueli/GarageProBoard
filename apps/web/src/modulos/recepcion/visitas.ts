import { ORPCError } from '@orpc/client'
import { useEffect, useState } from 'react'
import type { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

/** Lo que comparten la puerta y la cola de las tablets. */

export type Visita = Awaited<ReturnType<typeof api.recepcion.hoy>>['datos'][number]

/**
 * Cada cuánto se vuelve a preguntar. Es la cola compartida entre la puerta, las tablets y
 * los que atienden: lo que otro agarró tiene que dejar de verse como libre enseguida.
 */
export const REFRESCO = 5_000

/** Minutos enteros entre una hora y ahora. */
export function minutos(desde: string, hasta: number): number {
  return Math.max(0, Math.floor((hasta - new Date(desde).getTime()) / 60_000))
}

/** El reloj de la pantalla: las esperas cuentan solas aunque nadie toque nada. */
export function useAhora(cada = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cada)
    return () => clearInterval(t)
  }, [cada])
  return ahora
}

/** Si la tiene otro, el aviso dice quién: «Ya la tiene Juan Pérez». */
export function errorAlAtender(error: unknown): string {
  if (error instanceof ORPCError && error.code === 'YA_LA_TIENE') {
    const nombre = (error.data as { nombre?: string } | undefined)?.nombre
    if (nombre) return `Ya la tiene ${nombre}`
  }
  return mensajeGeneral(error)
}
