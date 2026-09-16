import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_MECANICO, SESION_REPUESTERO, SESION_SIN_ROL } from './montar.tsx'

const listarVehiculos = vi.fn()
const fichaVehiculo = vi.fn()
const listarClientes = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: {
      listar: (x: unknown) => listarVehiculos(x),
      ficha: (x: unknown) => fichaVehiculo(x),
      marcas: vi.fn().mockResolvedValue({ datos: [] }),
    },
    clientes: { listar: (x: unknown) => listarClientes(x) },
  },
  renovar: () => renovar(),
}))

const ID = '0b7e3f7a-5a8e-4c1b-9d9e-2f3c4b5a6d7e'

const HILUX = {
  id: ID,
  chasis: '8AJFB8CD5N1234567',
  dominio: 'AE123BC',
  anio: 2022,
  color: null,
  marca: 'Toyota',
  modelo: 'Hilux',
  titular: { id: 'c1', razonSocial: 'Transportes del Sur SRL' },
}

const TRANSPORTES = {
  id: 'c1',
  tipoDocumento: 80,
  numeroDocumento: '30711111111',
  razonSocial: 'Transportes del Sur SRL',
  activo: true,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [listarVehiculos, fichaVehiculo, listarClientes, renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  listarVehiculos.mockResolvedValue({ datos: [HILUX], total: 1 })
  listarClientes.mockResolvedValue({ datos: [TRANSPORTES], total: 1 })
  fichaVehiculo.mockResolvedValue({
    ...HILUX,
    motor: null,
    combustible: null,
    kilometraje: null,
    observaciones: null,
    creadoEn: '2024-03-01T12:00:00.000Z',
    titulares: [],
    historia: [],
  })
})

afterEach(cleanup)

async function buscar(texto: string) {
  await userEvent.keyboard('{F3}')
  const campo = screen.getByRole('searchbox', { name: 'Buscar patente, chasis o cliente' })
  expect(document.activeElement).toBe(campo)
  await userEvent.type(campo, texto)
  return screen.findByRole('region', { name: `Resultados para ${texto}` })
}

describe('el buscador del encabezado', () => {
  it('F3 lo enfoca, y encuentra vehículos y clientes a la vez', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    const resultados = await buscar('transportes')

    const vehiculos = await within(resultados).findByRole('region', { name: 'Vehículos' })
    expect(within(vehiculos).getByText('AE 123 BC')).toBeDefined()
    const clientes = within(resultados).getByRole('region', { name: 'Clientes' })
    expect(within(clientes).getByText('30-71111111-1')).toBeDefined()
    // Una sola consulta por búsqueda, no una por letra.
    expect(listarVehiculos).toHaveBeenCalledTimes(2)
    expect(listarVehiculos).toHaveBeenLastCalledWith(
      expect.objectContaining({ buscar: 'transportes', porPagina: 5 }),
    )
  })

  it('con las flechas y Enter abre la ficha del vehículo', async () => {
    entraComo(SESION)
    const router = await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    const resultados = await buscar('AE123')
    await within(resultados).findByText('AE 123 BC')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe(`/vehiculos/${ID}`))
    expect(screen.queryByRole('region', { name: /Resultados para/ })).toBeNull()
  })

  it('Esc lo cierra y deja el foco en el campo', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await buscar('hilux')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: /Resultados para/ })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Buscar patente, chasis o cliente' }),
    )
  })

  it('sin resultados lo dice', async () => {
    listarVehiculos.mockResolvedValue({ datos: [], total: 0 })
    listarClientes.mockResolvedValue({ datos: [], total: 0 })
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    const resultados = await buscar('zzz')
    expect(await within(resultados).findByText(/Nada coincide con «zzz»/)).toBeDefined()
  })
})

describe('con los permisos de cada uno', () => {
  it('el mecánico encuentra vehículos, y a los clientes ni se les pregunta', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    const resultados = await buscar('transportes')
    await within(resultados).findByRole('region', { name: 'Vehículos' })
    expect(within(resultados).queryByRole('region', { name: 'Clientes' })).toBeNull()
    expect(listarClientes).not.toHaveBeenCalled()
  })

  it('el repuestero encuentra clientes, y no vehículos', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/ordenes')
    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })

    const resultados = await buscar('transportes')
    await within(resultados).findByRole('region', { name: 'Clientes' })
    expect(listarVehiculos).not.toHaveBeenCalled()
  })

  it('quien no puede ver ni una cosa ni la otra no tiene buscador', async () => {
    entraComo(SESION_SIN_ROL)
    await montarApp('/')
    await screen.findByRole('heading', { name: /Todavía no tenés ninguna pantalla/ })

    expect(screen.queryByRole('searchbox', { name: 'Buscar patente, chasis o cliente' })).toBeNull()
  })
})
