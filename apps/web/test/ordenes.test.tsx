import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { cacheDePrueba, confirmarDialogo, montarApp, SESION } from './montar.tsx'
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
  anular: vi.fn(),
  presupuestar: vi.fn(),
  responderPresupuesto: vi.fn(),
  enviarPresupuesto: vi.fn(),
  pdfPresupuesto: vi.fn(),
  revisar: vi.fn(),
  pasarAPresupuesto: vi.fn(),
  pendientes: vi.fn(),
  descartarPendiente: vi.fn(),
  firmar: vi.fn(),
  subirFoto: vi.fn(),
  foto: vi.fn(),
  quitarFoto: vi.fn(),
}
const listarVehiculos = vi.fn()
const listarHojas = vi.fn()
const listarPuntos = vi.fn()
const listarRepuestos = vi.fn()
const listarPedidos = vi.fn()
const renovar = vi.fn()
const crearVehiculo = vi.fn()
const recepcion = { hoy: vi.fn(), atender: vi.fn(), soltar: vi.fn() }

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: {
      listar: (x: unknown) => listarVehiculos(x),
      crear: (x: unknown) => crearVehiculo(x),
      marcas: async () => ({ datos: [] }),
    },
    repuestos: { listar: (x: unknown) => listarRepuestos(x) },
    pedidosRepuestos: { listar: (x: unknown) => listarPedidos(x) },
    clientes: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    revision: { listar: () => listarPuntos() },
    recepcion: {
      hoy: () => recepcion.hoy(),
      atender: (x: unknown) => recepcion.atender(x),
      soltar: (x: unknown) => recepcion.soltar(x),
    },
    hojas: {
      listar: () => listarHojas(),
      imagen: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' })),
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

// jsdom no dibuja: la firma se reemplaza por un botón que entrega una imagen.
vi.mock('../src/componentes/Firma.tsx', () => ({
  Firma: ({ alCambiar }: { alCambiar: (b: Blob | null) => void }) => (
    <button type="button" onClick={() => alCambiar(new Blob(['firma'], { type: 'image/png' }))}>
      Firmar de prueba
    </button>
  ),
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
  entregaEstimada: null,
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
  // Lo que registró el fichaje. Vacío en casi todas las pruebas de esta pantalla: los tiempos
  // se prueban en las suyas.
  sesiones: [],
  manoDeObraMin: 0,
  kilometraje: 48210,
  combustible: 'medio',
  observaciones: null,
  hojaTipo: 'sedan',
  hojaImagenId: null,
  danios: [],
  inventario: {},
  // Sin revisión: la sección no aparece. La revisión se prueba en las suyas.
  revision: [] as Array<Record<string, unknown>>,
  terminadaEn: null,
  entregadaEn: null,
  firmas: { ingreso: null, egreso: null },
  fotos: [],
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
      codigosBarras: [],
    },
  ],
}

/** Tres puntos del catálogo del taller, uno en la sección que se completa en el taller. */
const PUNTOS = [
  { id: 'a0000000-0000-4000-8000-000000000001', seccion: 'interior', nombre: 'Bocina' },
  { id: 'a0000000-0000-4000-8000-000000000002', seccion: 'motor', nombre: 'Correas' },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    seccion: 'dinamica',
    nombre: 'Pastillas y discos de freno',
  },
].map((p, i) => ({ ...p, orden: i + 1, activo: true, propio: false }))
const [BOCINA, CORREAS, PASTILLAS] = PUNTOS as [
  (typeof PUNTOS)[number],
  (typeof PUNTOS)[number],
  (typeof PUNTOS)[number],
]

beforeEach(() => {
  for (const f of [
    crearVehiculo,
    ...Object.values(ordenes),
    ...Object.values(recepcion),
    listarVehiculos,
    listarHojas,
    listarPuntos,
    renovar,
  ])
    f.mockReset()
  recepcion.hoy.mockResolvedValue({ datos: [] })
  ordenes.pendientes.mockResolvedValue({ datos: [] })
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  ordenes.listar.mockResolvedValue({ datos: [ORDEN], total: 1 })
  ordenes.ficha.mockResolvedValue(FICHA)
  ordenes.personal.mockResolvedValue({ datos: [] })
  listarPuntos.mockResolvedValue({ datos: PUNTOS })
  // El taller todavía no subió sus dibujos: es el caso de la mayoría al arrancar.
  listarHojas.mockResolvedValue({
    datos: ['sedan', 'hatchback', 'suv', 'pickup'].map((tipo) => ({ tipo, propia: null })),
  })
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
          carroceria: null,
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

  it('ofrece lo que quedó pendiente, y lo que se elige va con la orden', async () => {
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
          carroceria: null,
          titular: TITULAR,
        },
      ],
      total: 1,
    })
    ordenes.pendientes.mockResolvedValue({
      datos: [
        {
          id: '77777777-0000-4000-8000-000000000001',
          descripcion: 'Pastillas de freno',
          origen: 'revision',
          semaforo: 'rojo',
          informadoEn: '2026-09-20T12:00:00.000Z',
          orden: { id: ORDEN.id, numero: 1 },
        },
      ],
    })
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')

    await userEvent.type(await screen.findByLabelText('Vehículo'), 'ab123')
    await screen.findByRole('list', { name: 'Vehículos que coinciden con ab123' })
    await userEvent.keyboard('{Enter}')

    const pendientes = await screen.findByRole('region', { name: 'Quedaron pendientes' })
    expect(within(pendientes).getByText('Pastillas de freno')).toBeDefined()
    await userEvent.click(within(pendientes).getByRole('button', { name: 'Sumar a esta orden' }))
    expect(
      within(pendientes).getByRole('button', { name: 'Se suma a esta orden', pressed: true }),
    ).toBeDefined()

    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Los frenos')
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({ pendienteIds: ['77777777-0000-4000-8000-000000000001'] }),
      ),
    )
  })

  it('si el cliente firma en la pantalla, la firma va con la orden recién abierta', async () => {
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
          carroceria: null,
          titular: TITULAR,
        },
      ],
      total: 1,
    })
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')

    await userEvent.type(await screen.findByLabelText('Vehículo'), 'ab123')
    await screen.findByRole('list', { name: 'Vehículos que coinciden con ab123' })
    await userEvent.keyboard('{Enter}')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    // Una firma sin aclaración no dice de quién es: no abre, y dice qué falta.
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await userEvent.keyboard('{F2}')
    expect(screen.getByText('Escribí el nombre de quien firma')).toBeDefined()
    expect(ordenes.abrir).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Quién firma'), 'Ana Gómez')
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.firmar).toHaveBeenCalledWith(
        expect.objectContaining({ id: FICHA.id, momento: 'ingreso', aclaracion: 'Ana Gómez' }),
      ),
    )
  })

  it('las fotos van con la orden recién abierta, con lo que muestra cada una', async () => {
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
          carroceria: null,
          titular: TITULAR,
        },
      ],
      total: 1,
    })
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')

    await userEvent.type(await screen.findByLabelText('Vehículo'), 'ab123')
    await screen.findByRole('list', { name: 'Vehículos que coinciden con ab123' })
    await userEvent.keyboard('{Enter}')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    await userEvent.upload(
      screen.getByLabelText('Fotos del vehículo'),
      new File(['foto'], 'puerta.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByAltText('Foto 1')).toBeDefined()
    await userEvent.type(screen.getByLabelText('Qué muestra la foto 1'), 'Rayón en la puerta')
    await userEvent.keyboard('{F2}')

    await waitFor(() =>
      expect(ordenes.subirFoto).toHaveBeenCalledWith(
        expect.objectContaining({ id: FICHA.id, momento: 'ingreso', nota: 'Rayón en la puerta' }),
      ),
    )
  })

  it('sin auto ni pedido no abre, y dice qué falta', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    await userEvent.keyboard('{F2}')
    expect(screen.getByText('Elegí el vehículo que entra.')).toBeDefined()
    expect(ordenes.abrir).not.toHaveBeenCalled()
  })
})

const VEHICULO_ELEGIBLE = {
  id: ORDEN.vehiculo.id,
  chasis: ORDEN.vehiculo.chasis,
  dominio: 'AB123CD',
  anio: 2022,
  color: null,
  marca: 'Volkswagen',
  modelo: 'Amarok',
  carroceria: null,
  titular: TITULAR,
}

async function elegirVehiculo(etiqueta: string, vehiculo = VEHICULO_ELEGIBLE) {
  listarVehiculos.mockResolvedValue({ datos: [vehiculo], total: 1 })
  await userEvent.type(await screen.findByLabelText(etiqueta), 'ab123')
  await screen.findByRole('list', { name: 'Vehículos que coinciden con ab123' })
  await userEvent.keyboard('{Enter}')
  await screen.findByText('Titular: Transportes del Sur SRL')
}

describe('el estado del vehículo al recibirlo', () => {
  it('con el modelo cargado se dibuja lo que es, y no se pregunta nada', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo', { ...VEHICULO_ELEGIBLE, carroceria: 'pickup' })

    // Ya se sabe qué es: no se pregunta.
    expect(screen.queryByRole('radio', { name: 'Pickup' })).toBeNull()
    expect(screen.getByRole('application', { name: /Dibujo de Pickup/ })).toBeDefined()
  })

  it('si el modelo no dice qué es, se pregunta una vez, y cambiarlo borra las marcas', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    const auto = screen.getByRole('application')
    auto.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}r')
    expect(within(screen.getByRole('list', { name: 'Marcas' })).getByText('Rayón')).toBeDefined()

    // Era una pickup: las marcas están puestas sobre otro dibujo, así que no pueden quedar.
    await userEvent.click(screen.getByRole('radio', { name: 'Pickup' }))
    expect(screen.queryByRole('list', { name: 'Marcas' })).toBeNull()

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({ carroceria: 'pickup', danios: [] }),
      ),
    )
  })

  /**
   * Sin mouse: la cruz arranca en el medio del dibujo, las flechas la mueven y la letra marca
   * donde quedó. Es lo que reemplazó al recorrido por piezas, que no existe más porque el
   * dibujo lo pone cada taller.
   */
  it('con teclado: las flechas mueven la cruz y la letra marca donde quedó', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    const auto = screen.getByRole('application')
    auto.focus()
    await userEvent.keyboard('r')
    // Dos flechas a la izquierda son cuatro centésimas del ancho.
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}g')

    const marcas = screen.getByRole('list', { name: 'Marcas' })
    expect(within(marcas).getByText('Rayón')).toBeDefined()
    expect(within(marcas).getByText('Golpe')).toBeDefined()

    await userEvent.type(screen.getByLabelText('Detalle de la marca 2, golpe'), 'Chico')
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          danios: [
            { tipo: 'rayon', x: 0.5, y: 0.5, nota: null },
            { tipo: 'golpe', x: 0.46, y: 0.5, nota: 'Chico' },
          ],
        }),
      ),
    )
  })

  it('Supr quita la última marca, después de confirmar', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    const auto = screen.getByRole('application')
    auto.focus()
    await userEvent.keyboard('x')
    const marcas = screen.getByRole('list', { name: 'Marcas' })
    expect(within(marcas).getByText('Roto o rajado')).toBeDefined()

    await userEvent.keyboard('{Delete}')
    await confirmarDialogo('Quitar la marca')
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Marcas' })).toBeNull())
  })

  it('tocar el dibujo lo marca con lo elegido', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    const queMarcar = screen.getByRole('group', { name: 'Qué marcar' })
    await userEvent.click(within(queMarcar).getByRole('radio', { name: /Falta/ }))
    await userEvent.click(screen.getByRole('application'))
    expect(within(screen.getByRole('list', { name: 'Marcas' })).getByText('Falta')).toBeDefined()
  })

  it('el inventario: lo que falta, y el resto de un toque', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Service')

    const auxilio = screen.getByRole('group', { name: 'Rueda de auxilio' })
    await userEvent.click(within(auxilio).getByRole('radio', { name: 'Falta' }))
    expect(screen.getByText('9 sin revisar')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'El resto está' }))
    expect(screen.getByText('Revisado entero')).toBeDefined()

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          inventario: expect.objectContaining({ auxilio: 'falta', gato: 'esta', manual: 'esta' }),
        }),
      ),
    )
  })

  it('sin tocar, el inventario no dice que está: dice que no se revisó', async () => {
    ordenes.ficha.mockResolvedValue({ ...FICHA, inventario: { auxilio: 'falta' } })
    await montarApp(`/ordenes/${ORDEN.id}`)
    const lista = await screen.findByRole('list', { name: 'Vino con el auto' })
    expect(within(lista).getByText('Falta')).toBeDefined()
    expect(within(lista).getAllByText('Sin revisar')).toHaveLength(9)
  })

  it('la ficha muestra las marcas con su detalle, y no se pueden tocar', async () => {
    ordenes.ficha.mockResolvedValue({
      ...FICHA,
      danios: [{ tipo: 'golpe', x: 0.78, y: 0.41, nota: 'Hondo' }],
    })
    await montarApp(`/ordenes/${ORDEN.id}`)
    expect(await screen.findByText('Golpe')).toBeDefined()
    expect(screen.getByText('— Hondo')).toBeDefined()
    // De sólo lectura: el dibujo de la ficha no se marca.
    expect(screen.queryByRole('application')).toBeNull()
  })
})

/** La tablet arranca en la cola: para recibir un auto que nadie anotó, se elige «sin turno». */
async function sinTurno() {
  await userEvent.click(await screen.findByRole('button', { name: 'Recibir sin turno' }))
  await screen.findByLabelText('Patente o chasis')
}

describe('la recepción en tablet', () => {
  it('es táctil, va paso por paso, no deja seguir sin lo que falta, y abre la orden', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, numero: 57, estado: 'recibida' })
    await montarApp('/recepcion')
    await sinTurno()
    expect(document.documentElement.dataset.densidad).toBe('tactil')

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Elegí el vehículo que entra.')).toBeDefined()

    await elegirVehiculo('Patente o chasis')
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByText('¿Quién lo trae y quién autoriza?')
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('¿Qué pide el cliente?')
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Anotá qué pide el cliente, con sus palabras.')).toBeDefined()
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Cambio de aceite')
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('¿Cómo está el vehículo?')
    await userEvent.click(screen.getByRole('application'))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // Las fotos son optativas: se sigue de largo.
    await screen.findByText('¿Le sacás fotos?')
    expect(screen.getByRole('button', { name: /Sacar una foto/ })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('¿Qué vino con el auto?')
    await userEvent.click(screen.getByRole('button', { name: 'Está todo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('¿Qué le falta?')
    const correas = screen.getByRole('group', { name: 'Correas' })
    await userEvent.click(within(correas).getByText('Urgente'))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('Repasalo con el cliente')
    expect(screen.getByText('R Rayón')).toBeDefined()
    expect(screen.getByText('Todo lo revisado está')).toBeDefined()
    expect(screen.getByText('1 urgente')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // La firma es optativa: sin ella, la copia impresa.
    await screen.findByText('Que firme el cliente')
    await userEvent.click(screen.getByRole('button', { name: /Abrir sin firmar/ }))

    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          vehiculoId: ORDEN.vehiculo.id,
          pedido: 'Cambio de aceite',
          danios: [{ tipo: 'rayon', x: 0.5, y: 0.5, nota: null }],
          revision: [{ puntoId: CORREAS.id, estado: 'rojo', nota: null }],
        }),
      ),
    )
    expect(await screen.findByText('OT 000057')).toBeDefined()
    expect(ordenes.firmar).not.toHaveBeenCalled()
    expect(screen.getByText(/Imprimila para que el cliente firme la copia/)).toBeDefined()

    // Y se sigue con el próximo, sin volver a entrar: vuelve a la cola, y de ahí sale vacía.
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la cola' }))
    await sinTurno()
    expect(screen.getByLabelText('Patente o chasis')).toHaveProperty('value', '')
  })

  it('«Cambiar» en el repaso lleva al paso donde se carga ese dato', async () => {
    await montarApp('/recepcion')
    await sinTurno()
    await userEvent.click(screen.getByRole('button', { name: /Repasar/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar qué pide' }))
    expect(await screen.findByText('¿Qué pide el cliente?')).toBeDefined()
  })

  it('al salir de la tablet vuelve la densidad de cada uno', async () => {
    const router = await montarApp('/recepcion')
    await sinTurno()
    await router.navigate({ to: '/ordenes' })
    await waitFor(() => expect(document.documentElement.dataset.densidad).toBeUndefined())
  })
})

describe('la revisión', () => {
  it('en la recepción: sin tocar no es verde, lo que no está bien lleva nota, y va con la orden', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Service')

    const revision = screen.getByRole('region', { name: 'Revisión' })
    // La sección del taller avisa que se completa después.
    expect(
      within(revision).getByText('Pide prueba de ruta: se completa en el taller'),
    ).toBeDefined()

    const correas = within(revision).getByRole('group', { name: 'Correas' })
    await userEvent.click(within(correas).getByText('Reparar'))
    await userEvent.type(within(revision).getByLabelText('Qué tiene: Correas'), 'Cuarteada')
    // «Todo bien» en una sección marca lo que falta de esa sección, y nada más.
    await userEvent.click(
      within(revision).getAllByRole('button', { name: 'Todo bien' })[0] as HTMLElement,
    )

    await userEvent.keyboard('{F2}')
    await waitFor(() => expect(ordenes.abrir).toHaveBeenCalled())
    const enviada = ordenes.abrir.mock.calls[0]?.[0] as { revision: unknown[] }
    expect(enviada.revision).toEqual(
      expect.arrayContaining([
        { puntoId: CORREAS.id, estado: 'ambar', nota: 'Cuarteada' },
        { puntoId: BOCINA.id, estado: 'verde', nota: null },
      ]),
    )
    // Las pastillas nadie las tocó: no viajan, y quedan sin revisar.
    expect(enviada.revision).toHaveLength(2)
  })

  const REVISADA = {
    ...FICHA,
    revision: [
      {
        puntoId: BOCINA.id,
        seccion: 'interior',
        nombre: 'Bocina',
        estado: 'verde',
        nota: null,
        por: 'Martín Gutiérrez',
        en: '2026-10-06T12:00:00.000Z',
        itemId: null,
      },
      {
        puntoId: CORREAS.id,
        seccion: 'motor',
        nombre: 'Correas',
        estado: 'ambar',
        nota: 'Cuarteada',
        por: 'Martín Gutiérrez',
        en: '2026-10-06T12:00:00.000Z',
        itemId: null,
      },
      {
        puntoId: PASTILLAS.id,
        seccion: 'dinamica',
        nombre: 'Pastillas y discos de freno',
        estado: null,
        nota: null,
        por: null,
        en: null,
        itemId: null,
      },
    ],
  }

  it('en la ficha se completa después, y se guarda sólo lo que cambió', async () => {
    ordenes.ficha.mockResolvedValue(REVISADA)
    ordenes.revisar.mockResolvedValue(REVISADA)
    await montarApp(`/ordenes/${ORDEN.id}`)
    const revision = await screen.findByRole('region', { name: 'Revisión' })
    expect(within(revision).getByText('1 sin revisar')).toBeDefined()

    const pastillas = within(revision).getByRole('group', { name: 'Pastillas y discos de freno' })
    await userEvent.click(within(pastillas).getByText('Urgente'))
    await userEvent.click(within(revision).getByRole('button', { name: 'Guardar la revisión' }))
    await waitFor(() =>
      expect(ordenes.revisar).toHaveBeenCalledWith({
        id: ORDEN.id,
        respuestas: [{ puntoId: PASTILLAS.id, estado: 'rojo', nota: null }],
      }),
    )
  })

  it('lo ámbar pasa a la orden como trabajo, sin perder lo que se estaba escribiendo', async () => {
    ordenes.ficha.mockResolvedValue(REVISADA)
    const NUEVO = {
      ...(FICHA.items[0] as (typeof FICHA.items)[number]),
      id: '55555555-5555-4555-8555-555555555555',
      descripcion: 'Correas: Cuarteada',
      precioUnitario: '0.0000',
      total: '0.00',
    }
    const PASADA = {
      ...REVISADA,
      items: [...FICHA.items, NUEVO],
      revision: REVISADA.revision.map((r) =>
        r.puntoId === CORREAS.id ? { ...r, itemId: NUEVO.id } : r,
      ),
    }
    ordenes.pasarAPresupuesto.mockImplementation(async () => {
      // Después de pasar, la orden que se vuelve a pedir ya trae el renglón.
      ordenes.ficha.mockResolvedValue(PASADA)
      return PASADA
    })
    await montarApp(`/ordenes/${ORDEN.id}`)

    // Alguien está corrigiendo un renglón y no guardó.
    const items = await screen.findByRole('region', { name: 'Trabajos y repuestos' })
    const descripcion = within(items).getByDisplayValue('Service')
    await userEvent.type(descripcion, ' completo')

    const revision = screen.getByRole('region', { name: 'Revisión' })
    await userEvent.click(within(revision).getByRole('button', { name: 'Pasar a presupuesto' }))
    const puntos = await screen.findByRole('list', { name: 'Puntos a presupuestar' })
    expect(within(puntos).getByText('Correas: Cuarteada')).toBeDefined()
    // Lo verde no se ofrece.
    expect(within(puntos).queryByText('Bocina')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Sumar el trabajo' }))
    await waitFor(() =>
      expect(ordenes.pasarAPresupuesto).toHaveBeenCalledWith({
        id: ORDEN.id,
        puntoIds: [CORREAS.id],
      }),
    )
    // El renglón nuevo aparece, y lo que se estaba escribiendo sigue ahí.
    expect(await within(items).findByDisplayValue('Correas: Cuarteada')).toBeDefined()
    expect(within(items).getByDisplayValue('Service completo')).toBeDefined()
    expect(within(revision).getByText('· en la orden')).toBeDefined()
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

  it('muestra las fotos de cuando entró, y darlas de baja pregunta antes', async () => {
    const FOTO = {
      id: '77777777-7777-4777-8777-777777777777',
      momento: 'ingreso' as const,
      nota: 'Rayón en la puerta',
      sacadaEn: '2026-10-13T12:00:00.000Z',
      sacadaPor: 'Martín Gutiérrez',
    }
    ordenes.ficha.mockResolvedValue({ ...FICHA, fotos: [FOTO] })
    ordenes.foto.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    ordenes.quitarFoto.mockResolvedValue({ hecho: true })
    await montarApp(`/ordenes/${ORDEN.id}`)

    const fotos = await screen.findByRole('region', { name: 'Fotos' })
    expect(await within(fotos).findByAltText('Foto 1 al recibirlo')).toBeDefined()
    expect(within(fotos).getByText('Rayón en la puerta')).toBeDefined()

    await userEvent.click(within(fotos).getByRole('button', { name: /Dar de baja/ }))
    await confirmarDialogo('Dar de baja')
    await waitFor(() =>
      expect(ordenes.quitarFoto).toHaveBeenCalledWith({ id: FICHA.id, fotoId: FOTO.id }),
    )
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

describe('anular la orden', () => {
  it('la lista de pedidos de la orden se actualiza sin recargar', async () => {
    const PEDIDO = {
      id: '88888888-8888-4888-8888-888888888888',
      numero: 1,
      estado: 'abierto',
      chasis: ORDEN.vehiculo.chasis,
      vehiculo: null,
      orden: { id: ORDEN.id, numero: 1 },
      cliente: null,
      solicitante: 'Diego',
      creadoPor: 'Carla',
      creadoEn: '2026-09-17T12:00:00.000Z',
      total: '0.00',
      items: 0,
    }
    listarPedidos.mockResolvedValue({ datos: [PEDIDO], total: 1 })
    ordenes.anular.mockResolvedValue({ ...FICHA, estado: 'anulada' })
    await montarApp(`/ordenes/${ORDEN.id}`)
    const pedidos = await screen.findByRole('region', { name: 'Pedidos de repuestos' })
    expect(await within(pedidos).findByText('Abierto')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'Anular' }))
    ordenes.ficha.mockResolvedValue({ ...FICHA, estado: 'anulada' })
    listarPedidos.mockResolvedValue({ datos: [{ ...PEDIDO, estado: 'anulado' }], total: 1 })
    await confirmarDialogo('Anular la orden')

    expect(await within(pedidos).findByText('Anulado')).toBeDefined()
  })

  /**
   * La regresión que lo motivó: el mecánico escaneaba, la base guardaba los minutos, y en la
   * pantalla de la orden no se enteraba nadie. El fichaje tiene que verse desde el sistema.
   */
  it('la orden muestra los tiempos que registró el fichaje', async () => {
    ordenes.ficha.mockResolvedValue({
      ...FICHA,
      manoDeObraMin: 95,
      sesiones: [
        {
          id: 's1',
          nombre: 'Diego Sosa',
          legajo: '0001',
          inicio: '2026-09-20T12:00:00.000Z',
          fin: '2026-09-20T13:35:00.000Z',
          minutos: 95,
          cerradaPor: 'mecanico',
        },
      ],
    })
    await montarApp(`/ordenes/${ORDEN.id}`)

    const tiempos = await screen.findByRole('region', { name: 'Tiempos de taller' })
    expect(within(tiempos).getByText('Diego Sosa')).toBeDefined()
    expect(within(tiempos).getAllByText('1 h 35 min').length).toBeGreaterThan(0)
  })

  /** Lo que cerró el fin de turno es lo que probablemente esté mal: hay que poder mirarlo. */
  it('marca las que no cerró el mecánico', async () => {
    ordenes.ficha.mockResolvedValue({
      ...FICHA,
      manoDeObraMin: 600,
      sesiones: [
        {
          id: 's1',
          nombre: 'Diego Sosa',
          legajo: '0001',
          inicio: '2026-09-19T12:00:00.000Z',
          fin: '2026-09-19T22:00:00.000Z',
          minutos: 600,
          cerradaPor: 'auto',
        },
      ],
    })
    await montarApp(`/ordenes/${ORDEN.id}`)

    const tiempos = await screen.findByRole('region', { name: 'Tiempos de taller' })
    expect(within(tiempos).getByText('cerrada al fin del turno')).toBeDefined()
  })

  it('sin nadie que haya fichado, explica de dónde salen los minutos', async () => {
    await montarApp(`/ordenes/${ORDEN.id}`)

    const tiempos = await screen.findByRole('region', { name: 'Tiempos de taller' })
    expect(within(tiempos).getByText(/puesto de fichaje/)).toBeDefined()
  })

  /**
   * La regresión: se cambiaba el estado de una orden y el tablero del taller seguía diciendo lo
   * de antes hasta recargar la página. Las dos pantallas son rutas distintas y no se montan
   * juntas, así que lo único observable desde afuera es que la consulta del tablero quede
   * marcada para volver a pedirse.
   */
  it('cambiar el estado marca el tablero del taller para volver a pedirlo', async () => {
    ordenes.cambiarEstado.mockResolvedValue({ ...FICHA, estado: 'esperando_repuesto' })
    await montarApp(`/ordenes/${ORDEN.id}`)
    // La orden llega por red: el selector no existe hasta que llegó.
    const estado = await screen.findByLabelText('Dónde está el auto')

    const cache = cacheDePrueba()
    // Como si el tablero se hubiera mirado hace un rato y estuviera en la caché.
    cache.setQueryData(['tablero', 't1', 's1'], { autos: [] })
    expect(cache.getQueryState(['tablero', 't1', 's1'])?.isInvalidated).toBe(false)

    // Otro estado que el que tiene: elegir el mismo no cambia nada, y con razón.
    await userEvent.selectOptions(estado, 'Esperando repuesto')
    await waitFor(() =>
      expect(cache.getQueryState(['tablero', 't1', 's1'])?.isInvalidated).toBe(true),
    )
  })
})

describe('la cola de la tablet', () => {
  const ESPERA = {
    id: 'v1',
    numero: 'S-004',
    motivo: 'servicio' as const,
    origen: 'recepcion' as const,
    entidadId: null,
    nombre: 'Juan Pérez',
    telefono: '351 555-1234',
    derivadaA: null,
    atendidaPor: null,
    llegoEn: new Date(Date.now() - 12 * 60_000).toISOString(),
    atendidaEn: null,
    cerradaEn: null,
    resultado: null,
    ordenId: null,
    nota: null,
    turno: null,
  }
  const DE_OTRO = {
    ...ESPERA,
    id: 'v2',
    numero: 'S-005',
    nombre: 'Carla Ruiz',
    atendidaEn: new Date().toISOString(),
    atendidaPor: { id: 'u9', nombre: 'Diego Sosa' },
  }
  const DE_VENTAS = { ...ESPERA, id: 'v3', numero: 'V-001', motivo: 'venta' as const }

  it('muestra a quién esperan para el taller, y lo que tiene otro aparte', async () => {
    recepcion.hoy.mockResolvedValue({ datos: [ESPERA, DE_OTRO, DE_VENTAS] })
    await montarApp('/recepcion')

    const esperando = await screen.findByRole('region', { name: 'Esperando' })
    expect(within(esperando).getByText('S-004')).toBeDefined()
    // Ventas no es del taller: no aparece.
    expect(screen.queryByText('V-001')).toBeNull()
    const otro = screen.getByRole('region', { name: 'Los está recibiendo otro' })
    expect(within(otro).getByText('Lo tiene Diego Sosa')).toBeDefined()
  })

  it('el que viene a retirar va aparte, y tocarlo lleva a entregarle el auto', async () => {
    const retiro = {
      ...ESPERA,
      id: '66666666-6666-4666-8666-666666666666',
      numero: 'S-007',
      motivo: 'retiro' as const,
      nombre: 'Ana Gómez',
    }
    recepcion.hoy.mockResolvedValue({ datos: [retiro] })
    recepcion.atender.mockResolvedValue({
      ...retiro,
      atendidaEn: new Date().toISOString(),
      atendidaPor: { id: 'u1', nombre: 'Martín Gutiérrez' },
    })
    ordenes.listar.mockResolvedValue({ datos: [], total: 0 })
    const router = await montarApp('/recepcion')

    const retiran = await screen.findByRole('region', { name: 'Vienen a retirar' })
    expect(screen.queryByRole('region', { name: 'Esperando' })).toBeNull()
    await userEvent.click(within(retiran).getByRole('button', { name: /S-007/ }))

    expect(recepcion.atender).toHaveBeenCalledWith({ id: retiro.id })
    await waitFor(() => expect(router.state.location.pathname).toBe('/entregas'))
    expect(router.state.location.search).toEqual({ visita: retiro.id })
  })

  it('tocar uno lo agarra y arranca con quién lo trae ya puesto; la orden cierra la visita', async () => {
    recepcion.hoy.mockResolvedValue({ datos: [ESPERA] })
    recepcion.atender.mockResolvedValue({
      ...ESPERA,
      atendidaEn: new Date().toISOString(),
      atendidaPor: { id: 'u1', nombre: 'Martín Gutiérrez' },
    })
    ordenes.abrir.mockResolvedValue({ ...FICHA, numero: 58, estado: 'recibida' })
    await montarApp('/recepcion')

    await userEvent.click(await screen.findByRole('button', { name: /S-004/ }))
    expect(recepcion.atender).toHaveBeenCalledWith({ id: 'v1' })
    await screen.findByLabelText('Patente o chasis')
    expect(screen.getByText('S-004')).toBeDefined()

    await elegirVehiculo('Patente o chasis')
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByLabelText('Lo trae')).toHaveProperty('value', 'Juan Pérez')

    await userEvent.click(screen.getByRole('button', { name: /Repasar/ }))
    await userEvent.click(screen.getByRole('button', { name: /Qué pide/ }))
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Service de 20.000')
    await userEvent.click(screen.getByRole('button', { name: /Firma/ }))
    // Firma quien lo trae, que ya se sabe desde la puerta.
    expect(screen.getByLabelText('Quién firma')).toHaveProperty('value', 'Juan Pérez')
    await userEvent.click(screen.getByRole('button', { name: 'Firmar de prueba' }))
    await userEvent.click(screen.getByRole('button', { name: /Abrir la orden/ }))

    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({ visitaId: 'v1', traeTelefono: '351 555-1234' }),
      ),
    )
    await waitFor(() =>
      expect(ordenes.firmar).toHaveBeenCalledWith(
        expect.objectContaining({ id: FICHA.id, momento: 'ingreso', aclaracion: 'Juan Pérez' }),
      ),
    )
    expect(await screen.findByText(/El cliente ya firmó/)).toBeDefined()
  })

  it('si vino con turno, arranca con su pedido y con el auto ya elegido', async () => {
    const conTurno = {
      ...ESPERA,
      turno: {
        id: 't1',
        fechaHora: new Date().toISOString(),
        pedido: 'Service de 20.000',
        vehiculoId: VEHICULO_ELEGIBLE.id,
        dominio: 'AB123CD',
      },
    }
    recepcion.hoy.mockResolvedValue({ datos: [conTurno] })
    recepcion.atender.mockResolvedValue({ ...conTurno, atendidaEn: new Date().toISOString() })
    listarVehiculos.mockResolvedValue({ datos: [VEHICULO_ELEGIBLE], total: 1 })
    await montarApp('/recepcion')

    expect(await screen.findByText(/Turno .* · AB123CD/)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /S-004/ }))
    expect(await screen.findByText('Titular: Transportes del Sur SRL')).toBeDefined()
    expect(listarVehiculos).toHaveBeenCalledWith(expect.objectContaining({ buscar: 'AB123CD' }))

    await userEvent.click(screen.getByRole('button', { name: /Qué pide/ }))
    expect(screen.getByLabelText('Qué pide el cliente')).toHaveProperty(
      'value',
      'Service de 20.000',
    )
  })

  it('si el auto del turno no está cargado, se da de alta ahí mismo y queda elegido', async () => {
    const sinAuto = {
      ...ESPERA,
      turno: {
        id: 't2',
        fechaHora: new Date().toISOString(),
        pedido: 'Primer service',
        vehiculoId: null,
        dominio: 'AH555JJ',
      },
    }
    recepcion.hoy.mockResolvedValue({ datos: [sinAuto] })
    recepcion.atender.mockResolvedValue({ ...sinAuto, atendidaEn: new Date().toISOString() })
    listarVehiculos.mockResolvedValue({ datos: [], total: 0 })
    crearVehiculo.mockResolvedValue({ ...VEHICULO_ELEGIBLE, dominio: 'AH555JJ' })
    await montarApp('/recepcion')

    await userEvent.click(await screen.findByRole('button', { name: /S-004/ }))
    // Arranca buscando la patente del turno, y como no está, ofrece darla de alta.
    expect(await screen.findByLabelText('Patente o chasis')).toHaveProperty('value', 'AH555JJ')
    await userEvent.click(await screen.findByRole('button', { name: 'Darlo de alta' }))

    const alta = screen.getByRole('region', { name: 'Nuevo vehículo' })
    expect(within(alta).getByLabelText('Patente')).toHaveProperty('value', 'AH555JJ')
    await userEvent.type(within(alta).getByLabelText('Chasis'), '9BWZZZ377VT009999')
    await userEvent.click(within(alta).getByRole('button', { name: /Guardar/ }))

    await waitFor(() =>
      expect(crearVehiculo).toHaveBeenCalledWith(
        expect.objectContaining({ chasis: '9BWZZZ377VT009999', dominio: 'AH555JJ' }),
      ),
    )
    expect(await screen.findByText('Titular: Transportes del Sur SRL')).toBeDefined()
    expect(screen.queryByRole('region', { name: 'Nuevo vehículo' })).toBeNull()
  })

  it('las órdenes recibidas hoy quedan a mano, para reimprimirlas o corregirlas', async () => {
    recepcion.hoy.mockResolvedValue({ datos: [] })
    ordenes.listar.mockResolvedValue({
      datos: [
        { ...ORDEN, numero: 57, estado: 'recibida', creadoEn: new Date().toISOString() },
        { ...ORDEN, id: 'vieja', numero: 12, creadoEn: '2026-01-02T12:00:00.000Z' },
      ],
      total: 2,
    })
    await montarApp('/recepcion')

    const recibidos = await screen.findByRole('region', { name: 'Recibidos hoy' })
    expect(within(recibidos).getByText('OT 000057')).toBeDefined()
    expect(within(recibidos).queryByText('OT 000012')).toBeNull()
    const ver = within(recibidos).getByRole('link', { name: 'Ver y corregir' })
    expect(ver.getAttribute('href')).toBe(`/ordenes/${ORDEN.id}`)
    expect(within(recibidos).getByRole('button', { name: /Imprimir/ })).toBeDefined()
  })

  it('«Devolver a la cola» la suelta y vuelve a la lista', async () => {
    recepcion.hoy.mockResolvedValue({ datos: [ESPERA] })
    recepcion.atender.mockResolvedValue({ ...ESPERA, atendidaEn: new Date().toISOString() })
    recepcion.soltar.mockResolvedValue(ESPERA)
    await montarApp('/recepcion')

    await userEvent.click(await screen.findByRole('button', { name: /S-004/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver a la cola' }))

    expect(recepcion.soltar).toHaveBeenCalledWith({ id: 'v1' })
    expect(await screen.findByRole('heading', { name: '¿A quién recibís?' })).toBeDefined()
  })
})
