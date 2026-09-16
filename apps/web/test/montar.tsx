import type { ReglaPermiso } from '@garagepro/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { DatosSesion } from '../src/sesion/almacen.ts'

/**
 * Monta la aplicación entera en una dirección, con el router de verdad y un historial
 * en memoria. Se prueba lo que ve el usuario al pegar esa URL, no un componente suelto.
 *
 * El router se importa acá adentro y no arriba: así cada test puede mockear el cliente
 * de la API antes de que la aplicación lo cargue.
 */
export async function montarApp(ruta: string) {
  const { crearRouter } = await import('../src/rutas.tsx')
  const router = crearRouter({ history: createMemoryHistory({ initialEntries: [ruta] }) })

  // Sin reintentos: un error tiene que verse ya, no después de que el test espere.
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={consultas}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

/**
 * Los permisos de la sesión de prueba.
 *
 * El gerente es el caso de siempre; los otros dos existen porque con un solo usuario
 * que puede todo, un permiso mal aplicado no se nota nunca. Son los mismos roles que
 * siembra `packages/db`, así que lo que se prueba acá es lo que hay en la base.
 */
const GERENTE: ReglaPermiso[] = [{ action: 'administrar', subject: 'all' }]

const MECANICO: ReglaPermiso[] = [{ action: 'ver', subject: ['Orden', 'Vehiculo', 'Repuesto'] }]

const REPUESTERO: ReglaPermiso[] = [
  { action: ['ver', 'crear', 'editar'], subject: ['Repuesto', 'Proveedor'] },
  { action: 'ver', subject: ['Orden', 'Cliente'] },
]

const CENTRAL = { id: 's1', nombre: 'Casa Central', empresaId: 'e1', razonSocial: 'Litoral SAS' }
const NORTE = {
  id: 's2',
  nombre: 'Taller Norte',
  empresaId: 'e2',
  razonSocial: 'Litoral Repuestos SAS',
}

const BASE: DatosSesion = {
  usuario: { id: 'u1', email: 'admin@litoral.test', nombre: 'Martín', apellido: 'Gutiérrez' },
  tenant: { id: 't1', nombre: 'Litoral', slug: 'litoral' },
  sucursalActiva: CENTRAL,
  sucursales: [CENTRAL],
  habilidades: GERENTE,
  atajos: {},
  config: {
    tema: 'oscuro',
    densidad: 'compacta',
    filasPorPagina: 50,
    sucursalPredeterminadaId: null,
  },
}

/** Una sola sucursal: nunca se le pregunta a cuál entrar. */
export const SESION = { access: 'un-access', ...BASE }

/** Dos sucursales de dos SAS distintas y ninguna predeterminada: el caso incómodo. */
export const SESION_VARIAS = { ...SESION, sucursales: [CENTRAL, NORTE] }

export const EN_NORTE = { ...SESION_VARIAS, sucursalActiva: NORTE }

/** La misma forma, de otra persona. */
export const OTRA_PERSONA = {
  ...SESION_VARIAS,
  usuario: { id: 'u2', email: 'caja@litoral.test', nombre: 'Laura', apellido: 'Paz' },
}

/** Ve órdenes y vehículos, no da de alta ninguno de los dos. */
export const SESION_MECANICO = { ...SESION, habilidades: MECANICO }

/** No ve vehículos: el caso que revela un permiso mal aplicado. */
export const SESION_REPUESTERO = { ...SESION, habilidades: REPUESTERO }

/** Recién creado, sin rol asignado: entra y no tiene ni una pantalla. */
export const SESION_SIN_ROL = { ...SESION, habilidades: [] }
