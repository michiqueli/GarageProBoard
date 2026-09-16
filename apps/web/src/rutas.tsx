import type { Pantalla } from '@gpb/core'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type ParsedLocation,
  type RouterHistory,
  redirect,
  useMatches,
  useRouter,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { Shell } from './componentes/Shell.tsx'
import { useCacheDeSesion } from './ganchos/useCacheDeSesion.ts'
import { useTema } from './ganchos/useTema.ts'
import { PantallaAuditoria } from './modulos/auditoria/PantallaAuditoria.tsx'
import { PantallaLogin } from './modulos/auth/PantallaLogin.tsx'
import { PantallaSucursal } from './modulos/auth/PantallaSucursal.tsx'
import { PantallaClientes } from './modulos/clientes/PantallaClientes.tsx'
import { PantallaFichaCliente } from './modulos/clientes/PantallaFichaCliente.tsx'
import { PantallaCertificadoAfip } from './modulos/empresas/PantallaCertificadoAfip.tsx'
import { PantallaEmpresas } from './modulos/empresas/PantallaEmpresas.tsx'
import { PantallaOrdenes } from './modulos/ordenes/PantallaOrdenes.tsx'
import { PantallaRoles } from './modulos/roles/PantallaRoles.tsx'
import { PantallaUsuarios } from './modulos/usuarios/PantallaUsuarios.tsx'
import { PantallaFichaVehiculo } from './modulos/vehiculos/PantallaFichaVehiculo.tsx'
import { PantallaVehiculos } from './modulos/vehiculos/PantallaVehiculos.tsx'
import { primeraPantalla } from './navegacion.tsx'
import { usarSesion } from './sesion/almacen.ts'
import { renovar } from './sesion/cliente.ts'
import { autorizacionActual } from './sesion/permisos.ts'
import { ProveedorTeclado } from './teclado/index.ts'

/**
 * Las rutas de la aplicación.
 *
 * **La sesión es la fuente de verdad y las rutas se derivan de ella.** Ninguna pantalla
 * navega después de entrar, de elegir sucursal o de salir: cambia la sesión, y las
 * guardias de cada ruta deciden adónde corresponde estar. Así hay un solo lugar que
 * responde «¿qué ve alguien sin sesión?», en vez de una respuesta por pantalla que
 * tarde o temprano se contradice con otra.
 */

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof crearRouter>
  }
  interface StaticDataRouteOption {
    /** Qué pantalla es, para la acción de F4 y sus teclas propias. */
    pantalla?: Pantalla
  }
}

interface ContextoRutas {
  /** Resuelve cuando ya se sabe si hay sesión: con cookie válida o sin ella. */
  sesionLista(): Promise<unknown>
}

/**
 * Sólo rutas propias. Un `volver=https://otro-sitio` convertiría el inicio de sesión en
 * un trampolín: el usuario entra acá, con nuestra dirección en la barra, y termina en
 * una copia de la pantalla de login pidiéndole la contraseña de nuevo. `//otro-sitio`
 * es lo mismo con un disfraz, porque el navegador lo lee como otra dirección.
 */
function esRutaPropia(valor: string): boolean {
  return valor.startsWith('/') && !valor.startsWith('//') && !valor.startsWith('/\\')
}

const conVolver = z.object({
  volver: z.string().refine(esRutaPropia).optional().catch(undefined),
})

/** Dónde estaba parado, para devolverlo ahí. La raíz no se anota: es el destino igual. */
function volverDesde(location: ParsedLocation): { volver?: string } {
  return location.href === '/' ? {} : { volver: location.href }
}

const raiz = createRootRouteWithContext<ContextoRutas>()({
  beforeLoad: ({ context }) => context.sesionLista(),
  component: Raiz,
  pendingComponent: Esperando,
  notFoundComponent: NoEncontrada,
})

const rutaEntrar = createRoute({
  getParentRoute: () => raiz,
  path: 'entrar',
  validateSearch: conVolver,
  beforeLoad: ({ search }) => {
    if (usarSesion.getState().datos) throw redirect({ href: search.volver ?? '/', replace: true })
  },
  component: PantallaLogin,
})

const rutaSucursal = createRoute({
  getParentRoute: () => raiz,
  path: 'sucursal',
  validateSearch: conVolver,
  beforeLoad: ({ search }) => {
    const { datos, eligiendoSucursal } = usarSesion.getState()
    if (!datos) throw redirect({ to: '/entrar', search, replace: true })
    // Ya eligió, o nunca tuvo que elegir: Atrás hasta acá no puede volver a preguntar.
    if (!eligiendoSucursal) throw redirect({ href: search.volver ?? '/', replace: true })
  },
  component: PantallaSucursal,
})

/**
 * Todo lo que necesita sesión cuelga de acá. Una pantalla nueva queda protegida por el
 * solo hecho de ser hija de esta ruta: no hay una guardia que acordarse de poner.
 */
const conSesion = createRoute({
  getParentRoute: () => raiz,
  id: 'con-sesion',
  beforeLoad: ({ location }) => {
    const { datos, eligiendoSucursal } = usarSesion.getState()
    if (!datos) throw redirect({ to: '/entrar', search: volverDesde(location), replace: true })
    if (eligiendoSucursal) {
      throw redirect({ to: '/sucursal', search: volverDesde(location), replace: true })
    }
  },
  component: ConSesion,
})

/**
 * El inicio manda a la primera pantalla que este usuario pueda ver.
 *
 * No es siempre la misma: el gerente cae en Vehículos y el repuestero caería en una
 * pantalla que no puede ver. Mandar a todos al mismo lado significaba recibir a algunos
 * con un «no tenés permiso» apenas entran.
 *
 * Cuando exista el tablero, el destino de quien puede verlo se cambia acá.
 */
const rutaInicio = createRoute({
  getParentRoute: () => conSesion,
  path: '/',
  beforeLoad: () => {
    const destino = primeraPantalla(autorizacionActual())
    if (destino) throw redirect({ to: destino, replace: true })
  },
  component: SinPantallas,
})

const rutaOrdenes = createRoute({
  getParentRoute: () => conSesion,
  path: 'ordenes',
  staticData: { pantalla: 'ordenes' },
  component: PantallaOrdenes,
})

const rutaVehiculos = createRoute({
  getParentRoute: () => conSesion,
  path: 'vehiculos',
  staticData: { pantalla: 'vehiculos' },
  // Un parámetro mal formado se descarta en vez de romper la pantalla: la URL la puede
  // escribir cualquiera, y un enlace viejo pegado en un chat no merece un error.
  validateSearch: z.object({
    buscar: z.string().optional().catch(undefined),
  }),
  component: PantallaVehiculos,
})

const rutaClientes = createRoute({
  getParentRoute: () => conSesion,
  path: 'clientes',
  staticData: { pantalla: 'clientes' },
  validateSearch: z.object({
    buscar: z.string().optional().catch(undefined),
  }),
  component: PantallaClientes,
})

const rutaFichaVehiculo = createRoute({
  getParentRoute: () => conSesion,
  path: 'vehiculos/$id',
  staticData: { pantalla: 'vehiculos' },
  component: PantallaFichaVehiculo,
})

const rutaFichaCliente = createRoute({
  getParentRoute: () => conSesion,
  path: 'clientes/$id',
  staticData: { pantalla: 'clientes' },
  component: PantallaFichaCliente,
})

const rutaUsuarios = createRoute({
  getParentRoute: () => conSesion,
  path: 'usuarios',
  component: PantallaUsuarios,
})

const rutaRoles = createRoute({
  getParentRoute: () => conSesion,
  path: 'roles',
  component: PantallaRoles,
})

const rutaAuditoria = createRoute({
  getParentRoute: () => conSesion,
  path: 'auditoria',
  component: PantallaAuditoria,
})

const rutaEmpresas = createRoute({
  getParentRoute: () => conSesion,
  path: 'empresas',
  component: PantallaEmpresas,
})

const rutaCertificadoAfip = createRoute({
  getParentRoute: () => conSesion,
  path: 'empresas/$id/certificado-afip',
  component: PantallaCertificadoAfip,
})

const arbol = raiz.addChildren([
  rutaEntrar,
  rutaSucursal,
  conSesion.addChildren([
    rutaInicio,
    rutaOrdenes,
    rutaVehiculos,
    rutaFichaVehiculo,
    rutaClientes,
    rutaFichaCliente,
    rutaUsuarios,
    rutaRoles,
    rutaAuditoria,
    rutaEmpresas,
    rutaCertificadoAfip,
  ]),
])

/**
 * Arma el router. Es una fábrica y no un valor suelto para que cada test tenga el suyo,
 * con su propio historial en memoria y su propio arranque.
 */
export function crearRouter(opciones: { history?: RouterHistory } = {}) {
  // Al arrancar se intenta recuperar la sesión con la cookie que el navegador tenga.
  // Sin esto, recargar la página devolvería al login aunque la sesión siga viva.
  //
  // Se intenta siempre, incluso sin sesión previa: como la cookie es httpOnly, desde
  // acá no hay forma de saber si existe. El costo de averiguarlo es un 401. Y se
  // intenta una sola vez: las navegaciones siguientes reusan la misma promesa.
  let arranque: Promise<unknown> | null = null

  return createRouter({
    routeTree: arbol,
    ...(opciones.history ? { history: opciones.history } : {}),
    context: {
      sesionLista: () => {
        arranque ??= usarSesion.getState().datos ? Promise.resolve() : renovar()
        return arranque
      },
    },
  })
}

/**
 * La raíz: tema, caché y la escucha que reacomoda las rutas cuando cambia la sesión.
 */
function Raiz() {
  const router = useRouter()
  const datos = usarSesion((e) => e.datos)

  useTema(datos?.config.tema)

  // Al cambiar de usuario se tira la caché: en la PC compartida del mostrador, el
  // cambio de turno no puede dejar a la vista los datos del turno anterior.
  useCacheDeSesion(datos?.usuario.id)

  useEffect(
    () =>
      usarSesion.subscribe((actual, anterior) => {
        // Se terminó la sesión: al login, y **sin** `volver`. Quien viene después en esa
        // computadora no tiene por qué caer en la pantalla — ni en la búsqueda — que
        // dejó el anterior. Va por navegación directa y no por las guardias para que
        // no haya carrera entre las dos.
        if (anterior.datos && !actual.datos) {
          void router.navigate({ to: '/entrar', replace: true })
          return
        }

        // Entró alguien, cambió de persona, o eligió sucursal: las guardias deciden.
        // Una renovación del acceso no entra acá — misma persona, mismo estado — y no
        // cuesta volver a correr las rutas cada quince minutos.
        if (
          anterior.datos?.usuario.id !== actual.datos?.usuario.id ||
          anterior.eligiendoSucursal !== actual.eligiendoSucursal
        ) {
          void router.invalidate()
        }
      }),
    [router],
  )

  return <Outlet />
}

/** El proveedor del teclado, con la pantalla que declara la ruta más profunda. */
function ConSesion() {
  const atajos = usarSesion((e) => e.datos?.atajos)
  const pantalla = useMatches({
    select: (coincidencias) =>
      coincidencias.findLast((c) => c.staticData.pantalla)?.staticData.pantalla,
  })

  return (
    <ProveedorTeclado pantalla={pantalla} diferencias={atajos}>
      <Outlet />
    </ProveedorTeclado>
  )
}

/**
 * El estado de arranque.
 *
 * Deliberadamente sobrio: dura lo que tarda un pedido y aparece en cada recarga. Una
 * animación llamativa acá se vuelve molesta a la décima vez que la ves en el día.
 */
function Esperando() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="text-dato text-texto-tenue">Cargando…</p>
    </div>
  )
}

/** Una dirección que no existe: decir qué pasó y ofrecer la salida, sin códigos. */
function NoEncontrada() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <main className="grid max-w-sm gap-3 text-center">
        <h1 className="font-display text-lg font-semibold">Esta dirección no existe</h1>
        <p className="text-dato text-texto-suave">
          Puede ser un enlace viejo o una letra de más. Desde el inicio llegás a todo.
        </p>
        <Link
          to="/"
          className="mx-auto flex h-campo items-center rounded-base border border-marca bg-marca-suave px-3 font-semibold text-dato text-marca"
        >
          Ir al inicio
        </Link>
      </main>
    </div>
  )
}

/**
 * Entró, pero no hay ni una pantalla para mostrarle.
 *
 * Pasa con un usuario recién creado al que todavía no le asignaron rol. Sin esto
 * quedaría mirando una página en blanco y concluiría que el sistema está roto, que es
 * justo lo contrario de lo que pasa: el sistema está cerrado, como corresponde.
 */
function SinPantallas() {
  return (
    <Shell titulo="Inicio" requiere="sesion">
      <section className="grid justify-items-center gap-2 rounded-base border border-borde bg-superficie px-4 py-10 text-center">
        <h2 className="font-display text-dato font-semibold">
          Todavía no tenés ninguna pantalla habilitada
        </h2>
        <p className="max-w-sm text-dato text-texto-suave">
          Tu usuario está bien, le falta el rol. Pedile a quien administra los usuarios de la
          concesionaria que te asigne uno.
        </p>
      </section>
    </Shell>
  )
}
