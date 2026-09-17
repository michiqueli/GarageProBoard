import type { MouseEvent } from 'react'

/**
 * Para que un clic en cualquier parte de la fila abra el detalle, y no sólo sobre el número.
 *
 * El enlace de la fila sigue estando —con teclado, clic del medio y «abrir en otra pestaña»—;
 * esto suma el clic en el resto. No se mete cuando el clic cae en otro control (un botón de
 * copiar, un enlace), cuando se abre en otra pestaña con Ctrl o cuando se está seleccionando
 * texto para copiarlo.
 */
export function clicEnFila(ir: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label')) return
    if (window.getSelection()?.toString()) return
    ir()
  }
}

/** Las clases de una fila que se abre con un clic. */
export const FILA_CLICABLE = 'cursor-ver hover:bg-superficie-2'
