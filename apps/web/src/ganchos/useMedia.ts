/*
 * Los hooks son el único lugar del código donde se usa el prefijo en inglés.
 *
 * No es una inconsistencia: `use` es un protocolo que leen las herramientas — la regla
 * de hooks del linter, React DevTools y sobre todo el React Compiler, que se apoya en
 * el nombre para saber qué lo es. Un hook llamado `usarAlgo` queda fuera de todas.
 *
 * El resto del código sigue en castellano.
 */
import { useEffect, useState } from 'react'

/**
 * Sigue una media query desde JavaScript.
 *
 * Para mostrar y ocultar alcanza con CSS, pero para **elegir qué renderizar** no: un
 * listado que arma la tabla y las tarjetas a la vez duplica el DOM, y sobre
 * quinientas filas virtualizadas eso se paga en la máquina del mostrador.
 */
export function useMedia(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(consulta).matches,
  )

  useEffect(() => {
    const lista = window.matchMedia(consulta)
    const alCambiar = (e: MediaQueryListEvent) => setCoincide(e.matches)

    setCoincide(lista.matches)
    lista.addEventListener('change', alCambiar)
    return () => lista.removeEventListener('change', alCambiar)
  }, [consulta])

  return coincide
}

/** El corte entre la tabla densa y las tarjetas. Coincide con `md` de Tailwind. */
export const ES_ESCRITORIO = '(min-width: 48rem)'
