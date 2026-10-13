import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION } from './montar.tsx'

/**
 * El egreso: la cola de lo que está para entregar y la entrega, con lo hecho, lo no hecho, cómo
 * sale, el cobro y la firma. La firma se reemplaza por un botón: jsdom no dibuja.
 */

const ordenes = {
  listar: vi.fn(),
  ficha: vi.fn(),
  firmar: vi.fn(),
  entregar: vi.fn(),
  pdfEgreso: vi.fn(),
  subirFoto: vi.fn(),
}
const renovar = vi.fn()
const recepcion = { hoy: vi.fn(), atender: vi.fn(), soltar: vi.fn() }

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    recepcion: {
      hoy: () => recepcion.hoy(),
      atender: (x: unknown) => recepcion.atender(x),
      soltar: (x: unknown) => recepcion.soltar(x),
    },
    ordenes: Object.fromEntries(
      Object.keys(ordenes).map((n) => [
        n,
        (x: unknown) => (ordenes as Record<string, (x: unknown) => unknown>)[n]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

vi.mock('../src/componentes/Firma.tsx', () => ({
  Firma: ({ alCambiar }: { alCambiar: (b: Blob | null) => void }) => (
    <button type="button" onClick={() => alCambiar(new Blob(['firma'], { type: 'image/png' }))}>
      Firmar de prueba
    </button>
  ),
}))

const ORDEN = {
  id: '11111111-1111-4111-8111-111111111111',
  numero: 42,
  estado: 'facturada',
  vehiculo: {
    id: '22222222-2222-4222-8222-222222222222',
    dominio: 'AB123CD',
    chasis: '8AJFB8CD5N1234567',
    marca: 'Toyota',
    modelo: 'Hilux',
  },
  titular: { id: '33333333-3333-4333-8333-333333333333', razonSocial: 'Juan Pérez' },
  paga: null,
  pedido: 'Service',
  asesor: 'Martín',
  mecanico: null,
  entregaEstimada: null,
  creadoEn: '2026-10-10T12:00:00.000Z',
  total: '63500.00',
  traeNombre: 'Juan Pérez',
  kilometraje: 10000,
  combustible: 'medio',
  inventario: { auxilio: 'esta' },
  danios: [],
  hojaTipo: 'sedan',
  hojaImagenId: null,
  items: [
    {
      id: '44444444-4444-4444-8444-444444444441',
      tipo: 'trabajo',
      descripcion: 'Service',
      cantidad: '1.0000',
      total: '45000.00',
      autorizacion: null,
      codigosBarras: [],
    },
    {
      id: '44444444-4444-4444-8444-444444444442',
      tipo: 'repuesto',
      descripcion: 'Filtro de aceite',
      cantidad: '1.0000',
      total: '18500.00',
      autorizacion: null,
      codigosBarras: ['7790009876543'],
    },
  ],
  noSeHizo: [{ origen: 'revision', descripcion: 'Discos de freno', semaforo: 'rojo' }],
  factura: {
    id: '55555555-5555-4555-8555-555555555555',
    nombre: 'Factura B',
    puntoVenta: 1,
    numero: 42,
  },
  egreso: null,
  firmas: { ingreso: null, egreso: null },
  fotos: [],
}

beforeEach(() => {
  for (const f of [...Object.values(ordenes), ...Object.values(recepcion), renovar]) {
    f.mockReset()
  }
  recepcion.hoy.mockResolvedValue({ datos: [] })
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  ordenes.listar.mockResolvedValue({ datos: [ORDEN], total: 1 })
  ordenes.ficha.mockResolvedValue(ORDEN)
})

afterEach(cleanup)

describe('para entregar', () => {
  it('la cola lista las terminadas y facturadas, y Enter abre la entrega', async () => {
    const router = await montarApp('/entregas')
    expect(await screen.findByText('Juan Pérez')).toBeDefined()
    expect(ordenes.listar).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'para_entregar' }),
    )

    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/entregas/${ORDEN.id}`))
  })
})

/** Alguien que se anotó en la puerta para buscar su auto. */
const RETIRO = {
  id: '66666666-6666-4666-8666-666666666666',
  numero: 'S-007',
  motivo: 'retiro' as const,
  origen: 'totem' as const,
  entidadId: null,
  nombre: 'Juan Pérez',
  telefono: null,
  derivadaA: null,
  atendidaPor: null,
  llegoEn: new Date().toISOString(),
  atendidaEn: null,
  cerradaEn: null,
  resultado: null,
  ordenId: null,
  nota: null,
  turno: null,
}

describe('el que viene a retirar', () => {
  it('se ve arriba; atenderlo lo agarra, y la visita viaja con el auto que se elige', async () => {
    recepcion.hoy.mockResolvedValue({ datos: [RETIRO] })
    const tomada = {
      ...RETIRO,
      atendidaEn: new Date().toISOString(),
      atendidaPor: { id: 'u1', nombre: 'Martín Gutiérrez' },
    }
    recepcion.atender.mockImplementation(async () => {
      recepcion.hoy.mockResolvedValue({ datos: [tomada] })
      return tomada
    })
    const router = await montarApp('/entregas')

    const retiran = await screen.findByRole('region', { name: 'Vienen a retirar' })
    await userEvent.click(within(retiran).getByRole('button', { name: 'Atender' }))
    expect(recepcion.atender).toHaveBeenCalledWith({ id: RETIRO.id })
    expect(await screen.findByText(/Elegí su auto/)).toBeDefined()

    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/entregas/${ORDEN.id}`))
    expect(router.state.location.search).toEqual({ visita: RETIRO.id })
  })

  it('entregar cierra su visita', async () => {
    recepcion.hoy.mockResolvedValue({
      datos: [{ ...RETIRO, atendidaPor: { id: 'u1', nombre: 'Martín Gutiérrez' } }],
    })
    ordenes.firmar.mockResolvedValue({ ingreso: null, egreso: null })
    ordenes.entregar.mockResolvedValue({ ...ORDEN, estado: 'entregada' })
    await montarApp(`/entregas/${ORDEN.id}?visita=${RETIRO.id}`)

    expect(await screen.findByText('S-007 · Juan Pérez')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await userEvent.keyboard('{F4}')
    await confirmarDialogo('Entregar')

    await waitFor(() =>
      expect(ordenes.entregar).toHaveBeenCalledWith(
        expect.objectContaining({ id: ORDEN.id, visitaId: RETIRO.id }),
      ),
    )
  })
})

describe('la entrega', () => {
  it('muestra la caja de cada repuesto y lo que no se hizo; con la firma, F4 entrega', async () => {
    ordenes.firmar.mockResolvedValue({
      ingreso: null,
      egreso: { aclaracion: 'Juan Pérez', firmadoEn: '' },
    })
    ordenes.entregar.mockResolvedValue({ ...ORDEN, estado: 'entregada' })
    await montarApp(`/entregas/${ORDEN.id}`)

    expect(await screen.findByText('Caja: 7790009876543')).toBeDefined()
    expect(
      within(screen.getByRole('region', { name: 'Lo que no se hizo' })).getByText(
        'Discos de freno',
      ),
    ).toBeDefined()
    expect(screen.getByText(/Facturada con la/)).toBeDefined()

    const entregar = screen.getByRole('button', { name: /^Entregar/ }) as HTMLButtonElement
    expect(entregar.disabled).toBe(true)
    expect(screen.getByText(/Falta la firma del cliente/)).toBeDefined()

    const km = screen.getByLabelText('Kilómetros')
    await userEvent.clear(km)
    await userEvent.type(km, '10025')
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await waitFor(() => expect(entregar.disabled).toBe(false))

    await userEvent.keyboard('{F4}')
    await confirmarDialogo('Entregar')

    await waitFor(() =>
      expect(ordenes.entregar).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ORDEN.id,
          kilometraje: 10025,
          combustible: 'medio',
          inventario: { auxilio: 'esta' },
          danios: [],
          sinFactura: null,
        }),
      ),
    )
    expect(ordenes.firmar).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDEN.id, momento: 'egreso', aclaracion: 'Juan Pérez' }),
    )
  })

  it('sin facturar y sin poder autorizar, manda a caja y no deja entregar', async () => {
    usarSesion.getState().limpiar()
    renovar.mockImplementation(async () => {
      usarSesion.getState().establecer({
        ...SESION,
        habilidades: [
          { action: ['ver', 'crear', 'editar'], subject: ['Orden', 'Vehiculo', 'Cliente'] },
        ],
      })
      return true
    })
    ordenes.ficha.mockResolvedValue({ ...ORDEN, estado: 'terminada', factura: null })
    await montarApp(`/entregas/${ORDEN.id}`)

    expect(await screen.findByText(/Facturala en/)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    expect((screen.getByRole('button', { name: /^Entregar/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/Falta facturarla en caja/)).toBeDefined()
  })

  it('quien puede autorizar la entrega sin factura dice por qué', async () => {
    ordenes.ficha.mockResolvedValue({ ...ORDEN, estado: 'terminada', factura: null })
    ordenes.firmar.mockResolvedValue({ ingreso: null, egreso: null })
    ordenes.entregar.mockResolvedValue({ ...ORDEN, estado: 'entregada' })
    await montarApp(`/entregas/${ORDEN.id}`)

    await userEvent.type(await screen.findByLabelText('Por qué sale sin factura'), 'Garantía')
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await userEvent.click(screen.getByRole('button', { name: /^Entregar/ }))
    const dialogo = await confirmarDialogo('Entregar')
    expect(dialogo.textContent).toMatch(/Sale sin factura: Garantía/)
    await waitFor(() =>
      expect(ordenes.entregar).toHaveBeenCalledWith(
        expect.objectContaining({ sinFactura: { motivo: 'Garantía' } }),
      ),
    )
  })
})

describe('las fotos de cómo sale', () => {
  it('son optativas, y las que se sacan se suben antes de entregar', async () => {
    ordenes.firmar.mockResolvedValue({ ingreso: null, egreso: null })
    ordenes.subirFoto.mockResolvedValue({})
    ordenes.entregar.mockResolvedValue({ ...ORDEN, estado: 'entregada' })
    await montarApp(`/entregas/${ORDEN.id}`)

    await userEvent.upload(
      await screen.findByLabelText('Fotos del vehículo'),
      new File(['foto'], 'frente.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByAltText('Foto 1')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await userEvent.keyboard('{F4}')
    await confirmarDialogo('Entregar')

    await waitFor(() => expect(ordenes.entregar).toHaveBeenCalled())
    expect(ordenes.subirFoto).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDEN.id, momento: 'egreso' }),
    )
    // Antes de entregar: con la orden entregada ya no se suben.
    expect(ordenes.subirFoto.mock.invocationCallOrder[0]).toBeLessThan(
      ordenes.entregar.mock.invocationCallOrder[0] as number,
    )
  })
})
