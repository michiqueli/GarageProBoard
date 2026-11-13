import 'reflect-metadata'
import { cliente, entidadComercial } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La operación de venta: el borrador, la confirmación y la anulación, con las dos puntas de cada
 * opción de configuración. Ver `docs/tecnicos/ventas-de-unidades.md`, paso 3.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let vendedor: string
let tenantId: string
const autos: string[] = []
let comprador: string
let otro: string

function pedir(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
  token: string = gerente,
) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  })
}

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

async function nuevoCliente(documento: string, nombre: string) {
  const db = api.pg.dbDuenio
  const [e] = await db
    .insert(entidadComercial)
    .values({
      tenantId,
      tipoDocumento: 96,
      numeroDocumento: documento,
      tipoPersona: 'fisica',
      razonSocial: nombre,
      condicionIva: 5,
    })
    .returning()
  await db.insert(cliente).values({ id: e?.id as string, tenantId })
  return e?.id as string
}

let siguiente = 0
async function unidadEnStock(parcial: object = {}) {
  const r = await pedir('POST', '/stock', {
    vehiculoId: autos[siguiente++],
    condicion: '0km',
    tenencia: 'propia',
    origen: 'fabrica',
    precio: '1000000',
    moneda: 'ARS',
    ...parcial,
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as { id: string }
}

async function ventaEnBorrador(parcial: object = {}) {
  const u = await unidadEnStock(parcial)
  const r = await pedir('POST', '/ventas', { unidadId: u.id, clienteId: comprador })
  expect(r.statusCode, r.body).toBe(201)
  return { unidad: u, venta: r.json() }
}

const BORRADOR = {
  precio: '1000000',
  moneda: 'ARS',
  conceptos: [] as object[],
  pagos: [] as object[],
}
const configurar = (parcial: object) =>
  pedir('PUT', '/ventas/configuracion', {
    descuentoMaximo: null,
    exigeSaldoCero: false,
    ...parcial,
  })

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'ventas',
    email: 'gerente@ventas.test',
    otros: [{ email: 'vendedor@ventas.test', rol: 'Vendedor' }],
    vehiculos: Array.from({ length: 20 }, (_, i) => ({
      chasis: `9BWZZZ377VT0042${String(i).padStart(2, '0')}`,
      dominio: `AF${String(100 + i)}GH`,
    })),
  })
  tenantId = semilla.tenant.id
  gerente = await entrar('gerente@ventas.test')
  vendedor = await entrar('vendedor@ventas.test')
  const lista = (await pedir('GET', '/vehiculos?porPagina=50')).json()
  autos.push(...lista.datos.map((v: { id: string }) => v.id))
  comprador = await nuevoCliente('30111222', 'Gómez, Ana')
  otro = await nuevoCliente('30111223', 'Paz, Luis')
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

beforeEach(async () => {
  await configurar({})
})

describe('el borrador', () => {
  it('arranca con el precio de la unidad, y la seña de su reserva como primer pago', async () => {
    const u = await unidadEnStock()
    await pedir('POST', `/stock/${u.id}/reservas`, { clienteId: comprador, sena: '100000' })

    const r = await pedir('POST', '/ventas', { unidadId: u.id, clienteId: comprador })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json()).toMatchObject({
      estado: 'borrador',
      precio: '1000000.00',
      pagos: [{ medio: 'sena', importe: '100000.00' }],
      totales: { total: '1000000.00', pagado: '100000.00', saldo: '900000.00' },
    })
  })

  it('una unidad no se vende dos veces a la vez', async () => {
    const { unidad } = await ventaEnBorrador()
    const r = await pedir('POST', '/ventas', { unidadId: unidad.id, clienteId: otro })
    expect(r.json().code).toBe('UNIDAD_NO_DISPONIBLE')
  })

  it('guarda gastos, descuentos y pagos; el usado en parte de pago tiene que estar en stock', async () => {
    const { venta } = await ventaEnBorrador()
    const usado = await unidadEnStock({ condicion: 'usado', origen: 'parte_de_pago' })
    const r = await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      clienteId: comprador,
      conceptos: [
        { tipo: 'gasto_cliente', descripcion: 'Patentamiento', importe: '80000', moneda: 'ARS' },
        { tipo: 'descuento', descripcion: 'Descuento', importe: '50000', moneda: 'ARS' },
      ],
      pagos: [
        { medio: 'usado', importe: '400000', moneda: 'ARS', unidadUsadaId: usado.id },
        {
          medio: 'financiacion',
          importe: '300',
          moneda: 'USD',
          cotizacion: '1000',
          entidad: 'Banco',
          cuotas: 12,
        },
      ],
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().totales).toMatchObject({
      total: '1030000.00',
      pagado: '700000.00',
      saldo: '330000.00',
      descuentoPorcentaje: '5.0',
    })
    expect(r.json().pagos[0].unidadUsada.id).toBe(usado.id)

    const malo = await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      clienteId: comprador,
      pagos: [{ medio: 'usado', importe: '1', moneda: 'ARS', unidadUsadaId: venta.unidad.id }],
    })
    expect(malo.json().code).toBe('DATO_INVALIDO')
  })
})

describe('los gastos en porcentaje', () => {
  it('se calculan sobre el precio, y se recalculan si el precio cambia', async () => {
    const { venta } = await ventaEnBorrador()
    const gasto = {
      tipo: 'gasto_cliente',
      descripcion: 'Patentamiento',
      porcentaje: '3',
      moneda: 'ARS',
    }
    const r = await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      clienteId: comprador,
      conceptos: [gasto],
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().conceptos[0]).toMatchObject({ importe: '30000.00', porcentaje: '3.0000' })

    const caro = await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      precio: '2000000',
      clienteId: comprador,
      conceptos: [gasto],
    })
    expect(caro.json().conceptos[0].importe).toBe('60000.00')
    expect(caro.json().totales.total).toBe('2060000.00')
  })

  it('va el importe o el porcentaje, no los dos', async () => {
    const { venta } = await ventaEnBorrador()
    const r = await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      clienteId: comprador,
      conceptos: [
        {
          tipo: 'gasto_cliente',
          descripcion: 'Sellos',
          importe: '1',
          porcentaje: '1',
          moneda: 'ARS',
        },
      ],
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('confirmar', () => {
  it('deja la unidad vendida, cumple la reserva del comprador y libera las otras', async () => {
    await configurar({})
    const u = await unidadEnStock()
    await pedir('PUT', '/stock/configuracion', {
      trasladoEntreEmpresas: 'solo_ubicacion',
      reservaModo: 'avisa',
      reservaDias: 7,
      reservaExigeSena: false,
      tenenciaUsado: 'propia',
      moneda: 'ARS',
    })
    await pedir('POST', `/stock/${u.id}/reservas`, { clienteId: comprador })
    await pedir('POST', `/stock/${u.id}/reservas`, { clienteId: otro })
    const venta = (await pedir('POST', '/ventas', { unidadId: u.id, clienteId: comprador })).json()

    const r = await pedir('POST', `/ventas/${venta.id}/confirmar`, {
      autorizacion: 'Paz no volvió a llamar',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().estado).toBe('confirmada')
    const unidad = (await pedir('GET', `/stock/${u.id}`)).json()
    expect(unidad.estado).toBe('vendida')
    const estados = unidad.historialReservas.map(
      (h: { cliente: { nombre: string }; estado: string }) => [h.cliente.nombre, h.estado],
    )
    expect(estados).toEqual(
      expect.arrayContaining([
        ['Gómez, Ana', 'convertida'],
        ['Paz, Luis', 'liberada'],
      ]),
    )
    await pedir('PUT', '/stock/configuracion', {
      trasladoEntreEmpresas: 'solo_ubicacion',
      reservaModo: 'bloquea',
      reservaDias: 7,
      reservaExigeSena: false,
      tenenciaUsado: 'propia',
      moneda: 'ARS',
    })
  })

  it('reservada para otro, sin autorización no se confirma', async () => {
    const u = await unidadEnStock()
    await pedir('POST', `/stock/${u.id}/reservas`, { clienteId: otro })
    const venta = (await pedir('POST', '/ventas', { unidadId: u.id, clienteId: comprador })).json()
    const r = await pedir('POST', `/ventas/${venta.id}/confirmar`, {})
    expect(r.json()).toMatchObject({ code: 'RESERVADA_PARA_OTRO', data: { cliente: 'Paz, Luis' } })
  })

  it('con saldo cero exigido, no se confirma con saldo', async () => {
    await configurar({ exigeSaldoCero: true })
    const { venta } = await ventaEnBorrador()
    const r = await pedir('POST', `/ventas/${venta.id}/confirmar`, {})
    expect(r.json()).toMatchObject({ code: 'SALDO_PENDIENTE', data: { saldo: '1000000.00' } })
  })

  it('un descuento mayor al máximo pide autorización, y el vendedor no la puede dar', async () => {
    await configurar({ descuentoMaximo: 3 })
    const { venta } = await ventaEnBorrador()
    await pedir('PUT', `/ventas/${venta.id}`, {
      ...BORRADOR,
      clienteId: comprador,
      conceptos: [{ tipo: 'descuento', descripcion: 'Descuento', importe: '50000', moneda: 'ARS' }],
    })

    const sin = await pedir('POST', `/ventas/${venta.id}/confirmar`, {})
    expect(sin.json()).toMatchObject({ code: 'REQUIERE_AUTORIZACION', data: { maximo: 3 } })
    const delVendedor = await pedir(
      'POST',
      `/ventas/${venta.id}/confirmar`,
      { autorizacion: 'Cliente de muchos años' },
      vendedor,
    )
    expect(delVendedor.statusCode).toBe(403)
    const conAutorizacion = await pedir('POST', `/ventas/${venta.id}/confirmar`, {
      autorizacion: 'Cliente de muchos años',
    })
    expect(conAutorizacion.json()).toMatchObject({
      estado: 'confirmada',
      autorizacionMotivo: 'Cliente de muchos años',
    })
  })

  it('confirmada no se modifica; anularla devuelve la unidad al stock', async () => {
    const { venta, unidad } = await ventaEnBorrador()
    await pedir('POST', `/ventas/${venta.id}/confirmar`, {})
    const cambio = await pedir('PUT', `/ventas/${venta.id}`, { ...BORRADOR, clienteId: comprador })
    expect(cambio.json().code).toBe('ESTADO_INVALIDO')

    const anulada = await pedir('POST', `/ventas/${venta.id}/anular`, {
      motivo: 'Se cayó el crédito',
    })
    expect(anulada.json()).toMatchObject({
      estado: 'anulada',
      anulacionMotivo: 'Se cayó el crédito',
    })
    expect((await pedir('GET', `/stock/${unidad.id}`)).json().estado).toBe('disponible')
  })
})

describe('la rentabilidad', () => {
  it('la ve quien ve los costos, descontando lo que costó la unidad', async () => {
    const { venta, unidad } = await ventaEnBorrador()
    await pedir('POST', `/stock/${unidad.id}/costos`, {
      tipo: 'compra',
      descripcion: 'Compra a fábrica',
      importe: '800000',
      moneda: 'ARS',
    })
    const r = await pedir('GET', `/ventas/${venta.id}`)
    expect(r.json().totales.rentabilidad).toMatchObject({
      costoUnidad: '800000.00',
      margen: '200000.00',
    })
    const delVendedor = await pedir('GET', `/ventas/${venta.id}`, undefined, vendedor)
    expect(delVendedor.statusCode).toBe(200)
    expect(delVendedor.json().totales.rentabilidad).toBeNull()
  })

  it('el vendedor vende pero no anula', async () => {
    const u = await unidadEnStock()
    const r = await pedir('POST', '/ventas', { unidadId: u.id, clienteId: otro }, vendedor)
    expect(r.statusCode, r.body).toBe(201)
    const anular = await pedir(
      'POST',
      `/ventas/${r.json().id}/anular`,
      { motivo: 'Me equivoqué' },
      vendedor,
    )
    expect(anular.statusCode).toBe(403)
  })
})
