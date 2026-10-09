import 'reflect-metadata'
import { eq } from '@gpb/db'
import { turno, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type ApiDePrueba,
  CLAVE,
  levantarApi,
  sembrarConcesionaria,
  sembrarEmpleado,
} from './fixture.ts'

/**
 * La agenda del taller: agendar por teléfono con lo mínimo, que el turno que llega entre a la
 * cola como visita con su auto y su pedido, y que el que no vino quede como que no vino.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let recepcionista: string
let mecanico: string
let otroGerente: string
let asesorId: string
let vehiculoId: string
let tenantId: string
let sucursalId: string

/** Mañana a las 9, en hora de Argentina. */
const MANANA = (() => {
  const d = new Date(Date.now() + 86_400_000)
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(d)
  return { dia, hora: `${dia}T09:00:00-03:00` }
})()
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
  new Date(),
)

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'agenda',
    email: 'gerente@agenda.test',
    otros: [
      { email: 'recepcion@agenda.test', rol: 'Recepcionista' },
      { email: 'mecanico@agenda.test', rol: 'Mecánico' },
    ],
    vehiculos: [{ chasis: '8AJFB8CD5N7654321', dominio: 'AF321GH' }],
  })
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'agenda-otra',
    email: 'gerente@agenda-otra.test',
  })
  tenantId = semilla.tenant.id
  sucursalId = semilla.sucursales[0]?.id as string
  asesorId = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '20',
    nombre: 'Andrea',
    apellido: 'Villalba',
    puesto: 'asesor',
  })
  const [auto] = await api.pg.dbDuenio
    .select({ id: vehiculo.id })
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, tenantId))
  vehiculoId = auto?.id as string
  recepcionista = await entrar('recepcion@agenda.test')
  mecanico = await entrar('mecanico@agenda.test')
  otroGerente = await entrar('gerente@agenda-otra.test')
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

async function agendar(datos: object, quien = recepcionista) {
  const r = await pedir(quien, 'POST', '/turnos', datos)
  expect(r.statusCode, r.body).toBe(201)
  return r.json()
}

describe('agendar', () => {
  it('por teléfono alcanza con la patente, un nombre y qué le pasa', async () => {
    const t = await agendar({
      fechaHora: MANANA.hora,
      dominio: 'ab 123 cd',
      nombre: 'Rosa Díaz',
      telefono: '351 555-0000',
      pedido: 'Service de 20.000',
      asesorId,
    })
    expect(t).toMatchObject({
      estado: 'agendado',
      dominio: 'AB123CD',
      vehiculo: null,
      asesor: { id: asesorId, nombre: 'Andrea Villalba' },
      visitaId: null,
    })
  })

  it('sin auto ni patente, o sin a nombre de quién, no se agenda', async () => {
    const sinAuto = await pedir(recepcionista, 'POST', '/turnos', {
      fechaHora: MANANA.hora,
      nombre: 'Sin auto',
      pedido: 'Frenos',
    })
    expect(sinAuto.statusCode).toBe(400)
    const sinQuien = await pedir(recepcionista, 'POST', '/turnos', {
      fechaHora: MANANA.hora,
      dominio: 'AA000AA',
      pedido: 'Frenos',
    })
    expect(sinQuien.statusCode).toBe(400)
  })

  it('con el auto cargado no hace falta el nombre: es el del titular', async () => {
    const t = await agendar({ fechaHora: MANANA.hora, vehiculoId, pedido: 'Ruido en el tren' })
    expect(t.vehiculo).toMatchObject({ id: vehiculoId, dominio: 'AF321GH' })
  })

  it('la agenda lista los del rango en orden, y sólo los de esta concesionaria', async () => {
    const r = await pedir(recepcionista, 'GET', `/turnos?desde=${MANANA.dia}&hasta=${MANANA.dia}`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().datos.length).toBe(2)
    const ajena = await pedir(otroGerente, 'GET', `/turnos?desde=${MANANA.dia}&hasta=${MANANA.dia}`)
    expect(ajena.json().datos).toEqual([])
  })

  it('el mecánico no ve la agenda', async () => {
    const r = await pedir(mecanico, 'GET', `/turnos?desde=${HOY}&hasta=${HOY}`)
    expect(r.statusCode).toBe(403)
  })
})

describe('cuando llega', () => {
  it('entra a la cola como visita de servicio, para su asesor y con su pedido', async () => {
    const t = await agendar({
      fechaHora: MANANA.hora,
      vehiculoId,
      nombre: 'Juan Pérez',
      pedido: 'Cambio de pastillas',
      asesorId,
    })
    const r = await pedir(recepcionista, 'POST', `/turnos/${t.id}/llego`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      motivo: 'servicio',
      nombre: 'Juan Pérez',
      derivadaA: { id: asesorId },
      turno: { id: t.id, pedido: 'Cambio de pastillas', vehiculoId, dominio: 'AF321GH' },
    })
    expect(r.json().numero).toMatch(/^S-\d{3}$/)

    // Llega una sola vez.
    const otra = await pedir(recepcionista, 'POST', `/turnos/${t.id}/llego`)
    expect(otra.statusCode).toBe(409)
    expect(otra.json().code).toBe('TURNO_CERRADO')

    const agenda = await pedir(
      recepcionista,
      'GET',
      `/turnos?desde=${MANANA.dia}&hasta=${MANANA.dia}`,
    )
    const llegado = agenda.json().datos.find((x: { id: string }) => x.id === t.id)
    expect(llegado).toMatchObject({ estado: 'llego', visitaId: r.json().id })
  })

  it('cancelado no se puede marcar como llegado ni cambiar', async () => {
    const t = await agendar({
      fechaHora: MANANA.hora,
      dominio: 'AC111DD',
      nombre: 'X',
      pedido: 'Aceite',
    })
    expect((await pedir(recepcionista, 'POST', `/turnos/${t.id}/cancelar`)).json().estado).toBe(
      'cancelado',
    )
    expect((await pedir(recepcionista, 'POST', `/turnos/${t.id}/llego`)).statusCode).toBe(409)
    const r = await pedir(recepcionista, 'PUT', `/turnos/${t.id}`, {
      fechaHora: MANANA.hora,
      dominio: 'AC111DD',
      nombre: 'X',
      pedido: 'Aceite',
    })
    expect(r.statusCode).toBe(409)
  })

  it('los de días pasados que nadie marcó pasan solos a «no vino»', async () => {
    const [viejo] = await api.pg.dbDuenio
      .insert(turno)
      .values({
        tenantId,
        sucursalId,
        fechaHora: new Date(Date.now() - 3 * 86_400_000),
        dominio: 'AD222EE',
        nombre: 'Olvidadizo',
        pedido: 'Alineación',
      })
      .returning()
    const desde = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date(Date.now() - 5 * 86_400_000))
    const r = await pedir(recepcionista, 'GET', `/turnos?desde=${desde}&hasta=${HOY}`)
    const visto = r.json().datos.find((x: { id: string }) => x.id === viejo?.id)
    expect(visto.estado).toBe('ausente')
  })

  it('cambiarlo de día', async () => {
    const t = await agendar({
      fechaHora: MANANA.hora,
      dominio: 'AE333FF',
      nombre: 'Y',
      pedido: 'Frenos',
    })
    const r = await pedir(recepcionista, 'PUT', `/turnos/${t.id}`, {
      fechaHora: `${MANANA.dia}T15:30:00-03:00`,
      dominio: 'AE333FF',
      nombre: 'Y',
      pedido: 'Frenos y aceite',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      pedido: 'Frenos y aceite',
      fechaHora: `${MANANA.dia}T18:30:00.000Z`,
    })
  })
})
