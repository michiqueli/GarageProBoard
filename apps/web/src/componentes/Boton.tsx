import type { ReactNode } from 'react'
import { useAtajo, useTeclado } from '../teclado/index.ts'
import { Tecla } from './Tecla.tsx'

export type Variante = 'principal' | 'normal' | 'sutil' | 'peligro'
export type Tamano = 'normal' | 'chico'

const ESTILOS: Record<Variante, string> = {
  principal: 'border-marca bg-marca-suave text-marca font-semibold',
  normal: 'border-borde bg-superficie-2 text-texto hover:border-texto-tenue',
  sutil: 'border-transparent text-texto-suave hover:bg-superficie-2',
  // Lo que deshace o descarta: anular, dejar para después. Se ve, pero en pastel: no le gana
  // al verbo de la pantalla.
  peligro: 'border-critico/40 bg-critico-suave text-critico hover:border-critico',
}

const TAMANOS: Record<Tamano, string> = {
  normal: 'h-campo gap-2 px-3 text-dato',
  // Para las acciones de una fila o una tarjeta: se ven como botón sin pelearle
  // protagonismo al contenido.
  chico: 'h-7 gap-1.5 px-2 text-etiqueta',
}

/**
 * Las clases de un botón, para lo que tiene que verse como botón sin serlo: un enlace que
 * lleva a otra pantalla sigue siendo un `<a>`, con su clic del medio y su «abrir en otra
 * pestaña».
 */
export function clasesBoton(variante: Variante = 'normal', tamano: Tamano = 'normal'): string {
  return [
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-base border',
    'transition-colors disabled:opacity-40 [&>svg]:size-3.5 [&>svg]:shrink-0',
    TAMANOS[tamano],
    ESTILOS[variante],
  ].join(' ')
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
  icono,
  variante = 'normal',
  tamano = 'normal',
  deshabilitado = false,
}: {
  accion?: string
  onClick: () => void
  children: ReactNode
  /** Un ícono de `iconos.tsx`: acompaña al texto, nunca lo reemplaza. */
  icono?: ReactNode
  variante?: Variante
  tamano?: Tamano
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
      className={clasesBoton(variante, tamano)}
    >
      {icono}
      {children}
      {tecla && <Tecla tecla={tecla} tono={variante === 'principal' ? 'marca' : 'normal'} />}
    </button>
  )
}
