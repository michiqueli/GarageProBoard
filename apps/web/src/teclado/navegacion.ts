import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { confirmar } from '../componentes/avisos.ts'
import { useTeclado } from './contexto.tsx'

/**
 * Moverse con las flechas por lo que se ve en pantalla: las pestañas con ← y →, las filas de
 * un listado con ↑ y ↓, y Enter para abrir la fila marcada.
 *
 * No pasan por el catálogo de atajos porque no se reasignan y porque sus teclas se usan
 * escribiendo: una flecha adentro de un campo mueve el cursor, y Enter manda el formulario.
 * Por eso cada una mira dónde está el foco antes de hacer algo.
 */

/** Hay un diálogo abierto: la pantalla de atrás no escucha. */
const hayModal = () => Boolean(document.querySelector('[aria-modal="true"]'))

function escribiendo(destino: EventTarget | null) {
  if (!(destino instanceof HTMLElement)) return false
  return (
    destino.tagName === 'INPUT' ||
    destino.tagName === 'TEXTAREA' ||
    destino.tagName === 'SELECT' ||
    destino.isContentEditable
  )
}

const conModificador = (e: KeyboardEvent) => e.ctrlKey || e.altKey || e.metaKey || e.shiftKey

/**
 * ← y → pasan a la pestaña anterior o siguiente, sin dar la vuelta. No actúa si el foco está
 * en un campo: ahí las flechas mueven el cursor.
 */
export function useFlechasPestanas<T>(opciones: readonly T[], actual: T, ir: (opcion: T) => void) {
  const { registrarAyuda } = useTeclado()
  const ultimo = useRef({ opciones, actual, ir })
  ultimo.current = { opciones, actual, ir }

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.defaultPrevented || conModificador(e) || escribiendo(e.target) || hayModal()) return
      const { opciones: todas, actual: ahora, ir: irA } = ultimo.current
      const i = todas.indexOf(ahora)
      const destino = todas[i + (e.key === 'ArrowRight' ? 1 : -1)]
      if (i < 0 || destino === undefined) return
      e.preventDefault()
      irA(destino)
    }
    document.addEventListener('keydown', alPresionar)
    const quitar = registrarAyuda({
      id: 'pestanas',
      teclas: ['ArrowLeft', 'ArrowRight'],
      etiqueta: 'Pestañas',
    })
    return () => {
      document.removeEventListener('keydown', alPresionar)
      quitar()
    }
  }, [registrarAyuda])
}

/**
 * ↑ y ↓ marcan una fila del listado; Enter abre la marcada y Esc suelta la marca. Funciona
 * con el foco afuera de los campos, y también desde el buscador del listado (el `input` con
 * `data-lista`): se escribe, ↓ baja a los resultados, Enter abre.
 *
 * Devuelve la fila marcada y las props para cada fila: `data-activa` pinta la marca (ver
 * `FILA_CLICABLE`) y la fila marcada se desplaza a la vista.
 */
export function useFilasConTeclado<T>(filas: readonly T[], abrir: (fila: T) => void) {
  const { registrarAyuda } = useTeclado()
  const [activa, setActiva] = useState<number | null>(null)
  const ultimo = useRef({ filas, abrir, activa })
  ultimo.current = { filas, abrir, activa }

  // Si la lista se achica —otra búsqueda—, la marca no puede quedar afuera.
  useEffect(() => {
    if (activa !== null && activa >= filas.length) setActiva(filas.length ? filas.length - 1 : null)
  }, [filas.length, activa])

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return
      if (e.defaultPrevented || conModificador(e) || hayModal()) return
      const desdeBuscador = e.target instanceof HTMLElement && e.target.hasAttribute('data-lista')
      if (escribiendo(e.target) && !desdeBuscador) return
      const { filas: todas, abrir: abrirFila, activa: marcada } = ultimo.current
      if (!todas.length) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiva(marcada === null ? 0 : Math.min(marcada + 1, todas.length - 1))
      } else if (e.key === 'ArrowUp') {
        if (marcada === null) return
        e.preventDefault()
        setActiva(marcada === 0 ? null : marcada - 1)
      } else if (e.key === 'Enter') {
        // Enter sobre un enlace o un botón hace lo suyo.
        if (marcada === null || (e.target instanceof HTMLElement && e.target.closest('a, button')))
          return
        const fila = todas[marcada]
        if (fila === undefined) return
        e.preventDefault()
        abrirFila(fila)
      } else if (marcada !== null) {
        e.stopPropagation()
        setActiva(null)
      }
    }
    document.addEventListener('keydown', alPresionar)
    const quitar = registrarAyuda({
      id: 'filas',
      teclas: ['ArrowUp', 'ArrowDown'],
      etiqueta: 'Moverse',
    })
    return () => {
      document.removeEventListener('keydown', alPresionar)
      quitar()
    }
  }, [registrarAyuda])

  // La ayuda de Enter aparece recién cuando hay una fila marcada para abrir.
  const hayMarca = activa !== null
  useEffect(() => {
    if (!hayMarca) return
    return registrarAyuda({ id: 'abrir-fila', teclas: ['Enter'], etiqueta: 'Abrir' })
  }, [hayMarca, registrarAyuda])

  useEffect(() => {
    if (activa === null) return
    document.querySelector('[data-activa="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [activa])

  return {
    activa,
    propsFila: (i: number) => ({ 'data-activa': i === activa ? 'true' : undefined }),
  }
}

/**
 * Cuántas partes de la pantalla tienen cambios sin guardar. Volver con Esc o ⌫ los perdería:
 * con alguno pendiente, primero se pregunta.
 */
let cambiosPendientes = 0

/** Mientras `hay` sea verdadero, volver con el teclado pide confirmación. */
export function useCambiosSinGuardar(hay: boolean) {
  useEffect(() => {
    if (!hay) return
    cambiosPendientes++
    return () => {
      cambiosPendientes--
    }
  }, [hay])
}

/**
 * En una ficha, Esc o ⌫ vuelven a la pantalla anterior —con su búsqueda y sus filtros—, o al
 * listado si se llegó directo por un enlace.
 *
 * Nunca con el foco en un campo: ahí Esc y ⌫ son de lo que se está escribiendo. Y si hay un
 * formulario abierto que se cierra con Esc, gana el formulario: el atajo de cancelar llega antes
 * y marca el evento. Con cambios sin guardar, pregunta.
 */
export function useVolver(listado: () => void, activo = true) {
  const { registrarAyuda } = useTeclado()
  const router = useRouter()
  const ultimo = useRef({ listado, activo })
  ultimo.current = { listado, activo }

  useEffect(() => {
    async function alPresionar(e: KeyboardEvent) {
      if (e.key !== 'Escape' && e.key !== 'Backspace') return
      if (!ultimo.current.activo) return
      if (e.defaultPrevented || conModificador(e) || escribiendo(e.target) || hayModal()) return
      e.preventDefault()
      if (
        cambiosPendientes > 0 &&
        !(await confirmar({
          titulo: '¿Salir sin guardar?',
          texto: 'Hay cambios que todavía no se guardaron y se van a perder.',
          confirmar: 'Salir sin guardar',
          peligro: true,
        }))
      ) {
        return
      }
      if (router.history.canGoBack()) router.history.back()
      else ultimo.current.listado()
    }
    document.addEventListener('keydown', alPresionar)
    const quitar = registrarAyuda({ id: 'volver', teclas: ['Backspace'], etiqueta: 'Volver' })
    return () => {
      document.removeEventListener('keydown', alPresionar)
      quitar()
    }
  }, [registrarAyuda, router])
}
