import { useEffect } from 'react'

type Preferencia = 'claro' | 'oscuro' | 'sistema'

/**
 * Estampa el tema en la raíz del documento.
 *
 * El CSS sólo contempla dos estados, `claro` y `oscuro`. La tercera opción del usuario,
 * `sistema`, se resuelve acá: así no existe una combinación de estilos sin probar, y el
 * que la eligió ve el cambio en el momento en que su sistema operativo cambia.
 */
export function useTema(preferencia: Preferencia = 'sistema'): void {
  useEffect(() => {
    const raiz = document.documentElement

    if (preferencia !== 'sistema') {
      raiz.dataset.tema = preferencia
      return
    }

    const oscuro = window.matchMedia('(prefers-color-scheme: dark)')
    const aplicar = () => {
      raiz.dataset.tema = oscuro.matches ? 'oscuro' : 'claro'
    }

    aplicar()
    oscuro.addEventListener('change', aplicar)
    return () => oscuro.removeEventListener('change', aplicar)
  }, [preferencia])
}
