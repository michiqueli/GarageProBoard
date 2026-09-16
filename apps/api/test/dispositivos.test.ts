import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Desde qué computadora se entra, y qué se le avisa a quien le cambiaron algo.
 *
 * Es lo que controla al administrador de sistema: puede modificar a cualquiera, pero queda
 * registrado desde dónde, y el afectado se entera.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'dispositivos',
    email: 'gerente@dispositivos.test',
    otros: [
      { email: 'mecanico@dispositivos.test', rol: 'Mecánico' },
      { email: 'sistemas@dispositivos.test', rol: 'Administrador de sistema' },
    ],
  })
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

function entrarConCookie(email: string, dispositivo?: string, password = CLAVE) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password },
    ...(dispositivo ? { cookies: { gpb_dispositivo: dispositivo } } : {}),
  })
}

const cookieDe = (r: Awaited<ReturnType<typeof entrarConCookie>>, nombre: string) =>
  r.cookies.find((c) => c.name === nombre)

async function dispositivosDeSesiones(email: string): Promise<Array<string | null>> {
  const { rows } = await api.pg.poolDuenio.query<{ dispositivo_id: string | null }>(
    `select s.dispositivo_id from sesion s join usuario u on u.id = s.usuario_id
      where u.email = $1 order by s.creado_en`,
    [email],
  )
  return rows.map((r) => r.dispositivo_id)
}

describe('la computadora desde la que se entra', () => {
  it('la primera vez recibe un identificador, en una cookie que el JavaScript no lee', async () => {
    const r = await entrarConCookie('gerente@dispositivos.test')

    expect(r.statusCode).toBe(200)
    const cookie = cookieDe(r, 'gpb_dispositivo')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.value).toMatch(/^[0-9a-f-]{36}$/)
    // Y no viaja en la respuesta.
    expect(r.json()).not.toHaveProperty('dispositivoId')
  })

  it('la próxima vez es la misma computadora, no una nueva', async () => {
    const primera = await entrarConCookie('mecanico@dispositivos.test')
    const id = cookieDe(primera, 'gpb_dispositivo')?.value
    await entrarConCookie('mecanico@dispositivos.test', id)

    const ids = await dispositivosDeSesiones('mecanico@dispositivos.test')
    expect(ids).toEqual([id, id])
  })

  it('renovar la sesión la conserva', async () => {
    const r = await entrarConCookie('sistemas@dispositivos.test')
    const refresco = cookieDe(r, 'gpb_refresco')?.value ?? ''
    const id = cookieDe(r, 'gpb_dispositivo')?.value

    const renovada = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: {},
      cookies: { gpb_refresco: refresco },
    })
    expect(renovada.statusCode).toBe(200)

    const ids = await dispositivosDeSesiones('sistemas@dispositivos.test')
    expect(ids.at(-1)).toBe(id)
  })

  it('una cookie inventada no se adopta: cuenta como computadora nueva', async () => {
    const inventada = '00000000-0000-4000-8000-000000000000'
    const r = await entrarConCookie('gerente@dispositivos.test', inventada)

    expect(cookieDe(r, 'gpb_dispositivo')?.value).not.toBe(inventada)
  })

  it('una app sin cookies no registra computadora', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email: 'gerente@dispositivos.test', password: CLAVE, entrega: 'cuerpo' },
    })
    expect(cookieDe(r, 'gpb_dispositivo')).toBeUndefined()
    expect((await dispositivosDeSesiones('gerente@dispositivos.test')).at(-1)).toBeNull()
  })
})

describe('el aviso al afectado', () => {
  async function tokenDe(email: string, password = CLAVE) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email, password, entrega: 'cuerpo' },
    })
    expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
    return r.json() as { access: string; avisos: Array<{ id: string; texto: string }> }
  }

  const con = (access: string) => ({ authorization: `Bearer ${access}` })

  it('si le cambian la contraseña, se entera al entrar: quién y cuándo', async () => {
    const sistemas = await tokenDe('sistemas@dispositivos.test')
    const { datos } = (
      await app.inject({ method: 'GET', url: '/api/usuarios', headers: con(sistemas.access) })
    ).json()
    const mecanico = datos.find((u: { email: string }) => u.email === 'mecanico@dispositivos.test')

    const nueva = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${mecanico.id}/password`,
      headers: con(sistemas.access),
    })
    const { passwordInicial } = nueva.json()

    const suya = await tokenDe('mecanico@dispositivos.test', passwordInicial)
    expect(suya.avisos).toHaveLength(1)
    expect(suya.avisos[0]?.texto).toMatch(
      /^Tu contraseña la cambió Prueba Administrador de sistema el \d+\/\d+\/\d+/,
    )
  })

  it('marcado como leído, no vuelve a aparecer', async () => {
    // Una contraseña nueva, para tener con qué entrar y un aviso seguro que leer.
    const sistemas = await tokenDe('sistemas@dispositivos.test')
    const { datos } = (
      await app.inject({ method: 'GET', url: '/api/usuarios', headers: con(sistemas.access) })
    ).json()
    const id = datos.find((u: { email: string }) => u.email === 'mecanico@dispositivos.test').id
    const nueva = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${id}/password`,
      headers: con(sistemas.access),
    })
    const sesion = await tokenDe('mecanico@dispositivos.test', nueva.json().passwordInicial)

    const ids = sesion.avisos.map((a) => a.id)
    expect(ids.length).toBeGreaterThan(0)
    const leidos = await app.inject({
      method: 'POST',
      url: '/api/auth/avisos/leidos',
      headers: con(sesion.access),
      payload: { ids },
    })
    expect(leidos.json().leidos).toBe(ids.length)

    const yo = await app.inject({ method: 'GET', url: '/api/auth/yo', headers: con(sesion.access) })
    expect(yo.json().avisos).toEqual([])
  })

  it('nadie marca como leídos los avisos de otro', async () => {
    const { rows } = await api.pg.poolDuenio.query<{ id: string }>(
      `insert into aviso (tenant_id, usuario_id, texto)
       select tenant_id, id, 'Aviso ajeno' from usuario where email = 'mecanico@dispositivos.test'
       returning id`,
    )
    const gerente = await tokenDe('gerente@dispositivos.test')

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/avisos/leidos',
      headers: con(gerente.access),
      payload: { ids: rows.map((x) => x.id) },
    })
    expect(r.json().leidos).toBe(0)
  })
})
