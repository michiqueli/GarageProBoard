import {
  type Diferencias,
  type MapaAtajos,
  type Pantalla,
  resolverAtajos,
  teclaDesdeEvento,
} from '@gpb/core'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { debeDisparar, debePrevenir } from './coincide.ts'

/**
 * Una tecla que no es un atajo configurable pero que la pantalla ofrece y la barra de estado
 * tiene que mostrar: las flechas de una lista, Enter para abrir. No salen del catálogo porque
 * no se reasignan: son las de siempre.
 */
export interface Ayuda {
  id: string
  teclas: string[]
  etiqueta: string
}

interface Teclado {
  /** El mapa resuelto: valores por omisión más las diferencias de este usuario. */
  mapa: MapaAtajos
  /** La pantalla montada, que define cuál es la acción de F4. */
  pantalla: Pantalla | undefined
  /** Las acciones que ahora mismo tienen un manejador montado. */
  activas: ReadonlySet<string>
  teclaDe(accion: string): string | undefined
  registrar(accion: string, manejador: () => void): () => void
  ayudas: readonly Ayuda[]
  registrarAyuda(ayuda: Ayuda): () => void
}

const Contexto = createContext<Teclado | null>(null)

export function ProveedorTeclado({
  children,
  pantalla,
  diferencias = {},
}: {
  children: ReactNode
  pantalla?: Pantalla | undefined
  diferencias?: Diferencias | undefined
}) {
  const mapa = useMemo(() => resolverAtajos(diferencias, pantalla), [diferencias, pantalla])

  // Los manejadores viven en una ref para que registrar uno no vuelva a renderizar
  // el árbol entero. El Set de activas sí es estado, porque la barra de estado lo mira.
  //
  // Cada acción guarda una pila: gana el último que se registró. La ficha registra Esc para
  // volver, el formulario que abre adentro registra Esc para cerrarse; al cerrarlo, Esc vuelve
  // a ser de la ficha. Con un solo manejador por acción, cerrar el formulario borraba el Esc.
  const manejadores = useRef(new Map<string, Array<{ fn: () => void }>>())
  const [activas, setActivas] = useState<ReadonlySet<string>>(new Set())
  const [ayudas, setAyudas] = useState<readonly Ayuda[]>([])

  const registrarAyuda = useCallback((ayuda: Ayuda) => {
    setAyudas((xs) => [...xs.filter((x) => x.id !== ayuda.id), ayuda])
    return () => setAyudas((xs) => xs.filter((x) => x.id !== ayuda.id))
  }, [])

  const registrar = useCallback((accion: string, manejador: () => void) => {
    const entrada = { fn: manejador }
    const pila = manejadores.current.get(accion) ?? []
    manejadores.current.set(accion, [...pila, entrada])
    setActivas(new Set(manejadores.current.keys()))

    return () => {
      const quedan = (manejadores.current.get(accion) ?? []).filter((e) => e !== entrada)
      if (quedan.length) manejadores.current.set(accion, quedan)
      else manejadores.current.delete(accion)
      setActivas(new Set(manejadores.current.keys()))
    }
  }, [])

  // Un solo escucha para toda la aplicación. Si cada pantalla pusiera el suyo, en
  // tres meses habría dos donde F2 hace cosas distintas y nadie sabría por qué.
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (!debeDisparar(evento)) return
      // Con una confirmación abierta, la pantalla de atrás no escucha: F2 no puede guardar
      // el formulario que la pregunta está protegiendo.
      if (document.querySelector('[aria-modal="true"]')) return

      const tecla = teclaDesdeEvento(evento)

      for (const [accion, asignada] of Object.entries(mapa)) {
        if (asignada !== tecla) continue

        const manejador = manejadores.current.get(accion)?.at(-1)?.fn
        if (!manejador) return // La acción existe pero esta pantalla no la ofrece.

        if (debePrevenir(tecla)) evento.preventDefault()
        manejador()
        return
      }
    }

    document.addEventListener('keydown', alPresionar)
    return () => document.removeEventListener('keydown', alPresionar)
  }, [mapa])

  const valor = useMemo<Teclado>(
    () => ({
      mapa,
      pantalla,
      activas,
      teclaDe: (accion) => mapa[accion],
      registrar,
      ayudas,
      registrarAyuda,
    }),
    [mapa, pantalla, activas, registrar, ayudas, registrarAyuda],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useTeclado(): Teclado {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('Falta envolver el árbol en <ProveedorTeclado>.')
  return contexto
}

/** Registra un manejador para una acción mientras el componente esté montado. */
export function useAtajo(accion: string, manejador: () => void, activo = true): void {
  const { registrar } = useTeclado()
  const ultimo = useRef(manejador)
  ultimo.current = manejador

  useEffect(() => {
    if (!activo) return
    return registrar(accion, () => ultimo.current())
  }, [accion, activo, registrar])
}
