import { atajosParaSembrar, ROLES_PREDEFINIDOS } from '@garagepro/core'
import { type Db, sembrarCatalogos } from '@garagepro/db'
import { levantarPostgres, type PostgresDePrueba } from '@garagepro/db/pruebas'
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
} from '@garagepro/db/schema'
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
  /** El gerente: puede todo. */
  email: string
  sucursales?: string[]
  vehiculos?: Array<{ chasis: string; dominio: string | null }>
  /** Más usuarios, cada uno con uno de los roles predefinidos. */
  otros?: Array<{ email: string; rol: string }>
}

/**
 * Una concesionaria mínima pero completa: empresa, sucursales, los roles predefinidos,
 * usuarios y vehículos.
 *
 * Se siembran **todos** los roles y no sólo el de gerente: los permisos se prueban con
 * las mismas reglas que recibe una concesionaria nueva, no con unas escritas para el
 * test que podrían no parecerse.
 */
export async function sembrarConcesionaria(db: Db, s: Semilla) {
  const nombres = s.sucursales ?? ['Casa Central']

  const [t] = await db.insert(tenant).values({ nombre: s.slug, slug: s.slug }).returning()
  if (!t) throw new Error('sin tenant')
  const tenantId = t.id

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

  const roles = await db
    .insert(rol)
    .values(
      ROLES_PREDEFINIDOS.map((r) => ({
        tenantId: t.id,
        nombre: r.nombre,
        habilidades: r.habilidades,
      })),
    )
    .returning()

  async function crearUsuario(email: string, nombreRol: string) {
    const elegido = roles.find((r) => r.nombre === nombreRol)
    if (!elegido) throw new Error(`No existe el rol ${nombreRol}`)

    const [u] = await db
      .insert(usuario)
      .values({
        tenantId,
        email,
        hashPassword: await argon2.hash(CLAVE, { type: argon2.argon2id }),
        nombre: 'Prueba',
        apellido: nombreRol,
      })
      .returning()
    if (!u) throw new Error('sin usuario')

    await db.insert(usuarioRol).values({ tenantId: tenantId, usuarioId: u.id, rolId: elegido.id })
    await db
      .insert(usuarioSucursal)
      .values(sucursales.map((x) => ({ tenantId: tenantId, usuarioId: u.id, sucursalId: x.id })))
    await db.insert(usuarioConfig).values({ tenantId: tenantId, usuarioId: u.id })
    await db.insert(usuarioAtajo).values(
      atajosParaSembrar().map((a) => ({
        tenantId: tenantId,
        usuarioId: u.id,
        ambito: a.ambito,
        accion: a.accion,
        tecla: a.tecla,
      })),
    )
    return u
  }

  const u = await crearUsuario(s.email, 'Gerente')
  for (const otro of s.otros ?? []) await crearUsuario(otro.email, otro.rol)

  if (s.vehiculos?.length) {
    await db.insert(vehiculo).values(s.vehiculos.map((v) => ({ tenantId: t.id, ...v })))
  }

  return { tenant: t, empresa: e, sucursales, roles, usuario: u }
}
