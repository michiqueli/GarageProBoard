import type { ReactNode } from 'react'
import { useAtajo, useTeclado } from '../teclado/index.ts'
import { Tecla } from './Tecla.tsx'

type Variante = 'principal' | 'normal' | 'sutil'

const ESTILOS: Record<Variante, string> = {
  principal: 'border-marca bg-marca-suave text-marca font-semibold',
  normal: 'border-borde bg-superficie-2 text-texto',
  sutil: 'border-transparent text-texto-suave hover:bg-superficie-2',
}

/**
 * Botón con su atajo.
 *
 * Declarar la acción hace tres cosas de una: dibuja la tecla que **este usuario**
 * tenga configurada, registra el atajo para que la dispare, y la anuncia a la barra
 * de estado. Por eso ninguna pantalla escribe `F2` a mano: un literal en el JSX es un
 * botón que miente apenas alguien reconfigure, y mentir sobre un atajo es peor que no
 * mostrarlo.
 */
export function Boton({
  accion,
  onClick,
  children,
  variante = 'normal',
  deshabilitado = false,
}: {
  accion?: string
  onClick: () => void
  children: ReactNode
  variante?: Variante
  deshabilitado?: boolean
}) {
  const { teclaDe } = useTeclado()
  const tecla = accion ? teclaDe(accion) : undefined

  useAtajo(accion ?? '', onClick, Boolean(accion) && !deshabilitado)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={[
        'inline-flex h-campo items-center gap-2 rounded-base border px-3',
        'text-dato transition-colors disabled:opacity-40',
        ESTILOS[variante],
      ].join(' ')}
    >
      {children}
      {tecla && <Tecla tecla={tecla} tono={variante === 'principal' ? 'marca' : 'normal'} />}
    </button>
  )
}
