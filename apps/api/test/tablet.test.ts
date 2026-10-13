import { TIPOS_QR } from '@gpb/core'
import { and, eq } from '@gpb/db'
import { credencial, sesion, usuario, usuarioSucursal } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashearRefresco } from '../src/auth/tokens.ts'
import { qrFirmado } from '../src/comun/qr.ts'
import {
  type ApiDePrueba,
  CLAVE,
  levantarApi,
  sembrarConcesionaria,
  sembrarEmpleado,
} from './fixture.ts'

/**
 * La tablet de recepción: se registra como estación y la persona entra con su credencial.
 *
 * Lo que importa: la credencial sola no abre nada fuera de una tablet registrada; abre la
 * cuenta vinculada con ese legajo y en la sucursal de la tablet; y la sesión vence a los
 * minutos y se corta si revocan la tablet. Ver `docs/tecnicos/recepcion-en-tablet.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let tenantId: string
let centralId: string
let rafaelaId: string
let tokenTablet: string
let tabletId: string
let tokenTaller: string
let qrAsesora: string
let qrSinCuenta: string
let asesoraId: string
let legajoAsesora: string

const MEDIA_HORA = 31 * 60 * 1000

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

function conCredencial(token: string | null, codigo: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/credencial',
    headers: token ? { authorization: `Estacion ${token}` } : {},
    payload: { codigo, entrega: 'cuerpo' },
  })
}

async function registrar(nombre: string, tipo: string, sucursalId: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/fichaje/estaciones',
    headers: { authorization: `Bearer ${gerente}` },
    payload: { nombre, tipo, sucursalId },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as { estacion: { id: string }; token: string }
}

async function credencialDe(empleadoId: string) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/personal/${empleadoId}/credencial`,
    headers: { authorization: `Bearer ${gerente}` },
  })
  expect(r.statusCode, r.body).toBeLessThan(300)
  const [c] = await api.pg.dbDuenio
    .select({ codigo: credencial.codigo })
    .from(credencial)
    .where(eq(credencial.empleadoId, empleadoId))
  return qrFirmado(TIPOS_QR.credencial, c?.codigo as string)
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'tablet',
    email: 'gerente@tablet.test',
    sucursales: ['Casa Central', 'Rafaela'],
    otros: [{ email: 'asesora@tablet.test', rol: 'Asesor de servicios' }],
  })
  tenantId = semilla.tenant.id
  centralId = semilla.sucursales[0]?.id as string
  rafaelaId = semilla.sucursales[1]?.id as string

  const [asesora] = await api.pg.dbDuenio
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.email, 'asesora@tablet.test'))
  asesoraId = asesora?.id as string
  legajoAsesora = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '0101',
    nombre: 'Laura',
    apellido: 'Gómez',
    puesto: 'administrativo',
    usuarioId: asesoraId,
  })
  const sinCuenta = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '0102',
    nombre: 'Raúl',
    apellido: 'Paz',
  })

  gerente = await entrar('gerente@tablet.test')
  const tablet = await registrar('Tablet del mostrador', 'recepcion', centralId)
  tokenTablet = tablet.token
  tabletId = tablet.estacion.id
  tokenTaller = (await registrar('PC del taller', 'taller', centralId)).token

  qrAsesora = await credencialDe(legajoAsesora)
  qrSinCuenta = await credencialDe(sinCuenta)
}, 240_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('entrar con la credencial', () => {
  it('abre la sesión de la cuenta vinculada, en la sucursal de la tablet', async () => {
    const r = await conCredencial(tokenTablet, qrAsesora)
    expect(r.statusCode, r.body).toBe(200)
    const cuerpo = r.json()
    expect(cuerpo.usuario.id).toBe(asesoraId)
    expect(cuerpo.sucursalActiva.id).toBe(centralId)
    expect(cuerpo.sucursalPendiente).toBe(false)

    const filas = await api.pg.dbDuenio
      .select()
      .from(sesion)
      .where(and(eq(sesion.usuarioId, asesoraId), eq(sesion.estacionId, tabletId)))
    expect(filas).toHaveLength(1)
    // Vence a la media hora, no a los treinta días.
    expect((filas[0]?.expiraEn.getTime() ?? 0) - Date.now()).toBeLessThan(MEDIA_HORA)
  })

  it('al renovarse sigue siendo de la tablet, y sigue venciendo pronto', async () => {
    const { refresh } = (await conCredencial(tokenTablet, qrAsesora)).json()
    const r = await app.inject({ method: 'POST', url: '/api/auth/refrescar', payload: { refresh } })
    expect(r.statusCode, r.body).toBe(200)

    const [renovada] = await api.pg.dbDuenio
      .select()
      .from(sesion)
      .where(eq(sesion.hashRefresco, hashearRefresco(r.json().refresh)))
    expect(renovada?.estacionId).toBe(tabletId)
    expect((renovada?.expiraEn.getTime() ?? 0) - Date.now()).toBeLessThan(MEDIA_HORA)
  })

  it('sin el token de una tablet no hay credencial que sirva', async () => {
    expect((await conCredencial(null, qrAsesora)).statusCode).toBe(401)
    const desdeElTaller = await conCredencial(tokenTaller, qrAsesora)
    expect(desdeElTaller.statusCode).toBe(403)
    expect(desdeElTaller.json().code).toBe('NO_ES_TABLET')
  })

  it('una credencial con otra firma no sirve', async () => {
    const trucha = `${qrAsesora.slice(0, -1)}${qrAsesora.endsWith('A') ? 'B' : 'A'}`
    const r = await conCredencial(tokenTablet, trucha)
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('CREDENCIAL_INVALIDA')
  })

  it('el legajo sin cuenta del sistema no entra, y se le dice por qué', async () => {
    const r = await conCredencial(tokenTablet, qrSinCuenta)
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('SIN_CUENTA')
  })

  it('la tablet no ficha: su token está en un aparato a la vista de todos', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/fichaje/escanear',
      headers: { authorization: `Estacion ${tokenTablet}` },
      payload: { codigo: qrAsesora },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ resultado: 'rechazado', titulo: 'Esta pantalla no ficha' })
  })

  it('una tablet de otra sucursal no abre a quien no entra ahí', async () => {
    const enRafaela = await registrar('Tablet de Rafaela', 'recepcion', rafaelaId)
    await api.pg.dbDuenio
      .delete(usuarioSucursal)
      .where(
        and(eq(usuarioSucursal.usuarioId, asesoraId), eq(usuarioSucursal.sucursalId, rafaelaId)),
      )
    const r = await conCredencial(enRafaela.token, qrAsesora)
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('SIN_ACCESO')
  })
})

describe('lo que la corta', () => {
  it('revocar la tablet corta las sesiones que se abrieron en ella', async () => {
    const otra = await registrar('Tablet que se pierde', 'recepcion', centralId)
    const { refresh } = (await conCredencial(otra.token, qrAsesora)).json()

    const revocada = await app.inject({
      method: 'POST',
      url: `/api/fichaje/estaciones/${otra.estacion.id}/revocar`,
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(revocada.statusCode, revocada.body).toBe(200)

    const r = await app.inject({ method: 'POST', url: '/api/auth/refrescar', payload: { refresh } })
    expect(r.statusCode).toBe(401)
  })

  it('revocar la credencial la deja sin entrar', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/personal/${legajoAsesora}/credencial/revocar`,
      headers: { authorization: `Bearer ${gerente}` },
      payload: { motivo: 'La perdió' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const despues = await conCredencial(tokenTablet, qrAsesora)
    expect(despues.statusCode).toBe(401)
    expect(despues.json().code).toBe('CREDENCIAL_INVALIDA')
  })
})
