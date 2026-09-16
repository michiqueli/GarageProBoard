import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Usuarios, por el camino completo. Lo que importa acá no es el alta en sí sino las
 * reglas sobre quién puede darle qué a quién:
 *
 * - **Quien administra usuarios** —gerente, administrador de sistema— asigna cualquier
 *   rol y modifica a cualquiera, menos a sí mismo.
 * - **Quien sólo da de alta usuarios** no da lo que no tiene, ni toca a quien tiene más.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let semilla: Awaited<ReturnType<typeof sembrarConcesionaria>>

beforeAll(async () => {
  api = await levantarApi()
  app = api.app

  semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'usuarios',
    email: 'gerente@usuarios.test',
    sucursales: ['Casa Central', 'Rafaela'],
    otros: [
      { email: 'sistemas@usuarios.test', rol: 'Administrador de sistema' },
      { email: 'altas@usuarios.test', rol: 'Encargado de altas' },
      { email: 'mecanico@usuarios.test', rol: 'Mecánico' },
      { email: 'asesor@usuarios.test', rol: 'Asesor de servicios' },
    ],
    // Un rol armado por la concesionaria: da de alta usuarios, pero no los administra.
    rolesPropios: [
      {
        nombre: 'Encargado de altas',
        habilidades: [{ action: ['ver', 'crear', 'editar'], subject: 'Usuario' }],
      },
    ],
  })
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

async function entrar(email: string, password = CLAVE) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json() as { access: string; refresh: string }
}

function pedir(access: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

const rolId = (nombre: string) => {
  const encontrado = semilla.roles.find((r) => r.nombre === nombre)
  if (!encontrado) throw new Error(`No existe el rol ${nombre}`)
  return encontrado.id
}
const centralId = () => semilla.sucursales[0]?.id ?? ''

async function idDe(access: string, email: string): Promise<string> {
  const { datos } = (await pedir(access, 'GET', '/usuarios')).json()
  return datos.find((u: { email: string }) => u.email === email).id
}

function nuevo(email: string, roles: string[]) {
  return {
    email,
    nombre: 'Nuevo',
    apellido: 'Usuario',
    rolIds: roles.map(rolId),
    sucursalIds: [centralId()],
  }
}

describe('el gerente administra usuarios', () => {
  it('ve a todos, y a sí mismo como no editable', async () => {
    const { access } = await entrar('gerente@usuarios.test')
    const { datos } = (await pedir(access, 'GET', '/usuarios')).json()

    const yo = datos.find((u: { email: string }) => u.email === 'gerente@usuarios.test')
    const mecanico = datos.find((u: { email: string }) => u.email === 'mecanico@usuarios.test')
    expect(yo.editable).toBe(false)
    expect(mecanico).toMatchObject({ editable: true, roles: [{ nombre: 'Mecánico' }] })
  })

  it('da de alta un usuario que entra con la contraseña que devuelve', async () => {
    const { access } = await entrar('gerente@usuarios.test')
    const r = await pedir(access, 'POST', '/usuarios', nuevo('Nuevo@Usuarios.test', ['Mecánico']))

    expect(r.statusCode).toBe(201)
    const { usuario, passwordInicial } = r.json()
    expect(usuario).toMatchObject({ email: 'nuevo@usuarios.test', roles: [{ nombre: 'Mecánico' }] })

    const sesion = await entrar('nuevo@usuarios.test', passwordInicial)
    const yo = (await pedir(sesion.access, 'GET', '/auth/yo')).json()
    // Con su mapa de teclas: sin esto entraría a una aplicación sin atajos.
    expect(Object.keys(yo.atajos).length).toBeGreaterThan(0)
  })

  it('un correo que ya existe se rechaza sin dejar nada a medias', async () => {
    const { access } = await entrar('gerente@usuarios.test')
    const r = await pedir(access, 'POST', '/usuarios', nuevo('mecanico@usuarios.test', []))

    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('EMAIL_DUPLICADO')
  })

  it('dar de baja corta al usuario con el token que ya tenía', async () => {
    const { access } = await entrar('gerente@usuarios.test')
    const baja = await pedir(access, 'POST', '/usuarios', nuevo('baja@usuarios.test', ['Mecánico']))
    const { usuario, passwordInicial } = baja.json()
    const suya = await entrar('baja@usuarios.test', passwordInicial)

    const r = await pedir(access, 'PUT', `/usuarios/${usuario.id}`, {
      nombre: 'Nuevo',
      apellido: 'Usuario',
      rolIds: [rolId('Mecánico')],
      sucursalIds: [centralId()],
      activo: false,
    })
    expect(r.statusCode).toBe(200)

    expect((await pedir(suya.access, 'GET', '/auth/yo')).statusCode).toBe(401)
    const renovar = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh: suya.refresh },
    })
    expect(renovar.statusCode).toBe(401)
  })

  it('queda en la auditoría, sin la contraseña', async () => {
    const { rows } = await api.pg.poolDuenio.query(
      `select accion, datos_despues from auditoria where tabla = 'usuario' order by creado_en`,
    )
    expect(rows.map((r) => r.accion)).toEqual(expect.arrayContaining(['alta', 'baja']))
    expect(JSON.stringify(rows)).not.toMatch(/argon2|hash/)
  })
})

describe('el administrador de sistema puede todo, menos tocarse a sí mismo', () => {
  it('ve todos los roles como asignables', async () => {
    const { access } = await entrar('sistemas@usuarios.test')
    const { roles } = (await pedir(access, 'GET', '/usuarios/opciones')).json()
    expect(roles.every((r: { leFalta: string[] }) => r.leFalta.length === 0)).toBe(true)
  })

  it('crea un gerente, y le puede generar una contraseña nueva', async () => {
    const { access } = await entrar('sistemas@usuarios.test')
    const creado = await pedir(
      access,
      'POST',
      '/usuarios',
      nuevo('gerente2@usuarios.test', ['Gerente']),
    )
    expect(creado.statusCode).toBe(201)

    const r = await pedir(access, 'POST', `/usuarios/${creado.json().usuario.id}/password`)
    expect(r.statusCode).toBe(200)
  })

  it('pero no se pone roles a sí mismo', async () => {
    const { access } = await entrar('sistemas@usuarios.test')
    const yo = await idDe(access, 'sistemas@usuarios.test')

    const r = await pedir(access, 'PUT', `/usuarios/${yo}`, {
      nombre: 'Prueba',
      apellido: 'Sistemas',
      rolIds: [rolId('Administrador de sistema'), rolId('Gerente')],
      sucursalIds: [centralId()],
      activo: true,
    })
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('ES_USTED')
  })
})

describe('quien sólo da de alta usuarios no da lo que no tiene', () => {
  it('las opciones dicen qué roles no puede asignar y por qué', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const { roles } = (await pedir(access, 'GET', '/usuarios/opciones')).json()

    const gerente = roles.find((r: { nombre: string }) => r.nombre === 'Gerente')
    const propio = roles.find((r: { nombre: string }) => r.nombre === 'Encargado de altas')
    expect(gerente.leFalta).toEqual(['administrar todo el sistema'])
    expect(propio.leFalta).toEqual([])
  })

  it('no puede crear un gerente', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const r = await pedir(access, 'POST', '/usuarios', nuevo('intruso@usuarios.test', ['Gerente']))

    expect(r.statusCode).toBe(403)
    expect(r.json()).toMatchObject({
      code: 'ROL_NO_OTORGABLE',
      data: { rol: 'Gerente', leFalta: ['administrar todo el sistema'] },
    })
  })

  it('ni un mecánico: con esa cuenta vería las órdenes que él no ve', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const r = await pedir(access, 'POST', '/usuarios', nuevo('otro@usuarios.test', ['Mecánico']))
    expect(r.json().code).toBe('ROL_NO_OTORGABLE')
  })

  it('pero sí un usuario con su mismo rol, o sin rol', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const r = await pedir(access, 'POST', '/usuarios', nuevo('ayudante@usuarios.test', []))
    expect(r.statusCode).toBe(201)
  })
})

describe('quien sólo da de alta usuarios no toca a quien tiene más', () => {
  it('su nombre sí lo puede corregir', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const yo = await idDe(access, 'altas@usuarios.test')
    const { datos } = (await pedir(access, 'GET', '/usuarios')).json()
    const actual = datos.find((u: { id: string }) => u.id === yo)

    const r = await pedir(access, 'PUT', `/usuarios/${yo}`, {
      nombre: 'Juana',
      apellido: 'Pérez',
      rolIds: actual.roles.map((x: { id: string }) => x.id),
      sucursalIds: actual.sucursales.map((x: { id: string }) => x.id),
      activo: true,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().nombre).toBe('Juana')
  })

  it('no le puede generar una contraseña al gerente: se quedaría con su cuenta', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const gerente = await idDe(access, 'gerente@usuarios.test')

    const r = await pedir(access, 'POST', `/usuarios/${gerente}/password`)
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('USUARIO_CON_MAS_PERMISOS')
  })

  it('ni dar de baja a un asesor', async () => {
    const { access } = await entrar('altas@usuarios.test')
    const asesor = await idDe(access, 'asesor@usuarios.test')

    const r = await pedir(access, 'PUT', `/usuarios/${asesor}`, {
      nombre: 'Prueba',
      apellido: 'Asesor',
      rolIds: [],
      sucursalIds: [centralId()],
      activo: false,
    })
    expect(r.json().code).toBe('USUARIO_CON_MAS_PERMISOS')
  })
})

describe('una contraseña nueva', () => {
  it('cierra las sesiones abiertas del usuario', async () => {
    const { access } = await entrar('gerente@usuarios.test')
    const mecanico = await entrar('mecanico@usuarios.test')
    const id = await idDe(access, 'mecanico@usuarios.test')

    const r = await pedir(access, 'POST', `/usuarios/${id}/password`)
    expect(r.statusCode).toBe(200)

    const renovar = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh: mecanico.refresh },
    })
    expect(renovar.statusCode).toBe(401)
    await entrar('mecanico@usuarios.test', r.json().passwordInicial)
  })
})

describe('sin permiso', () => {
  it('el asesor, que atiende el mostrador, no ve la lista de usuarios', async () => {
    const { access } = await entrar('asesor@usuarios.test')
    const r = await pedir(access, 'GET', '/usuarios')
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('SIN_PERMISO')
  })
})
