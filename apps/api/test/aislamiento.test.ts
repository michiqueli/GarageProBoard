import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El test que sostiene el producto entero.
 *
 * GarageProBoard es una sola instalación con todas las concesionarias adentro. Si un día se
 * cruzan los datos, no es un bug: es el fin del negocio. Nadie le confía la facturación
 * de sus clientes a un sistema donde el competidor de al lado pudo ver algo.
 *
 * En `packages/db` hay tests que verifican las políticas de RLS directamente contra el
 * motor. Éstos son otra cosa: verifican el camino completo — pedido HTTP, token,
 * sesión, consulta — que es por donde entra un atacante de verdad.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

/** Vehículos con patente reconocible para que un cruce salte a la vista. */
const DEL_LITORAL = [
  { chasis: 'AAAZZZ377KA000001', dominio: 'AA111AA' },
  { chasis: 'AAAZZZ377KA000002', dominio: 'AA222AA' },
  { chasis: 'AAAZZZ377KA000003', dominio: null },
]

const DEL_NORTE = [{ chasis: 'BBBZZZ377KA000001', dominio: 'BB111BB' }]

beforeAll(async () => {
  api = await levantarApi()
  app = api.app

  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'litoral',
    email: 'admin@litoral.test',
    vehiculos: DEL_LITORAL,
  })
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'norte',
    email: 'admin@norte.test',
    vehiculos: DEL_NORTE,
  })
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  // Si el login falla, que lo diga acá: sin esto, el síntoma es un «total» equivocado más
  // abajo, que parece un cruce de datos y no lo es.
  expect(r.statusCode, `no pudo entrar ${email}: ${r.body}`).toBe(200)
  return r.json().access
}

function listar(access: string, buscar?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/vehiculos${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`,
    headers: { authorization: `Bearer ${access}` },
  })
}

describe('los datos de una concesionaria no se ven desde otra', () => {
  it('cada una lista solamente sus vehículos', async () => {
    const litoral = (await listar(await entrar('admin@litoral.test'))).json()
    const norte = (await listar(await entrar('admin@norte.test'))).json()

    expect(litoral.total).toBe(DEL_LITORAL.length)
    expect(norte.total).toBe(DEL_NORTE.length)

    const patentesLitoral = litoral.datos.map((v: { chasis: string }) => v.chasis)
    const patentesNorte = norte.datos.map((v: { chasis: string }) => v.chasis)

    expect(patentesLitoral.every((c: string) => c.startsWith('AAA'))).toBe(true)
    expect(patentesNorte.every((c: string) => c.startsWith('BBB'))).toBe(true)
    // Sin un solo elemento en común.
    expect(patentesLitoral.filter((c: string) => patentesNorte.includes(c))).toEqual([])
  })

  it('buscar la patente exacta de la otra no la encuentra', async () => {
    // No alcanza con que el listado esté filtrado: buscar un dato ajeno del que se
    // conoce el valor exacto es justamente lo que haría alguien que sospecha que hay
    // un agujero.
    const access = await entrar('admin@litoral.test')
    const r = await listar(access, 'BB111BB')

    expect(r.json().total).toBe(0)
    expect(r.json().datos).toEqual([])
  })

  it('buscar el chasis exacto de la otra tampoco', async () => {
    const access = await entrar('admin@norte.test')
    const r = await listar(access, 'AAAZZZ377KA000001')

    expect(r.json().total).toBe(0)
  })

  it('el token de una no sirve para el contexto de la otra', async () => {
    // Los dos tokens son válidos; lo que cambia es a qué concesionaria apuntan. Un
    // token bien firmado no habilita nada fuera de su tenant.
    const litoral = await entrar('admin@litoral.test')
    const norte = await entrar('admin@norte.test')

    expect(litoral).not.toBe(norte)

    const conLitoral = (await listar(litoral)).json()
    const conNorte = (await listar(norte)).json()

    expect(conLitoral.datos[0].chasis.startsWith('AAA')).toBe(true)
    expect(conNorte.datos[0].chasis.startsWith('BBB')).toBe(true)
  })

  it('sin token no se lista nada', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/vehiculos' })
    expect(r.statusCode).toBe(401)
  })

  it('dar de alta un vehículo lo deja en la concesionaria correcta', async () => {
    const access = await entrar('admin@norte.test')

    const alta = await app.inject({
      method: 'POST',
      url: '/api/vehiculos',
      headers: { authorization: `Bearer ${access}` },
      payload: { chasis: 'BBBZZZ377KA000002', dominio: 'BB222BB', anio: 2024 },
    })
    expect(alta.statusCode).toBe(201)

    // Aparece en la suya…
    const norte = (await listar(access)).json()
    expect(norte.total).toBe(DEL_NORTE.length + 1)

    // …y en la otra no, ni siquiera buscándolo.
    const otra = await entrar('admin@litoral.test')
    expect((await listar(otra, 'BB222BB')).json().total).toBe(0)
    expect((await listar(otra)).json().total).toBe(DEL_LITORAL.length)
  })

  it('el mismo chasis puede existir en dos concesionarias distintas', async () => {
    // Es único **por concesionaria**, no globalmente: dos talleres distintos pueden
    // atender el mismo auto, y ninguno tiene por qué enterarse del otro.
    const compartido = 'CCCZZZ377KA000009'

    for (const email of ['admin@litoral.test', 'admin@norte.test']) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/vehiculos',
        headers: { authorization: `Bearer ${await entrar(email)}` },
        payload: { chasis: compartido },
      })
      expect(r.statusCode, `falló para ${email}`).toBe(201)
    }
  })

  it('repetir el chasis dentro de la misma concesionaria sí falla', async () => {
    const access = await entrar('admin@litoral.test')

    const r = await app.inject({
      method: 'POST',
      url: '/api/vehiculos',
      headers: { authorization: `Bearer ${access}` },
      payload: { chasis: DEL_LITORAL[0]?.chasis },
    })

    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('CHASIS_DUPLICADO')
  })
})
