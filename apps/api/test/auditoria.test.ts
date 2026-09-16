import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La auditoría de la concesionaria: quién entró desde qué computadora, y quién cambió qué.
 * El caso que la justifica es el de abajo: alguien entrando con la cuenta del gerente desde
 * la PC de sistemas.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'auditoria',
    email: 'gerente@auditoria.test',
    otros: [
      { email: 'sistemas@auditoria.test', rol: 'Administrador de sistema' },
      { email: 'mecanico@auditoria.test', rol: 'Mecánico' },
      { email: 'asesor@auditoria.test', rol: 'Asesor de servicios' },
      { email: 'recepcion@auditoria.test', rol: 'Asesor de servicios' },
    ],
  })
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

/** Entra como lo haría un navegador: con la cookie de su computadora, si ya tiene una. */
async function entrar(email: string, computadora?: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE },
    ...(computadora ? { cookies: { gpb_dispositivo: computadora } } : {}),
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return {
    access: r.json().access as string,
    computadora: r.cookies.find((c) => c.name === 'gpb_dispositivo')?.value ?? '',
  }
}

function pedir(access: string, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

describe('los ingresos', () => {
  it('el gerente entrando desde la PC de sistemas aparece como computadora nueva', async () => {
    const pcGerente = (await entrar('gerente@auditoria.test')).computadora
    await entrar('gerente@auditoria.test', pcGerente)
    const pcSistemas = (await entrar('sistemas@auditoria.test')).computadora

    // Alguien usa la cuenta del gerente desde la computadora de sistemas.
    await entrar('gerente@auditoria.test', pcSistemas)

    const { access } = await entrar('gerente@auditoria.test', pcGerente)
    const { datos } = (await pedir(access, 'GET', '/auditoria/ingresos?porPagina=50')).json()
    const delGerente = datos
      .filter((i: { usuario: { email: string } }) => i.usuario.email === 'gerente@auditoria.test')
      .reverse()

    expect(delGerente.map((i: { computadoraNueva: boolean }) => i.computadoraNueva)).toEqual([
      true, // la primera vez, desde su PC
      false, // la segunda, desde la misma
      true, // desde la PC de sistemas: esto es lo que hay que mirar
      false, // de nuevo desde la suya
    ])
    expect(delGerente[2].dispositivo.id).toBe(pcSistemas)
  })

  it('las renovaciones de la sesión no cuentan como ingresos', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email: 'mecanico@auditoria.test', password: CLAVE },
    })
    let refresco = r.cookies.find((c) => c.name === 'gpb_refresco')?.value ?? ''
    for (let i = 0; i < 3; i++) {
      const renovada = await app.inject({
        method: 'POST',
        url: '/api/auth/refrescar',
        payload: {},
        cookies: { gpb_refresco: refresco },
      })
      expect(renovada.statusCode).toBe(200)
      // Cada renovación rota el token: la próxima usa el nuevo.
      refresco = renovada.cookies.find((c) => c.name === 'gpb_refresco')?.value ?? ''
    }

    const { access } = await entrar('gerente@auditoria.test')
    const { datos } = (await pedir(access, 'GET', '/auditoria/ingresos?porPagina=50')).json()
    const delMecanico = datos.filter(
      (i: { usuario: { email: string } }) => i.usuario.email === 'mecanico@auditoria.test',
    )
    expect(delMecanico).toHaveLength(1)
  })
})

describe('los cambios', () => {
  it('dicen quién hizo qué sobre quién', async () => {
    const sistemas = await entrar('sistemas@auditoria.test')
    const { datos: usuarios } = (await pedir(sistemas.access, 'GET', '/usuarios')).json()
    const mecanico = usuarios.find((u: { email: string }) => u.email === 'mecanico@auditoria.test')
    await pedir(sistemas.access, 'POST', `/usuarios/${mecanico.id}/password`)

    const { access } = await entrar('gerente@auditoria.test')
    const { datos } = (await pedir(access, 'GET', '/auditoria/cambios')).json()

    expect(datos[0]).toMatchObject({
      autor: 'Prueba Administrador de sistema',
      sobre: 'el usuario mecanico@auditoria.test',
      accion: 'modificacion',
      detalle: 'Le generó una contraseña nueva',
    })
  })
})

describe('los cambios, contados en palabras', () => {
  it('dicen qué rol se agregó y cuál se quitó, con su nombre', async () => {
    const gerente = await entrar('gerente@auditoria.test')
    const { datos: usuarios } = (await pedir(gerente.access, 'GET', '/usuarios')).json()
    const asesor = usuarios.find((u: { email: string }) => u.email === 'recepcion@auditoria.test')
    const { roles } = (await pedir(gerente.access, 'GET', '/usuarios/opciones')).json()
    const idDe = (nombre: string) => roles.find((r: { nombre: string }) => r.nombre === nombre).id

    await pedir(gerente.access, 'PUT', `/usuarios/${asesor.id}`, {
      nombre: asesor.nombre,
      apellido: 'Asesora',
      rolIds: [idDe('Cajero'), idDe('Mecánico')],
      sucursalIds: asesor.sucursales.map((s: { id: string }) => s.id),
      activo: false,
    })

    const { datos } = (await pedir(gerente.access, 'GET', '/auditoria/cambios')).json()
    expect(datos[0].detalle).toBe(
      'Lo dio de baja, le agregó los roles Cajero y Mecánico, le quitó el rol Asesor de ' +
        'servicios y apellido: «Asesor de servicios» → «Asesora»',
    )
  })
})

describe('las computadoras', () => {
  it('se les pone nombre, y el cambio de nombre queda registrado', async () => {
    const gerente = await entrar('gerente@auditoria.test')

    const r = await pedir(gerente.access, 'PUT', `/auditoria/dispositivos/${gerente.computadora}`, {
      nombre: 'PC de gerencia',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ nombre: 'PC de gerencia', usuarios: ['Prueba Gerente'] })

    const { datos } = (await pedir(gerente.access, 'GET', '/auditoria/cambios')).json()
    expect(datos[0]).toMatchObject({
      sobre: 'la computadora PC de gerencia',
      detalle: 'Nombre: «sin nombre» → «PC de gerencia»',
    })
  })

  it('el administrador de sistema las ve, pero no las renombra', async () => {
    const sistemas = await entrar('sistemas@auditoria.test')

    expect((await pedir(sistemas.access, 'GET', '/auditoria/dispositivos')).statusCode).toBe(200)
    const r = await pedir(
      sistemas.access,
      'PUT',
      `/auditoria/dispositivos/${sistemas.computadora}`,
      { nombre: 'PC del gerente' },
    )
    expect(r.statusCode).toBe(403)
  })
})

describe('sin permiso', () => {
  it('el asesor no ve la auditoría', async () => {
    const { access } = await entrar('asesor@auditoria.test')
    expect((await pedir(access, 'GET', '/auditoria/ingresos')).statusCode).toBe(403)
  })
})
