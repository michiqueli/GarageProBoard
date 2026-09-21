/**
 * Los tres sonidos del puesto de fichaje.
 *
 * **No son decoración**: el mecánico está a dos metros, con guantes, mirando el auto. El color
 * y el texto le llegan si mira; el sonido le llega siempre. Por eso son tres y no dos — el del
 * paso intermedio confirma que la credencial entró, que es justo el momento en que uno duda.
 *
 * Sin archivos: un taller es ruidoso y lo que importa es que suenen **distinto**, no que suenen
 * lindos. Osciladores del navegador, que además no hay que descargar ni cachear.
 *
 * Los navegadores no dejan sonar hasta que alguien interactuó con la página. El primer escaneo
 * del día la despierta; si el primero sale mudo no pasa nada, porque la pantalla entera cambia
 * de color igual.
 */

type Nota = { hz: number; en: number; largo?: number }

function tocar(notas: readonly Nota[]): void {
  try {
    const Contexto =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Contexto) return

    const ctx = new Contexto()
    for (const { hz, en, largo = 0.12 } of notas) {
      const osc = ctx.createOscillator()
      const volumen = ctx.createGain()
      osc.frequency.value = hz
      // Rampa en vez de encendido seco: un corte abrupto suena a chasquido roto en un parlante
      // barato, que es el que va a tener la PC del taller.
      volumen.gain.setValueAtTime(0.0001, ctx.currentTime + en)
      volumen.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + en + 0.01)
      volumen.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + en + largo)
      osc.connect(volumen).connect(ctx.destination)
      osc.start(ctx.currentTime + en)
      osc.stop(ctx.currentTime + en + largo + 0.02)
    }
    setTimeout(() => void ctx.close(), 1000)
  } catch {
    // Sin audio la pantalla sigue diciendo lo mismo, en grande y en colores.
  }
}

/** Salió bien: uno agudo y corto. */
export const beepOk = () => tocar([{ hz: 880, en: 0 }])

/** Salió mal: dos graves. Dos golpes se distinguen de uno aunque no se oiga el tono. */
export const beepError = () =>
  tocar([
    { hz: 220, en: 0 },
    { hz: 220, en: 0.18 },
  ])

/** Vas por la mitad: uno medio, más corto. Ni premio ni error — «te leí, seguí». */
export const beepIntermedio = () => tocar([{ hz: 620, en: 0, largo: 0.07 }])
