import { useEffect, useState } from 'react'

const EVENTOS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/**
 * Cierra la sesión cuando nadie toca la pantalla durante `minutos`, y avisa en el último
 * minuto. Devuelve los segundos que quedan mientras avisa, y `null` el resto del tiempo.
 *
 * Es para la tablet de recepción: una tablet dejada en el mostrador no se cierra sola de otra
 * forma, y el siguiente que la agarra no puede encontrarse adentro de la cuenta del anterior.
 * Del lado del servidor la sesión de la tablet también vence sola, por si esta pantalla no
 * llega a cerrarla —se colgó, la apagaron—.
 */
export function useInactividad(
  activa: boolean,
  minutos: number,
  alVencer: () => void,
): number | null {
  const [restan, setRestan] = useState<number | null>(null)

  useEffect(() => {
    if (!activa) {
      setRestan(null)
      return
    }
    let ultimo = Date.now()
    const tocaron = () => {
      ultimo = Date.now()
    }
    for (const evento of EVENTOS) window.addEventListener(evento, tocaron, { passive: true })

    const limite = minutos * 60
    const id = setInterval(() => {
      const quedan = limite - Math.floor((Date.now() - ultimo) / 1000)
      if (quedan <= 0) {
        clearInterval(id)
        setRestan(null)
        alVencer()
        return
      }
      setRestan(quedan <= 60 ? quedan : null)
    }, 1000)

    return () => {
      clearInterval(id)
      for (const evento of EVENTOS) window.removeEventListener(evento, tocaron)
    }
  }, [activa, minutos, alVencer])

  return restan
}
