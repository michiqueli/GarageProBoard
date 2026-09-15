import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Permisos aplicados en la API, por el camino completo: pedido HTTP, token, reglas del
 * rol leídas de la base y la declaración de acceso del contrato.
 *
 * Los roles son los predefinidos, los mismos que recibe una concesionaria nueva:
 *
 * - **Gerente** administra todo.
 * - **Mecánico** ve vehículos pero no los da de alta.
 * - **Repuestero** no tiene nada que ver con el parque de vehículos.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

beforeAll(async () => {
  api = await levantarApi()
  app = api.app

  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'litoral',
    email: 'gerente@litoral.test',
    vehiculos: [{ chasis: 'AAAZZZ377KA000001', dominio: 'AA111AA' }],
    otros: [
      { email: 'mecanico@litoral.test', rol: 'Mecánico' },
      { email: 'repuestos@litoral.test', rol: 'Repuestero' },
      { email: 'baja@litoral.test', rol: 'Gerente' },
      { email: 'degradado@litoral.test', rol: 'Gerente' },
    ],
  })
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
  return r.json() as { access: string; refresh: string }
}

function listar(access: string) {
  return app.inject({
    method: 'GET',
    url: '/api/vehiculos',
    headers: { authorization: `Bearer ${access}` },
  })
}

function crear(access: string, chasis: string) {
  return app.inject({
    method: 'POST',
    url: '/api/vehiculos',
    headers: { authorization: `Bearer ${access}` },
    payload: { chasis },
  })
}

describe('cada rol hace lo que su rol permite', () => {
  it('el gerente lista y da de alta', async () => {
    const { access } = await entrar('gerente@litoral.test')

    expect((await listar(access)).statusCode).toBe(200)
    expect((await crear(access, 'AAAZZZ377KA000010')).statusCode).toBe(201)
  })

  it('el mecánico ve los vehículos', async () => {
    const { access } = await entrar('mecanico@litoral.test')
    expect((await listar(access)).statusCode).toBe(200)
  })

  it('el mecánico no da de alta, y el rechazo dice qué falta en castellano', async () => {
    const { access } = await entrar('mecanico@litoral.test')
    const r = await crear(access, 'AAAZZZ377KA000011')

    expect(r.statusCode).toBe(403)
    // La forma de error del contrato, para que el front la reconozca como tal.
    expect(r.json()).toEqual({
      defined: true,
      code: 'SIN_PERMISO',
      status: 403,
      message:
        'Tu usuario no tiene permiso para dar de alta vehículos. ' +
        'Pedíselo a quien administra los usuarios.',
      data: { accion: 'crear', sujeto: 'Vehiculo' },
    })
  })

  it('un rechazo no deja nada escrito', async () => {
    // La guardia corta antes del manejador: no es que se escribe y se deshace.
    const { access: mecanico } = await entrar('mecanico@litoral.test')
    await crear(mecanico, 'AAAZZZ377KA000012')

    const { access: gerente } = await entrar('gerente@litoral.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/vehiculos?buscar=AAAZZZ377KA000012',
      headers: { authorization: `Bearer ${gerente}` },
    })
    expect(r.json().total).toBe(0)
  })

  it('el repuestero no ve el parque de vehículos', async () => {
    const { access } = await entrar('repuestos@litoral.test')
    const r = await listar(access)

    expect(r.statusCode).toBe(403)
    expect(r.json().message).toMatch(/ver vehículos/)
  })

  it('las rutas que sólo piden sesión no piden permisos', async () => {
    // El repuestero no ve vehículos, pero sus propios datos de sesión sí.
    const { access } = await entrar('repuestos@litoral.test')
    const r = await app.inject({
      method: 'GET',
      url: '/api/auth/yo',
      headers: { authorization: `Bearer ${access}` },
    })
    expect(r.statusCode).toBe(200)
  })
})

describe('sin sesión', () => {
  it('responde 401 con la forma del contrato, antes de mirar permisos', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/vehiculos' })

    expect(r.statusCode).toBe(401)
    expect(r.json()).toMatchObject({ defined: true, code: 'NO_AUTENTICADO', status: 401 })
  })

  it('un token inventado tampoco pasa', async () => {
    const r = await listar('esto.no.es-un-token')
    expect(r.statusCode).toBe(401)
    expect(r.json().message).toBe('La sesión expiró')
  })
})

describe('los cambios valen desde el próximo pedido, no cuando vence el token', () => {
  it('un usuario dado de baja queda afuera con el token que ya tenía', async () => {
    const { access } = await entrar('baja@litoral.test')
    expect((await listar(access)).statusCode).toBe(200)

    await api.pg.poolDuenio.query(`update usuario set activo = false where email = $1`, [
      'baja@litoral.test',
    ])

    const r = await listar(access)
    expect(r.statusCode).toBe(401)
    expect(r.json().message).toMatch(/deshabilitado/)
  })

  it('y tampoco puede renovar la sesión', async () => {
    // Antes el refresco no miraba si el usuario seguía activo: dado de baja, podía
    // seguir renovando durante los treinta días del token de refresco.
    const { refresh } = await entrar('degradado@litoral.test')

    await api.pg.poolDuenio.query(`update usuario set activo = false where email = $1`, [
      'degradado@litoral.test',
    ])

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh },
    })
    expect(r.statusCode).toBe(401)

    await api.pg.poolDuenio.query(`update usuario set activo = true where email = $1`, [
      'degradado@litoral.test',
    ])
  })

  it('sacarle un rol le saca los permisos en el acto', async () => {
    const { access } = await entrar('degradado@litoral.test')
    expect((await crear(access, 'AAAZZZ377KA000020')).statusCode).toBe(201)

    // De gerente a mecánico, con el mismo token.
    await api.pg.poolDuenio.query(
      `update usuario_rol set rol_id = (select id from rol where nombre = 'Mecánico' and tenant_id = usuario_rol.tenant_id)
        where usuario_id = (select id from usuario where email = $1)`,
      ['degradado@litoral.test'],
    )

    expect((await crear(access, 'AAAZZZ377KA000021')).statusCode).toBe(403)
    expect((await listar(access)).statusCode).toBe(200)
  })
})
