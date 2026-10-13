import 'reflect-metadata'
import { eq } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El código de barras de la caja queda en la orden. El repuestero escanea las cajas al preparar
 * el pedido para la orden; al entregarlo, los códigos pasan a la orden y el cliente los compara
 * con las cajas que se lleva. Ver `docs/tecnicos/egreso.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let repuestero: string
let vehiculoId: string
let pastillas: { id: string }
let filtro: { id: string }
let ordenId: string

const EAN_PASTILLAS = '7790001234567'
const EAN_FILTRO = '7790009876543'

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

function pedir(access: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

async function alta(codigo: string, descripcion: string, precio: string, codigosBarras: string[]) {
  const r = await pedir(gerente, 'POST', '/repuestos', {
    codigo,
    descripcion,
    precioVenta: precio,
    codigosBarras,
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json()
}

async function pedidoParaUnaOrden() {
  const pedido = await pedir(repuestero, 'POST', '/repuestos/pedidos', {
    ordenId,
    items: [
      {
        repuestoId: pastillas.id,
        codigo: 'PAST001',
        descripcion: 'Pastillas de freno delanteras',
        cantidad: '1',
        precioUnitario: '45000',
      },
    ],
  })
  expect(pedido.statusCode, pedido.body).toBe(201)
  return { ordenId, pedidoId: pedido.json().id as string }
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'barras',
    email: 'gerente@barras.test',
    otros: [{ email: 'repuestero@barras.test', rol: 'Repuestero' }],
    vehiculos: [{ chasis: '8AJFB8CD5N1112223', dominio: 'AE999ZZ' }],
  })
  const [auto] = await api.pg.dbDuenio
    .select()
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  vehiculoId = auto?.id as string
  gerente = await entrar('gerente@barras.test')
  repuestero = await entrar('repuestero@barras.test')

  // Con espacios, como se tipea mirando la caja: se guarda sin ellos.
  pastillas = await alta('PAST001', 'Pastillas de freno delanteras', '45000', ['779 0001 234567'])
  filtro = await alta('FIL001', 'Filtro de aceite', '18500', [EAN_FILTRO])

  const orden = await pedir(gerente, 'POST', '/ordenes', { vehiculoId, pedido: 'Frenos' })
  expect(orden.statusCode, orden.body).toBe(201)
  ordenId = orden.json().id
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('el catálogo', () => {
  it('guarda el código normalizado, y se busca por él', async () => {
    const ficha = (await pedir(gerente, 'GET', `/repuestos/${pastillas.id}`)).json()
    expect(ficha.codigosBarras).toEqual([EAN_PASTILLAS])

    const buscado = (await pedir(gerente, 'GET', `/repuestos?buscar=${EAN_FILTRO}`)).json()
    expect(buscado.datos.map((r: { id: string }) => r.id)).toEqual([filtro.id])
  })

  it('un código no puede ser de dos piezas', async () => {
    const r = await pedir(gerente, 'POST', '/repuestos', {
      codigo: 'PAST002',
      descripcion: 'Pastillas de otra marca',
      precioVenta: '40000',
      codigosBarras: [EAN_PASTILLAS],
    })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({
      code: 'CODIGO_BARRAS_DUPLICADO',
      data: { codigo: EAN_PASTILLAS, id: pastillas.id },
    })
  })
})

describe('el pedido para una orden', () => {
  it('la caja de una pieza del pedido queda en su renglón; la de otra, la agrega', async () => {
    const { pedidoId } = await pedidoParaUnaOrden()

    const primera = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/escanear`, {
      codigo: EAN_PASTILLAS,
    })
    expect(primera.statusCode, primera.body).toBe(200)
    expect(primera.json()).toMatchObject({
      agregado: false,
      repuesto: 'Pastillas de freno delanteras',
    })
    expect(primera.json().pedido.items[0].codigosBarras).toEqual([EAN_PASTILLAS])

    const otra = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/escanear`, {
      codigo: EAN_FILTRO,
    })
    expect(otra.json().agregado).toBe(true)
    expect(otra.json().pedido.items[1]).toMatchObject({
      repuestoId: filtro.id,
      cantidad: '1',
      precioUnitario: '18500.00',
      codigosBarras: [EAN_FILTRO],
    })
  })

  it('un código desconocido se asocia a la pieza de un renglón, y queda en el catálogo', async () => {
    const { pedidoId } = await pedidoParaUnaOrden()
    const nuevo = '4001234567890'

    const desconocido = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/escanear`, {
      codigo: nuevo,
    })
    expect(desconocido.statusCode).toBe(404)
    expect(desconocido.json()).toMatchObject({
      code: 'CODIGO_DESCONOCIDO',
      data: { codigo: nuevo },
    })

    const pedido = (await pedir(repuestero, 'GET', `/repuestos/pedidos/${pedidoId}`)).json()
    const asociado = await pedir(
      repuestero,
      'POST',
      `/repuestos/pedidos/${pedidoId}/items/${pedido.items[0].id}/codigo`,
      { codigo: nuevo },
    )
    expect(asociado.statusCode, asociado.body).toBe(200)
    expect(asociado.json().items[0].codigosBarras).toEqual([nuevo])

    const ficha = (await pedir(gerente, 'GET', `/repuestos/${pastillas.id}`)).json()
    expect(ficha.codigosBarras).toContain(nuevo)
  })

  it('al entregarlo, los códigos pasan a la orden, y editarla no los pierde', async () => {
    const { pedidoId } = await pedidoParaUnaOrden()
    await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/escanear`, {
      codigo: EAN_PASTILLAS,
    })
    const entregado = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/entregar`)
    expect(entregado.statusCode, entregado.body).toBe(200)

    const orden = (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json()
    expect(orden.items.at(-1)).toMatchObject({
      repuestoId: pastillas.id,
      codigosBarras: [EAN_PASTILLAS],
    })

    // Se le suma un trabajo a la orden: los renglones se guardan enteros, y el código queda.
    const items = [
      ...orden.items.map((i: Record<string, unknown>) => ({
        id: i.id,
        tipo: i.tipo,
        repuestoId: i.repuestoId,
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        codigoAlicuota: i.codigoAlicuota,
      })),
      {
        tipo: 'trabajo',
        descripcion: 'Cambio de pastillas',
        cantidad: '1',
        precioUnitario: '20000',
      },
    ]
    const editada = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, { items })
    expect(editada.statusCode, editada.body).toBe(200)
    const despues = (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json()
    expect(
      despues.items.find((i: { tipo: string }) => i.tipo === 'repuesto').codigosBarras,
    ).toEqual([EAN_PASTILLAS])

    // Entregado, ya no se escanea.
    const tarde = await pedir(repuestero, 'POST', `/repuestos/pedidos/${pedidoId}/escanear`, {
      codigo: EAN_FILTRO,
    })
    expect(tarde.json().code).toBe('ESTADO_INVALIDO')
  })
})
