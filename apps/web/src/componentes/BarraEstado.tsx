import { CATALOGO } from '@gpb/core'
import { useTeclado } from '../teclado/index.ts'
import { Tecla } from './Tecla.tsx'

/**
 * La franja de abajo con las teclas del contexto. Es la convención que esta gente ya
 * conoce de los sistemas de caracteres, y resuelve el descubrimiento sin ocupar lugar:
 * el atajo se aprende usándolo, no leyendo un manual.
 *
 * Las que no aplican van atenuadas y **no se esconden**: si aparecieran y
 * desaparecieran, la barra se leería distinta en cada pantalla y dejaría de ser un
 * lugar fijo donde mirar.
 *
 * La pantalla sale del teclado, que a su vez lo toma de la ruta: la barra no puede
 * anunciar el F4 de una pantalla distinta de la que efectivamente dispara.
 */
export function BarraEstado() {
  const { mapa, pantalla, activas } = useTeclado()

  const visibles = CATALOGO.filter(
    (d) => mapa[d.accion] && (d.ambito === 'global' || d.ambito === pantalla),
  )

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex h-8 flex-wrap items-center gap-x-4 border-t border-borde bg-superficie px-4 text-etiqueta text-texto-suave">
      {visibles.map((d) => {
        const disponible = activas.has(d.accion)
        const esVerbo = d.ambito !== 'global'

        return (
          <span
            key={d.accion}
            className={[
              'inline-flex items-center gap-1.5',
              disponible ? '' : 'opacity-40',
              esVerbo && disponible ? 'font-semibold text-marca' : '',
            ].join(' ')}
          >
            <Tecla tecla={mapa[d.accion] ?? ''} tono={esVerbo && disponible ? 'marca' : 'normal'} />
            {d.etiqueta}
          </span>
        )
      })}
    </footer>
  )
}
