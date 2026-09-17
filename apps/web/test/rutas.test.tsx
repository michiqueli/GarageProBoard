import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { EN_NORTE, montarApp, SESION, SESION_VARIAS } from './montar.tsx'

const iniciar = vi.fn()
const cerrar = vi.fn()
const cambiarSucursal = vi.fn()
const listarVehiculos = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: {
      iniciar: (...a: unknown[]) => iniciar(...a),
      cerrar: (...a: unknown[]) => cerrar(...a),
      cambiarSucursal: (...a: unknown[]) => cambiarSucursal(...a),
    },
    vehiculos: { listar: (...a: unknown[]) => listarVehiculos(...a) },
  },
  renovar: () => renovar(),
}))

/** Sin cookie: la recuperación al arrancar no encuentra sesión. */
function sinCookie() {
  renovar.mockResolvedValue(false)
}

/** Con cookie válida: la recuperación trae la sesión, como hace el cliente real. */
function conCookie(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

async function entrarConCorreo() {
  await userEvent.type(await screen.findByLabelText('Correo'), 'admin@litoral.test')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'garageproboard')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

beforeEach(() => {
  for (const f of [iniciar, cerrar, cambiarSucursal, listarVehiculos, renovar]) f.mockReset()
  listarVehiculos.mockResolvedValue({ datos: [], total: 0 })
  cerrar.mockResolvedValue({})
  usarSesion.getState().limpiar()
})

// Primero se desmonta y recién después se limpia la sesión del próximo test: al revés,
// la limpieza haría navegar a un router que ya no importa.
afterEach(cleanup)

describe('sin sesión', () => {
  it('una pantalla protegida manda al login y anota adónde iba', async () => {
    sinCookie()
    const router = await montarApp('/ordenes')

    expect(await screen.findByLabelText('Correo')).toBeDefined()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(router.state.location.search).toEqual({ volver: '/ordenes' })
  })

  it('al entrar lo devuelve adonde iba, con la búsqueda que tenía', async () => {
    sinCookie()
    iniciar.mockResolvedValue(SESION)
    const router = await montarApp('/vehiculos?buscar=AB123CD')

    await entrarConCorreo()

    expect(await screen.findByRole('heading', { name: 'Vehículos', level: 1 })).toBeDefined()
    expect(router.state.location.pathname).toBe('/vehiculos')
    expect(router.state.location.search).toEqual({ buscar: 'AB123CD' })
    expect(screen.getByLabelText<HTMLInputElement>('Buscar').value).toBe('AB123CD')
  })

  it('no acepta un «volver» que lleve a otro sitio', async () => {
    sinCookie()
    iniciar.mockResolvedValue(SESION)
    const router = await montarApp('/entrar?volver=//otro-sitio.example/login')

    await entrarConCorreo()

    // Al inicio, que es la primera pantalla que este usuario puede ver — no al sitio
    // ajeno que traía la dirección.
    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
  })

  it('una dirección que no existe lo dice, y ofrece la salida', async () => {
    sinCookie()
    await montarApp('/esto-no-existe')

    expect(await screen.findByRole('heading', { name: 'Esta dirección no existe' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toBeDefined()
  })
})

describe('al recargar la página', () => {
  it('con la cookie vigente se queda en la pantalla donde estaba', async () => {
    conCookie(SESION)
    const router = await montarApp('/ordenes')

    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
    // Una sola vez: navegar después no vuelve a pedirle la sesión al servidor.
    expect(renovar).toHaveBeenCalledOnce()
  })

  it('recargar en la pantalla de elección vuelve a preguntar, no entra a la primera', async () => {
    conCookie(SESION_VARIAS)
    const router = await montarApp('/ordenes')

    expect(await screen.findByRole('heading', { name: '¿A qué sucursal entrás?' })).toBeDefined()
    expect(router.state.location.pathname).toBe('/sucursal')
  })

  it('no le vuelve a preguntar la sucursal a quien ya eligió', async () => {
    conCookie(EN_NORTE)
    const router = await montarApp('/ordenes')

    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
  })

  it('con sesión, la pantalla de login lleva al inicio', async () => {
    conCookie(SESION)
    const router = await montarApp('/entrar')

    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
  })
})

describe('la sucursal', () => {
  it('con varias, pregunta a cuál entra y después sigue adonde iba', async () => {
    sinCookie()
    iniciar.mockResolvedValue(SESION_VARIAS)
    cambiarSucursal.mockResolvedValue(EN_NORTE)
    const router = await montarApp('/ordenes')

    await entrarConCorreo()

    expect(await screen.findByRole('heading', { name: '¿A qué sucursal entrás?' })).toBeDefined()
    expect(router.state.location.pathname).toBe('/sucursal')

    await userEvent.click(screen.getByRole('button', { name: /Taller Norte/ }))

    expect(
      await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 }),
    ).toBeDefined()
    expect(router.state.location.pathname).toBe('/ordenes')
    expect(cambiarSucursal).toHaveBeenCalledWith({ sucursalId: 's2' })
  })

  it('F6 lleva a cambiarla y vuelve a la misma pantalla, con su búsqueda', async () => {
    conCookie({ ...SESION_VARIAS, sucursalPendiente: false })
    cambiarSucursal.mockResolvedValue(EN_NORTE)
    const router = await montarApp('/vehiculos?buscar=AB1')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.keyboard('{F6}')

    expect(await screen.findByRole('heading', { name: '¿A qué sucursal entrás?' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /Taller Norte/ }))

    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })
    expect(router.state.location.pathname).toBe('/vehiculos')
    expect(router.state.location.search).toEqual({ buscar: 'AB1' })
  })

  it('con una sola, F6 no hace nada', async () => {
    conCookie(SESION)
    const router = await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.keyboard('{F6}')

    expect(router.state.location.pathname).toBe('/vehiculos')
    expect(screen.queryByRole('heading', { name: '¿A qué sucursal entrás?' })).toBeNull()
  })
})

describe('al salir', () => {
  it('va al login sin recordar dónde estaba el anterior', async () => {
    // La PC del mostrador es compartida: el que entra después no tiene por qué caer en
    // la pantalla, ni en la búsqueda, que dejó el turno anterior.
    conCookie(SESION)
    const router = await montarApp('/vehiculos?buscar=AB123CD')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))

    expect(await screen.findByLabelText('Correo')).toBeDefined()
    expect(cerrar).toHaveBeenCalledOnce()
    await waitFor(() => expect(router.state.location.href).toBe('/entrar'))
  })

  it('si la sesión se pierde en el medio, también va al login', async () => {
    conCookie(SESION)
    await montarApp('/ordenes')
    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })

    usarSesion.getState().limpiar()

    expect(await screen.findByLabelText('Correo')).toBeDefined()
  })
})

describe('la navegación', () => {
  it('el menú cambia la dirección, marca la sección y cambia el F4 de la pantalla', async () => {
    conCookie(SESION)
    const router = await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    // En vehículos no hay «cerrar la orden»: F4 es de cada pantalla.
    expect(screen.queryByText('Cerrar la orden')).toBeNull()

    await userEvent.click(screen.getByRole('link', { name: 'Órdenes de trabajo' }))

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(router.state.location.pathname).toBe('/ordenes')
    expect(
      screen.getByRole('link', { name: 'Órdenes de trabajo' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getAllByText('Cerrar la orden').length).toBeGreaterThan(0)
  })

  it('la sección sigue marcada mientras se busca', async () => {
    conCookie(SESION)
    await montarApp('/vehiculos?buscar=AB')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    expect(screen.getByRole('link', { name: 'Vehículos' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('sin permiso, la pantalla dice qué falta y no manda a refrescar', async () => {
    conCookie(SESION)
    const mensaje =
      'Tu usuario no tiene permiso para ver vehículos. Pedíselo a quien administra los usuarios.'
    listarVehiculos.mockRejectedValue(
      new ORPCError('SIN_PERMISO', { status: 403, message: mensaje }),
    )
    await montarApp('/vehiculos')

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(mensaje)
    expect(aviso.textContent).not.toMatch(/refrescar/)
  })

  it('las secciones que todavía no existen no son enlaces', async () => {
    conCookie(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    expect(screen.queryByRole('link', { name: 'Entregas' })).toBeNull()
    expect(screen.getByText('Entregas')).toBeDefined()
  })
})
