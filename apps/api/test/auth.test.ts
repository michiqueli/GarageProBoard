import { atajosParaSembrar, ROLES_PREDEFINIDOS } from '@garagepro/core'
import { type Db, sembrarCatalogos } from '@garagepro/db'
import { levantarPostgres, type PostgresDePrueba } from '@garagepro/db/pruebas'
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
} from '@garagepro/db/schema'
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
  await sembrarConcesionaria(pg.dbDuenio, 'litoral', 'admin@litoral.test', [
    'Casa Central',
    'Rafaela',
  ])
  await sembrarConcesionaria(pg.dbDuenio, 'del-norte', 'admin@norte.test')

  const { ModuloPrincipal } = await import('../src/app.module.ts')
  const { configurarApp } = await import('../src/arranque.ts')
  const modulo = await Test.createTestingModule({ imports: [ModuloPrincipal] }).compile()

  app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  // La misma configuración que main.ts: si el test montara una app distinta, estaría
  // probando otra cosa.
  await configurarApp(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
}, 180_000)

afterAll(async () => {
  await app?.close()
  await pg?.cerrar()
})

/** Inicio de sesión con el token en el cuerpo: el camino de un cliente sin cookies. */
function iniciar(email: string, password = CLAVE, sucursalId?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password, entrega: 'cuerpo', ...(sucursalId ? { sucursalId } : {}) },
  })
}

/** Inicio de sesión como lo hace un navegador: el token va en la cookie. */
function iniciarEnNavegador(email: string, password = CLAVE) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password },
  })
}

describe('inicio de sesión', () => {
  it('devuelve todo lo que el front necesita para arrancar', async () => {
    const r = await iniciar('admin@litoral.test')
    expect(r.statusCode).toBe(200)

    const s = r.json()
    expect(s.usuario.email).toBe('admin@litoral.test')
    expect(s.tenant.slug).toBe('litoral')
    expect(s.sucursalActiva.nombre).toBe('Casa Central')
    expect(s.sucursales).toHaveLength(2)
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
    const r = await iniciar('admin@litoral.test', 'incorrecta')
    expect(r.statusCode).toBe(401)
    expect(r.json().code).toBe('CREDENCIALES_INVALIDAS')
  })

  it('dice lo mismo si el correo no existe que si la clave está mal', async () => {
    // Distinguirlos le confirma a quien prueba direcciones cuáles están registradas.
    const inexistente = await iniciar('nadie@litoral.test')
    const claveMala = await iniciar('admin@litoral.test', 'incorrecta')

    expect(inexistente.statusCode).toBe(claveMala.statusCode)
    expect(inexistente.json().code).toBe(claveMala.json().code)
    expect(inexistente.json().message).toBe(claveMala.json().message)
  })

  it('el correo determina la concesionaria, sin preguntarla', async () => {
    // Es la razón de que el correo sea único en todo el sistema: preguntarle a alguien
    // dónde trabaja antes de dejarlo entrar es hacerle recordar algo que ya sabemos.
    const litoral = await iniciar('admin@litoral.test')
    const norte = await iniciar('admin@norte.test')

    expect(litoral.json().tenant.slug).toBe('litoral')
    expect(norte.json().tenant.slug).toBe('del-norte')
    expect(litoral.json().tenant.id).not.toBe(norte.json().tenant.id)
  })
})

describe('elección de sucursal', () => {
  it('devuelve todas las sucursales del usuario y ninguna predeterminada', async () => {
    // Con más de una y sin predeterminada, la aplicación pregunta a cuál entrar. La
    // sucursal no es cosmética: define desde qué punto de venta se factura.
    const s = (await iniciar('admin@litoral.test')).json()

    expect(s.sucursales.map((x: { nombre: string }) => x.nombre).sort()).toEqual([
      'Casa Central',
      'Rafaela',
    ])
    expect(s.config.sucursalPredeterminadaId).toBeNull()
  })

  it('entra directo a la sucursal pedida', async () => {
    const primera = (await iniciar('admin@litoral.test')).json()
    const rafaela = primera.sucursales.find((x: { nombre: string }) => x.nombre === 'Rafaela')

    const s = (await iniciar('admin@litoral.test', CLAVE, rafaela.id)).json()
    expect(s.sucursalActiva.nombre).toBe('Rafaela')
  })

  it('cambia de sucursal sin volver a autenticarse', async () => {
    const { refresh, sucursales, sucursalActiva } = (await iniciar('admin@litoral.test')).json()
    const otra = sucursales.find((x: { id: string }) => x.id !== sucursalActiva.id)

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/sucursal',
      payload: { refresh, sucursalId: otra.id },
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().sucursalActiva.id).toBe(otra.id)
  })
})

describe('rotación del token de refresco', () => {
  it('cada refresco emite uno nuevo y anula el anterior', async () => {
    const { refresh } = (await iniciar('admin@litoral.test')).json()

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
    const { refresh: original } = (await iniciar('admin@litoral.test')).json()

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
    const { refresh } = (await iniciar('admin@litoral.test')).json()

    const { rows } = await pg.poolDuenio.query<{ hash_refresco: string }>(
      'select hash_refresco from sesion',
    )
    const hashes = rows.map((r) => r.hash_refresco)

    expect(hashes.some((h) => h === refresh)).toBe(false)
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true)
  })

  it('cerrar sesión mata la familia', async () => {
    const { refresh } = (await iniciar('admin@litoral.test')).json()

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

describe('entrega del refresco en un navegador', () => {
  it('no devuelve el token en el cuerpo', async () => {
    // Devolverlo también en el cuerpo anularía la protección entera: un script
    // malicioso que llame a la API leería el token del JSON y se lo llevaría igual.
    const r = await iniciarEnNavegador('admin@litoral.test')

    expect(r.statusCode).toBe(200)
    expect(r.json().access).toBeTruthy()
    expect(r.json().refresh).toBeUndefined()
  })

  it('lo manda en una cookie que el JavaScript no puede leer', async () => {
    const r = await iniciarEnNavegador('admin@litoral.test')
    const galleta = r.cookies.find((c) => c.name === 'gt_refresco')

    expect(galleta).toBeDefined()
    expect(galleta?.httpOnly, 'sin httpOnly, un XSS se lleva 30 días de sesión').toBe(true)
    expect(galleta?.sameSite?.toLowerCase()).toBe('strict')
    // Acotada a las rutas de sesión: no viaja en cada consulta de vehículos.
    expect(galleta?.path).toBe('/api/auth')
  })

  it('refresca leyendo la cookie, sin nada en el cuerpo', async () => {
    const inicio = await iniciarEnNavegador('admin@litoral.test')
    const galleta = inicio.cookies.find((c) => c.name === 'gt_refresco')

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/refrescar',
      cookies: { gt_refresco: String(galleta?.value) },
      payload: {},
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().access).toBeTruthy()
    expect(r.json().refresh).toBeUndefined()
    // Y el nuevo vuelve por el mismo camino.
    expect(r.cookies.find((c) => c.name === 'gt_refresco')?.value).not.toBe(galleta?.value)
  })

  it('sin cookie ni cuerpo, no hay refresco posible', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/refrescar', payload: {} })
    expect(r.statusCode).toBe(401)
  })

  it('cerrar sesión le saca la cookie al navegador', async () => {
    const inicio = await iniciarEnNavegador('admin@litoral.test')
    const galleta = inicio.cookies.find((c) => c.name === 'gt_refresco')

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/cerrar',
      cookies: { gt_refresco: String(galleta?.value) },
      payload: {},
    })

    expect(r.json().cerrada).toBe(true)
    const borrada = r.cookies.find((c) => c.name === 'gt_refresco')
    expect(borrada?.value).toBe('')
  })
})

describe('rutas protegidas', () => {
  it('sin token no se entra', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/auth/yo' })
    expect(r.statusCode).toBe(401)
  })

  it('con token se devuelve la sesión, sin los tokens adentro', async () => {
    const { access } = (await iniciar('admin@litoral.test')).json()

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
    const { refresh } = (await iniciar('admin@litoral.test')).json()

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
async function sembrarConcesionaria(
  db: Db,
  slug: string,
  email: string,
  nombresSucursal: string[] = ['Casa Central'],
) {
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

  const sucursales = await db
    .insert(sucursal)
    .values(nombresSucursal.map((nombre) => ({ tenantId: t.id, empresaId: e.id, nombre })))
    .returning()
  const s = sucursales[0]
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
  await db
    .insert(usuarioSucursal)
    .values(sucursales.map((x) => ({ tenantId: t.id, usuarioId: u.id, sucursalId: x.id })))
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
