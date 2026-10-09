import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

/**
 * La pantalla de la puerta.
 *
 * Lo que se prueba es lo que decide la pantalla: que separe por las horas a los que esperan de
 * los que se están atendiendo, que la espera larga se vea de lejos, que se derive y se agarre
 * con teclado, y que «se fue» pregunte antes. La numeración y quién gana cuando dos agarran a
 * la vez se prueban en la API.
 */

const recepcion = {
  hoy: vi.fn(),
  receptores: vi.fn(),
  anotar: vi.fn(),
  atender: vi.fn(),
  cerrar: vi.fn(),
  derivar: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    turnos: { listar: async () => ({ datos: [] }) },
    recepcion: {
      hoy: () => recepcion.hoy(),
      receptores: () => recepcion.receptores(),
      anotar: (e: unknown) => recepcion.anotar(e),
      atender: (e: unknown) => recepcion.atender(e),
      cerrar: (e: unknown) => recepcion.cerrar(e),
      derivar: (e: unknown) => recepcion.derivar(e),
    },
  },
  renovar: () => renovar(),
}))

const AHORA = new Date('2026-10-09T15:00:00.000Z')
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()

const BASE = {
  origen: 'recepcion' as const,
  entidadId: null,
  telefono: null,
  derivadaA: null,
  atendidaPor: null,
  atendidaEn: null,
  cerradaEn: null,
  resultado: null,
  ordenId: null,
  nota: null,
}

const RECIEN = {
  ...BASE,
  id: 'v1',
  numero: 'S-001',
  motivo: 'servicio' as const,
  nombre: 'Juan Pérez',
  telefono: '351 555-1234',
  llegoEn: hace(5),
}
const HACE_RATO = {
  ...BASE,
  id: 'v2',
  numero: 'V-001',
  motivo: 'plan_ahorro' as const,
  nombre: 'Ana López',
  llegoEn: hace(40),
  derivadaA: { id: 'e1', nombre: 'Laura Gómez' },
}
const ATENDIENDO = {
  ...BASE,
  id: 'v3',
  numero: 'S-002',
  motivo: 'servicio' as const,
  nombre: 'Carla Ruiz',
  llegoEn: hace(30),
  atendidaEn: hace(10),
  atendidaPor: { id: 'u9', nombre: 'Diego Sosa' },
}
const SE_FUE = {
  ...BASE,
  id: 'v4',
  numero: 'V-002',
  motivo: 'usados' as const,
  nombre: 'Impaciente',
  llegoEn: hace(90),
  cerradaEn: hace(55),
  resultado: 'se_fue' as const,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

const fila = (texto: string) => screen.getByText(texto).closest('tr') as HTMLElement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AHORA })
  for (const f of [...Object.values(recepcion), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  entraComo(SESION)
  recepcion.hoy.mockResolvedValue({ datos: [RECIEN, HACE_RATO, ATENDIENDO, SE_FUE] })
  recepcion.receptores.mockResolvedValue({
    datos: [
      { id: 'e2', nombre: 'Diego Sosa', puesto: 'asesor', conUsuario: true },
      { id: 'e1', nombre: 'Laura Gómez', puesto: 'vendedor', conUsuario: true },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('la puerta', () => {
  it('separa a los que esperan de los que se están atendiendo, por sus horas', async () => {
    await montarApp('/puerta')
    const esperando = await screen.findByRole('region', { name: 'Esperando' })
    const atendiendo = screen.getByRole('region', { name: 'Atendiendo' })

    expect(within(esperando).getByText('S-001')).toBeDefined()
    expect(within(esperando).getByText('V-001')).toBeDefined()
    expect(within(atendiendo).getByText('S-002')).toBeDefined()
    expect(within(atendiendo).getByText('La tiene Diego Sosa')).toBeDefined()
    // La que terminó no está en ninguna de las dos: va resumida abajo.
    expect(within(esperando).queryByText('V-002')).toBeNull()
    expect(screen.getByText(/1 se fue/)).toBeDefined()
  })

  it('la espera larga se ve de lejos: en rojo y con forma, no sólo con color', async () => {
    await montarApp('/puerta')
    const corta = within(
      await screen.findByText('S-001').then((n) => n.closest('tr') as HTMLElement),
    )
    expect(corta.getByText('5 min').className).not.toMatch(/critico/)

    const larga = within(fila('V-001')).getByText('40 min')
    expect(larga.className).toMatch(/bg-critico-suave/)
    expect(larga.className).toMatch(/rounded-full/)
  })

  it('a quien espera se le cambia a quién lo atiende ahí mismo', async () => {
    recepcion.derivar.mockResolvedValue({
      ...RECIEN,
      derivadaA: { id: 'e2', nombre: 'Diego Sosa' },
    })
    await montarApp('/puerta')
    await screen.findByText('S-001')

    const elegir = within(fila('S-001')).getByRole('combobox', { name: 'Lo atiende' })
    // Para servicio, el asesor va primero.
    expect(within(elegir).getAllByRole('option')[1]?.textContent).toBe(
      'Diego Sosa · Asesor de servicios',
    )
    await userEvent.selectOptions(elegir, 'e2')

    expect(recepcion.derivar).toHaveBeenCalledWith({ id: 'v1', derivadaA: 'e2' })
    expect(await screen.findByText('S-001: lo atiende Diego Sosa')).toBeDefined()
  })

  it('↓ marca la primera que espera y Enter la agarra', async () => {
    recepcion.atender.mockResolvedValue({
      ...RECIEN,
      atendidaEn: AHORA.toISOString(),
      atendidaPor: { id: 'u1', nombre: 'Martín Gutiérrez' },
    })
    await montarApp('/puerta')
    await screen.findByText('S-001')

    await userEvent.keyboard('{ArrowDown}')
    expect(fila('S-001').getAttribute('data-activa')).toBe('true')
    await userEvent.keyboard('{Enter}')

    expect(recepcion.atender).toHaveBeenCalledWith({ id: 'v1' })
    expect(await screen.findByText('S-001 quedó a tu nombre')).toBeDefined()
  })

  it('si otro la agarró antes, el aviso dice quién', async () => {
    const { ORPCError } = await import('@orpc/client')
    recepcion.atender.mockRejectedValue(
      new ORPCError('YA_LA_TIENE', {
        status: 409,
        message: 'Esa visita ya la está atendiendo otra persona',
        data: { nombre: 'Diego Sosa' },
      }),
    )
    await montarApp('/puerta')
    await screen.findByText('S-001')
    await userEvent.click(within(fila('S-001')).getByRole('button', { name: 'Atender' }))

    expect(await screen.findByText('Ya la tiene Diego Sosa')).toBeDefined()
  })

  it('«se fue» pregunta antes, y no es una baja', async () => {
    recepcion.cerrar.mockResolvedValue({
      ...HACE_RATO,
      cerradaEn: AHORA.toISOString(),
      resultado: 'se_fue',
    })
    await montarApp('/puerta')
    await screen.findByText('V-001')

    await userEvent.click(within(fila('V-001')).getByRole('button', { name: 'Se fue' }))
    expect(recepcion.cerrar).not.toHaveBeenCalled()
    await confirmarDialogo('Se fue')

    expect(recepcion.cerrar).toHaveBeenCalledWith({ id: 'v2', resultado: 'se_fue' })
  })

  it('anotar a alguien: a qué vino, quién es y a quién se le deriva', async () => {
    recepcion.anotar.mockResolvedValue({ ...HACE_RATO, id: 'v9', numero: 'V-003' })
    await montarApp('/puerta')
    await screen.findByText('S-001')

    await userEvent.click(screen.getByRole('button', { name: /Anotar a alguien/ }))
    const form = screen.getByRole('form', { name: 'Anotar a alguien que llegó' })
    await userEvent.selectOptions(within(form).getByLabelText('A qué vino'), 'plan_ahorro')
    await userEvent.type(within(form).getByLabelText('Nombre'), 'Rosa Díaz')
    // Para plan de ahorro, la vendedora va primero.
    const lo = within(form).getByLabelText('Lo atiende')
    expect(within(lo).getAllByRole('option')[1].textContent).toBe('Laura Gómez · Vendedor')
    await userEvent.selectOptions(lo, 'e1')
    await userEvent.click(within(form).getByRole('button', { name: /Anotar/ }))

    expect(recepcion.anotar).toHaveBeenCalledWith({
      motivo: 'plan_ahorro',
      nombre: 'Rosa Díaz',
      telefono: '',
      derivadaA: 'e1',
      nota: '',
    })
    expect(await screen.findByText('Anotado con el V-003')).toBeDefined()
  })

  it('el mecánico no tiene la puerta en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')
    await screen.findByRole('link', { name: 'Órdenes de trabajo' })
    expect(screen.queryByRole('link', { name: 'Recepción' })).toBeNull()
  })
})
