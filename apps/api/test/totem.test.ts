import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { eq } from '@gpb/db'
import { cliente, entidadComercial, titularidad, turno, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El tótem de la puerta. Lo que importa probar son sus cuidados: que el documento no devuelva
 * nunca un nombre, que reintentar no anote dos veces, y que el número que dio sin red se
 * respete —o se corra al siguiente si ya estaba—.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let tokenTotem: string
let tokenReloj: string
let tokenLlamador: string
let tenantId: string
let sucursalId: string

const DNI = '28456789'

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'totem',
    email: 'gerente@totem.test',
    vehiculos: [{ chasis: '8AJFB8CD5N1112223', dominio: 'AG444HH' }],
  })
  tenantId = semilla.tenant.id
  sucursalId = semilla.sucursales[0]?.id as string
  gerente = await entrar('gerente@totem.test')

  // Juan, con su CUIL —que lleva el DNI adentro— y titular del auto con turno hoy.
  const [juan] = await api.pg.dbDuenio
    .insert(entidadComercial)
    .values({
      tenantId,
      tipoDocumento: 86,
      numeroDocumento: `20${DNI}3`,
      tipoPersona: 'fisica',
      razonSocial: 'Pérez, Juan',
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '351 555-1234',
      condicionIva: 5,
    })
    .returning()
  const [auto] = await api.pg.dbDuenio
    .select({ id: vehiculo.id })
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, tenantId))
  await api.pg.dbDuenio.insert(cliente).values({ id: juan?.id as string, tenantId })
  await api.pg.dbDuenio.insert(titularidad).values({
    tenantId,
    vehiculoId: auto?.id as string,
    clienteId: juan?.id as string,
    desde: '2024-01-01',
  })
  await api.pg.dbDuenio.insert(turno).values({
    tenantId,
    sucursalId,
    fechaHora: new Date(),
    vehiculoId: auto?.id as string,
    pedido: 'Service de 30.000',
  })

  tokenTotem = await registrar('Tótem de la puerta', 'totem')
  tokenReloj = await registrar('Reloj', 'reloj')
  tokenLlamador = await registrar('Sala de espera', 'llamador')
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

async function registrar(nombre: string, tipo: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/fichaje/estaciones',
    headers: { authorization: `Bearer ${gerente}` },
    payload: { nombre, tipo, sucursalId },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().token as string
}

function anotar(datos: object, token = tokenTotem) {
  return app.inject({
    method: 'POST',
    url: '/api/totem/visitas',
    headers: { authorization: `Estacion ${token}` },
    payload: { id: randomUUID(), llegoEn: new Date().toISOString(), ...datos },
  })
}

async function visitasDeHoy() {
  const r = await app.inject({
    method: 'GET',
    url: '/api/recepcion/visitas',
    headers: { authorization: `Bearer ${gerente}` },
  })
  return r.json().datos as Array<{
    id: string
    numero: string
    nombre: string | null
    origen: string
  }>
}

describe('el tótem', () => {
  it('da el número que el tótem eligió, en su propia serie', async () => {
    const r = await anotar({ motivo: 'venta', numero: 1 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toEqual({ numero: 'T-001', turnoHora: null })
  })

  it('con el DNI encuentra a la persona y su turno, pero no devuelve su nombre', async () => {
    const r = await anotar({ motivo: 'servicio', documento: DNI, numero: 2 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().numero).toBe('T-002')
    expect(r.json().turnoHora).toMatch(/^\d\d:\d\d$/)
    expect(JSON.stringify(r.json())).not.toMatch(/Juan|Pérez/)

    // La recepcionista sí lo ve, con el turno al lado.
    const visita = (await visitasDeHoy()).find((v) => v.numero === 'T-002')
    expect(visita).toMatchObject({ nombre: 'Juan Pérez', origen: 'totem' })
  })

  it('reintentar la misma no anota dos veces', async () => {
    const id = randomUUID()
    const a = await anotar({ id, motivo: 'repuestos', numero: 3 })
    const b = await anotar({ id, motivo: 'repuestos', numero: 3 })
    expect(a.json()).toEqual(b.json())
    expect((await visitasDeHoy()).filter((v) => v.id === id)).toHaveLength(1)
  })

  it('si el número ya estaba dado —se le borró la cuenta—, le da el siguiente', async () => {
    const r = await anotar({ motivo: 'otro', numero: 1 })
    expect(r.json().numero).toBe('T-004')
    const estado = await app.inject({
      method: 'GET',
      url: '/api/totem/estado',
      headers: { authorization: `Estacion ${tokenTotem}` },
    })
    expect(estado.json().ultimo).toBe(4)
  })

  it('una estación que no es tótem no anota a nadie', async () => {
    const r = await anotar({ motivo: 'venta', numero: 9 }, tokenReloj)
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('NO_ES_TOTEM')
  })
})

describe('el llamador y la espera', () => {
  const HOY = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())

  function llamador(token = tokenLlamador) {
    return app.inject({
      method: 'GET',
      url: '/api/llamador',
      headers: { authorization: `Estacion ${token}` },
    })
  }

  it('agarrar una visita la llama: el número, con quién lo atiende y sin el cliente', async () => {
    const espera = (await visitasDeHoy()).find((v) => v.numero === 'T-002')
    const r = await app.inject({
      method: 'POST',
      url: `/api/recepcion/visitas/${espera?.id}/atender`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.statusCode, r.body).toBe(200)

    const pantalla = await llamador()
    expect(pantalla.statusCode, pantalla.body).toBe(200)
    expect(pantalla.json().llamados[0]).toMatchObject({ numero: 'T-002', atiende: 'Prueba G.' })
    expect(pantalla.json().esperando).toBeGreaterThan(0)
    expect(JSON.stringify(pantalla.json())).not.toMatch(/Juan|Pérez/)
  })

  it('una estación que no es llamador no lo ve', async () => {
    expect((await llamador(tokenTotem)).statusCode).toBe(403)
  })

  it('la espera del día, por motivo y por hora de llegada', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/recepcion/esperas?desde=${HOY}&hasta=${HOY}`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    const { total, porMotivo, porHora } = r.json()
    expect(total.visitas).toBe(4)
    expect(total.atendidas).toBe(1)
    expect(total.esperaMedia).toBeGreaterThanOrEqual(0)
    // En el orden en que se ofrecen: servicio primero.
    expect(porMotivo.map((m: { motivo: string }) => m.motivo)).toEqual([
      'servicio',
      'venta',
      'repuestos',
      'otro',
    ])
    expect(porHora.reduce((a: number, h: { visitas: number }) => a + h.visitas, 0)).toBe(4)
  })
})
