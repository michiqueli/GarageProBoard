import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Un formulario que se abre encima de la pantalla sin perderla: dar de alta un cliente en
 * medio de una venta, por ejemplo.
 *
 * Mientras está abierto, la pantalla de atrás no escucha atajos; los de adentro sí (F2 guarda
 * lo que está en el modal), por `data-con-atajos`. `Tab` no se escapa, `Esc` lo cierra y al
 * cerrar el foco vuelve adonde estaba.
 */
export function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus()
    }
    return () => antes?.focus()
  }, [])

  function teclas(evento: KeyboardEvent) {
    // Con una confirmación abierta encima, Esc es de ella.
    if (document.querySelector('[role="alertdialog"]')) return
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      cerrar.current()
      return
    }
    if (evento.key !== 'Tab') return
    const todos = [...(panel.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [])]
    if (!todos.length) return
    const i = todos.indexOf(document.activeElement as HTMLElement)
    const ultimo = todos.length - 1
    if (evento.shiftKey && i <= 0) {
      evento.preventDefault()
      todos[ultimo]?.focus()
    } else if (!evento.shiftKey && i === ultimo) {
      evento.preventDefault()
      todos[0]?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-velo p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        data-con-atajos
        onKeyDown={teclas}
        className="grid max-h-full w-full max-w-4xl animate-emerger gap-3 overflow-y-auto rounded-base border border-borde bg-superficie p-4 shadow-flotante"
      >
        <h2 id={id} className="sr-only">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  )
}
