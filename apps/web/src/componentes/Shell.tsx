import type { Modulo } from '@garagetick/core'
import type { ReactNode } from 'react'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { useTeclado } from '../teclado/index.ts'
import { BarraEstado } from './BarraEstado.tsx'
import { Tecla } from './Tecla.tsx'

interface Seccion {
  id: string
  etiqueta: string
  icono: ReactNode
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const

const PRINCIPALES: Seccion[] = [
  {
    id: 'tablero',
    etiqueta: 'Tablero',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" />
        <rect x="9" y="2" width="5" height="5" />
        <rect x="2" y="9" width="5" height="5" />
        <rect x="9" y="9" width="5" height="5" />
      </svg>
    ),
  },
  {
    id: 'ordenes',
    etiqueta: 'Órdenes de trabajo',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M3 2h7l3 3v9H3z" />
        <path d="M5.5 8h5M5.5 11h3" />
      </svg>
    ),
  },
  {
    id: 'vehiculos',
    etiqueta: 'Vehículos',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M2 10h12M3.5 10V7l1.5-3h6l1.5 3v3" />
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="11" cy="12" r="1.2" />
      </svg>
    ),
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
      </svg>
    ),
  },
  {
    id: 'repuestos',
    etiqueta: 'Repuestos',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M8 2l5 2.5v6L8 13 3 10.5v-6z" />
        <path d="M8 7.5L13 5M8 7.5v5.2M8 7.5L3 5" />
      </svg>
    ),
  },
  {
    id: 'caja',
    etiqueta: 'Caja',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="4" width="12" height="8" rx="1" />
        <path d="M2 7h12" />
      </svg>
    ),
  },
  {
    id: 'entregas',
    etiqueta: 'Entregas',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M2 8l4 4 8-8" />
      </svg>
    ),
  },
]

const SECUNDARIAS: Seccion[] = [
  {
    id: 'ayuda',
    etiqueta: 'Ayuda',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M6.5 6.2a1.6 1.6 0 113 .8c-.5.5-1.5.7-1.5 1.7M8 11.5v.01" />
      </svg>
    ),
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" />
      </svg>
    ),
  },
]

/**
 * El armazón de la aplicación: navegación, encabezado y barra de estado.
 *
 * La navegación todavía no está enrutada — TanStack Router entra junto con la sesión,
 * en el hito de autenticación. Hasta entonces `seccion` es un valor y no una URL, para
 * no dejar un router a medio cablear.
 */
export function Shell({
  seccion,
  titulo,
  modulo,
  acciones,
  onNavegar,
  children,
}: {
  seccion: string
  titulo: string
  modulo?: Modulo | undefined
  acciones?: ReactNode | undefined
  onNavegar?: ((seccion: string) => void) | undefined
  children: ReactNode
}) {
  const { teclaDe } = useTeclado()
  const datos = usarSesion((e) => e.datos)

  /**
   * Cerrar sesión de verdad: se le avisa al servidor para que anule la familia entera
   * de tokens. Limpiar sólo el estado local dejaría la sesión viva treinta días del
   * lado del servidor, que es exactamente lo que alguien que dice «salir» no quiere.
   */
  async function salir() {
    await api.auth.cerrar({}).catch(() => undefined)
    usarSesion.getState().limpiar()
  }

  /** Vuelve a la pantalla de elección sin cerrar la sesión. */
  function cambiarSucursal() {
    usarSesion.getState().elegirSucursal()
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[13rem_1fr]">
      <aside className="hidden flex-col gap-0.5 border-r border-borde bg-superficie p-2.5 md:flex">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-4">
          <span className="size-4 rotate-45 rounded-[3px] bg-marca" />
          <b className="font-display text-base font-bold tracking-tight">GarageTick</b>
        </div>
        <p className="truncate px-2 pb-3 font-mono text-[10.5px] tracking-[0.1em] text-texto-tenue uppercase">
          {datos?.tenant.nombre ?? '—'}
        </p>

        <Nav secciones={PRINCIPALES} activa={seccion} onNavegar={onNavegar} />
        <div className="mx-2 my-3 h-px bg-borde-suave" />
        <Nav secciones={SECUNDARIAS} activa={seccion} onNavegar={onNavegar} />

        <div className="mt-auto grid gap-2 rounded-base border border-borde p-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-borde bg-superficie-2 text-[10px] font-semibold text-texto-suave">
              {(datos?.usuario.nombre[0] ?? '') + (datos?.usuario.apellido[0] ?? '')}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-etiqueta font-semibold">
                {datos ? `${datos.usuario.nombre[0]}. ${datos.usuario.apellido}` : ''}
              </b>
              <span className="block truncate text-[10.5px] text-texto-tenue">
                {datos?.sucursalActiva.nombre ?? ''}
              </span>
            </span>
          </div>

          <div className="flex gap-1">
            {(datos?.sucursales.length ?? 0) > 1 && (
              <button
                type="button"
                onClick={cambiarSucursal}
                className="flex-1 rounded-[3px] border border-borde px-2 py-1 text-[11px] text-texto-suave hover:bg-superficie-2 hover:text-texto"
              >
                Cambiar sucursal
              </button>
            )}
            <button
              type="button"
              onClick={salir}
              className="flex-1 rounded-[3px] border border-borde px-2 py-1 text-[11px] text-texto-suave hover:border-critico hover:text-critico"
            >
              Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-borde bg-superficie px-4 py-2.5">
          <h1 className="font-display text-lg font-semibold tracking-tight">{titulo}</h1>

          <label className="ml-auto flex h-campo min-w-56 items-center gap-2 rounded-base border border-borde bg-superficie-2 px-2.5">
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
              type="search"
              placeholder="Patente, chasis o cliente"
              className="min-w-0 flex-1 bg-transparent text-dato outline-none placeholder:text-texto-tenue"
            />
            {teclaDe('global.buscar') && <Tecla tecla={teclaDe('global.buscar') ?? ''} />}
          </label>

          <span className="flex h-campo items-center gap-2 rounded-base border border-borde px-2.5 text-dato">
            {datos?.sucursalActiva.nombre ?? ''}
            {teclaDe('global.cambiarSucursal') && (
              <Tecla tecla={teclaDe('global.cambiarSucursal') ?? ''} />
            )}
          </span>

          {acciones}
        </header>

        <main className="grid gap-3 px-4 pt-3.5 pb-14">{children}</main>
      </div>

      <BarraEstado modulo={modulo} />
    </div>
  )
}

function Nav({
  secciones,
  activa,
  onNavegar,
}: {
  secciones: Seccion[]
  activa: string
  onNavegar?: ((seccion: string) => void) | undefined
}) {
  return (
    <nav className="flex flex-col gap-px">
      {secciones.map((s) => {
        const esActiva = s.id === activa
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onNavegar?.(s.id)}
            aria-current={esActiva ? 'page' : undefined}
            className={[
              'flex h-[30px] w-full items-center gap-2.5 rounded-base px-2.5 text-left text-dato',
              esActiva
                ? 'bg-marca-suave font-semibold text-marca'
                : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
            ].join(' ')}
          >
            <span className="size-[15px] shrink-0 [&>svg]:size-full">{s.icono}</span>
            {s.etiqueta}
          </button>
        )
      })}
    </nav>
  )
}
