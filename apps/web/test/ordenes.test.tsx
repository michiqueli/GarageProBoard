import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION } from './montar.tsx'
import { conAncho } from './preparar.ts'

const ordenes = {
  listar: vi.fn(),
  ficha: vi.fn(),
  abrir: vi.fn(),
  personal: vi.fn(),
  terminar: vi.fn(),
  items: vi.fn(),
  cambiarEstado: vi.fn(),
  pdf: vi.fn(),
}
const listarVehiculos = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: (x: unknown) => listarVehiculos(x) },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    ordenes: Object.fromEntries(
      Object.keys(ordenes).map((n) => [
        n,
        (x: unknown) => (ordenes as Record<string, (x: unknown) => unknown>)[n]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const TITULAR = {
  id: '22222222-2222-4222-8222-222222222222',
  razonSocial: 'Transportes del Sur SRL',
}
const ORDEN = {
  id: '11111111-1111-4111-8111-111111111111',
  numero: 1,
  estado: 'en_proceso',
  vehiculo: {
    id: '33333333-3333-4333-8333-333333333333',
    dominio: 'AB123CD',
    chasis: '9BWZZZ377VT004251',
    marca: 'Volkswagen',
    modelo: 'Amarok',
  },
  titular: TITULAR,
  paga: TITULAR,
  pedido: 'Service de 50.000 km',
  asesor: 'Martín Gutiérrez',
  mecanico: null,
  prometidaPara: null,
  creadoEn: '2026-09-16T12:00:00.000Z',
  total: '1140200.00',
}
const FICHA = {
  ...ORDEN,
  traeNombre: null,
  traeTelefono: null,
  kilometraje: 48210,
  combustible: 'medio',
  observaciones: null,
  terminadaEn: null,
  entregadaEn: null,
  factura: null,
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      tipo: 'trabajo',
      codigo: null,
      descripcion: 'Service',
      cantidad: '1.0000',
      precioUnitario: '1140200.0000',
      codigoAlicuota: 5,
      total: '1140200.00',
    },
  ],
}

beforeEach(() => {
  for (const f of [...Object.values(ordenes), listarVehiculos, renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  ordenes.listar.mockResolvedValue({ datos: [ORDEN], total: 1 })
  ordenes.ficha.mockResolvedValue(FICHA)
  ordenes.personal.mockResolvedValue({ datos: [] })
})

afterEach(() => {
  cleanup()
  conAncho(1440)
})

describe('el listado', () => {
  it('en escritorio, la tabla con la chapa, el estado y el total a la argentina', async () => {
    await montarApp('/ordenes')
    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByText('OT 000001')).toBeDefined()
    expect(within(tabla).getByText('AB 123 CD')).toBeDefined()
    expect(within(tabla).getByText('$ 1.140.200,00')).toBeDefined()
    expect(within(tabla).getByText('En proceso')).toBeDefined()
  })

  it('en teléfono, tarjetas y no una tabla con scroll horizontal', async () => {
    conAncho(390)
    await montarApp('/ordenes')
    expect(await screen.findByText('OT 000001')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('la recepción', () => {
  it('con teclado: patente, Enter elige el auto y quien paga es el titular; F2 abre la orden', async () => {
    listarVehiculos.mockResolvedValue({
      datos: [
        {
          id: ORDEN.vehiculo.id,
          chasis: ORDEN.vehiculo.chasis,
          dominio: 'AB123CD',
          anio: 2022,
          color: null,
          marca: 'Volkswagen',
          modelo: 'Amarok',
          titular: TITULAR,
        },
      ],
      total: 1,
    })
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    const router = await montarApp('/ordenes/nueva')

    const vehiculo = await screen.findByLabelText('Vehículo')
    await userEvent.type(vehiculo, 'ab123')
    await screen.findByRole('list', { name: 'Vehículos que coinciden con ab123' })
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('Titular: Transportes del Sur SRL')).toBeDefined()

    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')
    await userEvent.keyboard('{F2}')

    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          vehiculoId: ORDEN.vehiculo.id,
          pagaId: TITULAR.id,
          pedido: 'Ruido al frenar',
        }),
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ordenes/${ORDEN.id}`))
  })

  it('sin auto ni pedido no abre, y dice qué falta', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    await userEvent.keyboard('{F2}')
    expect(screen.getByText('Elegí el vehículo que entra.')).toBeDefined()
    expect(ordenes.abrir).not.toHaveBeenCalled()
  })
})

describe('la ficha', () => {
  it('F4 pide confirmar con el total y manda la orden a caja', async () => {
    ordenes.terminar.mockResolvedValue({ ...FICHA, estado: 'terminada' })
    await montarApp(`/ordenes/${ORDEN.id}`)
    await screen.findByRole('region', { name: 'Trabajos y repuestos' })

    await userEvent.keyboard('{F4}')
    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿Terminar la OT 000001 y mandarla a caja?',
    })
    expect(dialogo.textContent).toMatch(/\$ 1\.140\.200,00/)
    ordenes.ficha.mockResolvedValue({ ...FICHA, estado: 'terminada' })
    await confirmarDialogo('Terminar y mandar a caja')
    await waitFor(() => expect(ordenes.terminar).toHaveBeenCalledWith({ id: ORDEN.id }))
    expect(await screen.findByText('Está en caja, esperando que la facturen.')).toBeDefined()
  })
})

describe('los repuestos de la orden', () => {
  it('guardar los renglones no pierde la pieza del catálogo: si se perdiera, volvería al stock', async () => {
    const REPUESTO = '55555555-5555-4555-8555-555555555555'
    ordenes.ficha.mockResolvedValue({
      ...FICHA,
      items: [
        {
          ...FICHA.items[0],
          tipo: 'repuesto',
          repuestoId: REPUESTO,
          codigo: '7701208174',
          descripcion: 'Filtro de aceite',
        },
      ],
    })
    ordenes.items.mockResolvedValue(FICHA)
    await montarApp(`/ordenes/${ORDEN.id}`)
    await screen.findByRole('listitem', { name: 'Item 1' })
    await userEvent.keyboard('{Insert}')
    const nuevo = await screen.findByRole('listitem', { name: 'Item 2' })
    await userEvent.type(within(nuevo).getByLabelText('Descripción'), 'Mano de obra')
    await userEvent.type(within(nuevo).getByLabelText('Precio final'), '1000')
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.items).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({ repuestoId: REPUESTO, codigo: '7701208174' }),
            expect.objectContaining({ repuestoId: null, descripcion: 'Mano de obra' }),
          ],
        }),
      ),
    )
  })
})
