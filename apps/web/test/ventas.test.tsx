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
const clientes = { listar: vi.fn(), crear: vi.fn() }
const padron = { consultar: vi.fn(), porDocumento: vi.fn() }

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: {
      listar: (x: unknown) => clientes.listar(x),
      crear: (x: unknown) => clientes.crear(x),
    },
    padron: {
      consultar: (x: unknown) => padron.consultar(x),
      porDocumento: (x: unknown) => padron.porDocumento(x),
    },
    organizacion: {
      catalogos: vi.fn().mockResolvedValue({
        condicionesIva: [
          { codigo: 1, descripcion: 'IVA Responsable Inscripto' },
          { codigo: 5, descripcion: 'Consumidor Final' },
        ],
        provincias: [{ codigo: 1, nombre: 'Buenos Aires' }],
      }),
    },
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
  for (const f of [
    ...Object.values(ventas),
    ...Object.values(clientes),
    ...Object.values(padron),
    renovar,
  ]) {
    f.mockReset()
  }
  clientes.listar.mockResolvedValue({ datos: [], total: 0 })
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

  it('un gasto nuevo va en porcentaje del precio, y muestra cuánto es', async () => {
    ventas.guardar.mockResolvedValue(FICHA)
    await montarApp(`/ventas/${ID}`)

    const bloque = await screen.findByRole('region', { name: 'Gastos, descuentos y costos' })
    await userEvent.click(within(bloque).getByRole('button', { name: /Agregar/ }))
    const gasto = within(bloque).getByRole('listitem', { name: 'Concepto 3' })
    await userEvent.type(within(gasto).getByLabelText('Descripción'), 'Patentamiento')
    await userEvent.type(within(gasto).getByLabelText('Porcentaje'), '3')
    expect(within(gasto).getByText('$ 30.000,00')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: /^Guardar/ }))
    await waitFor(() =>
      expect(ventas.guardar).toHaveBeenCalledWith(
        expect.objectContaining({
          conceptos: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Patentamiento',
              porcentaje: '3',
              importe: null,
            }),
          ]),
        }),
      ),
    )
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

describe('el comprador que no es cliente', () => {
  it('lo busca en AFIP por el CUIT y lo da de alta ahí mismo', async () => {
    padron.consultar.mockResolvedValue({
      cuit: '30712345671',
      razonSocial: 'Transportes del Sur SA',
      tipoPersona: 'juridica',
      tipoClave: 'CUIT',
      activo: true,
      condicionIva: { codigo: 1, fuente: 'afip', motivo: '' },
      domicilio: {
        direccion: 'San Martín 100',
        localidad: 'Neuquén',
        codigoPostal: '8300',
        provinciaCodigo: 1,
      },
      origen: 'constancia',
    })
    clientes.crear.mockImplementation(async (d: { razonSocial: string }) => ({ id: 'nuevo', ...d }))
    await montarApp('/ventas/nueva')

    await userEvent.type(await screen.findByLabelText('Comprador'), '30-71234567-1')
    expect(await screen.findByText('Transportes del Sur SA')).toBeDefined()
    expect(padron.consultar).toHaveBeenCalledWith({ cuit: '30712345671' })
    await userEvent.click(screen.getByRole('button', { name: 'Darlo de alta con estos datos' }))

    const modal = await screen.findByRole('dialog', { name: 'Nuevo cliente' })
    await waitFor(() =>
      expect((within(modal).getByLabelText('Razón social') as HTMLInputElement).value).toBe(
        'Transportes del Sur SA',
      ),
    )
    await userEvent.click(within(modal).getByRole('button', { name: /Guardar/ }))

    await waitFor(() =>
      expect(clientes.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoDocumento: 80,
          numeroDocumento: '30712345671',
          condicionIva: 1,
          localidad: 'Neuquén',
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Transportes del Sur SA')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeDefined()
  })
})
