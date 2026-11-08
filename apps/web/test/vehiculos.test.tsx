import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import {
  montarApp,
  SESION,
  SESION_MECANICO,
  SESION_SIN_TALLER_NI_CAJA,
  textoDelError,
} from './montar.tsx'

const vehiculos = {
  listar: vi.fn(),
  marcas: vi.fn(),
  ficha: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  transferir: vi.fn(),
}
const listarClientes = vi.fn()
const listarOrdenes = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: { listar: (x: unknown) => listarClientes(x) },
    ordenes: { listar: (x: unknown) => listarOrdenes(x), ficha: vi.fn() },
    vehiculos: Object.fromEntries(
      Object.keys({
        listar: 0,
        marcas: 0,
        ficha: 0,
        crear: 0,
        editar: 0,
        transferir: 0,
      }).map((nombre) => [
        nombre,
        (x: unknown) => (vehiculos as Record<string, (x: unknown) => unknown>)[nombre]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const ID = '0b7e3f7a-5a8e-4c1b-9d9e-2f3c4b5a6d7e'

const HILUX = {
  id: ID,
  chasis: '8AJFB8CD5N1234567',
  dominio: 'AE123BC',
  anio: 2022,
  color: 'Blanco',
  marca: 'Toyota',
  modelo: 'Hilux',
  titular: { id: 'c2', razonSocial: 'Gómez, Ana' },
}

const FICHA = {
  ...HILUX,
  motor: null,
  combustible: 'diesel',
  kilometraje: 48000,
  observaciones: null,
  creadoEn: '2024-03-01T12:00:00.000Z',
  titulares: [
    {
      id: 't2',
      cliente: {
        id: 'c2',
        razonSocial: 'Gómez, Ana',
        tipoDocumento: 96,
        numeroDocumento: '20123456',
      },
      desde: '2025-06-15',
      hasta: null,
    },
    {
      id: 't1',
      cliente: {
        id: 'c1',
        razonSocial: 'Transportes del Sur SRL',
        tipoDocumento: 80,
        numeroDocumento: '30711111111',
      },
      desde: '2024-03-01',
      hasta: '2025-06-15',
    },
  ],
  historia: [
    {
      fecha: '2025-06-15T13:00:00.000Z',
      autor: 'Martín Gutiérrez',
      detalle: 'Pasó de Transportes del Sur SRL a Gómez, Ana, desde el 15/06/2025',
    },
    { fecha: '2024-03-01T12:00:00.000Z', autor: 'Martín Gutiérrez', detalle: 'Lo dio de alta' },
  ],
}

const ID_ORDEN = '1c8f4a8b-6b9f-4d2c-8eaf-3a4d5c6b7e8f'

const ORDEN = {
  id: ID_ORDEN,
  numero: 12,
  estado: 'entregada',
  sucursal: 'Casa central',
  vehiculo: { ...HILUX, id: ID },
  titular: { id: 'c1', razonSocial: 'Transportes del Sur SRL' },
  paga: null,
  pedido: 'Service de 40.000 km',
  asesor: 'Martín Gutiérrez',
  mecanico: null,
  entregaEstimada: null,
  creadoEn: '2025-03-10T12:00:00.000Z',
  total: '252003.00',
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(vehiculos), listarClientes, listarOrdenes, renovar]) {
    f.mockReset()
  }
  listarOrdenes.mockResolvedValue({ datos: [ORDEN], total: 1 })
  usarSesion.getState().limpiar()
  vehiculos.listar.mockResolvedValue({
    datos: [
      HILUX,
      {
        ...HILUX,
        id: 'v2',
        chasis: '9BWZZZ377VT004251',
        dominio: null,
        marca: null,
        modelo: null,
        titular: null,
      },
    ],
    total: 2,
  })
  vehiculos.marcas.mockResolvedValue({ datos: [{ marca: 'Toyota', modelos: ['Hilux'] }] })
  vehiculos.ficha.mockResolvedValue(FICHA)
  listarClientes.mockResolvedValue({
    datos: [
      {
        id: 'c1',
        razonSocial: 'Transportes del Sur SRL',
        tipoDocumento: 80,
        numeroDocumento: '30711111111',
      },
    ],
    total: 1,
  })
})

afterEach(cleanup)

describe('el listado', () => {
  it('muestra la patente como en la chapa, el vehículo y su titular', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')

    const fila = (await screen.findByRole('link', { name: 'AE 123 BC' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(fila).getByText('Toyota Hilux')).toBeDefined()
    expect(within(fila).getByText('Gómez, Ana')).toBeDefined()
    // El 0km: sin patente y sin titular, dicho con palabras.
    expect(screen.getByText('SIN PATENTAR')).toBeDefined()
    expect(screen.getByText('sin titular')).toBeDefined()
  })

  it('un clic en cualquier parte de la fila abre la ficha, pero copiar el chasis no', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    entraComo(SESION)
    const router = await montarApp('/vehiculos')
    const fila = (await screen.findByRole('link', { name: 'AE 123 BC' })).closest(
      'tr',
    ) as HTMLElement

    await userEvent.click(
      within(fila).getAllByRole('button', { name: /^Copiar chasis/ })[0] as HTMLElement,
    )
    expect(router.state.location.pathname).toBe('/vehiculos')

    await userEvent.click(within(fila).getByText('Gómez, Ana'))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/vehiculos\/.+/))
  })
})

describe('con el teclado', () => {
  it('↓ desde el buscador marca la primera fila, ↓ la siguiente, Enter abre la ficha', async () => {
    entraComo(SESION)
    const router = await montarApp('/vehiculos')
    const buscar = await screen.findByLabelText('Buscar')
    await screen.findByRole('link', { name: 'AE 123 BC' })
    expect(screen.getByText('Moverse')).toBeDefined()

    buscar.focus()
    await userEvent.keyboard('{ArrowDown}')
    const filas = screen.getAllByRole('row').slice(1)
    expect(filas[0]?.getAttribute('data-activa')).toBe('true')
    await userEvent.keyboard('{ArrowDown}')
    expect(filas[1]?.getAttribute('data-activa')).toBe('true')
    expect(filas[0]?.getAttribute('data-activa')).toBeNull()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByText('Abrir')).toBeDefined()

    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/vehiculos/${ID}`))
  })
})

describe('volver y copiar con el teclado', () => {
  it('Esc en la ficha vuelve al listado con la búsqueda que tenía', async () => {
    entraComo(SESION)
    const router = await montarApp('/vehiculos?buscar=AE')
    await userEvent.click(await screen.findByText('Gómez, Ana'))
    await screen.findByRole('heading', { name: 'AE 123 BC · Toyota Hilux', level: 1 })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/vehiculos'))
    expect(router.state.location.search).toEqual({ buscar: 'AE' })
  })

  it('escribiendo en un campo, ⌫ borra y no vuelve; afuera, ⌫ vuelve', async () => {
    entraComo(SESION)
    const router = await montarApp('/vehiculos')
    await userEvent.click(await screen.findByText('Gómez, Ana'))
    await screen.findByRole('heading', { name: 'AE 123 BC · Toyota Hilux', level: 1 })

    const buscador = screen.getByPlaceholderText(/patente, chasis/i)
    await userEvent.type(buscador, 'ab{Backspace}')
    expect(router.state.location.pathname).toBe(`/vehiculos/${ID}`)

    buscador.blur()
    await userEvent.keyboard('{Backspace}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/vehiculos'))
  })

  it('Alt+C y Alt+P copian el chasis y la patente de la fila marcada', async () => {
    // En jsdom no hay portapapeles seguro: se copia por el camino viejo, que acá se simula.
    const copiar = vi.fn(() => true)
    document.execCommand = copiar
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('link', { name: 'AE 123 BC' })

    await userEvent.keyboard('{ArrowDown}{Alt>}c{/Alt}')
    expect(
      await screen.findByRole('listitem', { name: 'Listo: Chasis 8AJFB8CD5N1234567 copiado' }),
    ).toBeDefined()
    await userEvent.keyboard('{Alt>}p{/Alt}')
    expect(
      await screen.findByRole('listitem', { name: 'Listo: Patente AE123BC copiada' }),
    ).toBeDefined()
  })
})

describe('el alta', () => {
  async function abrirAlta() {
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('link', { name: 'AE 123 BC' })
    await userEvent.keyboard('{Insert}')
    return screen.findByRole('region', { name: 'Nuevo vehículo' })
  }

  it('una patente mal escrita y una marca sin modelo avisan al lado del campo, y no manda', async () => {
    const formulario = await abrirAlta()
    await userEvent.type(within(formulario).getByLabelText('Chasis'), '8AJFB8CD5N7654321')
    await userEvent.type(within(formulario).getByLabelText('Patente'), 'AB 12 CD')
    await userEvent.type(within(formulario).getByLabelText('Marca'), 'Ford')
    await userEvent.keyboard('{F2}')

    expect(within(formulario).getByText('La patente es ABC 123 o AB 123 CD')).toBeDefined()
    expect(
      within(formulario).getByText('Marca y modelo van juntos: completá los dos, o ninguno'),
    ).toBeDefined()
    expect(vehiculos.crear).not.toHaveBeenCalled()
  })

  it('elige el titular con el teclado y manda la patente compacta', async () => {
    vehiculos.crear.mockResolvedValue({ ...HILUX, id: 'v3' })
    const formulario = await abrirAlta()

    await userEvent.type(within(formulario).getByLabelText('Chasis'), '8ajfb8cd5n7654321')
    await userEvent.type(within(formulario).getByLabelText('Patente'), 'af 456 cd')
    await userEvent.type(within(formulario).getByLabelText('Marca'), 'Toyota')
    await userEvent.type(within(formulario).getByLabelText('Modelo'), 'Hilux')
    await userEvent.type(within(formulario).getByLabelText('Titular'), 'transp')
    await within(formulario).findByRole('button', { name: /Transportes del Sur SRL/ })
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(within(formulario).getByText('Transportes del Sur SRL')).toBeDefined()
    await userEvent.keyboard('{F2}')

    expect(vehiculos.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        chasis: '8AJFB8CD5N7654321',
        dominio: 'AF456CD',
        marca: 'Toyota',
        modelo: 'Hilux',
        titular: { clienteId: 'c1', desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      }),
    )
  })

  it('la patente repetida dice de qué vehículo es', async () => {
    vehiculos.crear.mockRejectedValue(
      new ORPCError('DOMINIO_DUPLICADO', {
        status: 409,
        message: 'Ya hay un vehículo con esa patente',
        data: { id: ID, chasis: '8AJFB8CD5N1234567' },
      }),
    )
    const formulario = await abrirAlta()
    await userEvent.type(within(formulario).getByLabelText('Chasis'), '8AJFB8CD5N7654321')
    await userEvent.type(within(formulario).getByLabelText('Patente'), 'AE123BC')
    await userEvent.keyboard('{F2}')

    expect(await textoDelError()).toBe(
      'Esa patente ya la tiene el vehículo con chasis 8AJFB8CD5N1234567. Revisá cuál de los dos está mal.',
    )
  })
})

describe('la ficha', () => {
  it('muestra el titular actual, los anteriores con sus fechas, y la historia', async () => {
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)

    expect(
      await screen.findByRole('heading', { name: 'AE 123 BC · Toyota Hilux', level: 1 }),
    ).toBeDefined()
    const titulares = screen.getByRole('region', { name: 'Titulares' })
    expect(within(titulares).getByText('Actual')).toBeDefined()
    expect(within(titulares).getByText('Desde el 15/06/2025')).toBeDefined()
    expect(within(titulares).getByText('Del 01/03/2024 al 15/06/2025')).toBeDefined()
    expect(within(titulares).getByText('30-71111111-1')).toBeDefined()

    const historia = screen.getByRole('region', { name: 'Historia' })
    expect(
      within(historia).getByText(
        'Pasó de Transportes del Sur SRL a Gómez, Ana, desde el 15/06/2025',
      ),
    ).toBeDefined()
  })

  it('F4 abre la transferencia, y una fecha anterior dice desde cuándo lo tiene el actual', async () => {
    vehiculos.transferir.mockRejectedValue(
      new ORPCError('FECHA_ANTERIOR', {
        status: 422,
        message: 'La fecha no puede ser anterior a la del titular actual',
        data: { desde: '2025-06-15' },
      }),
    )
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)
    await screen.findByRole('region', { name: 'Titulares' })

    await userEvent.keyboard('{F4}')
    const formulario = await screen.findByRole('region', {
      name: 'Transferir: hoy es de Gómez, Ana',
    })
    await userEvent.type(within(formulario).getByLabelText('Nuevo titular'), 'transp')
    await userEvent.click(
      await within(formulario).findByRole('button', { name: /Transportes del Sur SRL/ }),
    )
    await userEvent.keyboard('{F2}')

    expect(vehiculos.transferir).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, clienteId: 'c1' }),
    )
    expect(await textoDelError()).toBe(
      'Gómez, Ana lo tiene desde el 15/06/2025: la fecha tiene que ser ésa o posterior.',
    )
  })

  it('sin elegir a quién, no manda', async () => {
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)
    await screen.findByRole('region', { name: 'Titulares' })

    await userEvent.keyboard('{F4}')
    const formulario = await screen.findByRole('region', { name: /Transferir/ })
    await userEvent.keyboard('{F2}')

    expect(within(formulario).getByRole('alert').textContent).toBe(
      'Elegí a quién pasa el vehículo.',
    )
    expect(vehiculos.transferir).not.toHaveBeenCalled()
  })

  it('modificar no deja tocar el chasis', async () => {
    vehiculos.editar.mockResolvedValue(FICHA)
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)
    const datos = await screen.findByRole('region', { name: 'Datos' })

    await userEvent.click(within(datos).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('region', { name: 'Modificar los datos' })
    expect((within(formulario).getByLabelText('Chasis') as HTMLInputElement).disabled).toBe(true)

    const km = within(formulario).getByLabelText('Kilómetros')
    await userEvent.clear(km)
    await userEvent.type(km, '52000')
    await userEvent.keyboard('{F2}')

    expect(vehiculos.editar).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, kilometraje: 52000, dominio: 'AE123BC' }),
    )
  })

  it('el mecánico la ve, pero sin modificar ni transferir', async () => {
    entraComo(SESION_MECANICO)
    await montarApp(`/vehiculos/${ID}`)
    const datos = await screen.findByRole('region', { name: 'Datos' })

    expect(within(datos).queryByRole('button', { name: 'Modificar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Transferir/ })).toBeNull()
  })

  it('cuenta las órdenes del auto, con quién era el titular cada vez', async () => {
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)
    const seccion = await screen.findByRole('region', { name: 'Órdenes de trabajo' })

    expect(await within(seccion).findByRole('link', { name: 'OT 000012' })).toBeDefined()
    expect(within(seccion).getByText('Service de 40.000 km')).toBeDefined()
    expect(within(seccion).getByText('Transportes del Sur SRL')).toBeDefined()
    // Una sola sucursal: no hay nada que distinguir.
    expect(within(seccion).queryByText('Sucursal')).toBeNull()
    expect(listarOrdenes).toHaveBeenCalledWith(
      expect.objectContaining({ vehiculoId: ID, estado: 'todas' }),
    )
  })

  it('la sucursal aparece cuando el auto pasó por más de una', async () => {
    listarOrdenes.mockResolvedValue({
      datos: [ORDEN, { ...ORDEN, id: 'o2', numero: 3, sucursal: 'Norte' }],
      total: 2,
    })
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)
    const seccion = await screen.findByRole('region', { name: 'Órdenes de trabajo' })

    expect(await within(seccion).findByText('Norte')).toBeDefined()
    expect(within(seccion).getByText('Sucursal')).toBeDefined()
  })

  it('↓ marca la orden, Enter la abre', async () => {
    entraComo(SESION)
    const router = await montarApp(`/vehiculos/${ID}`)
    await screen.findByRole('link', { name: 'OT 000012' })

    await userEvent.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe(`/ordenes/${ID_ORDEN}`))
  })

  it('con una orden marcada, Esc la suelta y no se va de la ficha', async () => {
    entraComo(SESION)
    const router = await montarApp(`/vehiculos/${ID}`)
    const enlace = await screen.findByRole('link', { name: 'OT 000012' })
    const fila = enlace.closest('tr') as HTMLElement

    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(fila.getAttribute('data-activa')).toBe('true'))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(fila.getAttribute('data-activa')).toBeNull())
    expect(router.state.location.pathname).toBe(`/vehiculos/${ID}`)
  })

  it('un auto que nunca vino lo dice', async () => {
    listarOrdenes.mockResolvedValue({ datos: [], total: 0 })
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)

    expect(await screen.findByText(/todavía no pasó por el taller/)).toBeDefined()
  })

  it('sin el módulo del taller no hay órdenes que mostrar ni que pedir', async () => {
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    await montarApp(`/vehiculos/${ID}`)
    await screen.findByRole('region', { name: 'Datos' })

    expect(screen.queryByRole('region', { name: 'Órdenes de trabajo' })).toBeNull()
    expect(listarOrdenes).not.toHaveBeenCalled()
  })

  it('un vehículo que no existe lo dice, con salida', async () => {
    vehiculos.ficha.mockRejectedValue(
      new ORPCError('NO_ENCONTRADO', { status: 404, message: 'Ese vehículo no existe' }),
    )
    entraComo(SESION)
    await montarApp(`/vehiculos/${ID}`)

    expect((await screen.findByRole('alert')).textContent).toMatch(/buscalo desde el listado/)
    expect(screen.getByRole('link', { name: 'Todos los vehículos' })).toBeDefined()
  })
})
