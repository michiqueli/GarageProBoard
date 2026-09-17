import { useEffect } from 'react'

type Densidad = 'compacta' | 'comoda'

/**
 * Estampa la densidad en la raíz del documento, igual que `useTema`.
 *
 * Sólo se marca `comoda`: la compacta es la de trabajo y por lo tanto la que vale sin
 * atributo. Así una pantalla nueva ya nace en la densidad correcta sin acordarse de nada, y
 * el alto de fila sale del token —no de una clase condicional en cada tabla—.
 */
export function useDensidad(densidad: Densidad = 'compacta'): void {
  useEffect(() => {
    const raiz = document.documentElement

    if (densidad === 'compacta') {
      delete raiz.dataset.densidad
      return
    }

    raiz.dataset.densidad = densidad
    return () => {
      delete raiz.dataset.densidad
    }
  }, [densidad])
}
