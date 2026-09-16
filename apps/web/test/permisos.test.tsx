import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import {
  montarApp,
  SESION,
  SESION_MECANICO,
  SESION_REPUESTERO,
  SESION_SIN_ROL,
  SESION_SIN_TALLER_NI_CAJA,
} from './montar.tsx'

/**
 * Lo que ve cada rol, montando la aplicación de verdad.
 *
 * Se prueba con los roles que siembra la base — gerente, mecánico, repuestero — y no con
 * permisos inventados para el test: si mañana el mecánico deja de ver vehículos, esto
 * tiene que enterarse.
 *
 * Lo que **no** se prueba acá es que el servidor rechace: de eso se ocupan los tests de
 * la API. El front oculta, la API decide, y son dos cosas distintas.
 */

const listarVehiculos = vi.fn()
const renovar = vi.fn()
const leerAvisos = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: {
      iniciar: vi.fn(),
      cerrar: vi.fn().mockResolvedValue({}),
      cambiarSucursal: vi.fn(),
      leerAvisos: (...a: unknown[]) => leerAvisos(...a),
    },
    vehiculos: { listar: (...a: unknown[]) => listarVehiculos(...a) },
  },
  renovar: () => renovar(),
}))

/** Entra con la cookie, como al recargar la página. */
function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [listarVehiculos, renovar]) f.mockReset()
  listarVehiculos.mockResolvedValue({ datos: [], total: 0 })
  usarSesion.getState().limpiar()
})

afterEach(cleanup)

describe('el menú', () => {
  it('con permiso total muestra todas las secciones', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    expect(screen.getByRole('link', { name: 'Vehículos' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Órdenes de trabajo' })).toBeDefined()
    expect(screen.getByText('Caja')).toBeDefined()
    expect(screen.getByText('Repuestos')).toBeDefined()
  })

  it('esconde las secciones que el usuario no puede ver', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    // Ve órdenes, vehículos y repuestos; caja y clientes no son para él.
    expect(screen.getByRole('link', { name: 'Órdenes de trabajo' })).toBeDefined()
    expect(screen.getByText('Repuestos')).toBeDefined()
    expect(screen.queryByText('Caja')).toBeNull()
    expect(screen.queryByText('Clientes')).toBeNull()
  })

  it('las que no existen todavía se ven atenuadas, no escondidas', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    // Caja no tiene pantalla: está, pero no es un enlace.
    expect(screen.getByText('Caja')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Caja' })).toBeNull()
  })
})

describe('el botón con atajo', () => {
  it('aparece si el usuario puede dar de alta', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')

    expect(await screen.findByRole('button', { name: /Nuevo vehículo/ })).toBeDefined()
  })

  it('no aparece sin el permiso de alta, y su tecla no queda registrada', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    expect(screen.queryByRole('button', { name: /Nuevo vehículo/ })).toBeNull()

    // La barra de estado anuncia la tecla igual — es un lugar fijo donde mirar — pero
    // atenuada: sin manejador montado, `Ins` no dispara nada.
    const nuevo = screen.getByText('Nuevo').closest('span')
    expect(nuevo?.className).toContain('opacity-40')
  })
})

describe('una pantalla sin permiso', () => {
  it('dice qué falta y a quién pedírselo, sin dejar al usuario tirado', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/vehiculos')

    expect(
      await screen.findByRole('heading', { name: 'No tenés permiso para ver vehículos' }),
    ).toBeDefined()
    // El menú sigue ahí: desde acá se puede seguir trabajando.
    expect(screen.getByRole('link', { name: 'Órdenes de trabajo' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toBeDefined()
  })

  it('no le pide el listado a la API: el 403 ya se sabe de antemano', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: /No tenés permiso/ })
    expect(listarVehiculos).not.toHaveBeenCalled()
  })
})

describe('el inicio', () => {
  it('lleva a la primera pantalla que el usuario puede ver', async () => {
    entraComo(SESION_REPUESTERO)
    const router = await montarApp('/')

    // El repuestero ve órdenes pero no vehículos: no puede caer en el listado de autos.
    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
  })

  it('sin ninguna pantalla habilitada lo explica en vez de quedar en blanco', async () => {
    entraComo(SESION_SIN_ROL)
    const router = await montarApp('/')

    expect(
      await screen.findByRole('heading', { name: /Todavía no tenés ninguna pantalla habilitada/ }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('el verbo de la pantalla', () => {
  it('sin permiso para cerrar la orden, F4 no hace nada', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('button', { name: /Cerrar la orden/ })).toBeNull()

    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
    await userEvent.keyboard('{F4}')
    expect(alerta).not.toHaveBeenCalled()
    alerta.mockRestore()
  })
})

describe('un módulo que la concesionaria no tiene', () => {
  it('desaparece del menú aunque el usuario pueda todo', async () => {
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    // Ni atenuadas: atenuada es «todavía no está», y esto no va a estar.
    expect(screen.queryByText('Órdenes de trabajo')).toBeNull()
    expect(screen.queryByText('Entregas')).toBeNull()
    expect(screen.queryByText('Caja')).toBeNull()
    // Lo del núcleo y lo de repuestos sigue ahí.
    expect(screen.getByRole('link', { name: 'Vehículos' })).toBeDefined()
    expect(screen.getByText('Repuestos')).toBeDefined()
  })

  it('por un enlace viejo, avisa sin hablar de permisos', async () => {
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    await montarApp('/ordenes')

    expect(
      await screen.findByRole('heading', {
        name: 'Esta sección no está habilitada en la concesionaria',
      }),
    ).toBeDefined()
    expect(screen.queryByText(/permiso/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toBeDefined()
  })

  it('tampoco registra el verbo de la pantalla', async () => {
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: /no está habilitada/ })
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
    await userEvent.keyboard('{F4}')
    expect(alerta).not.toHaveBeenCalled()
    alerta.mockRestore()
  })

  it('el inicio lo salta: el gerente cae en la primera sección contratada', async () => {
    // Con todo contratado, el gerente cae en Órdenes. Sin servicios, en Vehículos.
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    const router = await montarApp('/')

    expect(await screen.findByRole('heading', { name: 'Vehículos', level: 1 })).toBeDefined()
    expect(router.state.location.pathname).toBe('/vehiculos')
  })
})

describe('los avisos', () => {
  it('aparecen al entrar y se van con «Entendido»', async () => {
    leerAvisos.mockResolvedValue({ leidos: 1 })
    entraComo({
      ...SESION,
      avisos: [
        { id: 'a1', texto: 'Tu contraseña la cambió Juan Pérez el 16/9/26, 10:32.', creadoEn: '' },
      ],
    })
    await montarApp('/vehiculos')

    const avisos = await screen.findByRole('alert', { name: 'Avisos' })
    expect(avisos.textContent).toContain('Tu contraseña la cambió Juan Pérez')

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('alert', { name: 'Avisos' })).toBeNull()
    expect(leerAvisos).toHaveBeenCalledWith({ ids: ['a1'] })
  })
})
