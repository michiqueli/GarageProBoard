import { afterEach, vi } from 'vitest'
import { limpiarAvisos } from '../src/componentes/avisos.ts'

/** Cada test arranca sin notificaciones ni preguntas del anterior. */
afterEach(() => limpiarAvisos())

/**
 * jsdom no implementa `matchMedia`. El polyfill vive acá y no en el código de
 * producción: el navegador siempre la tiene, y meterle una guarda al gancho sería
 * llevar andamio de test adentro de la aplicación.
 */
let anchoActual = 1440

const escuchas = new Set<(e: MediaQueryListEvent) => void>()

function evaluar(consulta: string): boolean {
  const min = consulta.match(/min-width:\s*([\d.]+)(px|rem)/)
  if (!min) return false

  const valor = Number(min[1])
  const px = min[2] === 'rem' ? valor * 16 : valor
  return anchoActual >= px
}

window.matchMedia = vi.fn((consulta: string) => {
  const lista = {
    matches: evaluar(consulta),
    media: consulta,
    onchange: null,
    addEventListener: (_: string, e: (ev: MediaQueryListEvent) => void) => escuchas.add(e),
    removeEventListener: (_: string, e: (ev: MediaQueryListEvent) => void) => escuchas.delete(e),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  return lista as unknown as MediaQueryList
}) as typeof window.matchMedia

/**
 * Tampoco implementa `scrollTo`, que el router llama al navegar para dejar arriba la
 * pantalla nueva. Sin esto la salida de los tests se llena de avisos que tapan los
 * errores de verdad.
 */
window.scrollTo = (() => {}) as typeof window.scrollTo

/** Simula un ancho de pantalla para probar la forma de teléfono de un listado. */
export function conAncho(px: number): void {
  anchoActual = px
}
