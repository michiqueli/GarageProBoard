import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION } from './montar.tsx'

/**
 * La agenda y los turnos de hoy en la puerta. Lo que se prueba es lo que decide la pantalla:
 * la semana con cuántos tiene cada día, agendar con lo mínimo, y que «llegó» y «no vino» se
 * hagan desde la puerta. Los ausentes automáticos y la visita que sale del turno, en la API.
 */

const turnos = {
  listar: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  cancelar: vi.fn(),
  llego: vi.fn(),
  noVino: vi.fn(),
}
const recepcion = { hoy: vi.fn(), receptores: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    turnos: Object.fromEntries(
      Object.keys(turnos).map((n) => [
        n,
        (x: unknown) => (turnos as Record<string, (x: unknown) => unknown>)[n]?.(x),
      ]),
    ),
    recepcion: {
      hoy: () => recepcion.hoy(),
      receptores: () => recepcion.receptores(),
    },
  },
  renovar: () => renovar(),
}))

// Jueves 8 de octubre de 2026, a las 10 de la mañana en Argentina.
const AHORA = new Date('2026-10-08T13:00:00.000Z')

const BASE = {
  estado: 'agendado' as const,
  entidadId: null,
  telefono: null,
  vehiculo: null,
  asesor: null,
  visitaId: null,
}
const HOY_11 = {
  ...BASE,
  id: 't1',
  fechaHora: '2026-10-08T14:00:00.000Z',
  pedido: 'Service de 20.000',
  nombre: 'Rosa Díaz',
  dominio: 'AB123CD',
}
const HOY_15 = {
  ...BASE,
  id: 't2',
  fechaHora: '2026-10-08T18:00:00.000Z',
  pedido: 'Frenos',
  nombre: 'Luis Paz',
  dominio: 'AC456EF',
}
const VIERNES = {
  ...BASE,
  id: 't3',
  fechaHora: '2026-10-09T12:00:00.000Z',
  pedido: 'Alineación',
  nombre: 'Ana López',
  dominio: 'AD789GH',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AHORA })
  for (const f of [...Object.values(turnos), ...Object.values(recepcion), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  turnos.listar.mockResolvedValue({ datos: [HOY_11, HOY_15, VIERNES] })
  recepcion.hoy.mockResolvedValue({ datos: [] })
  recepcion.receptores.mockResolvedValue({
    datos: [{ id: 'e2', nombre: 'Andrea Villalba', puesto: 'asesor', conUsuario: true }],
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('la agenda', () => {
  it('pide la semana de lunes a domingo y muestra el día de hoy, por hora', async () => {
    await montarApp('/agenda')
    const dia = await screen.findByRole('region', { name: 'Turnos del día' })
    expect(turnos.listar).toHaveBeenCalledWith({ desde: '2026-10-05', hasta: '2026-10-11' })
    expect(await within(dia).findByText('Rosa Díaz')).toBeDefined()
    expect(within(dia).getByText('Luis Paz')).toBeDefined()
    expect(within(dia).queryByText('Ana López')).toBeNull()
    expect(within(dia).getByLabelText('Turnos por franja').textContent).toBe('11:00: 1 · 15:00: 1')
  })

  it('→ pasa al día siguiente', async () => {
    await montarApp('/agenda')
    await screen.findByText('Rosa Díaz')
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByText('Ana López')).toBeDefined()
    expect(screen.queryByText('Rosa Díaz')).toBeNull()
  })

  it('agendar con la patente, un nombre y qué le pasa', async () => {
    turnos.crear.mockResolvedValue({ ...VIERNES, id: 't9' })
    await montarApp('/agenda')
    await screen.findByText('Rosa Díaz')

    await userEvent.click(screen.getByRole('button', { name: /Agendar un turno/ }))
    const form = screen.getByRole('form', { name: 'Agendar un turno' })
    const hora = within(form).getByLabelText('Hora')
    await userEvent.clear(hora)
    await userEvent.type(hora, '16:30')
    await userEvent.type(within(form).getByLabelText('Patente'), 'AE111FF')
    await userEvent.type(within(form).getByLabelText('A nombre de'), 'Marta Sosa')
    await userEvent.type(within(form).getByLabelText('Qué le pasa o qué service es'), 'Aceite')
    await userEvent.selectOptions(within(form).getByLabelText('Lo atiende'), 'e2')
    await userEvent.click(within(form).getByRole('button', { name: /Agendar/ }))

    await waitFor(() =>
      expect(turnos.crear).toHaveBeenCalledWith({
        fechaHora: '2026-10-08T16:30:00-03:00',
        vehiculoId: null,
        dominio: 'AE111FF',
        nombre: 'Marta Sosa',
        telefono: '',
        pedido: 'Aceite',
        asesorId: 'e2',
        sobreturno: false,
      }),
    )
  })

  it('cancelar un turno pregunta antes', async () => {
    turnos.cancelar.mockResolvedValue({ ...HOY_11, estado: 'cancelado' })
    await montarApp('/agenda')
    await screen.findByText('Rosa Díaz')

    const fila = screen.getByText('Rosa Díaz').closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Cambiar' }))
    await userEvent.click(screen.getByRole('button', { name: /Cancelar el turno/ }))
    expect(turnos.cancelar).not.toHaveBeenCalled()
    await confirmarDialogo('Cancelar el turno')
    expect(turnos.cancelar).toHaveBeenCalledWith({ id: 't1' })
  })
})

describe('los turnos de hoy en la puerta', () => {
  it('muestra los que faltan llegar, y «Llegó» los manda a la cola', async () => {
    turnos.llego.mockResolvedValue({ numero: 'S-007' })
    await montarApp('/puerta')
    const bloque = await screen.findByRole('region', { name: 'Turnos de hoy' })
    await within(bloque).findByText('Rosa Díaz')
    // El del viernes no es de hoy.
    expect(within(bloque).queryByText('Ana López')).toBeNull()

    const fila = within(bloque).getByText('Rosa Díaz').closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Llegó' }))
    expect(turnos.llego).toHaveBeenCalledWith({ id: 't1' })
    expect(await screen.findByText('Llegó: S-007, a la cola del taller')).toBeDefined()
  })

  it('«No vino» pregunta antes', async () => {
    turnos.noVino.mockResolvedValue({ ...HOY_15, estado: 'ausente' })
    await montarApp('/puerta')
    const bloque = await screen.findByRole('region', { name: 'Turnos de hoy' })
    const fila = (await within(bloque).findByText('Luis Paz')).closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'No vino' }))
    await confirmarDialogo('No vino')
    expect(turnos.noVino).toHaveBeenCalledWith({ id: 't2' })
  })
})

describe('el cupo', () => {
  it('con cupo cuenta por franja y marca la llena', async () => {
    turnos.listar.mockResolvedValue({
      datos: [HOY_11, HOY_15, VIERNES],
      cupo: { minutosFranja: 60, cupo: 1 },
    })
    await montarApp('/agenda')
    const dia = await screen.findByRole('region', { name: 'Turnos del día' })
    await within(dia).findByText('Rosa Díaz')
    expect(within(dia).getByLabelText('Turnos por franja').textContent).toBe(
      '11:00: 1/1, llena · 15:00: 1/1, llena',
    )
  })

  it('con la franja llena pregunta, y como sobreturno lo agenda', async () => {
    turnos.crear
      .mockRejectedValueOnce(
        new ORPCError('FRANJA_LLENA', {
          message: 'Esa franja ya tiene todos los turnos del cupo',
          data: { desde: '16:00', hasta: '17:00', cupo: 2, ocupados: 2 },
        }),
      )
      .mockResolvedValueOnce({ ...VIERNES, id: 't9', sobreturno: true })
    await montarApp('/agenda')
    await screen.findByText('Rosa Díaz')

    await userEvent.click(screen.getByRole('button', { name: /Agendar un turno/ }))
    const form = screen.getByRole('form', { name: 'Agendar un turno' })
    await userEvent.type(within(form).getByLabelText('Patente'), 'AE111FF')
    await userEvent.type(within(form).getByLabelText('A nombre de'), 'Marta Sosa')
    await userEvent.type(within(form).getByLabelText('Qué le pasa o qué service es'), 'Aceite')
    await userEvent.click(within(form).getByRole('button', { name: /Agendar/ }))

    const dialogo = await confirmarDialogo('Agendar como sobreturno')
    expect(dialogo.textContent).toMatch(/16:00 a 17:00 está llena/)
    await waitFor(() =>
      expect(turnos.crear).toHaveBeenLastCalledWith(expect.objectContaining({ sobreturno: true })),
    )
  })
})
