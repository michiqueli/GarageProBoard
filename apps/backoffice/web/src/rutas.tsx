import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  type RouterHistory,
  useNavigate,
} from '@tanstack/react-router'
import { api, CLAVE_OPERADOR, esSinSesion } from './cliente.ts'
import { Boton, Esqueleto } from './componentes.tsx'
import { PantallaDetalle } from './pantallas/Detalle.tsx'
import { PantallaEntrar } from './pantallas/Entrar.tsx'
import { PantallaListado } from './pantallas/Listado.tsx'
import { PantallaNueva } from './pantallas/Nueva.tsx'

/**
 * Las rutas del back-office. Todo lo que no es entrar cuelga de `conOperador`, que
 * pregunta al servidor quién está operando: la cookie es `httpOnly` y desde acá no hay
 * otra forma de saber si hay sesión.
 */

const raiz = createRootRoute({ component: Outlet })

const rutaEntrar = createRoute({
  getParentRoute: () => raiz,
  path: 'entrar',
  component: PantallaEntrar,
})

const conOperador = createRoute({
  getParentRoute: () => raiz,
  id: 'con-operador',
  component: ConOperador,
})

const rutaListado = createRoute({
  getParentRoute: () => conOperador,
  path: '/',
  component: PantallaListado,
})

const rutaNueva = createRoute({
  getParentRoute: () => conOperador,
  path: 'nueva',
  component: PantallaNueva,
})

export const rutaDetalle = createRoute({
  getParentRoute: () => conOperador,
  path: 'concesionarias/$id',
  component: PantallaDetalle,
})

const arbol = raiz.addChildren([
  rutaEntrar,
  conOperador.addChildren([rutaListado, rutaNueva, rutaDetalle]),
])

export function crearRouter(opciones: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree: arbol,
    ...(opciones.history ? { history: opciones.history } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof crearRouter>
  }
}

function ConOperador() {
  const cache = useQueryClient()
  const navegar = useNavigate()
  const operador = useQuery({
    queryKey: CLAVE_OPERADOR,
    queryFn: () => api.auth.yo(),
    retry: false,
  })

  if (operador.isPending) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <Esqueleto />
      </div>
    )
  }
  if (operador.isError) {
    if (esSinSesion(operador.error)) return <Navigate to="/entrar" replace />
    return (
      <main className="mx-auto grid max-w-sm gap-3 p-4 pt-16 text-center">
        <h1 className="font-display text-lg font-semibold">No se pudo conectar</h1>
        <p className="text-dato text-texto-suave">
          El servidor del back-office no responde. Probá de nuevo en un momento.
        </p>
        <Boton variante="principal" onClick={() => operador.refetch()}>
          Reintentar
        </Boton>
      </main>
    )
  }

  async function salir() {
    await api.auth.cerrar().catch(() => undefined)
    // Se tira toda la caché: lo que se vio con esta sesión no queda en memoria.
    cache.clear()
    await navegar({ to: '/entrar', replace: true })
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="size-3.5 rotate-45 rounded-[3px] bg-marca" />
            <b className="font-display text-base font-bold tracking-tight">GarageProBoard</b>
            <span className="rounded-base border border-marca px-1.5 font-mono text-etiqueta text-marca uppercase">
              Back-office
            </span>
          </Link>
          <span className="ml-auto text-dato text-texto-suave">{operador.data.nombre}</span>
          <Boton onClick={salir}>Salir</Boton>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}
