import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION } from './montar.tsx'

/**
 * Los motivos de espera: se agregan propios y se apagan, preguntando antes. No hay baja.
 */

const motivosEspera = { listar: vi.fn(), crear: vi.fn(), editar: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    motivosEspera: {
      listar: () => motivosEspera.listar(),
      crear: (x: unknown) => motivosEspera.crear(x),
      editar: (x: unknown) => motivosEspera.editar(x),
    },
  },
  renovar: () => renovar(),
}))

const MOTIVOS = [
  { id: 'm1', nombre: 'Repuestos', activo: true, propio: false },
  { id: 'm2', nombre: 'Elevador libre', activo: true, propio: false },
]

beforeEach(() => {
  for (const f of [...Object.values(motivosEspera), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  motivosEspera.listar.mockResolvedValue({ datos: MOTIVOS })
})

afterEach(cleanup)

describe('los motivos de espera', () => {
  it('agrega uno propio al final', async () => {
    motivosEspera.crear.mockResolvedValue({
      datos: [...MOTIVOS, { id: 'm3', nombre: 'Lavadero', activo: true, propio: true }],
    })
    await montarApp('/taller/motivos-espera')

    await userEvent.click(await screen.findByRole('button', { name: /Agregar/ }))
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Lavadero')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(motivosEspera.crear).toHaveBeenCalledWith({ nombre: 'Lavadero' }))
    expect(await screen.findByText('Lavadero')).toBeDefined()
  })

  it('apagar uno pregunta antes, y no lo borra', async () => {
    motivosEspera.editar.mockResolvedValue({
      datos: [MOTIVOS[0], { ...MOTIVOS[1], activo: false }],
    })
    await montarApp('/taller/motivos-espera')

    const elevador = (await screen.findByText('Elevador libre')).closest('li') as HTMLElement
    await userEvent.click(within(elevador).getByRole('button', { name: 'Dejar de usar' }))
    await confirmarDialogo('Dejar de usarlo')

    await waitFor(() =>
      expect(motivosEspera.editar).toHaveBeenCalledWith({
        id: 'm2',
        nombre: 'Elevador libre',
        activo: false,
      }),
    )
    expect(await screen.findByText('No se usa')).toBeDefined()
  })
})
