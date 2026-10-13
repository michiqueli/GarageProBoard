import type { Pantalla } from '@gpb/core'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  Outlet,
  type ParsedLocation,
  type RouterHistory,
  redirect,
  useMatches,
  useRouter,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { limpiarAvisos } from './componentes/avisos.ts'
import { DialogoConfirmacion } from './componentes/DialogoConfirmacion.tsx'
import { Notificaciones } from './componentes/Notificaciones.tsx'
import { Shell } from './componentes/Shell.tsx'
import { useCacheDeSesion } from './ganchos/useCacheDeSesion.ts'
import { useDensidad } from './ganchos/useDensidad.ts'
import { useInactividad } from './ganchos/useInactividad.ts'
import { useTema } from './ganchos/useTema.ts'
import { PantallaLogin } from './modulos/auth/PantallaLogin.tsx'
import { PantallaSucursal } from './modulos/auth/PantallaSucursal.tsx'
import { esTabletDeRecepcion } from './modulos/fichaje/estacion.ts'
import { primeraPantalla } from './navegacion.tsx'
import { usarSesion } from './sesion/almacen.ts'
import { renovar } from './sesion/cliente.ts'
import { autorizacionActual } from './sesion/permisos.ts'
import { salir } from './sesion/salir.ts'
import { ProveedorTeclado } from './teclado/index.ts'

// Cada pantalla se descarga recién cuando se abre (`lazyRouteComponent`): quien sólo usa el
// taller no baja caja ni roles, y la primera carga no crece con cada pantalla nueva. Lo que
// comparten —React, el router, el contrato— queda en su propio archivo y se cachea aparte.

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
    /**
     * La densidad que pide la pantalla, por encima de la preferencia del usuario. Es para la
     * recepción en tablet: ahí manda el dedo, elija lo que elija cada uno en su escritorio.
     */
    densidad?: 'tactil'
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

const conVisita = z.object({
  visita: z.uuid().optional().catch(undefined),
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
    // En la tablet de recepción no hay correo y contraseña: se entra con la credencial.
    if (!datos && esTabletDeRecepcion()) throw redirect({ to: '/fichaje', replace: true })
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
    // La tablet de recepción arranca en la recepción, sea quien sea el que entró.
    if (esTabletDeRecepcion()) throw redirect({ to: '/recepcion', replace: true })
    const destino = primeraPantalla(autorizacionActual())
    if (destino) throw redirect({ to: destino, replace: true })
  },
  component: SinPantallas,
})

/**
 * La puerta: quién está esperando, a quién se le derivó y quién lo atiende. Ver
 * `docs/tecnicos/recepcion-y-turnos.md`.
 */
const rutaPuerta = createRoute({
  getParentRoute: () => conSesion,
  path: 'puerta',
  staticData: { pantalla: 'recepcion' },
  component: lazyRouteComponent(
    () => import('./modulos/recepcion/PantallaPuerta.tsx'),
    'PantallaPuerta',
  ),
})

/** Cuánto se espera en la puerta, por motivo y por hora. */
const rutaEsperas = createRoute({
  getParentRoute: () => conSesion,
  path: 'puerta/esperas',
  staticData: { pantalla: 'recepcion' },
  component: lazyRouteComponent(
    () => import('./modulos/recepcion/PantallaEsperas.tsx'),
    'PantallaEsperas',
  ),
})

/** La agenda de turnos del taller. */
const rutaAgenda = createRoute({
  getParentRoute: () => conSesion,
  path: 'agenda',
  staticData: { pantalla: 'recepcion' },
  component: lazyRouteComponent(
    () => import('./modulos/recepcion/PantallaAgenda.tsx'),
    'PantallaAgenda',
  ),
})

const rutaEntregas = createRoute({
  getParentRoute: () => conSesion,
  path: 'entregas',
  // La visita de quien vino a buscar el auto, si se tomó de la puerta: viaja hasta la entrega.
  validateSearch: conVisita,
  staticData: { pantalla: 'entregas' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaEntregas.tsx'),
    'PantallaEntregas',
  ),
})

const rutaEgreso = createRoute({
  getParentRoute: () => conSesion,
  path: 'entregas/$id',
  validateSearch: conVisita,
  staticData: { pantalla: 'entregas' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaEgreso.tsx'),
    'PantallaEgreso',
  ),
})

const rutaCupoAgenda = createRoute({
  getParentRoute: () => conSesion,
  path: 'agenda/cupo',
  staticData: { pantalla: 'recepcion' },
  component: lazyRouteComponent(
    () => import('./modulos/recepcion/PantallaCupoAgenda.tsx'),
    'PantallaCupoAgenda',
  ),
})

const rutaOrdenes = createRoute({
  getParentRoute: () => conSesion,
  path: 'ordenes',
  staticData: { pantalla: 'ordenes' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaOrdenes.tsx'),
    'PantallaOrdenes',
  ),
})

const rutaRecepcion = createRoute({
  getParentRoute: () => conSesion,
  path: 'ordenes/nueva',
  staticData: { pantalla: 'ordenes' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaRecepcion.tsx'),
    'PantallaRecepcion',
  ),
})

/**
 * La recepción en tablet: el mismo flujo que `ordenes/nueva`, en pasos y para el dedo (ver
 * `docs/tecnicos/recepcion-en-tablet.md`). Con sesión, porque quien recibe es una persona y la
 * auditoría tiene que decir quién; lo que cambia es la vista, no quién opera.
 */
const rutaRecepcionTablet = createRoute({
  getParentRoute: () => conSesion,
  path: 'recepcion',
  staticData: { pantalla: 'ordenes', densidad: 'tactil' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaRecepcionTablet.tsx'),
    'PantallaRecepcionTablet',
  ),
})

const rutaFichaOrden = createRoute({
  getParentRoute: () => conSesion,
  path: 'ordenes/$id',
  staticData: { pantalla: 'ordenes' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaFichaOrden.tsx'),
    'PantallaFichaOrden',
  ),
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
  component: lazyRouteComponent(
    () => import('./modulos/vehiculos/PantallaVehiculos.tsx'),
    'PantallaVehiculos',
  ),
})

const rutaClientes = createRoute({
  getParentRoute: () => conSesion,
  path: 'clientes',
  staticData: { pantalla: 'clientes' },
  validateSearch: z.object({
    buscar: z.string().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('./modulos/clientes/PantallaClientes.tsx'),
    'PantallaClientes',
  ),
})

const rutaFichaVehiculo = createRoute({
  getParentRoute: () => conSesion,
  path: 'vehiculos/$id',
  staticData: { pantalla: 'vehiculos' },
  component: lazyRouteComponent(
    () => import('./modulos/vehiculos/PantallaFichaVehiculo.tsx'),
    'PantallaFichaVehiculo',
  ),
})

const rutaFichaCliente = createRoute({
  getParentRoute: () => conSesion,
  path: 'clientes/$id',
  staticData: { pantalla: 'clientes' },
  component: lazyRouteComponent(
    () => import('./modulos/clientes/PantallaFichaCliente.tsx'),
    'PantallaFichaCliente',
  ),
})

const rutaUsuarios = createRoute({
  getParentRoute: () => conSesion,
  path: 'usuarios',
  component: lazyRouteComponent(
    () => import('./modulos/usuarios/PantallaUsuarios.tsx'),
    'PantallaUsuarios',
  ),
})

/**
 * La pantalla de fichaje del taller.
 *
 * Cuelga de la raíz y **no de `conSesion`**: ahí no hay usuario. La PC se autentica con el
 * token de su estación, que es toda la idea (ver `docs/tecnicos/taller-control-de-tiempos.md`,
 * regla 10). Si colgara de `conSesion`, la guardia mandaría al mecánico a iniciar sesión, que
 * es exactamente lo que este módulo existe para evitar.
 */
const rutaFichaje = createRoute({
  getParentRoute: () => raiz,
  path: 'fichaje',
  component: lazyRouteComponent(
    () => import('./modulos/fichaje/PantallaFichaje.tsx'),
    'PantallaFichaje',
  ),
})

const rutaTablero = createRoute({
  getParentRoute: () => conSesion,
  path: 'taller',
  staticData: { pantalla: 'ordenes' },
  component: lazyRouteComponent(
    () => import('./modulos/fichaje/PantallaTablero.tsx'),
    'PantallaTablero',
  ),
})

const rutaEstaciones = createRoute({
  getParentRoute: () => conSesion,
  path: 'estaciones',
  component: lazyRouteComponent(
    () => import('./modulos/fichaje/PantallaEstaciones.tsx'),
    'PantallaEstaciones',
  ),
})

const rutaHojaRecepcion = createRoute({
  getParentRoute: () => conSesion,
  path: 'hoja-recepcion',
  staticData: { pantalla: 'ordenes' },
  component: lazyRouteComponent(
    () => import('./modulos/ordenes/PantallaHojaRecepcion.tsx'),
    'PantallaHojaRecepcion',
  ),
})

const rutaRrhh = createRoute({
  getParentRoute: () => conSesion,
  path: 'rrhh',
  staticData: { pantalla: 'personal' },
  validateSearch: z.object({
    ver: z.enum(['personal', 'asistencia']).optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('./modulos/personal/PantallaRrhh.tsx'),
    'PantallaRrhh',
  ),
})

const rutaRoles = createRoute({
  getParentRoute: () => conSesion,
  path: 'roles',
  component: lazyRouteComponent(() => import('./modulos/roles/PantallaRoles.tsx'), 'PantallaRoles'),
})

const rutaAuditoria = createRoute({
  getParentRoute: () => conSesion,
  path: 'auditoria',
  component: lazyRouteComponent(
    () => import('./modulos/auditoria/PantallaAuditoria.tsx'),
    'PantallaAuditoria',
  ),
})

const rutaEmpresas = createRoute({
  getParentRoute: () => conSesion,
  path: 'empresas',
  component: lazyRouteComponent(
    () => import('./modulos/empresas/PantallaEmpresas.tsx'),
    'PantallaEmpresas',
  ),
})

const rutaCaja = createRoute({
  getParentRoute: () => conSesion,
  path: 'caja',
  staticData: { pantalla: 'caja' },
  component: lazyRouteComponent(() => import('./modulos/caja/PantallaCaja.tsx'), 'PantallaCaja'),
})

const rutaRepuestos = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaRepuestos.tsx'),
    'PantallaRepuestos',
  ),
})

const rutaPedidosRepuestos = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/pedidos',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaPedidos.tsx'),
    'PantallaPedidos',
  ),
})

const rutaNuevoPedido = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/pedidos/nuevo',
  staticData: { pantalla: 'repuestos' },
  // Desde la ficha de una orden se llega con la orden elegida.
  validateSearch: z.object({
    ordenId: z.uuid().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaNuevoPedido.tsx'),
    'PantallaNuevoPedido',
  ),
})

const rutaPedido = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/pedidos/$id',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaPedido.tsx'),
    'PantallaPedido',
  ),
})

const rutaCompras = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/compras',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaCompras.tsx'),
    'PantallaCompras',
  ),
})

const rutaCompra = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/compras/$id',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaCompra.tsx'),
    'PantallaCompra',
  ),
})

const rutaProveedores = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/proveedores',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaProveedores.tsx'),
    'PantallaProveedores',
  ),
})

const rutaFichaRepuesto = createRoute({
  getParentRoute: () => conSesion,
  path: 'repuestos/$id',
  staticData: { pantalla: 'repuestos' },
  component: lazyRouteComponent(
    () => import('./modulos/repuestos/PantallaFichaRepuesto.tsx'),
    'PantallaFichaRepuesto',
  ),
})

/**
 * La configuración personal. No declara `pantalla`: sus teclas son las globales, y el verbo
 * F4 no tiene nada que hacer acá.
 *
 * La pestaña va en la dirección para que el buscador del sistema pueda llevar derecho a las
 * teclas rápidas, que es como la mayoría va a llegar.
 */
const rutaConfiguracion = createRoute({
  getParentRoute: () => conSesion,
  path: 'configuracion',
  validateSearch: z.object({
    ver: z.enum(['generales', 'teclas']).optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('./modulos/configuracion/PantallaConfiguracion.tsx'),
    'PantallaConfiguracion',
  ),
})

const rutaCertificadoAfip = createRoute({
  getParentRoute: () => conSesion,
  path: 'empresas/$id/certificado-afip',
  component: lazyRouteComponent(
    () => import('./modulos/empresas/PantallaCertificadoAfip.tsx'),
    'PantallaCertificadoAfip',
  ),
})

const arbol = raiz.addChildren([
  rutaEntrar,
  rutaSucursal,
  rutaFichaje,
  conSesion.addChildren([
    rutaInicio,
    rutaOrdenes,
    rutaRecepcion,
    rutaRecepcionTablet,
    rutaPuerta,
    rutaAgenda,
    rutaCupoAgenda,
    rutaEntregas,
    rutaEgreso,
    rutaEsperas,
    rutaFichaOrden,
    rutaVehiculos,
    rutaFichaVehiculo,
    rutaClientes,
    rutaFichaCliente,
    rutaUsuarios,
    rutaRrhh,
    rutaTablero,
    rutaEstaciones,
    rutaHojaRecepcion,
    rutaRoles,
    rutaAuditoria,
    rutaEmpresas,
    rutaConfiguracion,
    rutaCertificadoAfip,
    rutaCaja,
    rutaRepuestos,
    rutaFichaRepuesto,
    rutaPedidosRepuestos,
    rutaNuevoPedido,
    rutaPedido,
    rutaCompras,
    rutaCompra,
    rutaProveedores,
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
  // La decide la raíz y no la pantalla: si la estampara la pantalla, el efecto de acá —que
  // corre después del de los hijos— la pisaría con la preferencia del usuario.
  const densidadDeRuta = useMatches({
    select: (ms) => ms.find((m) => m.staticData?.densidad)?.staticData.densidad,
  })
  // En la tablet de recepción todo va al dedo, no sólo la recepción: también la entrega.
  useDensidad(
    densidadDeRuta ?? (datos && esTabletDeRecepcion() ? 'tactil' : datos?.config.densidad),
  )

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
          limpiarAvisos()
          void router.navigate({
            to: esTabletDeRecepcion() ? '/fichaje' : '/entrar',
            replace: true,
          })
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

  // En la tablet de recepción la sesión se cierra sola a los quince minutos sin tocarla.
  const restan = useInactividad(
    Boolean(datos) && esTabletDeRecepcion(),
    MINUTOS_TABLET,
    salirPorInactividad,
  )

  return (
    <>
      <Outlet />
      {restan !== null && (
        <p
          role="status"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-atencion bg-superficie px-4 py-4 text-center text-ui font-semibold text-atencion"
        >
          Se cierra en {restan} s porque nadie la usa. Tocá la pantalla para seguir.
        </p>
      )}
      <Notificaciones />
      <DialogoConfirmacion />
    </>
  )
}

/** Lo que la tablet de recepción espera sin que nadie la toque antes de cerrar la sesión. */
const MINUTOS_TABLET = 15

function salirPorInactividad() {
  void salir()
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
