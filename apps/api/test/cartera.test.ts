import 'reflect-metadata'
import { eq } from '@gpb/db'
import { cliente, entidadComercial, sucursal, unidadReserva } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El stock de unidades: lo que varía entre concesionarias es configuración, y acá se prueban las
 * dos puntas de cada opción. Ver `docs/tecnicos/ventas-de-unidades.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let asesor: string
let tenantId: string
let otraEmpresaSucursal: string
let misma: string
let central: string
const autos: string[] = []
let clienteA: string
let clienteB: string

const POR_OMISION = {
  trasladoEntreEmpresas: 'solo_ubicacion',
  reservaModo: 'bloquea',
  reservaDias: 7,
  reservaExigeSena: false,
  tenenciaUsado: 'propia',
  moneda: 'ARS',
}

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
async function ingresar(parcial: object = {}) {
  const r = await pedir('POST', '/stock', {
    vehiculoId: autos[siguiente++],
    condicion: 'usado',
    tenencia: 'propia',
    origen: 'compra',
    ...parcial,
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json()
}

const configurar = (parcial: object) =>
  pedir('PUT', '/stock/configuracion', { ...POR_OMISION, ...parcial })

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const vehiculos = Array.from({ length: 14 }, (_, i) => ({
    chasis: `8AJFB8CD5N12345${String(i).padStart(2, '0')}`,
    dominio: `AE${String(100 + i)}BC`,
  }))
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'cartera',
    email: 'gerente@cartera.test',
    sucursales: ['Central', 'Norte'],
    otros: [{ email: 'asesor@cartera.test', rol: 'Asesor de servicios' }],
    vehiculos,
  })
  tenantId = semilla.tenant.id
  central = semilla.sucursales.find((s) => s.nombre === 'Central')?.id as string
  misma = semilla.sucursales.find((s) => s.nombre === 'Norte')?.id as string
  const [otra] = await api.pg.dbDuenio
    .insert(sucursal)
    .values({ tenantId, empresaId: await segundaEmpresa(semilla.empresa), nombre: 'Sur' })
    .returning()
  otraEmpresaSucursal = otra?.id as string
  gerente = await entrar('gerente@cartera.test')
  asesor = await entrar('asesor@cartera.test')
  const lista = (await pedir('GET', '/vehiculos?porPagina=50')).json()
  autos.push(...lista.datos.map((v: { id: string }) => v.id))
  clienteA = await nuevoCliente('20123456', 'Gómez, Ana')
  clienteB = await nuevoCliente('20123457', 'Paz, Luis')
}, 180_000)

async function segundaEmpresa(primera: Record<string, unknown>) {
  const { empresa } = await import('@gpb/db/schema')
  const {
    id: _id,
    creadoEn: _c,
    actualizadoEn: _a,
    ...resto
  } = primera as {
    id: string
    creadoEn: Date
    actualizadoEn: Date
  } & Record<string, unknown>
  const [e] = await api.pg.dbDuenio
    .insert(empresa)
    .values({ ...resto, razonSocial: 'Otra SAS', cuit: '30712345671' } as never)
    .returning()
  return e?.id as string
}

afterAll(async () => {
  await api?.cerrar()
})

beforeEach(async () => {
  await configurar({})
})

describe('el ingreso', () => {
  it('una propia queda a nombre de la razón social de la sucursal', async () => {
    const u = await ingresar({ precio: '15000000', moneda: 'USD', sucursalId: central })
    expect(u).toMatchObject({
      estado: 'disponible',
      tenencia: 'propia',
      moneda: 'USD',
      sucursal: { id: central },
      consignante: null,
      movimientos: [{ tipo: 'ingreso' }],
    })
    expect(u.empresa).not.toBeNull()
  })

  it('una en consignación lleva su consignante, y no es de la concesionaria', async () => {
    const u = await ingresar({
      tenencia: 'consignacion',
      origen: 'consignacion',
      consignanteId: clienteA,
    })
    expect(u.empresa).toBeNull()
    expect(u.consignante).toMatchObject({ nombre: 'Gómez, Ana' })

    const sin = await pedir('POST', '/stock', {
      vehiculoId: autos[siguiente],
      condicion: 'usado',
      tenencia: 'consignacion',
      origen: 'consignacion',
    })
    expect(sin.statusCode).toBe(400)
  })

  it('el mismo vehículo no entra dos veces', async () => {
    const u = await ingresar()
    const r = await pedir('POST', '/stock', {
      vehiculoId: u.vehiculo.id,
      condicion: 'usado',
      tenencia: 'propia',
      origen: 'compra',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('YA_EN_STOCK')
  })

  it('el asesor no tiene la cartera', async () => {
    expect((await pedir('GET', '/stock', undefined, asesor)).statusCode).toBe(403)
  })
})

describe('el traslado entre razones sociales', () => {
  it('por omisión cambia dónde está y no de quién es', async () => {
    const u = await ingresar({ sucursalId: central })
    const r = await pedir('POST', `/stock/${u.id}/traslado`, { sucursalId: otraEmpresaSucursal })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().sucursal.id).toBe(otraEmpresaSucursal)
    expect(r.json().empresa.id).toBe(u.empresa.id)
  })

  it('con comprobante: lo pide, y cambia la dueña', async () => {
    await configurar({ trasladoEntreEmpresas: 'con_comprobante' })
    const u = await ingresar({ sucursalId: central })

    const sin = await pedir('POST', `/stock/${u.id}/traslado`, { sucursalId: otraEmpresaSucursal })
    expect(sin.statusCode).toBe(422)
    expect(sin.json().code).toBe('FALTA_COMPROBANTE')

    const con = await pedir('POST', `/stock/${u.id}/traslado`, {
      sucursalId: otraEmpresaSucursal,
      comprobante: 'R-0001-123',
    })
    expect(con.json().empresa.nombre).toBe('Otra SAS')
    expect(con.json().movimientos[0]).toMatchObject({ tipo: 'traslado', comprobante: 'R-0001-123' })
  })

  it('dentro de la misma razón social no pide nada', async () => {
    await configurar({ trasladoEntreEmpresas: 'con_comprobante' })
    const u = await ingresar({ sucursalId: central })
    const r = await pedir('POST', `/stock/${u.id}/traslado`, { sucursalId: misma })
    expect(r.statusCode, r.body).toBe(200)
  })
})

describe('las reservas', () => {
  const reservar = (id: string, parcial: object = {}) =>
    pedir('POST', `/stock/${id}/reservas`, { clienteId: clienteA, ...parcial })

  it('reserva con los días configurados, y liberar la devuelve', async () => {
    const u = await ingresar()
    const r = await reservar(u.id)
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().estado).toBe('reservada')
    const reserva = r.json().reservas[0]
    expect(reserva.vence).not.toBeNull()

    const libre = await pedir('POST', `/stock/${u.id}/reservas/${reserva.id}/liberar`, {
      motivo: 'Se arrepintió',
    })
    expect(libre.json()).toMatchObject({ estado: 'disponible', reservas: [] })
    expect(libre.json().historialReservas[0]).toMatchObject({ estado: 'liberada' })
  })

  it('si traba, la segunda se rechaza diciendo de quién es', async () => {
    const u = await ingresar()
    await reservar(u.id)
    const r = await reservar(u.id, { clienteId: clienteB })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ code: 'YA_RESERVADA', data: { cliente: 'Gómez, Ana' } })
  })

  it('el gerente la pasa por encima con motivo, y la anterior queda a la vista', async () => {
    const u = await ingresar()
    await reservar(u.id)
    const r = await reservar(u.id, { clienteId: clienteB, pasarPorEncima: 'Pagó el total' })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().reservas).toHaveLength(1)
    expect(r.json().reservas[0].cliente.nombre).toBe('Paz, Luis')
    expect(
      r
        .json()
        .historialReservas.map((h: { estado: string }) => h.estado)
        .sort(),
    ).toEqual(['activa', 'desplazada'])
  })

  it('si sólo avisa, puede haber más de una', async () => {
    await configurar({ reservaModo: 'avisa' })
    const u = await ingresar()
    await reservar(u.id)
    const r = await reservar(u.id, { clienteId: clienteB })
    expect(r.statusCode).toBe(201)
    expect(r.json().reservas).toHaveLength(2)
  })

  it('la seña es obligatoria sólo si la concesionaria la pide', async () => {
    await configurar({ reservaExigeSena: true })
    const u = await ingresar()
    const sin = await reservar(u.id)
    expect(sin.json().code).toBe('FALTA_SENA')
    expect((await reservar(u.id, { sena: '500000' })).statusCode).toBe(201)
  })

  it('sin días configurados no vence', async () => {
    await configurar({ reservaDias: null })
    const u = await ingresar()
    expect((await reservar(u.id)).json().reservas[0].vence).toBeNull()
  })

  it('la vencida se cae sola al consultar, y la unidad vuelve a estar disponible', async () => {
    const u = await ingresar()
    const r = (await reservar(u.id)).json().reservas[0]
    await api.pg.dbDuenio
      .update(unidadReserva)
      .set({ vence: '2020-01-01' })
      .where(eq(unidadReserva.id, r.id))

    const ficha = (await pedir('GET', `/stock/${u.id}`)).json()
    expect(ficha).toMatchObject({ estado: 'disponible', reservas: [] })
    expect(ficha.historialReservas[0].estado).toBe('vencida')
  })

  it('con reserva no se saca del stock; sin ella, sí, y deja de listarse', async () => {
    const u = await ingresar()
    const reservada = (await reservar(u.id)).json()
    const r = await pedir('POST', `/stock/${u.id}/retiro`, { motivo: 'Se devolvió al dueño' })
    expect(r.json().code).toBe('TIENE_RESERVA')

    await pedir('POST', `/stock/${u.id}/reservas/${reservada.reservas[0].id}/liberar`, {
      motivo: 'Se arrepintió',
    })
    const retirada = await pedir('POST', `/stock/${u.id}/retiro`, {
      motivo: 'Se devolvió al dueño',
    })
    expect(retirada.json().estado).toBe('retirada')
    const lista = (await pedir('GET', '/stock?porPagina=200')).json()
    expect(lista.datos.map((x: { id: string }) => x.id)).not.toContain(u.id)
  })
})
