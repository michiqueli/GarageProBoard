import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hoyEnArgentina } from '../src/vehiculos/vehiculos.service.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Vehículos: la ficha completa, la marca y el modelo que se crean al escribirlos, y el
 * titular como relación con vigencia. Lo que importa: transferir no borra al anterior, y
 * la historia cuenta quién lo tuvo y desde cuándo.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let transportes: string
let ana: string

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'vehiculos',
    email: 'gerente@vehiculos.test',
    otros: [{ email: 'mecanico@vehiculos.test', rol: 'Mecánico' }],
  })
  await sembrarConcesionaria(api.pg.dbDuenio, { slug: 'ajena', email: 'gerente@ajena.test' })

  gerente = await entrar('gerente@vehiculos.test')
  transportes = await altaCliente('30711111111', 'Transportes del Sur SRL', 80)
  ana = await altaCliente('20123456', 'Gómez, Ana', 96)
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

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

async function altaCliente(numeroDocumento: string, razonSocial: string, tipoDocumento: number) {
  const r = await pedir(gerente, 'POST', '/clientes', {
    tipoDocumento,
    numeroDocumento,
    razonSocial,
    condicionIva: 5,
    domicilio: null,
    provinciaCodigo: null,
    localidad: null,
    codigoPostal: null,
    email: null,
    telefono: null,
    numeroIibb: null,
    condicionIibb: 'no_inscripto',
    observaciones: null,
  })
  expect(r.statusCode).toBe(201)
  return r.json().id as string
}

const HILUX = {
  chasis: '8AJFB8CD5N1234567',
  dominio: 'AE123BC',
  marca: 'Toyota',
  modelo: 'Hilux',
  anio: 2022,
  color: 'Blanco',
  combustible: 'diesel',
  kilometraje: 48000,
}

async function ficha(id: string) {
  const r = await pedir(gerente, 'GET', `/vehiculos/${id}`)
  expect(r.statusCode).toBe(200)
  return r.json()
}

async function porChasis(chasis: string) {
  const { datos } = (await pedir(gerente, 'GET', `/vehiculos?buscar=${chasis}`)).json()
  return datos[0].id as string
}

describe('el alta', () => {
  it('con marca, modelo y titular: se crean la marca y el modelo, y queda el titular', async () => {
    const r = await pedir(gerente, 'POST', '/vehiculos', {
      ...HILUX,
      titular: { clienteId: transportes, desde: '2024-03-01' },
    })

    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      marca: 'Toyota',
      modelo: 'Hilux',
      titular: { id: transportes, razonSocial: 'Transportes del Sur SRL' },
    })
  })

  it('la marca se reconoce aunque se escriba distinto, y no se duplica', async () => {
    const r = await pedir(gerente, 'POST', '/vehiculos', {
      chasis: '8AJFB8CD5N7654321',
      marca: 'TOYOTA',
      modelo: 'hilux',
    })
    expect(r.statusCode).toBe(201)

    const { datos } = (await pedir(gerente, 'GET', '/vehiculos/marcas')).json()
    expect(datos).toEqual([{ marca: 'Toyota', modelos: ['Hilux'] }])
  })

  it('una marca sin modelo no pasa: se perdería', async () => {
    const r = await pedir(gerente, 'POST', '/vehiculos', {
      chasis: '8AJFB8CD5N0000001',
      marca: 'Ford',
    })
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatch(/Marca y modelo van juntos/)
  })

  it('la patente repetida dice de qué vehículo es', async () => {
    const r = await pedir(gerente, 'POST', '/vehiculos', {
      chasis: '8AJFB8CD5N0000002',
      dominio: 'AE123BC',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({
      code: 'DOMINIO_DUPLICADO',
      data: { chasis: HILUX.chasis },
    })
  })

  it('un titular con fecha futura no', async () => {
    const r = await pedir(gerente, 'POST', '/vehiculos', {
      chasis: '8AJFB8CD5N0000003',
      titular: { clienteId: ana, desde: '2099-01-01' },
    })
    expect(r.json().code).toBe('FECHA_FUTURA')
  })
})

describe('el buscador', () => {
  it('encuentra por la patente escrita con espacios y por el nombre del titular', async () => {
    const porPatente = (await pedir(gerente, 'GET', '/vehiculos?buscar=AE%20123%20BC')).json()
    expect(porPatente.datos.map((v: { chasis: string }) => v.chasis)).toEqual([HILUX.chasis])

    const porTitular = (await pedir(gerente, 'GET', '/vehiculos?buscar=transportes')).json()
    expect(porTitular.total).toBe(1)
  })
})

describe('modificar', () => {
  it('patentar un 0km: el chasis queda, y la historia lo cuenta', async () => {
    const id = await porChasis('8AJFB8CD5N7654321')

    const r = await pedir(gerente, 'PUT', `/vehiculos/${id}`, {
      dominio: 'AF456CD',
      marca: 'Toyota',
      modelo: 'Hilux',
      chasis: 'OTROCHASIS1234567',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ dominio: 'AF456CD', chasis: '8AJFB8CD5N7654321' })
    expect(r.json().historia[0].detalle).toBe('Patente: «vacío» → «AF456CD»')
  })

  it('no puede quedarse con la patente de otro', async () => {
    const id = await porChasis('8AJFB8CD5N7654321')
    const r = await pedir(gerente, 'PUT', `/vehiculos/${id}`, { dominio: 'AE123BC' })
    expect(r.json().code).toBe('DOMINIO_DUPLICADO')
  })
})

describe('transferir', () => {
  it('a una fecha anterior a la del titular actual no, y dice cuál es', async () => {
    const id = await porChasis(HILUX.chasis)
    const r = await pedir(gerente, 'POST', `/vehiculos/${id}/titularidad`, {
      clienteId: ana,
      desde: '2023-12-31',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json()).toMatchObject({ code: 'FECHA_ANTERIOR', data: { desde: '2024-03-01' } })
  })

  it('al mismo titular no', async () => {
    const id = await porChasis(HILUX.chasis)
    const r = await pedir(gerente, 'POST', `/vehiculos/${id}/titularidad`, {
      clienteId: transportes,
      desde: hoyEnArgentina(),
    })
    expect(r.json().code).toBe('MISMO_TITULAR')
  })

  it('cierra al anterior el mismo día y lo conserva', async () => {
    const id = await porChasis(HILUX.chasis)
    const r = await pedir(gerente, 'POST', `/vehiculos/${id}/titularidad`, {
      clienteId: ana,
      desde: '2025-06-15',
    })
    expect(r.statusCode).toBe(200)

    const f = await ficha(id)
    expect(f.titular).toEqual({ id: ana, razonSocial: 'Gómez, Ana' })
    expect(
      f.titulares.map((t: { cliente: { razonSocial: string }; desde: string; hasta: string }) => [
        t.cliente.razonSocial,
        t.desde,
        t.hasta,
      ]),
    ).toEqual([
      ['Gómez, Ana', '2025-06-15', null],
      ['Transportes del Sur SRL', '2024-03-01', '2025-06-15'],
    ])
    expect(f.historia.map((h: { detalle: string }) => h.detalle)).toEqual([
      'Pasó de Transportes del Sur SRL a Gómez, Ana, desde el 15/06/2025',
      'Le asignó como titular a Transportes del Sur SRL, desde el 01/03/2024',
      'Lo dio de alta',
    ])
  })

  it('a un cliente desactivado no', async () => {
    const id = await porChasis(HILUX.chasis)
    const baja = await pedir(gerente, 'PUT', `/clientes/${transportes}`, {
      razonSocial: 'Transportes del Sur SRL',
      condicionIva: 5,
      domicilio: null,
      provinciaCodigo: null,
      localidad: null,
      codigoPostal: null,
      email: null,
      telefono: null,
      numeroIibb: null,
      condicionIibb: 'no_inscripto',
      observaciones: null,
      activo: false,
    })
    expect(baja.statusCode).toBe(200)

    const r = await pedir(gerente, 'POST', `/vehiculos/${id}/titularidad`, {
      clienteId: transportes,
      desde: hoyEnArgentina(),
    })
    expect(r.json().code).toBe('CLIENTE_INEXISTENTE')
  })

  it('queda en la auditoría de la concesionaria, sobre el vehículo', async () => {
    const { datos } = (await pedir(gerente, 'GET', '/auditoria/cambios')).json()
    expect(datos).toContainEqual(
      expect.objectContaining({
        sobre: 'el vehículo AE123BC',
        detalle: 'Pasó de Transportes del Sur SRL a Gómez, Ana, desde el 15/06/2025',
      }),
    )
  })
})

describe('aislamiento y permisos', () => {
  it('la ficha de un vehículo de otra concesionaria no existe', async () => {
    const id = await porChasis(HILUX.chasis)
    const ajeno = await entrar('gerente@ajena.test')
    expect((await pedir(ajeno, 'GET', `/vehiculos/${id}`)).statusCode).toBe(404)
  })

  it('el mecánico ve la ficha pero no la modifica ni transfiere', async () => {
    const id = await porChasis(HILUX.chasis)
    const mecanico = await entrar('mecanico@vehiculos.test')

    expect((await pedir(mecanico, 'GET', `/vehiculos/${id}`)).statusCode).toBe(200)
    expect((await pedir(mecanico, 'PUT', `/vehiculos/${id}`, { dominio: null })).statusCode).toBe(
      403,
    )
    const r = await pedir(mecanico, 'POST', `/vehiculos/${id}/titularidad`, {
      clienteId: ana,
      desde: hoyEnArgentina(),
    })
    expect(r.statusCode).toBe(403)
  })
})
