/**
 * Beep del kiosco. El mecánico está a 2 metros, con las manos sucias, y no lee
 * texto: el sonido es la mitad del feedback.
 *
 * WebAudio en vez de un archivo: no hay que servir nada y suena instantáneo,
 * que es justo lo que pide el presupuesto de latencia.
 */

let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  // Los navegadores lo suspenden hasta que hay interacción del usuario.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tono(frecuencia: number, desdeMs: number, duracionMs: number) {
  const ac = contexto()
  if (!ac) return
  const inicio = ac.currentTime + desdeMs / 1000
  const fin = inicio + duracionMs / 1000

  const osc = ac.createOscillator()
  const vol = ac.createGain()
  osc.type = 'square'
  osc.frequency.value = frecuencia
  vol.gain.setValueAtTime(0.0001, inicio)
  vol.gain.exponentialRampToValueAtTime(0.12, inicio + 0.01)
  vol.gain.exponentialRampToValueAtTime(0.0001, fin)

  osc.connect(vol).connect(ac.destination)
  osc.start(inicio)
  osc.stop(fin + 0.02)
}

/** Un beep agudo y corto = salió bien. */
export function beepOk() {
  tono(880, 0, 110)
}

/** Doble beep grave = algo falló. Distinguible sin mirar la pantalla. */
export function beepError() {
  tono(220, 0, 130)
  tono(220, 180, 130)
}

/** Beep intermedio: credencial leída, falta la OT. */
export function beepIntermedio() {
  tono(620, 0, 90)
}
