import { contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { usePuedeUsar } from '../sesion/permisos.ts'
import { Patente } from './Patente.tsx'

type Listado = Awaited<ReturnType<typeof api.vehiculos.listar>>['datos'][number]
export type VehiculoElegido = Listado

/**
 * Elegir un vehículo escribiendo su patente, su chasis o el nombre del titular. Igual que el
 * selector de clientes: se escribe, `↓` baja, `Enter` elige el primero. Es la entrada de la
 * recepción, y el asesor la hace sin mirar el teclado.
 */
export function SelectorVehiculo({
  etiqueta,
  valor,
  onChange,
  autoFocus = false,
}: {
  etiqueta: string
  valor: VehiculoElegido | null
  onChange: (vehiculo: VehiculoElegido | null) => void
  autoFocus?: boolean
}) {
  const id = useId()
  const [buscar, setBuscar] = useState('')
  const lista = useRef<HTMLUListElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.vehiculos.listar)
  const texto = buscar.trim()

  const consulta = useQuery({
    queryKey: ['vehiculos', tenantId, texto, 'selector'],
    queryFn: () => api.vehiculos.listar({ pagina: 1, porPagina: 8, buscar: texto }),
    enabled: puedeVer && !valor && texto.length >= 2,
  })

  if (valor) {
    return (
      <div className="grid gap-1">
        <span className="text-etiqueta font-medium text-texto-suave">{etiqueta}</span>
        <div className="flex min-h-campo flex-wrap items-center gap-2 rounded-base border border-borde bg-superficie-2 px-2.5 py-1 text-dato">
          <Patente dominio={valor.dominio} />
          <span className="truncate">
            {[valor.marca, valor.modelo, valor.anio].filter(Boolean).join(' ') || valor.chasis}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setBuscar('')
              requestAnimationFrame(() => campo.current?.focus())
            }}
            className="ml-auto text-etiqueta text-marca hover:underline"
          >
            Cambiar
          </button>
        </div>
      </div>
    )
  }

  const botones = () => [...(lista.current?.querySelectorAll('button') ?? [])]

  function moverDesdeCampo(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const primero = consulta.data?.datos[0]
      if (primero) onChange(primero)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      botones()[0]?.focus()
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
        // biome-ignore lint/a11y/noAutofocus: la recepción empieza acá
        autoFocus={autoFocus}
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        onKeyDown={moverDesdeCampo}
        placeholder="Patente, chasis o titular"
        autoComplete="off"
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none placeholder:text-texto-tenue focus-visible:border-marca"
      />
      {texto.length >= 2 && consulta.data && (
        <ul
          ref={lista}
          aria-label={`Vehículos que coinciden con ${texto}`}
          onKeyDown={moverEnLista}
          className="grid divide-y divide-borde-suave overflow-hidden rounded-base border border-borde bg-superficie"
        >
          {resultados.length === 0 && (
            <li className="px-2.5 py-2 text-etiqueta text-texto-suave">
              Ningún vehículo coincide con «{texto}». Si es la primera vez que viene, dalo de alta
              en Vehículos.
            </li>
          )}
          {resultados.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onChange(v)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-dato hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
              >
                <Patente dominio={v.dominio} />
                <span className="truncate">{[v.marca, v.modelo].filter(Boolean).join(' ')}</span>
                <span className="ml-auto truncate text-etiqueta text-texto-tenue">
                  {v.titular?.razonSocial ?? 'sin titular'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
