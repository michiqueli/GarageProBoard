import { contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import {
  type KeyboardEvent,
  type RefObject,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { usePuedeUsar } from '../sesion/permisos.ts'

export type RepuestoElegido = Awaited<ReturnType<typeof api.repuestos.listar>>['datos'][number]

const CLASES_CAMPO =
  'h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none placeholder:text-texto-tenue focus-visible:border-marca'

/** Los repuestos activos que coinciden con lo tipeado, desde la segunda letra. */
function useBusquedaRepuestos(texto: string, activa: boolean) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const puedeVer = usePuedeUsar(contrato.repuestos.listar)
  // Mientras se tipea rápido, no una consulta por letra.
  const buscado = useDeferredValue(texto.trim())
  const consulta = useQuery({
    queryKey: ['repuestos', tenantId, sucursalId, 'selector', buscado],
    queryFn: () =>
      api.repuestos.listar({
        pagina: 1,
        porPagina: 8,
        buscar: buscado,
        estado: 'activos',
        stock: 'todos',
      }),
    enabled: puedeVer && activa && buscado.length >= 2,
  })
  return { puedeVer, buscado, consulta }
}

/**
 * La lista de resultados, fija a la pantalla debajo del campo: las secciones recortan lo que
 * se sale de ellas, y la última fila de una orden dejaría la lista cortada.
 */
function ListaResultados({
  ancla,
  lista,
  texto,
  resultados,
  alElegir,
  alVolver,
}: {
  ancla: RefObject<HTMLElement | null>
  lista: RefObject<HTMLUListElement | null>
  texto: string
  resultados: RepuestoElegido[]
  alElegir: (r: RepuestoElegido) => void
  alVolver: () => void
}) {
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  useLayoutEffect(() => {
    const ubicar = () => {
      const r = ancla.current?.getBoundingClientRect()
      if (r) setPosicion({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 448) })
    }
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [ancla])

  function mover(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      alVolver()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const todos = [...(lista.current?.querySelectorAll('button') ?? [])]
    const actual = todos.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowUp' && actual <= 0) {
      alVolver()
      return
    }
    todos[actual + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
  }

  return (
    <ul
      ref={lista}
      aria-label={`Repuestos que coinciden con ${texto}`}
      onKeyDown={mover}
      style={posicion ?? undefined}
      className="fixed z-40 grid max-h-80 divide-y divide-borde-suave overflow-y-auto rounded-base border border-borde bg-superficie shadow-flotante"
    >
      {resultados.length === 0 && (
        <li className="px-2.5 py-2 text-etiqueta text-texto-suave">
          Ningún repuesto del catálogo coincide con «{texto}». Queda como repuesto suelto, sin mover
          stock.
        </li>
      )}
      {resultados.map((r) => {
        const stock = Number(r.stock)
        return (
          <li key={r.id}>
            <button
              type="button"
              // Con el mouse, que el campo no pierda el foco antes de elegir.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => alElegir(r)}
              className="grid w-full grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 px-2.5 py-1.5 text-left text-dato hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
            >
              <span className="font-mono text-etiqueta">{r.codigo}</span>
              <span className="truncate">
                {r.descripcion}
                {r.marca && <span className="text-texto-tenue"> · {r.marca}</span>}
              </span>
              <span
                className={`tabular font-mono text-etiqueta ${stock <= 0 ? 'text-critico' : r.reponer ? 'text-atencion' : 'text-texto-suave'}`}
              >
                {stock <= 0 ? 'Sin stock' : `Stock ${r.stock}`}
              </span>
              <span className="tabular w-24 text-right font-mono">
                $ {formatearImporte(r.precioVenta)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * La descripción de un renglón de repuesto, que busca en el catálogo mientras se escribe.
 *
 * Se tipea o se pega el código de fábrica, la descripción o el modelo; `Enter` elige el primero,
 * `↓` baja a la lista y `Esc` la cierra. Elegido, el renglón queda enganchado a la pieza —mueve
 * stock— y se ve el código; «Soltar» lo vuelve un repuesto suelto. Si nada coincide, lo escrito
 * queda como repuesto fuera del catálogo.
 */
export function CampoRepuesto({
  etiqueta = 'Repuesto',
  valor,
  onChange,
  codigo,
  vinculado,
  alElegir,
  alSoltar,
  autoFocus = false,
}: {
  etiqueta?: string
  valor: string
  onChange: (texto: string) => void
  /** El código de la pieza del catálogo, si el renglón ya está enganchado a una. */
  codigo: string | null
  vinculado: boolean
  alElegir: (r: RepuestoElegido) => void
  alSoltar: () => void
  autoFocus?: boolean
}) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const [abierta, setAbierta] = useState(false)
  const { puedeVer, buscado, consulta } = useBusquedaRepuestos(valor, abierta && !vinculado)
  const resultados = consulta.data?.datos ?? []
  const mostrar = puedeVer && abierta && !vinculado && buscado.length >= 2 && consulta.data

  function elegir(r: RepuestoElegido) {
    alElegir(r)
    setAbierta(false)
    requestAnimationFrame(() => campo.current?.focus())
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (!mostrar) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const primero = resultados[0]
      if (primero) elegir(primero)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      lista.current?.querySelector('button')?.focus()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setAbierta(false)
    }
  }

  return (
    <div className="grid gap-1">
      {/* El código y «Soltar» van al lado de la etiqueta y no adentro: adentro se sumarían al nombre del campo. */}
      <div className="flex items-baseline gap-2 text-etiqueta">
        <label htmlFor={id} className="font-medium text-texto-suave">
          {etiqueta}
        </label>
        {vinculado && codigo && (
          <>
            <span className="font-mono text-marca">{codigo}</span>
            <button
              type="button"
              onClick={alSoltar}
              className="text-texto-tenue hover:text-texto hover:underline"
              aria-label={`Soltar la pieza ${codigo} del catálogo`}
            >
              Soltar
            </button>
          </>
        )}
      </div>
      <input
        id={id}
        ref={campo}
        // biome-ignore lint/a11y/noAutofocus: el renglón se agrega a pedido y el foco tiene que caer acá
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => {
          onChange(e.target.value)
          setAbierta(true)
        }}
        onKeyDown={teclas}
        onBlur={(e) => {
          if (!lista.current?.contains(e.relatedTarget as Node | null)) setAbierta(false)
        }}
        placeholder={vinculado ? undefined : 'Código, descripción o modelo'}
        autoComplete="off"
        className={CLASES_CAMPO}
      />
      {mostrar && (
        <ListaResultados
          ancla={campo}
          lista={lista}
          texto={buscado}
          resultados={resultados}
          alElegir={elegir}
          alVolver={() => {
            setAbierta(false)
            campo.current?.focus()
          }}
        />
      )}
    </div>
  )
}

/**
 * Buscar una pieza del catálogo y elegirla, para agregarla a una lista (las compras). Al
 * elegir, limpia la búsqueda y queda listo para la próxima.
 */
export function SelectorRepuesto({
  etiqueta = 'Buscar en el catálogo',
  alElegir,
  autoFocus = false,
}: {
  etiqueta?: string
  alElegir: (r: RepuestoElegido) => void
  autoFocus?: boolean
}) {
  const id = useId()
  const [buscar, setBuscar] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const { puedeVer, buscado, consulta } = useBusquedaRepuestos(buscar, true)
  if (!puedeVer) return null
  const resultados = consulta.data?.datos ?? []

  function elegir(r: RepuestoElegido) {
    alElegir(r)
    setBuscar('')
    requestAnimationFrame(() => campo.current?.focus())
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const primero = resultados[0]
      if (primero) elegir(primero)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      lista.current?.querySelector('button')?.focus()
    } else if (e.key === 'Escape' && buscar) {
      e.stopPropagation()
      setBuscar('')
    }
  }

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <input
        id={id}
        ref={campo}
        // biome-ignore lint/a11y/noAutofocus: se abre a pedido y el foco tiene que caer acá
        autoFocus={autoFocus}
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        onKeyDown={teclas}
        placeholder="Código de fábrica, descripción o modelo"
        autoComplete="off"
        className={CLASES_CAMPO}
      />
      {buscado.length >= 2 && consulta.data && (
        <ListaResultados
          ancla={campo}
          lista={lista}
          texto={buscado}
          resultados={resultados}
          alElegir={elegir}
          alVolver={() => campo.current?.focus()}
        />
      )}
    </div>
  )
}
