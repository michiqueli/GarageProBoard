import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, errorNotificado, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const comprobantes = {
  opciones: vi.fn(),
  receptor: vi.fn(),
  emitir: vi.fn(),
  listar: vi.fn(),
  verificar: vi.fn(),
  pdf: vi.fn(),
  anular: vi.fn(),
  enviar: vi.fn(),
  ficha: vi.fn(),
}
const renovar = vi.fn()
const ordenes = { listar: vi.fn(), ficha: vi.fn() }

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    ordenes: {
      listar: (x: unknown) => ordenes.listar(x),
      ficha: (x: unknown) => ordenes.ficha(x),
    },
    comprobantes: Object.fromEntries(
      Object.keys(comprobantes).map((nombre) => [
        nombre,
        (x: unknown) => (comprobantes as Record<string, (x: unknown) => unknown>)[nombre]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const PV = {
  id: '11111111-1111-4111-8111-111111111111',
  numero: 5,
  predeterminado: true,
  empresa: {
    id: '22222222-2222-4222-8222-222222222222',
    razonSocial: 'Litoral SAS',
    condicionIva: 1,
  },
  certificado: 'vigente',
  entorno: 'produccion',
}

const RECEPTOR_CF = {
  clienteId: null,
  tipoDocReceptor: 99,
  numeroDocReceptor: '0',
  nombre: 'Consumidor Final',
  condicionIva: 5,
  domicilio: null,
  tipoComprobante: 6,
  letra: 'B',
  nombreComprobante: 'Factura B',
  avisos: [],
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(comprobantes), ...Object.values(ordenes), renovar])
    f.mockReset()
  ordenes.listar.mockResolvedValue({ datos: [], total: 0 })
  usarSesion.getState().limpiar()
  comprobantes.opciones.mockResolvedValue({ puntosVenta: [PV] })
  comprobantes.receptor.mockResolvedValue(RECEPTOR_CF)
  comprobantes.listar.mockResolvedValue({ datos: [], total: 0 })
})

afterEach(cleanup)

async function cargarRenglon(descripcion: string, precio: string) {
  const renglon = await screen.findByRole('listitem', { name: 'Renglón 1' })
  await userEvent.type(within(renglon).getByLabelText('Descripción'), descripcion)
  await userEvent.type(within(renglon).getByLabelText('Precio unitario'), precio)
}

describe('las órdenes para facturar, con el teclado', () => {
  it('↓ marca la orden, F4 la carga en el formulario y el siguiente F4 factura', async () => {
    const OT = {
      id: '44444444-4444-4444-8444-444444444444',
      numero: 3,
      estado: 'terminada',
      vehiculo: {
        id: 'v',
        dominio: 'MFV872',
        chasis: '8AFDR5AD3G6123456',
        marca: 'Ford',
        modelo: 'Ranger',
      },
      titular: null,
      paga: null,
      pedido: 'Alineación',
      asesor: 'Martín',
      mecanico: null,
      prometidaPara: null,
      creadoEn: '2026-09-16T12:00:00.000Z',
      total: '48000.00',
    }
    ordenes.listar.mockResolvedValue({ datos: [OT], total: 1 })
    ordenes.ficha.mockResolvedValue({
      ...OT,
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          tipo: 'trabajo',
          repuestoId: null,
          codigo: null,
          descripcion: 'Alineación y balanceo',
          cantidad: '1.0000',
          precioUnitario: '48000.0000',
          codigoAlicuota: 5,
          total: '48000.00',
          autorizacion: null,
          presupuestoId: null,
        },
      ],
    })
    entraComo(SESION)
    await montarApp('/caja')
    await screen.findByRole('region', { name: 'Órdenes para facturar' })
    await screen.findByText('Factura B', { selector: 'b' })

    await userEvent.keyboard('{ArrowDown}')
    expect(await screen.findByRole('button', { name: /Cargar la OT 000003/ })).toBeDefined()
    await userEvent.keyboard('{F4}')
    expect(await screen.findByRole('heading', { name: 'Facturar la OT 000003' })).toBeDefined()
    expect(ordenes.ficha).toHaveBeenCalledWith({ id: OT.id })
    expect(comprobantes.emitir).not.toHaveBeenCalled()

    await userEvent.keyboard('{F4}')
    expect(
      await screen.findByRole('alertdialog', { name: '¿Emitir Factura B por $ 48.000,00?' }),
    ).toBeDefined()
  })
})

describe('facturar', () => {
  it('a consumidor final: F4 pide confirmar con el resumen, y recién ahí emite', async () => {
    comprobantes.emitir.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      nombre: 'Factura B',
      puntoVenta: 5,
      numero: 42,
      cae: '70000000000042',
    })
    entraComo(SESION)
    await montarApp('/caja')

    await screen.findByText('Factura B', { selector: 'b' })
    await cargarRenglon('Service 10.000 km', '1.234,50')
    expect(screen.getByText('$ 1.234,50')).toBeDefined()

    await userEvent.keyboard('{F4}')
    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿Emitir Factura B por $ 1.234,50?',
    })
    expect(dialogo.textContent).toMatch(/sólo se anula con una nota de crédito/)
    expect(comprobantes.emitir).not.toHaveBeenCalled()

    await confirmarDialogo('Emitir')
    await waitFor(() =>
      expect(comprobantes.emitir).toHaveBeenCalledWith(
        expect.objectContaining({
          puntoVentaId: PV.id,
          receptor: { consumidorFinal: { nombre: null, dni: null } },
          renglones: [
            expect.objectContaining({
              descripcion: 'Service 10.000 km',
              precioUnitario: '1234.50',
            }),
          ],
        }),
      ),
    )
    expect(
      await screen.findByRole('listitem', {
        name: 'Listo: Factura B 00005-00000042 emitida, CAE 70000000000042',
      }),
    ).toBeDefined()
  })

  it('con CUIT muestra qué factura corresponde según el padrón, con sus avisos', async () => {
    comprobantes.receptor.mockImplementation(async (x: { cuit?: string }) =>
      x.cuit
        ? {
            ...RECEPTOR_CF,
            tipoDocReceptor: 80,
            numeroDocReceptor: x.cuit,
            nombre: 'TRANSPORTES DEL SUR SRL',
            condicionIva: 1,
            tipoComprobante: 1,
            letra: 'A',
            nombreComprobante: 'Factura A',
            avisos: [
              'La condición frente al IVA que informa AFIP no es la de la ficha del cliente.',
            ],
          }
        : RECEPTOR_CF,
    )
    entraComo(SESION)
    await montarApp('/caja')
    await screen.findByText('Factura B', { selector: 'b' })

    await userEvent.click(screen.getByRole('radio', { name: 'Otro CUIT' }))
    await userEvent.type(screen.getByLabelText('CUIT'), '30711111111')

    const vista = await screen.findByRole('region', { name: 'Comprobante que corresponde' })
    await within(vista).findByText('Factura A')
    expect(within(vista).getByText('TRANSPORTES DEL SUR SRL')).toBeDefined()
    expect(within(vista).getByText(/no es la de la ficha/)).toBeDefined()
    expect(comprobantes.receptor).toHaveBeenLastCalledWith({
      puntoVentaId: PV.id,
      cuit: '30711111111',
    })
  })

  it('si AFIP rechaza, lo dice con los motivos', async () => {
    comprobantes.emitir.mockRejectedValue(
      new ORPCError('RECHAZADO', {
        status: 422,
        data: {
          comprobanteId: '44444444-4444-4444-8444-444444444444',
          errores: [{ codigo: 10016, mensaje: 'El número no es el próximo a autorizar' }],
          observaciones: [],
        },
      }),
    )
    entraComo(SESION)
    await montarApp('/caja')
    await screen.findByText('Factura B', { selector: 'b' })
    await cargarRenglon('Aceite', '100')
    await userEvent.keyboard('{F4}')
    await confirmarDialogo('Emitir')

    const error = await errorNotificado()
    expect(error.textContent).toMatch(/AFIP rechazó la factura/)
    expect(error.textContent).toMatch(/10016: El número no es el próximo a autorizar/)
  })

  it('sin certificado no deja facturar y lleva a cargarlo', async () => {
    comprobantes.opciones.mockResolvedValue({
      puntosVenta: [{ ...PV, certificado: 'falta', entorno: null }],
    })
    entraComo(SESION)
    await montarApp('/caja')
    expect(await screen.findByText(/todavía no tiene el certificado de AFIP/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Certificado de AFIP' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Emitir/ })).toBeNull()
  })

  it('el mecánico no ve la caja', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/caja')
    expect(await screen.findByRole('heading', { name: /No tenés permiso/ })).toBeDefined()
  })
})

describe('anular', () => {
  const FACTURA = {
    id: '55555555-5555-4555-8555-555555555555',
    estado: 'autorizado',
    tipoComprobante: 6,
    nombre: 'Factura B',
    letra: 'B',
    puntoVenta: 5,
    numero: 42,
    fecha: '2026-09-16',
    receptorNombre: 'Consumidor Final',
    importeTotal: '1234.50',
    cae: '70000000000042',
    entorno: 'produccion',
    anulado: false,
  }

  it('pide confirmar con el importe, y emite la nota de crédito', async () => {
    comprobantes.listar.mockResolvedValue({ datos: [FACTURA], total: 1 })
    comprobantes.anular.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      nombre: 'Nota de Crédito B',
      puntoVenta: 5,
      numero: 3,
      cae: '70000000000003',
    })
    entraComo(SESION)
    await montarApp('/caja')

    const fila = (await screen.findByText('Factura B 00005-00000042')).closest('tr') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Anular' }))
    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿Anular la Factura B 00005-00000042?',
    })
    expect(dialogo.textContent).toMatch(/nota de crédito por \$ 1\.234,50/)
    expect(comprobantes.anular).not.toHaveBeenCalled()

    await confirmarDialogo('Emitir la nota de crédito')
    await waitFor(() => expect(comprobantes.anular).toHaveBeenCalledWith({ id: FACTURA.id }))
    expect(
      await screen.findByRole('listitem', {
        name: 'Listo: Nota de Crédito B 00005-00000003 emitida, CAE 70000000000003',
      }),
    ).toBeDefined()
  })

  it('una anulada no se vuelve a anular, y lo dice', async () => {
    comprobantes.listar.mockResolvedValue({ datos: [{ ...FACTURA, anulado: true }], total: 1 })
    entraComo(SESION)
    await montarApp('/caja')
    const fila = (await screen.findByText('Factura B 00005-00000042')).closest('tr') as HTMLElement
    expect(within(fila).getByText('Anulada')).toBeDefined()
    expect(within(fila).queryByRole('button', { name: 'Anular' })).toBeNull()
  })
})

describe('mandar por mail', () => {
  it('ofrece el correo del cliente, deja cambiarlo y manda', async () => {
    comprobantes.listar.mockResolvedValue({
      datos: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          estado: 'autorizado',
          tipoComprobante: 1,
          nombre: 'Factura A',
          letra: 'A',
          puntoVenta: 5,
          numero: 9,
          fecha: '2026-09-16',
          receptorNombre: 'Transportes del Sur SRL',
          importeTotal: '121.00',
          cae: '70000000000009',
          entorno: 'produccion',
          anulado: false,
        },
      ],
      total: 1,
    })
    comprobantes.ficha.mockResolvedValue({ receptorEmail: 'compras@transportes.test' })
    comprobantes.enviar.mockResolvedValue({ enviadoA: 'pagos@transportes.test' })
    entraComo(SESION)
    await montarApp('/caja')

    const fila = (await screen.findByText('Factura A 00005-00000009')).closest('tr') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Mail' }))
    const dialogo = await screen.findByRole('alertdialog', {
      name: '¿A qué correo mando la Factura A 00005-00000009?',
    })
    const campo = within(dialogo).getByLabelText('Correo') as HTMLInputElement
    await waitFor(() => expect(campo.value).toBe('compras@transportes.test'))

    await userEvent.clear(campo)
    await userEvent.type(campo, 'no-es-correo{Enter}')
    expect(within(dialogo).getByText('Escribí un correo, como nombre@dominio.com')).toBeDefined()
    expect(comprobantes.enviar).not.toHaveBeenCalled()

    await userEvent.clear(campo)
    await userEvent.type(campo, 'pagos@transportes.test{Enter}')
    await waitFor(() =>
      expect(comprobantes.enviar).toHaveBeenCalledWith({
        id: '77777777-7777-4777-8777-777777777777',
        email: 'pagos@transportes.test',
      }),
    )
    expect(
      await screen.findByRole('listitem', {
        name: 'Listo: Mandada por mail a pagos@transportes.test',
      }),
    ).toBeDefined()
  })
})
