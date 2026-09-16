import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_MECANICO, SESION_REPUESTERO } from './montar.tsx'

const clientes = { listar: vi.fn(), ficha: vi.fn(), crear: vi.fn(), editar: vi.fn() }
const catalogos = vi.fn()
const vehiculosDelCliente = vi.fn()
const consultarPadron = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    padron: { consultar: (x: unknown) => consultarPadron(x) },
    organizacion: { catalogos: () => catalogos() },
    vehiculos: { delCliente: (x: unknown) => vehiculosDelCliente(x) },
    clientes: {
      listar: (x: unknown) => clientes.listar(x),
      ficha: (x: unknown) => clientes.ficha(x),
      crear: (x: unknown) => clientes.crear(x),
      editar: (x: unknown) => clientes.editar(x),
    },
  },
  renovar: () => renovar(),
}))

const TRANSPORTES = {
  id: 'c1',
  tipoDocumento: 80,
  numeroDocumento: '30711111111',
  tipoPersona: 'juridica',
  razonSocial: 'Transportes del Sur SRL',
  condicionIva: 1,
  domicilio: null,
  provinciaCodigo: 12,
  localidad: 'Santa Fe',
  codigoPostal: null,
  email: null,
  telefono: '342 555-1234',
  numeroIibb: null,
  condicionIibb: 'local',
  observaciones: null,
  activo: true,
  esProveedor: true,
}

const ANA = {
  ...TRANSPORTES,
  id: 'c2',
  tipoDocumento: 96,
  numeroDocumento: '20123456',
  tipoPersona: 'fisica',
  razonSocial: 'Gómez, Ana',
  condicionIva: 5,
  esProveedor: false,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [
    ...Object.values(clientes),
    catalogos,
    consultarPadron,
    renovar,
    vehiculosDelCliente,
  ])
    f.mockReset()
  usarSesion.getState().limpiar()
  clientes.listar.mockResolvedValue({ datos: [TRANSPORTES, ANA], total: 2 })
  catalogos.mockResolvedValue({
    condicionesIva: [
      { codigo: 1, descripcion: 'IVA Responsable Inscripto' },
      { codigo: 5, descripcion: 'Consumidor Final' },
    ],
    provincias: [{ codigo: 12, nombre: 'Santa Fe' }],
  })
})

afterEach(cleanup)

describe('el listado', () => {
  it('muestra el documento como está impreso y avisa quién es también proveedor', async () => {
    entraComo(SESION)
    await montarApp('/clientes')

    const fila = (await screen.findByText('Transportes del Sur SRL')).closest('tr') as HTMLElement
    expect(within(fila).getByText('30-71111111-1')).toBeDefined()
    expect(within(fila).getByText('También proveedor')).toBeDefined()
    expect(await within(fila).findByText('IVA Responsable Inscripto')).toBeDefined()
    expect(screen.getByText('20.123.456')).toBeDefined()
  })

  it('la búsqueda llega a la API', async () => {
    entraComo(SESION)
    await montarApp('/clientes?buscar=30-7111')
    await screen.findByText('Transportes del Sur SRL')

    expect(clientes.listar).toHaveBeenCalledWith(
      expect.objectContaining({ buscar: '30-7111', estado: 'activos' }),
    )
  })

  it('el repuestero los ve, pero no tiene con qué dar de alta', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/clientes')
    await screen.findByText('Transportes del Sur SRL')

    expect(screen.queryByRole('button', { name: /Nuevo cliente/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modificar' })).toBeNull()
  })

  it('el mecánico no tiene Clientes en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull()
  })
})

describe('un cliente nuevo', () => {
  async function abrirAlta() {
    entraComo(SESION)
    await montarApp('/clientes')
    await screen.findByText('Transportes del Sur SRL')
    await userEvent.keyboard('{Insert}')
    return screen.findByRole('region', { name: 'Nuevo cliente' })
  }

  it('con el CUIT mal escrito avisa al lado del campo y no manda nada', async () => {
    const formulario = await abrirAlta()
    await userEvent.type(within(formulario).getByLabelText('CUIT'), '30-71111111-2')
    await userEvent.type(within(formulario).getByLabelText('Razón social'), 'Otra SRL')
    await userEvent.keyboard('{F2}')

    expect(within(formulario).getByText('Ese CUIT no existe: revisá los números')).toBeDefined()
    expect(clientes.crear).not.toHaveBeenCalled()
  })

  it('con DNI, lo manda sin puntos y como consumidor final', async () => {
    clientes.crear.mockResolvedValue({ ...ANA, id: 'c3' })
    const formulario = await abrirAlta()

    await userEvent.selectOptions(within(formulario).getByLabelText('Tipo de documento'), 'DNI')
    await userEvent.type(within(formulario).getByLabelText('DNI'), '20.123.457')
    await userEvent.type(within(formulario).getByLabelText('Apellido y nombre'), 'Pérez, Juan')
    // Con DNI no hay padrón que consultar.
    expect(within(formulario).queryByRole('button', { name: /Completar con AFIP/ })).toBeNull()
    await userEvent.keyboard('{F2}')

    expect(clientes.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumento: 96,
        numeroDocumento: '20123457',
        razonSocial: 'Pérez, Juan',
        condicionIva: 5,
      }),
    )
  })

  it('F4 completa con AFIP, y no guarda', async () => {
    consultarPadron.mockResolvedValue({
      cuit: '30712222227',
      razonSocial: 'NEUMATICOS RAFAELA SA',
      tipoPersona: 'juridica',
      tipoClave: 'CUIT',
      activo: true,
      condicionIva: { codigo: 1, fuente: 'afip', motivo: 'AFIP lo informa.' },
      domicilio: {
        direccion: 'RUTA 34 KM 3',
        localidad: 'RAFAELA',
        codigoPostal: '2300',
        provinciaCodigo: 12,
      },
      origen: 'constancia',
    })
    const formulario = await abrirAlta()

    await userEvent.type(within(formulario).getByLabelText('CUIT'), '30-71222222-7')
    await userEvent.keyboard('{F4}')

    expect(consultarPadron).toHaveBeenCalledWith({ cuit: '30712222227' })
    expect(await within(formulario).findByDisplayValue('NEUMATICOS RAFAELA SA')).toBeDefined()
    expect(within(formulario).getByDisplayValue('RUTA 34 KM 3')).toBeDefined()
    expect(within(formulario).getByDisplayValue('2300')).toBeDefined()
    expect(clientes.crear).not.toHaveBeenCalled()
  })

  it('si ya está cargado, dice a nombre de quién y lleva a su ficha', async () => {
    clientes.ficha.mockResolvedValue({ ...TRANSPORTES, historia: [] })
    clientes.crear.mockRejectedValue(
      new ORPCError('CLIENTE_DUPLICADO', {
        status: 409,
        message: 'Ese documento ya está cargado como cliente',
        data: { id: 'c1', razonSocial: 'Transportes del Sur SRL' },
      }),
    )
    entraComo(SESION)
    const router = await montarApp('/clientes')
    await screen.findByText('Transportes del Sur SRL')
    await userEvent.keyboard('{Insert}')
    const formulario = await screen.findByRole('region', { name: 'Nuevo cliente' })
    await userEvent.type(within(formulario).getByLabelText('CUIT'), '30-71111111-1')
    await userEvent.type(within(formulario).getByLabelText('Razón social'), 'Transportes')
    await userEvent.keyboard('{F2}')

    const aviso = await within(formulario).findByRole('alert')
    expect(aviso.textContent).toMatch(/a nombre de Transportes del Sur SRL/)
    await userEvent.click(within(aviso).getByRole('button', { name: 'Abrir su ficha' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes/c1'))
  })
})

describe('modificar', () => {
  it('el documento no se toca, y desactivar avisa qué implica', async () => {
    clientes.editar.mockResolvedValue({ ...TRANSPORTES, activo: false })
    entraComo(SESION)
    await montarApp('/clientes')

    const fila = (await screen.findByText('Transportes del Sur SRL')).closest('tr') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('region', {
      name: 'Modificar Transportes del Sur SRL',
    })

    expect((within(formulario).getByLabelText('CUIT') as HTMLInputElement).disabled).toBe(true)
    expect(within(formulario).getByText(/También es proveedor/)).toBeDefined()

    await userEvent.click(within(formulario).getByRole('checkbox', { name: /Activo/ }))
    expect(within(formulario).getByText('no se le va a poder facturar')).toBeDefined()
    await userEvent.keyboard('{F2}')

    expect(clientes.editar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', activo: false }),
    )
  })
})

describe('la ficha', () => {
  const HILUX = {
    id: '0b7e3f7a-5a8e-4c1b-9d9e-2f3c4b5a6d7e',
    chasis: '8AJFB8CD5N1234567',
    dominio: 'AE123BC',
    anio: 2022,
    color: null,
    marca: 'Toyota',
    modelo: 'Hilux',
  }

  beforeEach(() => {
    clientes.ficha.mockResolvedValue({
      ...TRANSPORTES,
      historia: [
        { fecha: '2025-06-15T13:00:00.000Z', autor: 'Martín Gutiérrez', detalle: 'Lo dio de alta' },
      ],
    })
    vehiculosDelCliente.mockResolvedValue({
      datos: [
        {
          ...HILUX,
          titular: { id: 'c1', razonSocial: 'Transportes del Sur SRL' },
          desde: '2024-03-01',
          hasta: null,
        },
        {
          ...HILUX,
          id: 'v2',
          dominio: 'AB123CD',
          marca: 'Ford',
          modelo: 'Ranger',
          titular: null,
          desde: '2020-01-10',
          hasta: '2023-05-02',
        },
      ],
    })
  })

  it('se llega desde el listado, con sus datos, sus vehículos y su historia', async () => {
    entraComo(SESION)
    const router = await montarApp('/clientes')
    await userEvent.click(await screen.findByRole('link', { name: 'Transportes del Sur SRL' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes/c1'))
    expect(
      await screen.findByRole('heading', { name: 'Transportes del Sur SRL', level: 1 }),
    ).toBeDefined()
    const datos = screen.getByRole('region', { name: 'Datos' })
    expect(within(datos).getByText('30-71111111-1')).toBeDefined()
    expect(within(datos).getByText('Santa Fe, Santa Fe')).toBeDefined()

    const suyos = await screen.findByRole('region', { name: 'A su nombre' })
    expect(within(suyos).getByRole('link', { name: 'AE 123 BC' })).toBeDefined()
    expect(within(suyos).getByText('Desde el 01/03/2024')).toBeDefined()
    const tuvo = screen.getByRole('region', { name: 'Tuvo' })
    expect(within(tuvo).getByText('Del 10/01/2020 al 02/05/2023')).toBeDefined()

    expect(
      within(screen.getByRole('region', { name: 'Historia' })).getByText('Lo dio de alta'),
    ).toBeDefined()
  })

  it('el repuestero ve al cliente, pero no sus vehículos: ni se piden', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/clientes/c1')

    await screen.findByRole('region', { name: 'Datos' })
    expect(screen.queryByRole('region', { name: 'Vehículos' })).toBeNull()
    expect(vehiculosDelCliente).not.toHaveBeenCalled()
  })

  it('se modifica desde la ficha', async () => {
    clientes.editar.mockResolvedValue(TRANSPORTES)
    entraComo(SESION)
    await montarApp('/clientes/c1')

    const datos = await screen.findByRole('region', { name: 'Datos' })
    await userEvent.click(within(datos).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('region', {
      name: 'Modificar Transportes del Sur SRL',
    })
    const telefono = within(formulario).getByLabelText('Teléfono')
    await userEvent.clear(telefono)
    await userEvent.type(telefono, '342 555-9999')
    await userEvent.keyboard('{F2}')

    expect(clientes.editar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', telefono: '342 555-9999' }),
    )
  })

  it('sin vehículos lo dice, y dónde se asignan', async () => {
    vehiculosDelCliente.mockResolvedValue({ datos: [] })
    entraComo(SESION)
    await montarApp('/clientes/c1')

    expect(
      await screen.findByText(
        'No tiene vehículos a su nombre. Se le asignan desde la ficha de cada vehículo.',
      ),
    ).toBeDefined()
  })
})
