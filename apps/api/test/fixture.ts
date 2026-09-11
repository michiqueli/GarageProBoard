import { atajosParaSembrar, ROLES_PREDEFINIDOS } from '@garagetick/core'
import { type Db, sembrarCatalogos } from '@garagetick/db'
import { levantarPostgres, type PostgresDePrueba } from '@garagetick/db/pruebas'
import {
  empresa,
  rol,
  sucursal,
  tenant,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
  vehiculo,
} from '@garagetick/db/schema'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import argon2 from 'argon2'

export const CLAVE = 'clave-de-prueba'

export interface ApiDePrueba {
  app: NestFastifyApplication
  pg: PostgresDePrueba
  cerrar(): Promise<void>
}

/**
 * La API montada contra un Postgres real, con las migraciones y las políticas puestas.
 *
 * Se comparte entre archivos de test para que todos monten **la misma aplicación**: dos
 * andamios distintos terminan siempre desincronizados, y el que se olvida algo pasa
 * tests contra una aplicación que no existe.
 */
export async function levantarApi(): Promise<ApiDePrueba> {
  const pg = await levantarPostgres()

  // Antes de crear el módulo: la fábrica del pool lee estas variables al arrancar.
  process.env.DATABASE_URL_APP = pg.urlApp
  process.env.JWT_SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres'
  process.env.NODE_ENV = 'test'

  await sembrarCatalogos(pg.dbDuenio)

  const { ModuloPrincipal } = await import('../src/app.module.ts')
  const { configurarApp } = await import('../src/arranque.ts')
  const modulo = await Test.createTestingModule({ imports: [ModuloPrincipal] }).compile()

  const app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  // La misma configuración que main.ts.
  await configurarApp(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return {
    app,
    pg,
    cerrar: async () => {
      await app.close()
      await pg.cerrar()
    },
  }
}

export interface Semilla {
  slug: string
  email: string
  sucursales?: string[]
  vehiculos?: Array<{ chasis: string; dominio: string | null }>
}

/** Una concesionaria mínima pero completa: empresa, sucursales, rol, usuario y vehículos. */
export async function sembrarConcesionaria(db: Db, s: Semilla) {
  const nombres = s.sucursales ?? ['Casa Central']

  const [t] = await db.insert(tenant).values({ nombre: s.slug, slug: s.slug }).returning()
  if (!t) throw new Error('sin tenant')

  const [e] = await db
    .insert(empresa)
    .values({
      tenantId: t.id,
      razonSocial: `${s.slug} SAS`,
      // El CUIT es único por tenant, así que cada concesionaria necesita el suyo.
      cuit: `30${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
      condicionIva: 1,
    })
    .returning()
  if (!e) throw new Error('sin empresa')

  const sucursales = await db
    .insert(sucursal)
    .values(nombres.map((nombre) => ({ tenantId: t.id, empresaId: e.id, nombre })))
    .returning()

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
      email: s.email,
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

  if (s.vehiculos?.length) {
    await db.insert(vehiculo).values(s.vehiculos.map((v) => ({ tenantId: t.id, ...v })))
  }

  return { tenant: t, empresa: e, sucursales, usuario: u }
}
