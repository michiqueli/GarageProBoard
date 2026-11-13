import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_VARIAS } from './montar.tsx'

const cartera = {
  config: vi.fn(),
  guardarConfig: vi.fn(),
  listar: vi.fn(),
  ficha: vi.fn(),
  ingresar: vi.fn(),
  editar: vi.fn(),
  trasladar: vi.fn(),
  reservar: vi.fn(),
  liberar: vi.fn(),
  retirar: vi.fn(),
}
const listarClientes = vi.fn()
const costos = { ver: vi.fn(), agregar: vi.fn(), anular: vi.fn(), categorias: vi.fn() }
const renovar = vi.fn()
const crearVehiculo = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: { listar: (x: unknown) => listarClientes(x) },
    vehiculos: {
      listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }),
      marcas: vi.fn().mockResolvedValue({ datos: [] }),
      crear: (x: unknown) => crearVehiculo(x),
    },
    costosUnidad: {
      ver: (x: unknown) => costos.ver(x),
      agregar: (x: unknown) => costos.agregar(x),
      anular: (x: unknown) => costos.anular(x),
      categorias: () => costos.categorias(),
    },
    cartera: Object.fromEntries(
      Object.keys(cartera).map((n) => [
        n,
        (x: unknown) => (cartera as Record<string, (x: unknown) => unknown>)[n]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const POR_OMISION = {
  trasladoEntreEmpresas: 'solo_ubicacion',
  reservaModo: 'bloquea',
  reservaDias: 7,
  reservaExigeSena: false,
  tenenciaUsado: 'propia',
  moneda: 'ARS',
}

const ID = '0b7e3f7a-5a8e-4c1b-9d9e-2f3c4b5a6d7e'
const UNIDAD = {
  id: ID,
  condicion: 'usado',
  tenencia: 'propia',
  origen: 'compra',
  estado: 'disponible',
  vehiculo: {
    id: 'v1',
    dominio: 'AE123BC',
    chasis: '8AJFB8CD5N1234567',
    marca: 'Toyota',
    modelo: 'Hilux',
    anio: 2022,
    color: null,
  },
  empresa: { id: 'e1', nombre: 'Litoral SAS' },
  consignante: null,
  sucursal: { id: 's1', nombre: 'Casa Central' },
  precio: '35000.00',
  moneda: 'USD',
  fechaIngreso: '2026-11-01',
  diasEnStock: 7,
  reservas: [],
}
const FICHA = {
  ...UNIDAD,
  observaciones: null,
  retiroMotivo: null,
  historialReservas: [],
  movimientos: [
    {
      id: 'm1',
      tipo: 'ingreso',
      detalle: 'Ingresó al stock en Casa Central',
      comprobante: null,
      creadoEn: '2026-11-01T12:00:00.000Z',
      autor: 'Ana Paz',
    },
  ],
}

const TOTALES_VACIOS = {
  compra: '0.00',
  gastos: '0.00',
  bonificaciones: '0.00',
  costo: '0.00',
  margen: '35000.00',
  margenPorcentaje: null,
  sinConvertir: 0,
}
const SIN_COSTOS = { moneda: 'USD', precio: '35000.00', conceptos: [], totales: TOTALES_VACIOS }

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(cartera), ...Object.values(costos), listarClientes, renovar]) {
    f.mockReset()
  }
  costos.ver.mockResolvedValue(SIN_COSTOS)
  costos.categorias.mockResolvedValue({ datos: [{ id: 'k1', nombre: 'Flete', activo: true }] })
  usarSesion.getState().limpiar()
  cartera.config.mockResolvedValue(POR_OMISION)
  cartera.listar.mockResolvedValue({ datos: [UNIDAD], total: 1 })
  cartera.ficha.mockResolvedValue(FICHA)
  listarClientes.mockResolvedValue({
    datos: [
      { id: 'c1', razonSocial: 'Gómez, Ana', tipoDocumento: 96, numeroDocumento: '20123456' },
    ],
    total: 1,
  })
  entraComo(SESION)
})

afterEach(cleanup)

async function elegirCliente(etiqueta: RegExp | string) {
  await userEvent.type(await screen.findByLabelText(etiqueta), 'Gómez')
  await userEvent.click(await screen.findByRole('button', { name: /Gómez, Ana/ }))
}

describe('el listado', () => {
  it('dice qué hay, de quién es, dónde está y a cuánto', async () => {
    await montarApp('/stock')

    expect(await screen.findByRole('link', { name: 'Toyota Hilux 2022' })).toBeDefined()
    expect(screen.getByText('Usado · Propia')).toBeDefined()
    expect(screen.getByText('Litoral SAS')).toBeDefined()
    expect(screen.getByText('US$ 35.000,00')).toBeDefined()
    expect(screen.getByText('Disponible')).toBeDefined()
  })
})

describe('la configuración decide', () => {
  it('la guarda con las opciones elegidas, y vacío es que no vence', async () => {
    cartera.guardarConfig.mockImplementation(async (x: unknown) => x)
    await montarApp('/stock/configuracion')

    await userEvent.selectOptions(
      await screen.findByLabelText('Cuando una unidad ya está reservada'),
      'avisa',
    )
    await userEvent.clear(screen.getByLabelText('Días que dura una reserva'))
    await userEvent.click(screen.getByLabelText('Pedir seña para reservar'))
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(() =>
      expect(cartera.guardarConfig).toHaveBeenCalledWith({
        ...POR_OMISION,
        reservaModo: 'avisa',
        reservaDias: null,
        reservaExigeSena: true,
      }),
    )
  })

  it('el usado arranca como la concesionaria eligió, y se puede cambiar', async () => {
    cartera.config.mockResolvedValue({ ...POR_OMISION, tenenciaUsado: 'consignacion' })
    await montarApp('/stock/ingresar')

    const tenencia = (await screen.findByLabelText('Tenencia')) as HTMLSelectElement
    await waitFor(() => expect(tenencia.value).toBe('consignacion'))
    expect(screen.getByLabelText('De quién es (consignante)')).toBeDefined()

    await userEvent.selectOptions(tenencia, 'propia')
    expect(screen.queryByLabelText('De quién es (consignante)')).toBeNull()
  })

  it('con seña obligatoria no deja reservar sin ella', async () => {
    cartera.config.mockResolvedValue({ ...POR_OMISION, reservaExigeSena: true })
    await montarApp(`/stock/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Reservar' }))
    await elegirCliente('Para quién')
    const reservas = screen.getByRole('region', { name: 'Reservas' })
    const reservar = within(reservas).getByRole('button', { name: 'Reservar' }) as HTMLButtonElement
    expect(reservar.disabled).toBe(true)

    await userEvent.type(screen.getByLabelText('Seña'), '500000')
    expect(reservar.disabled).toBe(false)
  })
})

describe('reservar', () => {
  it('si ya está reservada, el gerente la pasa por encima con motivo', async () => {
    cartera.reservar
      .mockRejectedValueOnce(
        new ORPCError('YA_RESERVADA', {
          status: 409,
          data: { cliente: 'Paz, Luis', vence: null },
        }),
      )
      .mockResolvedValueOnce({ ...FICHA, estado: 'reservada' })
    await montarApp(`/stock/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Reservar' }))
    await elegirCliente('Para quién')
    const reservas = screen.getByRole('region', { name: 'Reservas' })
    await userEvent.click(within(reservas).getByRole('button', { name: 'Reservar' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('Ya está reservada para Paz, Luis')).toBeDefined()
    await userEvent.type(within(dialogo).getByLabelText('Por qué'), 'Pagó el total')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Pasar por encima' }))

    await waitFor(() =>
      expect(cartera.reservar).toHaveBeenLastCalledWith(
        expect.objectContaining({ pasarPorEncima: 'Pagó el total', clienteId: 'c1' }),
      ),
    )
  })
})

describe('los costos', () => {
  it('muestra lo que deja, y avisa lo que no pudo convertir', async () => {
    costos.ver.mockResolvedValue({
      ...SIN_COSTOS,
      conceptos: [
        {
          id: 'x1',
          tipo: 'compra',
          categoria: null,
          descripcion: 'Compra a particular',
          proveedor: null,
          comprobante: null,
          fecha: '2026-11-01',
          importe: '30000.00',
          moneda: 'USD',
          cotizacion: null,
          anulacionMotivo: null,
        },
      ],
      totales: {
        ...TOTALES_VACIOS,
        compra: '30000.00',
        costo: '30000.00',
        margen: '5000.00',
        margenPorcentaje: '16.7',
        sinConvertir: 1,
      },
    })
    await montarApp(`/stock/${ID}`)

    const seccion = await screen.findByRole('region', { name: 'Costos y margen' })
    expect(await within(seccion).findByText('US$ 5.000,00 · 16.7 %')).toBeDefined()
    expect(within(seccion).getByText(/no entra en la suma/)).toBeDefined()
  })

  it('quien no tiene el permiso no ve los costos ni los pide', async () => {
    entraComo({
      ...SESION,
      habilidades: [{ action: ['ver', 'editar'], subject: 'Unidad' }],
    } as typeof SESION)
    await montarApp(`/stock/${ID}`)

    await screen.findByRole('region', { name: 'Datos' })
    expect(screen.queryByRole('region', { name: 'Costos y margen' })).toBeNull()
    expect(costos.ver).not.toHaveBeenCalled()
  })

  it('un gasto en otra moneda pide la cotización', async () => {
    costos.agregar.mockResolvedValue(SIN_COSTOS)
    await montarApp(`/stock/${ID}`)

    const seccion = await screen.findByRole('region', { name: 'Costos y margen' })
    await userEvent.click(await within(seccion).findByRole('button', { name: 'Agregar' }))
    await userEvent.selectOptions(within(seccion).getByLabelText('Qué es'), 'gasto')
    await userEvent.type(within(seccion).getByLabelText('Descripción'), 'Flete desde fábrica')
    await userEvent.type(within(seccion).getByLabelText('Importe'), '150000')
    await userEvent.selectOptions(within(seccion).getByLabelText('Moneda'), 'ARS')
    await userEvent.type(within(seccion).getByLabelText('Cotización'), '1000')
    await userEvent.click(
      within(seccion).getAllByRole('button', { name: 'Agregar' })[0] as HTMLElement,
    )

    await waitFor(() =>
      expect(costos.agregar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'gasto',
          importe: '150000',
          moneda: 'ARS',
          cotizacion: '1000',
        }),
      ),
    )
  })
})

describe('trasladar', () => {
  it('entre razones sociales pide el comprobante sólo si la concesionaria lo eligió', async () => {
    entraComo(SESION_VARIAS as typeof SESION)
    usarSesion.getState().limpiar()
    cartera.config.mockResolvedValue({
      ...POR_OMISION,
      trasladoEntreEmpresas: 'con_comprobante',
    })
    cartera.trasladar.mockResolvedValue(FICHA)
    renovar.mockImplementation(async () => {
      usarSesion.getState().establecer({
        ...SESION_VARIAS,
        sucursalPendiente: false,
        sucursalActiva: SESION.sucursalActiva,
      })
      return true
    })
    await montarApp(`/stock/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Trasladar' }))
    const traslado = await screen.findByRole('region', { name: 'Traslado' })
    const trasladar = within(traslado).getByRole('button', {
      name: 'Trasladar',
    }) as HTMLButtonElement
    expect(trasladar.disabled).toBe(true)

    await userEvent.type(within(traslado).getByLabelText('Comprobante'), 'R-0001-123')
    await userEvent.click(trasladar)

    await waitFor(() =>
      expect(cartera.trasladar).toHaveBeenCalledWith(
        expect.objectContaining({ sucursalId: 's2', comprobante: 'R-0001-123' }),
      ),
    )
  })
})

describe('ingresar una unidad', () => {
  it('un 0km se carga con los datos de la factura, sin patente, y la factura queda como la compra', async () => {
    cartera.ingresar.mockResolvedValue({ ...UNIDAD, condicion: '0km' })
    await montarApp('/stock/ingresar')

    await userEvent.selectOptions(await screen.findByLabelText('Condición'), '0km')
    expect(screen.queryByLabelText('Patente')).toBeNull()
    await userEvent.type(screen.getByLabelText('Chasis'), '9bgen69k0vg160495')
    await userEvent.type(screen.getByLabelText('Número de motor'), 'L4F262094693')
    await userEvent.type(screen.getByLabelText('Color'), 'Jinx Met')
    await userEvent.type(screen.getByLabelText('Marca'), 'Chevrolet')
    await userEvent.type(screen.getByLabelText('Modelo'), 'Onix')
    await userEvent.type(screen.getByLabelText('Número de factura'), '0065-00710617')
    await userEvent.type(screen.getByLabelText('Importe (pesos)'), '15000000')
    await userEvent.click(screen.getByRole('button', { name: /Ingresar al stock/ }))

    await waitFor(() =>
      expect(cartera.ingresar).toHaveBeenCalledWith(
        expect.objectContaining({
          condicion: '0km',
          vehiculo: expect.objectContaining({
            chasis: '9BGEN69K0VG160495',
            motor: 'L4F262094693',
            marca: 'Chevrolet',
            modelo: 'Onix',
            color: 'Jinx Met',
            dominio: null,
          }),
        }),
      ),
    )
    await waitFor(() =>
      expect(costos.agregar).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ID,
          tipo: 'compra',
          descripcion: 'Compra a fábrica',
          comprobante: '0065-00710617',
          importe: '15000000',
        }),
      ),
    )
  })

  it('un usado pide patente y kilómetros, y sin chasis no ingresa', async () => {
    await montarApp('/stock/ingresar')

    await userEvent.type(await screen.findByLabelText('Patente'), 'ab123cd')
    expect(screen.getByText('Falta el chasis')).toBeDefined()
    expect(
      (screen.getByRole('button', { name: /Ingresar al stock/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
