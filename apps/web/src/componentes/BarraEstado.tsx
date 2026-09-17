import { CATALOGO } from '@gpb/core'
import { useLayoutEffect, useRef } from 'react'
import { useTeclado } from '../teclado/index.ts'
import { Tecla } from './Tecla.tsx'

/**
 * La franja de abajo con las teclas del contexto. Es la convención que esta gente ya
 * conoce de los sistemas de caracteres, y resuelve el descubrimiento sin ocupar lugar:
 * el atajo se aprende usándolo, no leyendo un manual.
 *
 * **Las principales siempre, el resto sólo si funciona acá.** Guardar, buscar, cancelar,
 * la ayuda y el verbo de la pantalla están siempre en el mismo lugar —atenuadas si ahora
 * no aplican—: son el lugar fijo donde mirar. Las demás aparecen cuando se pueden
 * apretar; con el catálogo creciendo, una lista larga de teclas apagadas tapaba las
 * pocas que servían.
 *
 * La pantalla sale del teclado, que a su vez lo toma de la ruta: la barra no puede
 * anunciar el F4 de una pantalla distinta de la que efectivamente dispara.
 */
export function BarraEstado() {
  const { mapa, pantalla, activas, ayudas } = useTeclado()

  const visibles = CATALOGO.filter(
    (d) =>
      mapa[d.accion] &&
      (d.principal || activas.has(d.accion)) &&
      (d.ambito === 'global' || d.ambito === pantalla),
  )

  const barra = useRef<HTMLElement>(null)

  // Si las teclas no entran en una fila, pasan a dos. Lo que se apoya sobre la barra —el
  // menú lateral, el final del contenido, las notificaciones— descuenta
  // `--spacing-barra-estado`, así que la barra publica su altura real: una fila en una
  // pantalla ancha, dos en una notebook, sin que nada quede tapado.
  useLayoutEffect(() => {
    const elemento = barra.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const raiz = document.documentElement
    const publicar = () =>
      raiz.style.setProperty('--spacing-barra-estado', `${elemento.offsetHeight}px`)
    publicar()
    const observador = new ResizeObserver(publicar)
    observador.observe(elemento)
    return () => {
      observador.disconnect()
      raiz.style.removeProperty('--spacing-barra-estado')
    }
  }, [])

  return (
    <footer
      ref={barra}
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-borde bg-superficie px-4 py-1 text-etiqueta whitespace-nowrap text-texto-suave"
    >
      {visibles.map((d) => {
        const disponible = activas.has(d.accion)
        const esVerbo = d.ambito !== 'global' && disponible

        return (
          <span
            key={d.accion}
            className={[
              'inline-flex items-center gap-1.5',
              disponible ? '' : 'opacity-40',
              esVerbo ? 'font-semibold text-marca' : '',
            ].join(' ')}
          >
            <Tecla tecla={mapa[d.accion] ?? ''} tono={esVerbo ? 'marca' : 'normal'} />
            {d.etiqueta}
          </span>
        )
      })}
      {ayudas.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1.5">
          {a.teclas.map((tecla) => (
            <Tecla key={tecla} tecla={tecla} />
          ))}
          {a.etiqueta}
        </span>
      ))}
    </footer>
  )
}
