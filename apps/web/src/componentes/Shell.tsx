import type { Acceso } from '@gpb/contracts'
import { describirPermiso } from '@gpb/core'
import { Link, useRouterState } from '@tanstack/react-router'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { ES_ESCRITORIO, useMedia } from '../ganchos/useMedia.ts'
import { PRINCIPALES, SECUNDARIAS, type Seccion, visibles } from '../navegacion.tsx'
import { usarSesion } from '../sesion/almacen.ts'
import { api } from '../sesion/cliente.ts'
import { useAutorizacion, useVeredicto } from '../sesion/permisos.ts'
import { useAtajo, useTeclado } from '../teclado/index.ts'
import { BarraEstado } from './BarraEstado.tsx'
import { BuscadorGlobal } from './BuscadorGlobal.tsx'
import { BuscadorSistema } from './BuscadorSistema.tsx'
import { IconoCerrar, IconoMenu } from './iconos.tsx'
import { Tecla } from './Tecla.tsx'

/**
 * El armazón de la aplicación: navegación, encabezado y barra de estado.
 *
 * La sección activa sale de la URL y no de una prop: el enlace se marca solo cuando su
 * ruta coincide, así que no hay forma de que el menú diga una pantalla y se vea otra.
 *
 * **`requiere` es obligatorio y por eso no se olvida.** Es el equivalente de `@Operacion`
 * en la API: una pantalla nueva no compila hasta decir de qué módulo es y qué permiso
 * pide, y con eso sola queda cubierta. Lo que declare es lo mismo que aplica el
 * servidor — `accesoDeRuta(contrato.vehiculos.listar)` — así que no hay dos reglas.
 */
export function Shell({
  titulo,
  requiere,
  acciones,
  children,
}: {
  titulo: string
  requiere: Acceso
  acciones?: ReactNode | undefined
  children: ReactNode
}) {
  const { teclaDe } = useTeclado()
  const datos = usarSesion((e) => e.datos)
  const autorizacion = useAutorizacion()
  const veredicto = useVeredicto(requiere)
  const puede = veredicto === 'permitido'
  const variasSucursales = (datos?.sucursales.length ?? 0) > 1
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const botonMenu = useRef<HTMLButtonElement>(null)

  // Al llegar a otra pantalla el menú del teléfono se cierra solo: ya hizo su trabajo.
  const ruta = useRouterState({ select: (e) => e.location.pathname })
  // biome-ignore lint/correctness/useExhaustiveDependencies: se cierra cuando cambia la ruta, no cuando cambia el estado
  useEffect(() => {
    setMenuAbierto(false)
  }, [ruta])
  // Y si la ventana se agranda hasta escritorio, deja de tener sentido.
  useEffect(() => {
    if (esEscritorio) setMenuAbierto(false)
  }, [esEscritorio])

  /**
   * Cerrar sesión de verdad: se le avisa al servidor para que anule la familia entera
   * de tokens. Limpiar sólo el estado local dejaría la sesión viva treinta días del
   * lado del servidor, que es exactamente lo que alguien que dice «salir» no quiere.
   *
   * No navega: al quedar sin sesión, las rutas mandan al inicio de sesión por su cuenta.
   */
  async function salir() {
    await api.auth.cerrar({}).catch(() => undefined)
    usarSesion.getState().limpiar()
  }

  /**
   * Vuelve a la pantalla de elección sin cerrar la sesión. Con una sola sucursal la
   * tecla queda atenuada en la barra: no hay a dónde cambiar.
   */
  function cambiarSucursal() {
    usarSesion.getState().elegirSucursal()
  }

  useAtajo('global.cambiarSucursal', cambiarSucursal, variasSucursales)

  // Un solo menú, dibujado donde toque: en escritorio la barra lateral; en el teléfono, el
  // panel que abre el botón del encabezado. Nunca los dos a la vez, porque el buscador del
  // sistema registra su tecla y dos copias se la pisarían.
  const menu = (
    <>
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-4">
        <span className="size-4 rotate-45 rounded-[3px] bg-marca" />
        <b className="font-display text-base font-bold tracking-tight">GarageProBoard</b>
      </div>
      <p className="truncate px-2 pb-3 font-mono text-[10.5px] tracking-[0.1em] text-texto-tenue uppercase">
        {datos?.tenant.nombre ?? '—'}
      </p>

      <BuscadorSistema />

      <Nav secciones={visibles(PRINCIPALES, autorizacion)} />
      <div className="mx-2 my-3 h-px bg-borde-suave" />
      <Nav secciones={visibles(SECUNDARIAS, autorizacion)} />

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
          {variasSucursales && (
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
    </>
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[13rem_1fr]">
      {esEscritorio ? (
        // Pegado a la pantalla y con la altura justa hasta la barra de teclas: con una
        // pantalla larga, el usuario y «Salir» no se van al fondo de la página ni quedan
        // tapados. Si el menú no entra, scrollea él solo.
        <aside className="sticky top-0 flex h-[calc(100dvh-var(--spacing-barra-estado))] flex-col gap-0.5 self-start overflow-y-auto border-r border-borde bg-superficie p-2.5">
          {menu}
        </aside>
      ) : (
        menuAbierto && (
          <MenuMovil
            alCerrar={() => {
              setMenuAbierto(false)
              botonMenu.current?.focus()
            }}
          >
            {menu}
          </MenuMovil>
        )
      )}

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-borde bg-superficie px-4 py-2.5">
          {!esEscritorio && (
            <button
              ref={botonMenu}
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir el menú"
              aria-expanded={menuAbierto}
              className="-ml-1.5 grid size-9 place-items-center rounded-base text-texto-suave hover:bg-superficie-2 hover:text-texto [&>svg]:size-5"
            >
              <IconoMenu />
            </button>
          )}
          <h1 className="font-display text-lg font-semibold tracking-tight">{titulo}</h1>

          <BuscadorGlobal />

          <span className="flex h-campo items-center gap-2 rounded-base border border-borde px-2.5 text-dato">
            {datos?.sucursalActiva.nombre ?? ''}
            {teclaDe('global.cambiarSucursal') && (
              <Tecla tecla={teclaDe('global.cambiarSucursal') ?? ''} />
            )}
          </span>

          {/* Sin permiso no hay verbo: el botón de alta de una pantalla que no se
              puede ni ver sería una promesa falsa, y además registraría su atajo. */}
          {puede && acciones}
        </header>

        <main className="grid gap-3 px-4 pt-3.5 pb-[calc(var(--spacing-barra-estado)+1.5rem)]">
          <Avisos />
          {veredicto === 'permitido' ? (
            children
          ) : veredicto === 'modulo-apagado' ? (
            <NoHabilitada />
          ) : (
            <SinPermiso acceso={requiere} />
          )}
        </main>
      </div>

      <BarraEstado />
    </div>
  )
}

/**
 * El menú en el teléfono: un panel que entra desde la izquierda, sobre un velo. Se cierra
 * con la X, tocando afuera, con `Esc` o al ir a otra pantalla. Mientras está abierto, el
 * foco no se escapa a la pantalla de atrás.
 */
function MenuMovil({ alCerrar, children }: { alCerrar: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button, a, input')?.focus()
    // Sin scroll de fondo: en el teléfono, arrastrar el menú movería la pantalla de atrás.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      alCerrar()
      return
    }
    if (e.key !== 'Tab') return
    const focables = [
      ...(panel.current?.querySelectorAll<HTMLElement>('a[href], button, input') ?? []),
    ]
    const primero = focables[0]
    const ultimo = focables.at(-1)
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo?.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar el menú"
        tabIndex={-1}
        onClick={alCerrar}
        className="absolute inset-0 animate-aparecer bg-velo"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        onKeyDown={teclas}
        tabIndex={-1}
        // Si el foco se va a ningún lado —el buscador lo suelta al cerrar su lista—, vuelve al
        // panel: así Esc sigue cerrando el menú y el Tab no cae en la pantalla de atrás.
        onBlur={() =>
          requestAnimationFrame(() => {
            const actual = document.activeElement
            if (panel.current && (!actual || actual === document.body)) panel.current.focus()
          })
        }
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-0.5 overflow-y-auto outline-none border-r border-borde bg-superficie p-2.5 shadow-flotante"
      >
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar el menú"
          className="absolute top-2 right-2 grid size-9 place-items-center rounded-base text-texto-suave hover:bg-superficie-2 hover:text-texto [&>svg]:size-5"
        >
          <IconoCerrar />
        </button>
        {children}
      </div>
    </div>
  )
}

const CLASES_ITEM =
  'flex h-[30px] w-full items-center gap-2.5 rounded-base px-2.5 text-left text-dato'

function Nav({ secciones }: { secciones: Seccion[] }) {
  return (
    <nav className="flex flex-col gap-px">
      {secciones.map((s) => {
        const contenido = (
          <>
            <span className="size-[15px] shrink-0 [&>svg]:size-full">{s.icono}</span>
            {s.etiqueta}
          </>
        )

        // Una sección sin pantalla se muestra igual, para que el menú tenga su forma
        // definitiva desde ahora, pero atenuada y sin llevar a ningún lado. Un enlace
        // que abre una pantalla vacía hace pensar que algo se rompió.
        if (!s.to) {
          return (
            <span
              key={s.id}
              aria-disabled="true"
              title="Todavía no está disponible"
              className={`${CLASES_ITEM} cursor-default text-texto-tenue opacity-60`}
            >
              {contenido}
            </span>
          )
        }

        return (
          <Link
            key={s.id}
            to={s.to}
            // El listado filtrado sigue siendo la misma sección: sin esto, buscar una
            // patente apagaría el resaltado del menú.
            activeOptions={{ includeSearch: false }}
            className={CLASES_ITEM}
            activeProps={{ className: 'bg-marca-suave font-semibold text-marca' }}
            inactiveProps={{ className: 'text-texto-suave hover:bg-superficie-2 hover:text-texto' }}
          >
            {contenido}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Lo que le pasó a quien está usando el sistema mientras no estaba: «Tu contraseña la
 * cambió Juan Pérez el 16/9 a las 10:32».
 *
 * Va arriba de cualquier pantalla y no en una sección aparte, porque lo que importa es que
 * lo vea al entrar, no que lo encuentre si lo busca. Queda hasta que dice «Entendido».
 */
function Avisos() {
  const avisos = usarSesion((e) => e.datos?.avisos ?? [])

  async function entendido() {
    const ids = avisos.map((a) => a.id)
    // Se sacan de la pantalla aunque falle el pedido: el aviso ya se leyó, y si no llegó
    // a marcarse, vuelve a aparecer la próxima vez que entre, que es lo correcto.
    const { datos, actualizarDatos } = usarSesion.getState()
    if (datos) actualizarDatos({ ...datos, avisos: [] })
    await api.auth.leerAvisos({ ids }).catch(() => undefined)
  }

  if (avisos.length === 0) return null

  return (
    <section
      role="alert"
      aria-label="Avisos"
      className="grid gap-2 rounded-base border border-atencion bg-superficie px-3 py-2.5"
    >
      <ul className="grid gap-1">
        {avisos.map((a) => (
          <li key={a.id} className="text-dato">
            {a.texto}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={entendido}
        className="h-campo w-fit rounded-base border border-borde px-3 text-dato text-texto-suave hover:bg-superficie-2 hover:text-texto"
      >
        Entendido
      </button>
    </section>
  )
}

/**
 * Lo que se ve en lugar de la pantalla cuando la concesionaria no tiene el módulo.
 *
 * Llega acá sólo quien tenía un enlace guardado: en el menú la sección ni aparece. Por
 * eso no habla de permisos — no hay a quién pedírselo — y no ofrece contratar nada: lo
 * que no es de esta concesionaria no se le muestra, tampoco en un aviso.
 */
function NoHabilitada() {
  return (
    <section className="grid justify-items-center gap-2 rounded-base border border-borde bg-superficie px-4 py-10 text-center">
      <h2 className="font-display text-dato font-semibold">
        Esta sección no está habilitada en la concesionaria
      </h2>
      <p className="max-w-sm text-dato text-texto-suave">
        Puede ser un enlace guardado de antes. Desde el menú llegás a todo lo que está habilitado.
      </p>
      <Link
        to="/"
        className="mt-1 flex h-campo items-center rounded-base border border-marca bg-marca-suave px-3 font-semibold text-dato text-marca"
      >
        Ir al inicio
      </Link>
    </section>
  )
}

/**
 * Lo que se ve en lugar de la pantalla cuando el permiso falta.
 *
 * Va adentro del armazón, con el menú y la barra: quien llegó acá por un enlace viejo o
 * un favorito tiene que poder seguir trabajando, no quedarse en una página muerta. Y
 * dice qué permiso falta y a quién pedírselo, con las mismas palabras que usa la API
 * cuando rechaza la operación.
 */
function SinPermiso({ acceso }: { acceso: Acceso }) {
  const que =
    typeof acceso === 'string' ? 'esta pantalla' : describirPermiso(acceso.accion, acceso.sujeto)

  return (
    <section className="grid justify-items-center gap-2 rounded-base border border-borde bg-superficie px-4 py-10 text-center">
      <h2 className="font-display text-dato font-semibold">No tenés permiso para {que}</h2>
      <p className="max-w-sm text-dato text-texto-suave">
        Pedíselo a quien administra los usuarios de la concesionaria. Mientras tanto, desde el menú
        llegás a lo que sí tenés habilitado.
      </p>
      <Link
        to="/"
        className="mt-1 flex h-campo items-center rounded-base border border-marca bg-marca-suave px-3 font-semibold text-dato text-marca"
      >
        Ir al inicio
      </Link>
    </section>
  )
}
