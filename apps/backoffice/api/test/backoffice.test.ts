import 'reflect-metadata'
import { sembrarCatalogos } from '@gpb/db'
import { levantarPostgres, type PostgresDePrueba } from '@gpb/db/pruebas'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import argon2 from 'argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * El back-office de punta a punta: pedido HTTP, cookie de sesión, el rol de Postgres del
 * back-office y lo que queda escrito en la base.
 */

const CLAVE = 'clave-de-operador'

let pg: PostgresDePrueba
let app: NestFastifyApplication

beforeAll(async () => {
  pg = await levantarPostgres()
  process.env.DATABASE_URL_BACKOFFICE = pg.urlBackoffice
  process.env.NODE_ENV = 'test'
  await sembrarCatalogos(pg.dbDuenio)

  const hash = await argon2.hash(CLAVE, { type: argon2.argon2id })
  await pg.poolDuenio.query(
    `insert into operador (email, hash_password, nombre) values
       ('ops@gpb.test', $1, 'Operaciones'),
       ('baja@gpb.test', $1, 'Dado de baja')`,
    [hash],
  )

  const { ModuloPrincipal } = await import('../src/app.module.ts')
  const { configurarApp } = await import('../src/arranque.ts')
  const modulo = await Test.createTestingModule({ imports: [ModuloPrincipal] }).compile()
  app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })
  await configurarApp(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
}, 240_000)

afterAll(async () => {
  await app?.close()
  await pg?.cerrar()
})

async function entrar(email = 'ops@gpb.test'): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  const cookie = r.cookies.find((c) => c.name === 'gpb_bo_sesion')
  if (!cookie) throw new Error('sin cookie de sesión')
  return `gpb_bo_sesion=${cookie.value}`
}

function pedir(cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { cookie },
    ...(payload ? { payload } : {}),
  })
}

const ALTA = {
  nombre: 'Automotores de Prueba',
  slug: 'prueba',
  modulos: ['nucleo', 'servicios', 'contable'],
  empresa: { razonSocial: 'Automotores de Prueba SAS', cuit: '30712345671', condicionIva: 1 },
  sucursal: 'Casa Central',
  gerente: { email: 'Gerente@Prueba.test', nombre: 'Ana', apellido: 'Sosa' },
}

async function contar(tabla: string): Promise<number> {
  const { rows } = await pg.poolDuenio.query<{ n: string }>(`select count(*) as n from ${tabla}`)
  return Number(rows[0]?.n)
}

describe('la sesión del operador', () => {
  it('con la contraseña equivocada no entra', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email: 'ops@gpb.test', password: 'otra' },
    })
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('CREDENCIALES_INVALIDAS')
  })

  it('la sesión viaja en una cookie que el JavaScript no puede leer', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email: 'ops@gpb.test', password: CLAVE },
    })
    const cookie = r.cookies.find((c) => c.name === 'gpb_bo_sesion')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Strict')
    // Y el token no aparece en el cuerpo.
    expect(JSON.stringify(r.json())).not.toContain(cookie?.value)
  })

  it('sin sesión no se ve nada', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/concesionarias' })
    expect(r.statusCode).toBe(401)
    expect(r.json()).toMatchObject({ defined: true, code: 'NO_AUTENTICADO' })
  })

  it('cerrar la sesión la anula del lado del servidor', async () => {
    const cookie = await entrar()
    expect((await pedir(cookie, 'GET', '/auth/yo')).json().nombre).toBe('Operaciones')

    await pedir(cookie, 'POST', '/auth/cerrar')
    // Aunque alguien se haya guardado la cookie, ya no sirve.
    expect((await pedir(cookie, 'GET', '/auth/yo')).statusCode).toBe(401)
  })

  it('dar de baja a un operador le corta la sesión en el acto', async () => {
    const cookie = await entrar('baja@gpb.test')
    await pg.poolDuenio.query(`update operador set activo = false where email = 'baja@gpb.test'`)
    expect((await pedir(cookie, 'GET', '/auth/yo')).statusCode).toBe(401)
  })
})

describe('el alta de una concesionaria', () => {
  it('crea todo lo que hace falta para que el gerente entre', async () => {
    const cookie = await entrar()
    const r = await pedir(cookie, 'POST', '/concesionarias', ALTA)

    expect(r.statusCode).toBe(201)
    const { concesionaria, passwordInicial } = r.json()
    expect(concesionaria.modulos).toEqual(['nucleo', 'contable', 'servicios'])

    // El gerente existe, con el correo en minúsculas, y la contraseña devuelta es la suya.
    const { rows } = await pg.poolDuenio.query<{ hash_password: string; tenant_id: string }>(
      `select * from autenticar_usuario('gerente@prueba.test')`,
    )
    expect(rows[0]?.tenant_id).toBe(concesionaria.id)
    expect(await argon2.verify(rows[0]?.hash_password ?? '', passwordInicial)).toBe(true)

    // Con su rol, su sucursal, sus preferencias y su mapa de teclas.
    const { rows: detalle } = await pg.poolDuenio.query(
      `select r.nombre as rol,
              (select count(*) from usuario_sucursal us where us.usuario_id = u.id) as sucursales,
              (select count(*) from usuario_config uc where uc.usuario_id = u.id) as config,
              (select count(*) from usuario_atajo ua where ua.usuario_id = u.id) as atajos
         from usuario u
         join usuario_rol ur on ur.usuario_id = u.id
         join rol r on r.id = ur.rol_id
        where u.email = 'gerente@prueba.test'`,
    )
    expect(detalle[0]).toMatchObject({ rol: 'Gerente', sucursales: '1', config: '1' })
    expect(Number(detalle[0]?.atajos)).toBeGreaterThan(0)

    // Y todos los roles predefinidos, no sólo el suyo.
    const { rows: roles } = await pg.poolDuenio.query(
      `select count(*) as n from rol where tenant_id = $1`,
      [concesionaria.id],
    )
    expect(Number(roles[0]?.n)).toBeGreaterThan(1)
  })

  it('queda en el historial, con quién la dio de alta', async () => {
    const cookie = await entrar()
    const [creada] = (await pedir(cookie, 'GET', '/concesionarias')).json().datos
    const detalle = (await pedir(cookie, 'GET', `/concesionarias/${creada.id}`)).json()

    expect(detalle.historial[0]).toMatchObject({
      accion: 'alta_concesionaria',
      operador: 'Operaciones',
    })
  })

  it('rechaza una combinación de módulos que no funciona, y dice por qué', async () => {
    const cookie = await entrar()
    const r = await pedir(cookie, 'POST', '/concesionarias', {
      ...ALTA,
      slug: 'sin-nucleo',
      modulos: ['servicios'],
    })

    expect(r.statusCode).toBe(422)
    expect(r.json().data.motivos).toEqual(['Servicios necesita Núcleo'])
  })

  it('un correo que ya existe no deja nada a medias', async () => {
    const cookie = await entrar()
    const antes = await contar('tenant')

    const r = await pedir(cookie, 'POST', '/concesionarias', { ...ALTA, slug: 'otra' })

    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('EMAIL_DUPLICADO')
    // Todo o nada: ni la concesionaria, ni sus módulos, ni su empresa.
    expect(await contar('tenant')).toBe(antes)
  })

  it('un identificador repetido tampoco', async () => {
    const cookie = await entrar()
    const r = await pedir(cookie, 'POST', '/concesionarias', {
      ...ALTA,
      gerente: { ...ALTA.gerente, email: 'otro@prueba.test' },
    })
    expect(r.json().code).toBe('SLUG_DUPLICADO')
  })
})

describe('los módulos de una concesionaria', () => {
  async function laDePrueba(cookie: string): Promise<string> {
    const { datos } = (await pedir(cookie, 'GET', '/concesionarias')).json()
    return datos.find((d: { slug: string }) => d.slug === 'prueba').id
  }

  it('se apaga uno, con motivo, y deja de estar vigente', async () => {
    const cookie = await entrar()
    const id = await laDePrueba(cookie)

    const r = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/contable`, {
      activo: false,
      vigenteHasta: null,
      motivo: 'Factura con otro sistema',
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().modulos).toEqual(['nucleo', 'servicios'])
    expect(r.json().historial[0]).toMatchObject({
      accion: 'modulo',
      motivo: 'Factura con otro sistema',
    })
  })

  it('sin motivo no se toca', async () => {
    const cookie = await entrar()
    const id = await laDePrueba(cookie)

    const r = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/contable`, {
      activo: true,
      vigenteHasta: null,
      motivo: '',
    })
    expect(r.statusCode).toBe(400)
  })

  it('no se apaga el núcleo de una concesionaria que usa servicios', async () => {
    const cookie = await entrar()
    const id = await laDePrueba(cookie)

    const r = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/nucleo`, {
      activo: false,
      vigenteHasta: null,
      motivo: 'Prueba',
    })

    expect(r.statusCode).toBe(422)
    expect(r.json().data.motivos).toEqual(['Servicios necesita Núcleo'])
    // Y no quedó escrito: el rechazo deshace la transacción.
    const detalle = (await pedir(cookie, 'GET', `/concesionarias/${id}`)).json()
    expect(detalle.modulos).toContain('nucleo')
  })

  it('apagar el núcleo pidiéndolo apaga todo lo que depende de él, y lo deja escrito', async () => {
    const cookie = await entrar()
    const r = await pedir(cookie, 'POST', '/concesionarias', {
      ...ALTA,
      slug: 'cascada',
      gerente: { ...ALTA.gerente, email: 'cascada@prueba.test' },
    })
    const id = r.json().concesionaria.id

    const apagada = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/nucleo`, {
      activo: false,
      vigenteHasta: null,
      motivo: 'Baja del servicio',
      apagarDependientes: true,
    })

    expect(apagada.statusCode).toBe(200)
    expect(apagada.json().modulos).toEqual([])
    // Uno por módulo en el historial, y los arrastrados dicen por qué cayeron.
    const motivos = apagada.json().historial.map((h: { motivo: string }) => h.motivo)
    expect(motivos).toContain('Baja del servicio')
    expect(motivos).toContain('Baja del servicio (se apagó con Núcleo)')
    expect(motivos.filter((m: string | null) => m?.startsWith('Baja del servicio'))).toHaveLength(3)
  })

  it('se contrata uno nuevo con vencimiento: una prueba de treinta días', async () => {
    const cookie = await entrar()
    const id = await laDePrueba(cookie)
    const enTreintaDias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const r = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/repuestos`, {
      activo: true,
      vigenteHasta: enTreintaDias,
      motivo: 'Prueba de treinta días',
    })

    expect(r.statusCode).toBe(200)
    const repuestos = r
      .json()
      .contratos.find((c: { modulo: string }) => c.modulo === 'repuestos').contrato
    expect(repuestos).toMatchObject({ activo: true, vigente: true, vigenteHasta: enTreintaDias })
  })

  it('un vencimiento anterior al inicio se rechaza', async () => {
    const cookie = await entrar()
    const id = await laDePrueba(cookie)

    const r = await pedir(cookie, 'PUT', `/concesionarias/${id}/modulos/repuestos`, {
      activo: true,
      vigenteHasta: '2020-01-01T00:00:00.000Z',
      motivo: 'Error de fecha',
    })
    expect(r.json().code).toBe('VIGENCIA_INVALIDA')
  })
})

describe('suspender una concesionaria', () => {
  it('la marca inactiva y lo deja escrito', async () => {
    const cookie = await entrar()
    const { datos } = (await pedir(cookie, 'GET', '/concesionarias')).json()
    const id = datos[0].id

    const r = await pedir(cookie, 'POST', `/concesionarias/${id}/estado`, {
      activo: false,
      motivo: 'Falta de pago',
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().activo).toBe(false)
    // Los datos siguen ahí: suspender no es borrar.
    expect(r.json().modulos.length).toBeGreaterThan(0)

    const detalle = (await pedir(cookie, 'GET', `/concesionarias/${id}`)).json()
    expect(detalle.historial[0]).toMatchObject({
      accion: 'suspender_concesionaria',
      motivo: 'Falta de pago',
    })
  })

  it('una concesionaria que no existe da 404', async () => {
    const cookie = await entrar()
    const r = await pedir(
      cookie,
      'POST',
      '/concesionarias/00000000-0000-4000-8000-000000000000/estado',
      {
        activo: false,
        motivo: 'No existe',
      },
    )
    expect(r.statusCode).toBe(404)
  })
})
