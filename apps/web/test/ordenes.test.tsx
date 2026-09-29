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
}
const listarVehiculos = vi.fn()
const listarRepuestos = vi.fn()
const listarPedidos = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: (x: unknown) => listarVehiculos(x) },
    repuestos: { listar: (x: unknown) => listarRepuestos(x) },
    pedidosRepuestos: { listar: (x: unknown) => listarPedidos(x) },
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
  silueta: 'auto',
  danios: [],
  inventario: {},
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
  // La hoja de papel trae las siluetas todas juntas porque no sabe qué auto va a entrar.
  it('con el modelo cargado se dibuja lo que es, y no se pregunta nada', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo', { ...VEHICULO_ELEGIBLE, carroceria: 'pickup' })

    // Ya se sabe qué es: no se pregunta.
    expect(screen.queryByRole('radio', { name: 'Pickup' })).toBeNull()

    const auto = screen.getByRole('application')
    auto.focus()
    // Bajando desde el capot: parabrisas, techo, ventanilla y la caja, que un auto no tiene.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}g')
    const marcas = screen.getByRole('list', { name: 'Marcas' })
    expect(within(marcas).getByText('Golpe · Caja de carga')).toBeDefined()
  })

  it('si el modelo no dice qué es, se pregunta una vez, y cambiarlo borra las marcas', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    const auto = screen.getByRole('application')
    auto.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}r')
    expect(
      within(screen.getByRole('list', { name: 'Marcas' })).getByText('Rayón · Techo'),
    ).toBeDefined()

    // Era una pickup: el techo marcado es de otro dibujo, así que la marca no puede quedar.
    await userEvent.click(screen.getByRole('radio', { name: 'Pickup' }))
    expect(screen.queryByRole('list', { name: 'Marcas' })).toBeNull()

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({ carroceria: 'pickup', danios: [] }),
      ),
    )
  })

  it('con teclado: las flechas recorren las piezas por dónde están y la letra marca', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, estado: 'recibida' })
    await montarApp('/ordenes/nueva')
    await elegirVehiculo('Vehículo')
    await userEvent.type(screen.getByLabelText('Qué pide el cliente'), 'Ruido al frenar')

    const auto = screen.getByRole('application')
    auto.focus()
    // Arranca en el capot; a la izquierda del capot está el guardabarros, no la óptica.
    await userEvent.keyboard('r')
    await userEvent.keyboard('{ArrowLeft}')
    await userEvent.keyboard('g')

    const marcas = screen.getByRole('list', { name: 'Marcas' })
    expect(within(marcas).getByText('Rayón · Capot')).toBeDefined()
    expect(within(marcas).getByText('Golpe · Guardabarros delantero izquierdo')).toBeDefined()

    await userEvent.type(
      screen.getByLabelText('Detalle de golpe · guardabarros delantero izquierdo'),
      'Chico',
    )
    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          danios: [
            { tipo: 'rayon', x: 120, y: 75, nota: null },
            { tipo: 'golpe', x: 54, y: 75, nota: 'Chico' },
          ],
        }),
      ),
    )
  })

  it('Supr quita la última marca de la pieza, después de confirmar', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    const auto = screen.getByRole('application')
    auto.focus()
    await userEvent.keyboard('x')
    expect(screen.getByText('Roto o rajado · Capot')).toBeDefined()

    await userEvent.keyboard('{Delete}')
    await confirmarDialogo('Quitar la marca')
    await waitFor(() => expect(screen.queryByText('Roto o rajado · Capot')).toBeNull())
  })

  it('tocar una pieza la marca con lo elegido', async () => {
    await montarApp('/ordenes/nueva')
    await screen.findByLabelText('Vehículo')
    const queMarcar = screen.getByRole('group', { name: 'Qué marcar' })
    await userEvent.click(within(queMarcar).getByRole('radio', { name: /Falta/ }))
    const espejo = document.querySelector('[data-zona="espejo_derecho"]')
    if (!espejo) throw new Error('falta el espejo en el dibujo')
    await userEvent.click(espejo)
    expect(screen.getByText('Falta · Espejo derecho')).toBeDefined()
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

  it('la ficha muestra las marcas con la pieza donde cayeron', async () => {
    ordenes.ficha.mockResolvedValue({
      ...FICHA,
      danios: [{ zona: 'puerta_delantera_derecha', tipo: 'golpe', x: 186, y: 153, nota: 'Hondo' }],
    })
    await montarApp(`/ordenes/${ORDEN.id}`)
    expect(await screen.findByText('Golpe · Puerta delantera derecha')).toBeDefined()
    expect(screen.getByText('— Hondo')).toBeDefined()
    // De sólo lectura: el dibujo de la ficha no se marca.
    expect(screen.queryByRole('application')).toBeNull()
  })
})

describe('la recepción en tablet', () => {
  it('es táctil, va paso por paso, no deja seguir sin lo que falta, y abre la orden', async () => {
    ordenes.abrir.mockResolvedValue({ ...FICHA, numero: 57, estado: 'recibida' })
    await montarApp('/recepcion')
    await screen.findByLabelText('Patente o chasis')
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
    const techo = document.querySelector('[data-zona="techo"]')
    if (!techo) throw new Error('falta el techo en el dibujo')
    await userEvent.click(techo)
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('¿Qué vino con el auto?')
    await userEvent.click(screen.getByRole('button', { name: 'Está todo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('Revisalo con el cliente')
    expect(screen.getByText('R Rayón · Techo')).toBeDefined()
    expect(screen.getByText('Todo lo revisado está')).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /Abrir la orden/ }))

    await waitFor(() =>
      expect(ordenes.abrir).toHaveBeenCalledWith(
        expect.objectContaining({
          vehiculoId: ORDEN.vehiculo.id,
          pedido: 'Cambio de aceite',
          danios: [{ tipo: 'rayon', x: 120, y: 192, nota: null }],
        }),
      ),
    )
    expect(await screen.findByText('OT 000057')).toBeDefined()

    // Y se sigue con el próximo, sin volver a entrar.
    await userEvent.click(screen.getByRole('button', { name: 'Recibir otro vehículo' }))
    expect(await screen.findByLabelText('Patente o chasis')).toHaveProperty('value', '')
  })

  it('«Cambiar» en el repaso lleva al paso donde se carga ese dato', async () => {
    await montarApp('/recepcion')
    await screen.findByLabelText('Patente o chasis')
    await userEvent.click(screen.getByRole('button', { name: /Revisar/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar qué pide' }))
    expect(await screen.findByText('¿Qué pide el cliente?')).toBeDefined()
  })

  it('al salir de la tablet vuelve la densidad de cada uno', async () => {
    const router = await montarApp('/recepcion')
    await screen.findByLabelText('Patente o chasis')
    await router.navigate({ to: '/ordenes' })
    await waitFor(() => expect(document.documentElement.dataset.densidad).toBeUndefined())
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
