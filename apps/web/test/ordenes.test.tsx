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
  presupuestar: vi.fn(),
  responderPresupuesto: vi.fn(),
  enviarPresupuesto: vi.fn(),
  pdfPresupuesto: vi.fn(),
}
const listarVehiculos = vi.fn()
const listarRepuestos = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: (x: unknown) => listarVehiculos(x) },
    repuestos: { listar: (x: unknown) => listarRepuestos(x) },
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
  autorizaNombre: 'Jorge Pérez',
  autorizaTelefono: null,
  pagaEmail: 'flota@transportes.test',
  presupuestos: [],
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
      autorizacion: null,
      presupuestoId: null,
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

describe('buscar el repuesto en el renglón', () => {
  it('Alt+R agrega un renglón que busca en el catálogo mientras se escribe; Enter lo engancha', async () => {
    const PIEZA = {
      id: '66666666-6666-4666-8666-666666666666',
      codigo: '7701208174',
      descripcion: 'Filtro de aceite',
      marca: 'Renault',
      rubro: 'Filtros',
      precioVenta: '18500.00',
      codigoAlicuota: 5,
      activo: true,
      stock: '12',
      minimo: null,
      ubicacion: null,
      reponer: false,
    }
    listarRepuestos.mockResolvedValue({ datos: [PIEZA], total: 1 })
    ordenes.items.mockResolvedValue(FICHA)
    await montarApp(`/ordenes/${ORDEN.id}`)
    await screen.findByRole('listitem', { name: 'Item 1' })

    await userEvent.keyboard('{Alt>}r{/Alt}')
    const renglon = await screen.findByRole('listitem', { name: 'Item 2' })
    const descripcion = within(renglon).getByLabelText('Descripción')
    expect(document.activeElement).toBe(descripcion)
    await userEvent.type(descripcion, '7701 208')
    const lista = await screen.findByRole('list', { name: 'Repuestos que coinciden con 7701 208' })
    expect(within(lista).getByText('Stock 12')).toBeDefined()
    await userEvent.keyboard('{Enter}')
    expect((descripcion as HTMLInputElement).value).toBe('Filtro de aceite')
    expect(within(renglon).getByText('7701208174')).toBeDefined()

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.items).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.anything(),
            expect.objectContaining({
              tipo: 'repuesto',
              repuestoId: PIEZA.id,
              codigo: PIEZA.codigo,
              precioUnitario: '18500',
            }),
          ],
        }),
      ),
    )
  })
})

describe('el presupuesto', () => {
  const ITEM = FICHA.items[0] as (typeof FICHA.items)[number]
  const PRESUPUESTO = {
    id: '77777777-7777-4777-8777-777777777777',
    numero: 1,
    estado: 'pendiente',
    total: '1140200.00',
    totalAutorizado: null,
    enviadoA: 'flota@transportes.test',
    creadoPor: 'Martín Gutiérrez',
    creadoEn: '2026-09-17T12:00:00.000Z',
    autorizaNombre: null,
    autorizaMedio: null,
    nota: null,
    respondidoEn: null,
  }
  const PENDIENTE = {
    ...FICHA,
    estado: 'esperando_autorizacion',
    items: [{ ...ITEM, autorizacion: 'pendiente', presupuestoId: PRESUPUESTO.id }],
    presupuestos: [PRESUPUESTO],
  }

  it('se arma con los renglones elegidos y sale por mail al correo de quien paga', async () => {
    ordenes.presupuestar.mockResolvedValue(PENDIENTE)
    await montarApp(`/ordenes/${ORDEN.id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir autorización' }))
    const renglones = await screen.findByRole('list', { name: 'Renglones a presupuestar' })
    expect(within(renglones).getByRole('checkbox')).toHaveProperty('checked', true)
    expect(screen.getByLabelText('Correo')).toHaveProperty('value', 'flota@transportes.test')

    ordenes.ficha.mockResolvedValue(PENDIENTE)
    await userEvent.click(screen.getByRole('button', { name: 'Armar el presupuesto' }))
    await waitFor(() =>
      expect(ordenes.presupuestar).toHaveBeenCalledWith({
        id: ORDEN.id,
        itemIds: [ITEM.id],
        enviarA: 'flota@transportes.test',
      }),
    )
    expect(await screen.findByText('Esperando respuesta')).toBeDefined()
  })

  it('lo que espera respuesta no se edita; rechazar pide confirmar y dice qué no se cobra', async () => {
    ordenes.ficha.mockResolvedValue(PENDIENTE)
    const RESPONDIDA = {
      ...FICHA,
      estado: 'en_proceso',
      items: [{ ...ITEM, autorizacion: 'rechazado', presupuestoId: PRESUPUESTO.id }],
      presupuestos: [{ ...PRESUPUESTO, estado: 'respondido', totalAutorizado: '0.00' }],
    }
    ordenes.responderPresupuesto.mockResolvedValue(RESPONDIDA)
    await montarApp(`/ordenes/${ORDEN.id}`)
    const lista = await screen.findByRole('list', { name: 'Items' })
    expect(within(lista).getByText('Esperando autorización')).toBeDefined()
    expect(screen.queryByRole('listitem', { name: 'Item 1' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Registrar respuesta' }))
    const respuesta = await screen.findByRole('region', { name: 'Respuesta al presupuesto 1' })
    expect(within(respuesta).getByLabelText('Quién autorizó')).toHaveProperty(
      'value',
      'Jorge Pérez',
    )
    await userEvent.click(within(respuesta).getByRole('checkbox'))
    await userEvent.selectOptions(within(respuesta).getByLabelText('Cómo'), 'Por WhatsApp')
    await userEvent.keyboard('{F2}')

    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿No autoriza nada de todo el presupuesto?',
    })
    expect(dialogo.textContent).toMatch(/no se hace ni se cobra/)
    ordenes.ficha.mockResolvedValue(RESPONDIDA)
    await confirmarDialogo('Registrar la respuesta')
    await waitFor(() =>
      expect(ordenes.responderPresupuesto).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ORDEN.id,
          presupuestoId: PRESUPUESTO.id,
          autorizados: [],
          autorizaNombre: 'Jorge Pérez',
          medio: 'whatsapp',
        }),
      ),
    )
    expect(await screen.findByText('Rechazado: no se cobra')).toBeDefined()
  })
})
