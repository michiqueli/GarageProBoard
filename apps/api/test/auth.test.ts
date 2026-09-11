import { atajosParaSembrar, ROLES_PREDEFINIDOS } from '@garagetick/core'
import { type Db, sembrarCatalogos } from '@garagetick/db'
import { levantarPostgres, type PostgresDePrueba } from '@garagetick/db/pruebas'
import {
  empresa,
  rol,
  sesion,
  sucursal,
  tenant,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '@garagetick/db/schema'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import argon2 from 'argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let pg: PostgresDePrueba
let app: NestFastifyApplication

const CLAVE = 'clave-de-prueba'

beforeAll(async () => {
  pg = await levantarPostgres()

  // Antes de crear el módulo: la fábrica del pool lee estas variables al arrancar.
  process.env.DATABASE_URL_APP = pg.urlApp
  process.env.JWT_SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres'
  process.env.NODE_ENV = 'test'

  await sembrarCatalogos(pg.dbDuenio)
  await sembrarConcesionaria(pg.dbDuenio, 'litoral', 'admin@litoral.test')
  await sembrarConcesionaria(pg.dbDuenio, 'del-norte', 'admin@norte.test')

  const { ModuloPrincipal } = await import('../src/app.module.ts')
  const modulo = await Test.createTestingModule({ imports: [ModuloPrincipal] }).compile()

  app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  app.setGlobalPrefix('api')
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
}, 180_000)

afterAll(async () => {
  await app?.close()
  await pg?.cerrar()
})

function iniciar(tenantSlug: string, email: string, password = CLAVE, sucursalId?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { tenant: tenantSlug, email, password, ...(sucursalId ? { sucursalId } : {}) },
  })
}

describe('inicio de sesión', () => {
  it('devuelve todo lo que el front necesita para arrancar', async () => {
    const r = await iniciar('litoral', 'admin@litoral.test')
    expect(r.statusCode).toBe(200)

    const s = r.json()
    expect(s.usuario.email).toBe('admin@litoral.test')
    expect(s.tenant.slug).toBe('litoral')
    expect(s.sucursalActiva.nombre).toBe('Casa Central')
    expect(s.sucursales).toHaveLength(1)
    expect(s.habilidades).toEqual([{ action: 'administrar', subject: 'all' }])
    // El mapa completo, sembrado al crear el usuario.
    expect(Object.keys(s.atajos).length).toBe(atajosParaSembrar().length)
    expect(s.atajos['global.guardar']).toBe('F2')
    expect(s.access).toBeTruthy()
    expect(s.refresh).toBeTruthy()
  })

  it('rechaza la contraseña equivocada con 401, no con 500', async () => {
    // Un 500 le dice al monitoreo que el servidor se rompió cuando en realidad
    // alguien escribió mal la contraseña. Ensucia los tableros y esconde lo real.
    const r = await iniciar('litoral', 'admin@litoral.test', 'incorrecta')
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('CREDENCIALES_INVALIDAS')
  })

  it('dice lo mismo si el correo no existe que si la clave está mal', async () => {
    // Distinguirlos le confirma a quien prueba direcciones cuáles están registradas.
    const inexistente = await iniciar('litoral', 'nadie@litoral.test')
    const claveMala = await iniciar('litoral', 'admin@litoral.test', 'incorrecta')

    expect(inexistente.statusCode).toBe(claveMala.statusCode)
    expect(inexistente.json().code).toBe(claveMala.json().code)
    expect(inexistente.json().message).toBe(claveMala.json().message)
  })

  it('un usuario no puede entrar por la puerta de otra concesionaria', async () => {
    const r = await iniciar('del-norte', 'admin@litoral.test')
    expect(r.statusCode).toBe(401)
  })

  it('el tenant inexistente tampoco se distingue', async () => {
    const r = await iniciar('no-existe', 'admin@litoral.test')
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('CREDENCIALES_INVALIDAS')
  })
})

describe('rotación del token de refresco', () => {
  it('cada refresco emite uno nuevo y anula el anterior', async () => {
    const { refresh } = (await iniciar('litoral', 'admin@litoral.test')).json()

    const primero = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh },
    })
    expect(primero.statusCode).toBe(200)
    expect(primero.json().refresh).not.toBe(refresh)

    const reuso = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh },
    })
    expect(reuso.statusCode).toBe(401)
  })

  it('reusar un token rotado anula la familia entera', async () => {
    // La propiedad que hace que la rotación sirva de algo. Si llega un token ya usado,
    // o lo robaron o el legítimo se quedó con una copia vieja: no hay forma de saber
    // cuál es cuál, así que caen los dos y ambos vuelven a autenticarse.
    const { refresh: original } = (await iniciar('litoral', 'admin@litoral.test')).json()

    const r1 = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh: original },
    })
    const vigente = r1.json().refresh

    // El ladrón usa el viejo.
    await app.inject({ method: 'POST', url: '/api/auth/refrescar', payload: { refresh: original } })

    // Y el que era válido también murió.
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh: vigente },
    })
    expect(r2.statusCode).toBe(401)
  })

  it('guarda el hash del token, nunca el token', async () => {
    const { refresh } = (await iniciar('litoral', 'admin@litoral.test')).json()

    const { rows } = await pg.poolDuenio.query<{ hash_refresco: string }>(
      'select hash_refresco from sesion',
    )
    const hashes = rows.map((r) => r.hash_refresco)

    expect(hashes.some((h) => h === refresh)).toBe(false)
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true)
  })

  it('cerrar sesión mata la familia', async () => {
    const { refresh } = (await iniciar('litoral', 'admin@litoral.test')).json()

    const cierre = await app.inject({
      method: 'POST',
      url: '/api/auth/cerrar',
      payload: { refresh },
    })
    expect(cierre.json().cerrada).toBe(true)

    const despues = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      payload: { refresh },
    })
    expect(despues.statusCode).toBe(401)
  })
})

describe('rutas protegidas', () => {
  it('sin token no se entra', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/auth/yo' })
    expect(r.statusCode).toBe(401)
  })

  it('con token se devuelve la sesión, sin los tokens adentro', async () => {
    const { access } = (await iniciar('litoral', 'admin@litoral.test')).json()

    const r = await app.inject({
      method: 'GET',
      url: '/api/auth/yo',
      headers: { authorization: `Bearer ${access}` },
    })

    expect(r.statusCode).toBe(200)
    const s = r.json()
    expect(s.usuario.email).toBe('admin@litoral.test')
    // No tiene sentido reemitir credenciales en una consulta de lectura.
    expect(s.access).toBeUndefined()
    expect(s.refresh).toBeUndefined()
  })

  it('un token inventado no sirve', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/auth/yo',
      headers: { authorization: 'Bearer no.es.un.token' },
    })
    expect(r.statusCode).toBe(401)
  })

  it('el chequeo de vida es público', async () => {
    // Si necesitara sesión no serviría para lo único que existe: que el balanceador
    // sepa si el proceso está sano.
    const r = await app.inject({ method: 'GET', url: '/api/salud' })
    expect(r.statusCode).toBe(200)
  })
})

describe('cambio de sucursal', () => {
  it('rechaza una sucursal a la que el usuario no tiene acceso', async () => {
    const { refresh } = (await iniciar('litoral', 'admin@litoral.test')).json()

    // Una sucursal del otro tenant: ni siquiera debería poder nombrarla.
    const { rows } = await pg.poolDuenio.query<{ id: string }>(
      `select s.id from sucursal s join tenant t on t.id = s.tenant_id where t.slug = 'del-norte'`,
    )
    const ajena = rows[0]?.id
    expect(ajena).toBeTruthy()

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/sucursal',
      payload: { refresh, sucursalId: ajena },
    })
    expect(r.statusCode).toBe(403)
  })
})

/** Una concesionaria mínima pero completa: empresa, sucursal, rol, usuario y su config. */
async function sembrarConcesionaria(db: Db, slug: string, email: string) {
  const [t] = await db.insert(tenant).values({ nombre: slug, slug }).returning()
  if (!t) throw new Error('sin tenant')

  const [e] = await db
    .insert(empresa)
    .values({
      tenantId: t.id,
      razonSocial: `${slug} SAS`,
      cuit: slug === 'litoral' ? '30712345679' : '30719876543',
      condicionIva: 1,
    })
    .returning()
  if (!e) throw new Error('sin empresa')

  const [s] = await db
    .insert(sucursal)
    .values({ tenantId: t.id, empresaId: e.id, nombre: 'Casa Central' })
    .returning()
  if (!s) throw new Error('sin sucursal')

  const plantilla = ROLES_PREDEFINIDOS.find((r) => r.nombre === 'Gerente')
  const [g] = await db
    .insert(rol)
    .values({ tenantId: t.id, nombre: 'Gerente', habilidades: plantilla?.habilidades ?? [] })
    .returning()
  if (!g) throw new Error('sin rol')

  const [u] = await db
    .insert(usuario)
    .values({
      tenantId: t.id,
      email,
      hashPassword: await argon2.hash(CLAVE, { type: argon2.argon2id }),
      nombre: 'Prueba',
      apellido: 'Usuario',
    })
    .returning()
  if (!u) throw new Error('sin usuario')

  await db.insert(usuarioRol).values({ tenantId: t.id, usuarioId: u.id, rolId: g.id })
  await db.insert(usuarioSucursal).values({ tenantId: t.id, usuarioId: u.id, sucursalId: s.id })
  await db.insert(usuarioConfig).values({ tenantId: t.id, usuarioId: u.id })
  await db.insert(usuarioAtajo).values(
    atajosParaSembrar().map((a) => ({
      tenantId: t.id,
      usuarioId: u.id,
      ambito: a.ambito,
      accion: a.accion,
      tecla: a.tecla,
    })),
  )
}

// Referencia usada sólo para tipar la consulta de arriba.
void sesion
