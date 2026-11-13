import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION } from './montar.tsx'

const ventas = {
  config: vi.fn(),
  guardarConfig: vi.fn(),
  listar: vi.fn(),
  ficha: vi.fn(),
  crear: vi.fn(),
  guardar: vi.fn(),
  confirmar: vi.fn(),
  anular: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    cartera: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    ventas: Object.fromEntries(
      Object.keys(ventas).map((n) => [
        n,
        (x: unknown) => (ventas as Record<string, (x: unknown) => unknown>)[n]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const ID = '5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const RESUMEN = {
  id: ID,
  numero: 12,
  estado: 'borrador' as const,
  unidad: {
    id: 'u1',
    nombre: 'Toyota Hilux 2022',
    dominio: 'AE123BC',
    chasis: '8AJFB8CD5N1234567',
  },
  cliente: { id: 'c1', nombre: 'Gómez, Ana' },
  vendedor: 'Ana Paz',
  sucursal: 'Casa Central',
  fecha: '2026-11-13',
  moneda: 'ARS' as const,
  total: '1030000.00',
  saldo: '330000.00',
}
const FICHA = {
  ...RESUMEN,
  precio: '1000000.00',
  observaciones: null,
  conceptos: [
    {
      tipo: 'gasto_cliente',
      descripcion: 'Patentamiento',
      importe: '80000.00',
      moneda: 'ARS',
      cotizacion: null,
    },
    {
      tipo: 'descuento',
      descripcion: 'Descuento',
      importe: '50000.00',
      moneda: 'ARS',
      cotizacion: null,
    },
  ],
  pagos: [
    {
      medio: 'transferencia',
      importe: '700000.00',
      moneda: 'ARS',
      cotizacion: null,
      detalle: null,
      entidad: null,
      cuotas: null,
      unidadUsada: null,
      reservaId: null,
    },
  ],
  totales: {
    precio: '1000000.00',
    gastosCliente: '80000.00',
    descuentos: '50000.00',
    total: '1030000.00',
    pagado: '700000.00',
    saldo: '330000.00',
    descuentoPorcentaje: '5.0',
    sinConvertir: 0,
    rentabilidad: {
      costoUnidad: '800000.00',
      costosVenta: '0.00',
      margen: '150000.00',
      margenPorcentaje: '18.8',
    },
  },
  requiereAutorizacion: true,
  autorizacionMotivo: null,
  anulacionMotivo: null,
}

beforeEach(() => {
  for (const f of [...Object.values(ventas), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  ventas.listar.mockResolvedValue({ datos: [RESUMEN], total: 1 })
  ventas.ficha.mockResolvedValue(FICHA)
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
})

afterEach(cleanup)

describe('el listado', () => {
  it('dice qué se vende, a quién, y lo que falta cobrar', async () => {
    await montarApp('/ventas')

    expect(await screen.findByRole('link', { name: 'Venta 000012' })).toBeDefined()
    expect(screen.getByText('Gómez, Ana')).toBeDefined()
    expect(screen.getByText('Borrador')).toBeDefined()
    expect(screen.getByText('$ 330.000,00')).toBeDefined()
  })
})

describe('la venta', () => {
  it('suma al tipear, y muestra el margen a quien ve los costos', async () => {
    await montarApp(`/ventas/${ID}`)

    const totales = await screen.findByRole('region', { name: 'Totales' })
    expect(within(totales).getByText('$ 330.000,00')).toBeDefined()
    expect(within(totales).getByText('$ 150.000,00 · 18.8 %')).toBeDefined()

    const pago = screen.getByRole('listitem', { name: 'Pago 1' })
    const importe = within(pago).getByLabelText('Importe')
    await userEvent.clear(importe)
    await userEvent.type(importe, '1030000')
    expect(within(totales).getAllByText('$ 0,00').length).toBeGreaterThan(0)
  })

  it('si el descuento pasa el máximo, confirmar pide el motivo y lo manda', async () => {
    ventas.confirmar
      .mockRejectedValueOnce(
        new ORPCError('REQUIERE_AUTORIZACION', {
          status: 409,
          data: { descuento: '5.0', maximo: 3 },
        }),
      )
      .mockResolvedValueOnce({ ...FICHA, estado: 'confirmada', requiereAutorizacion: false })
    await montarApp(`/ventas/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar la venta' }))
    const pregunta = await screen.findByRole('alertdialog')
    await userEvent.click(within(pregunta).getByRole('button', { name: 'Confirmar la venta' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('El descuento es del 5.0 %, y el máximo es 3 %')).toBeDefined()
    await userEvent.type(within(dialogo).getByLabelText('Por qué'), 'Cliente de muchos años')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Autorizar y confirmar' }))

    await waitFor(() =>
      expect(ventas.confirmar).toHaveBeenLastCalledWith({
        id: ID,
        autorizacion: 'Cliente de muchos años',
      }),
    )
  })
})
