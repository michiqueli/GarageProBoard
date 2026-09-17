import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'
import { conAncho } from './preparar.ts'

const repuestos = { listar: vi.fn(), ficha: vi.fn(), crear: vi.fn(), ajustar: vi.fn() }
const pedidos = {
  listar: vi.fn(),
  ficha: vi.fn(),
  abrir: vi.fn(),
  editar: vi.fn(),
  aCaja: vi.fn(),
  entregar: vi.fn(),
}
const ordenes = { listar: vi.fn() }
const renovar = vi.fn()

const delegar = (objeto: Record<string, (x: unknown) => unknown>) =>
  Object.fromEntries(Object.keys(objeto).map((n) => [n, (x: unknown) => objeto[n]?.(x)]))

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    proveedores: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    repuestos: delegar(repuestos),
    pedidosRepuestos: delegar(pedidos),
    ordenes: delegar(ordenes),
  },
  renovar: () => renovar(),
}))

const FILTRO = {
  id: '11111111-1111-4111-8111-111111111111',
  codigo: '7701208174',
  descripcion: 'Filtro de aceite',
  marca: 'Renault',
  rubro: 'Filtros',
  precioVenta: '18500.00',
  codigoAlicuota: 5,
  activo: true,
  stock: '2',
  minimo: '3',
  ubicacion: 'Estante 4',
  reponer: true,
}
const PASTILLAS = {
  ...FILTRO,
  id: '22222222-2222-4222-8222-222222222222',
  codigo: 'PAST001',
  descripcion: 'Pastillas de freno',
  stock: '0',
  minimo: null,
  reponer: false,
}

const PEDIDO = {
  id: '33333333-3333-4333-8333-333333333333',
  numero: 7,
  estado: 'abierto',
  chasis: '93YBB000012345',
  vehiculo: null,
  orden: null,
  cliente: null,
  solicitante: 'Cliente por teléfono',
  creadoPor: 'Carla Benítez',
  creadoEn: '2026-09-16T12:00:00.000Z',
  total: '0.00',
  nota: null,
  enCajaEn: null,
  entregadoEn: null,
  items: [],
  factura: null,
}

beforeEach(() => {
  for (const f of [
    ...Object.values(repuestos),
    ...Object.values(pedidos),
    ...Object.values(ordenes),
    renovar,
  ]) {
    f.mockReset()
  }
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  repuestos.listar.mockResolvedValue({ datos: [FILTRO, PASTILLAS], total: 2 })
  pedidos.ficha.mockResolvedValue(PEDIDO)
  pedidos.listar.mockResolvedValue({ datos: [], total: 0 })
})

afterEach(() => {
  cleanup()
  conAncho(1440)
})

describe('el catálogo', () => {
  it('dice el stock en palabras: reponer y sin stock, además del color', async () => {
    await montarApp('/repuestos')
    const tabla = await screen.findByRole('table')
    const fila = (texto: string) => within(tabla).getByText(texto).closest('tr') as HTMLElement
    expect(within(fila('7701208174')).getByText('2 · reponer')).toBeDefined()
    expect(within(fila('PAST001')).getByText('Sin stock')).toBeDefined()
    expect(screen.getByRole('navigation', { name: 'Repuestos' })).toBeDefined()
  })

  it('el mecánico lo ve pero no da de alta', async () => {
    renovar.mockImplementation(async () => {
      usarSesion.getState().establecer(SESION_MECANICO)
      return true
    })
    await montarApp('/repuestos')
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /Nuevo repuesto/ })).toBeNull()
  })
})

describe('el pedido de mostrador', () => {
  it('pegar el código y Enter agrega la pieza; F2 guarda con la pieza del catálogo', async () => {
    pedidos.editar.mockImplementation(async (x: { items: unknown[] }) => ({
      ...PEDIDO,
      total: '18500.00',
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          repuestoId: FILTRO.id,
          codigo: FILTRO.codigo,
          descripcion: FILTRO.descripcion,
          cantidad: '1',
          precioUnitario: '18500.00',
          codigoAlicuota: 5,
          total: '18500.00',
          stock: '2',
        },
      ],
      _enviado: x,
    }))
    await montarApp(`/repuestos/pedidos/${PEDIDO.id}`)

    // Un pedido vacío arranca con un renglón y el foco en la descripción: se pega el código.
    const renglon = await screen.findByRole('listitem', { name: 'Repuesto 1' })
    const buscar = within(renglon).getByLabelText('Descripción')
    expect(document.activeElement).toBe(buscar)
    await userEvent.type(buscar, '7701 208 174')
    await screen.findByRole('list', { name: 'Repuestos que coinciden con 7701 208 174' })
    await userEvent.keyboard('{Enter}')
    expect(await within(renglon).findByText('7701208174')).toBeDefined()
    expect((buscar as HTMLInputElement).value).toBe('Filtro de aceite')

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(pedidos.editar).toHaveBeenCalledWith(
        expect.objectContaining({
          id: PEDIDO.id,
          items: [
            expect.objectContaining({
              repuestoId: FILTRO.id,
              codigo: FILTRO.codigo,
              cantidad: '1',
              precioUnitario: '18500',
            }),
          ],
        }),
      ),
    )
  })

  it('F4 pide confirmar, avisa si no alcanza el stock, y lo manda a caja', async () => {
    const conItem = {
      ...PEDIDO,
      total: '37000.00',
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          repuestoId: PASTILLAS.id,
          codigo: PASTILLAS.codigo,
          descripcion: PASTILLAS.descripcion,
          cantidad: '2',
          precioUnitario: '18500.00',
          codigoAlicuota: 5,
          total: '37000.00',
          stock: '0',
        },
      ],
    }
    pedidos.ficha.mockResolvedValue(conItem)
    pedidos.aCaja.mockResolvedValue({ ...conItem, estado: 'en_caja' })
    await montarApp(`/repuestos/pedidos/${PEDIDO.id}`)
    await screen.findByRole('list', { name: 'Repuestos del pedido' })
    expect(screen.getByText('Stock 0 · no alcanza')).toBeDefined()

    await userEvent.keyboard('{F4}')
    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿Mandar el Pedido 000007 a caja?',
    })
    expect(dialogo.textContent).toMatch(/no alcanza el stock de PAST001/)
    await confirmarDialogo('Mandar a caja')
    await waitFor(() => expect(pedidos.aCaja).toHaveBeenCalledWith({ id: PEDIDO.id }))
  })
})

describe('abrir un pedido', () => {
  it('sin chasis no abre; con el chasis pegado con espacios, sí', async () => {
    pedidos.abrir.mockResolvedValue(PEDIDO)
    const router = await montarApp('/repuestos/pedidos/nuevo')
    const chasis = await screen.findByLabelText('Chasis')
    await userEvent.keyboard('{F2}')
    expect(screen.getByText(/Falta el chasis/)).toBeDefined()
    expect(pedidos.abrir).not.toHaveBeenCalled()

    await userEvent.type(chasis, '93y bb 0000 12345')
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(pedidos.abrir).toHaveBeenCalledWith(
        expect.objectContaining({ chasis: '93YBB000012345', clienteId: null, items: [] }),
      ),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/repuestos/pedidos/${PEDIDO.id}`),
    )
  })
})
