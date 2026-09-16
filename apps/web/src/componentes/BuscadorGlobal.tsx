import { contrato } from '@gpb/contracts'
import { formatearCuit } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { usePuedeUsar } from '../sesion/permisos.ts'
import { useAtajo, useTeclado } from '../teclado/index.ts'
import { Patente } from './Patente.tsx'
import { Tecla } from './Tecla.tsx'

const POR_GRUPO = 5
/** Lo que se espera entre tecla y tecla antes de preguntar: una patente son siete letras seguidas. */
const ESPERA_MS = 250

/** El texto, pero recién cuando se dejó de escribir. */
function useDemorado(valor: string, ms: number) {
  const [demorado, setDemorado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return demorado
}

/**
 * El buscador del encabezado (`F3`): patente, chasis, cliente o CUIT, desde cualquier
 * pantalla.
 *
 * No tiene endpoint propio. Pregunta a los dos listados que ya existen, cada uno sólo si
 * el usuario puede verlo: así el mecánico encuentra autos pero no clientes, sin una regla
 * repetida acá. Busca datos; las pantallas y acciones son del buscador del sistema.
 */
export function BuscadorGlobal() {
  const { teclaDe } = useTeclado()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVehiculos = usePuedeUsar(contrato.vehiculos.listar)
  const puedeClientes = usePuedeUsar(contrato.clientes.listar)

  const campo = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const buscado = useDemorado(texto.trim(), ESPERA_MS)
  const listo = abierto && buscado.length >= 2

  useAtajo(
    'global.buscar',
    () => {
      campo.current?.focus()
      campo.current?.select()
    },
    puedeVehiculos || puedeClientes,
  )

  const vehiculos = useQuery({
    queryKey: ['vehiculos', tenantId, buscado, 'buscador'],
    queryFn: () => api.vehiculos.listar({ pagina: 1, porPagina: POR_GRUPO, buscar: buscado }),
    enabled: listo && puedeVehiculos,
  })
  const clientes = useQuery({
    queryKey: ['clientes', tenantId, buscado, 'todos', 'buscador'],
    queryFn: () =>
      api.clientes.listar({ pagina: 1, porPagina: POR_GRUPO, buscar: buscado, estado: 'todos' }),
    enabled: listo && puedeClientes,
  })

  if (!puedeVehiculos && !puedeClientes) return null

  const cargando = (puedeVehiculos && vehiculos.isPending) || (puedeClientes && clientes.isPending)
  const sinResultados =
    !cargando && (vehiculos.data?.total ?? 0) === 0 && (clientes.data?.total ?? 0) === 0

  function cerrar(devolverFoco: boolean) {
    setAbierto(false)
    if (devolverFoco) campo.current?.focus()
  }

  function enlaces() {
    return [...(panel.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && abierto) {
      // Que no llegue al teclado global: si hay un formulario abierto atrás, Esc cerraría
      // el formulario además del buscador.
      e.stopPropagation()
      e.preventDefault()
      cerrar(true)
      return
    }
    const todos = enlaces()
    const actual = todos.indexOf(document.activeElement as HTMLAnchorElement)

    if (e.key === 'Enter' && e.target === campo.current) {
      e.preventDefault()
      todos[0]?.click()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      todos[actual + 1]?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (actual <= 0) campo.current?.focus()
      else todos[actual - 1]?.focus()
    }
  }

  /** Se cierra cuando el foco sale del buscador entero, no cuando pasa del campo a un resultado. */
  function alSalir(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false)
  }

  function elegido() {
    setAbierto(false)
    setTexto('')
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: el contenedor sólo reparte flechas y Esc entre el campo y los resultados
    <div
      className="relative order-last w-full md:order-none md:ml-auto md:w-auto"
      onKeyDown={alTeclear}
      onBlur={alSalir}
    >
      <label className="flex h-campo items-center gap-2 rounded-base border border-borde bg-superficie-2 px-2.5 focus-within:border-marca md:min-w-64">
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="shrink-0 text-texto-tenue"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          ref={campo}
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          aria-label="Buscar en todo el sistema"
          aria-controls="buscador-global-resultados"
          placeholder={
            puedeVehiculos && puedeClientes
              ? 'Patente, chasis, cliente o CUIT'
              : puedeVehiculos
                ? 'Patente, chasis o titular'
                : 'Cliente o CUIT'
          }
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-dato outline-none placeholder:text-texto-tenue"
        />
        {teclaDe('global.buscar') && <Tecla tecla={teclaDe('global.buscar') ?? ''} />}
      </label>

      {listo && (
        <section
          ref={panel}
          id="buscador-global-resultados"
          aria-label={`Resultados para ${buscado}`}
          className="absolute top-full right-0 left-0 z-10 mt-1 grid max-h-[70vh] overflow-y-auto rounded-base border border-borde bg-superficie md:left-auto md:w-[26rem]"
        >
          {cargando && <p className="px-3 py-2 text-etiqueta text-texto-tenue">Buscando…</p>}

          {!cargando && sinResultados && (
            <p className="px-3 py-3 text-dato text-texto-suave">
              Nada coincide con «{buscado}». Probá con la patente, el chasis, el nombre o el CUIT.
            </p>
          )}

          {puedeVehiculos && (vehiculos.data?.total ?? 0) > 0 && (
            <Grupo
              titulo="Vehículos"
              total={vehiculos.data?.total ?? 0}
              verTodos={
                <Link
                  to="/vehiculos"
                  search={{ buscar: buscado }}
                  onClick={elegido}
                  className="text-etiqueta text-marca hover:underline focus-visible:underline"
                >
                  Ver los {vehiculos.data?.total}
                </Link>
              }
            >
              {vehiculos.data?.datos.map((v) => (
                <li key={v.id}>
                  <Link
                    to="/vehiculos/$id"
                    params={{ id: v.id }}
                    onClick={elegido}
                    className="flex items-center gap-2 px-3 py-1.5 text-dato hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
                  >
                    <Patente dominio={v.dominio} />
                    <span className="truncate">
                      {[v.marca && `${v.marca} ${v.modelo ?? ''}`.trim(), v.titular?.razonSocial]
                        .filter(Boolean)
                        .join(' · ') || v.chasis}
                    </span>
                  </Link>
                </li>
              ))}
            </Grupo>
          )}

          {puedeClientes && (clientes.data?.total ?? 0) > 0 && (
            <Grupo
              titulo="Clientes"
              total={clientes.data?.total ?? 0}
              verTodos={
                <Link
                  to="/clientes"
                  search={{ buscar: buscado }}
                  onClick={elegido}
                  className="text-etiqueta text-marca hover:underline focus-visible:underline"
                >
                  Ver los {clientes.data?.total}
                </Link>
              }
            >
              {clientes.data?.datos.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/clientes/$id"
                    params={{ id: c.id }}
                    onClick={elegido}
                    className="flex items-baseline gap-2 px-3 py-1.5 text-dato hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
                  >
                    <span className="truncate">{c.razonSocial}</span>
                    {!c.activo && (
                      <span className="text-etiqueta text-texto-tenue">desactivado</span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-etiqueta text-texto-tenue">
                      {c.tipoDocumento === 96
                        ? c.numeroDocumento
                        : formatearCuit(c.numeroDocumento)}
                    </span>
                  </Link>
                </li>
              ))}
            </Grupo>
          )}

          <p className="border-t border-borde-suave px-3 py-1.5 text-[10.5px] text-texto-tenue">
            ↑ ↓ para moverse · Enter abre · Esc cierra
          </p>
        </section>
      )}
    </div>
  )
}

function Grupo({
  titulo,
  total,
  verTodos,
  children,
}: {
  titulo: string
  total: number
  verTodos: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className="border-b border-borde-suave py-1 last-of-type:border-b-0"
    >
      <header className="flex items-baseline gap-2 px-3 py-1">
        <h2 className="text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase">
          {titulo}
        </h2>
        {total > POR_GRUPO && <span className="ml-auto">{verTodos}</span>}
      </header>
      <ul>{children}</ul>
    </section>
  )
}
