import { contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { usePuedeUsar } from '../sesion/permisos.ts'

export type RepuestoElegido = Awaited<ReturnType<typeof api.repuestos.listar>>['datos'][number]

/**
 * Buscar una pieza del catálogo por código, descripción, marca o aplicación, y elegirla.
 *
 * Pensado para pegar el código que devuelve la base de la marca: con espacios, guiones o como
 * venga, el exacto sale primero y `Enter` lo elige. `↓` baja a los resultados. Muestra el
 * stock de la sucursal y el precio, que es lo que se pregunta antes de ofrecer la pieza.
 *
 * No guarda lo elegido: al elegir, limpia la búsqueda y queda listo para la próxima.
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
  const lista = useRef<HTMLUListElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const puedeVer = usePuedeUsar(contrato.repuestos.listar)
  const texto = buscar.trim()

  const consulta = useQuery({
    queryKey: ['repuestos', tenantId, sucursalId, 'selector', texto],
    queryFn: () =>
      api.repuestos.listar({
        pagina: 1,
        porPagina: 8,
        buscar: texto,
        estado: 'activos',
        stock: 'todos',
      }),
    enabled: puedeVer && texto.length >= 2,
  })

  if (!puedeVer) return null

  function elegir(r: RepuestoElegido) {
    alElegir(r)
    setBuscar('')
    requestAnimationFrame(() => campo.current?.focus())
  }

  const botones = () => [...(lista.current?.querySelectorAll('button') ?? [])]

  function moverDesdeCampo(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const primero = consulta.data?.datos[0]
      if (primero) elegir(primero)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      botones()[0]?.focus()
    }
    if (e.key === 'Escape' && buscar) {
      e.stopPropagation()
      setBuscar('')
    }
  }

  function moverEnLista(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const todos = botones()
    const actual = todos.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowUp' && actual <= 0) {
      campo.current?.focus()
      return
    }
    todos[actual + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
  }

  const resultados = consulta.data?.datos ?? []

  return (
    <div className="relative grid gap-1">
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
        onKeyDown={moverDesdeCampo}
        placeholder="Código de fábrica, descripción o modelo"
        autoComplete="off"
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2.5 font-mono text-dato text-texto outline-none placeholder:font-sans placeholder:text-texto-tenue focus-visible:border-marca"
      />
      {texto.length >= 2 && consulta.data && (
        <ul
          ref={lista}
          aria-label={`Repuestos que coinciden con ${texto}`}
          onKeyDown={moverEnLista}
          className="absolute top-full right-0 left-0 z-20 mt-1 grid max-h-80 divide-y divide-borde-suave overflow-y-auto rounded-base border border-borde bg-superficie shadow-lg"
        >
          {resultados.length === 0 && (
            <li className="px-2.5 py-2 text-etiqueta text-texto-suave">
              Ningún repuesto coincide con «{texto}». Si no está en el catálogo, cargalo a mano o
              dalo de alta en Repuestos.
            </li>
          )}
          {resultados.map((r) => {
            const stock = Number(r.stock)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => elegir(r)}
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
      )}
    </div>
  )
}
