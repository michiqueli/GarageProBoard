import {
  type Diferencias,
  type MapaAtajos,
  type Modulo,
  resolverAtajos,
  teclaDesdeEvento,
} from '@garagepro/core'
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

interface Teclado {
  /** El mapa resuelto: valores por omisión más las diferencias de este usuario. */
  mapa: MapaAtajos
  /** Las acciones que ahora mismo tienen un manejador montado. */
  activas: ReadonlySet<string>
  teclaDe(accion: string): string | undefined
  registrar(accion: string, manejador: () => void): () => void
}

const Contexto = createContext<Teclado | null>(null)

export function ProveedorTeclado({
  children,
  modulo,
  diferencias = {},
}: {
  children: ReactNode
  modulo?: Modulo | undefined
  diferencias?: Diferencias | undefined
}) {
  const mapa = useMemo(() => resolverAtajos(diferencias, modulo), [diferencias, modulo])

  // Los manejadores viven en una ref para que registrar uno no vuelva a renderizar
  // el árbol entero. El Set de activas sí es estado, porque la barra de estado lo mira.
  const manejadores = useRef(new Map<string, () => void>())
  const [activas, setActivas] = useState<ReadonlySet<string>>(new Set())

  const registrar = useCallback((accion: string, manejador: () => void) => {
    manejadores.current.set(accion, manejador)
    setActivas(new Set(manejadores.current.keys()))

    return () => {
      manejadores.current.delete(accion)
      setActivas(new Set(manejadores.current.keys()))
    }
  }, [])

  // Un solo escucha para toda la aplicación. Si cada pantalla pusiera el suyo, en
  // tres meses habría dos donde F2 hace cosas distintas y nadie sabría por qué.
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (!debeDisparar(evento)) return

      const tecla = teclaDesdeEvento(evento)

      for (const [accion, asignada] of Object.entries(mapa)) {
        if (asignada !== tecla) continue

        const manejador = manejadores.current.get(accion)
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
      activas,
      teclaDe: (accion) => mapa[accion],
      registrar,
    }),
    [mapa, activas, registrar],
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
