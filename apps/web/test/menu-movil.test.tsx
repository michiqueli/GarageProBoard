import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION } from './montar.tsx'
import { conAncho } from './preparar.ts'

const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    organizacion: {
      listar: vi.fn().mockResolvedValue({ datos: [] }),
      catalogos: vi.fn().mockResolvedValue({ condicionesIva: [], provincias: [] }),
    },
  },
  renovar: () => renovar(),
}))

beforeEach(() => {
  renovar.mockReset().mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  usarSesion.getState().limpiar()
  conAncho(390)
})

afterEach(() => {
  cleanup()
  conAncho(1440)
})

describe('en el teléfono', () => {
  it('el menú está detrás de un botón, lleva a otra pantalla y se cierra solo', async () => {
    const router = await montarApp('/vehiculos')
    const abrir = await screen.findByRole('button', { name: 'Abrir el menú' })
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull()

    await userEvent.click(abrir)
    const menu = await screen.findByRole('dialog', { name: 'Menú' })
    await userEvent.click(within(menu).getByRole('link', { name: 'Clientes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menú' })).toBeNull())
  })

  it('tiene el buscador del sistema, y Esc lo cierra devolviendo el foco al botón', async () => {
    await montarApp('/vehiculos')
    const abrir = await screen.findByRole('button', { name: 'Abrir el menú' })
    await userEvent.click(abrir)
    const menu = await screen.findByRole('dialog', { name: 'Menú' })

    await userEvent.type(within(menu).getByRole('combobox'), 'usuarios')
    expect(await screen.findByRole('list', { name: 'Lugares del sistema' })).toBeDefined()

    // El primer Esc cierra la lista del buscador; el segundo, el menú.
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Lugares del sistema' })).toBeNull(),
    )
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menú' })).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir el menú' }))
  })

  it('en escritorio no hay botón: el menú está siempre a la vista', async () => {
    conAncho(1440)
    await montarApp('/vehiculos')
    expect(await screen.findByRole('link', { name: 'Clientes' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Abrir el menú' })).toBeNull()
  })
})
