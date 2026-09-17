import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { crearDb, crearPool, type Db } from './index.ts'
import { ddlAislamiento, ddlAuditoria, ROL_APP, ROL_BACKOFFICE } from './rls/index.ts'

const aqui = dirname(fileURLToPath(import.meta.url))

const PASSWORD_APP = 'test_app'
const PASSWORD_BACKOFFICE = 'test_backoffice'

/**
 * Levanta un Postgres real, migrado y con las políticas aplicadas.
 *
 * Vive en el paquete y no en su carpeta de tests porque lo usan también las pruebas de
 * la API: el aislamiento multi-tenant no se puede verificar contra un mock, y montar
 * dos veces el mismo andamio garantiza que en algún momento se desincronicen.
 */
export interface PostgresDePrueba {
  contenedor: StartedPostgreSqlContainer
  /** Dueño del esquema. Es superusuario, así que ignora RLS: sólo para preparar datos. */
  urlDuenio: string
  poolDuenio: ReturnType<typeof crearPool>
  dbDuenio: Db
  /** El rol de la aplicación: sin BYPASSRLS y sin ser dueño de nada. */
  urlApp: string
  poolApp: ReturnType<typeof crearPool>
  dbApp: Db
  /** El rol del back-office: ve todas las concesionarias, pero sólo en dos tablas. */
  urlBackoffice: string
  poolBackoffice: ReturnType<typeof crearPool>
  dbBackoffice: Db
  cerrar: () => Promise<void>
}

export async function levantarPostgres(): Promise<PostgresDePrueba> {
  const contenedor = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('gpb_test')
    .withUsername('gpb')
    .withPassword('gpb')
    .start()

  const urlDuenio = contenedor.getConnectionUri()
  const poolDuenio = crearPool(urlDuenio)
  const dbDuenio = crearDb(poolDuenio)

  await migrate(dbDuenio, { migrationsFolder: resolve(aqui, '../migrations') })
  await poolDuenio.query(ddlAislamiento())
  await poolDuenio.query(ddlAuditoria(ROL_APP))
  await poolDuenio.query(`alter role ${ROL_APP} with login password '${PASSWORD_APP}'`)
  await poolDuenio.query(
    `alter role ${ROL_BACKOFFICE} with login password '${PASSWORD_BACKOFFICE}'`,
  )

  const urlApp = urlDuenio.replace('gpb:gpb@', `${ROL_APP}:${PASSWORD_APP}@`)
  const poolApp = crearPool(urlApp)
  const dbApp = crearDb(poolApp)

  const urlBackoffice = urlDuenio.replace('gpb:gpb@', `${ROL_BACKOFFICE}:${PASSWORD_BACKOFFICE}@`)
  const poolBackoffice = crearPool(urlBackoffice)
  const dbBackoffice = crearDb(poolBackoffice)

  return {
    contenedor,
    urlDuenio,
    poolDuenio,
    dbDuenio,
    urlApp,
    poolApp,
    dbApp,
    urlBackoffice,
    poolBackoffice,
    dbBackoffice,
    cerrar: async () => {
      await poolBackoffice.end()
      await poolApp.end()
      await poolDuenio.end()
      await contenedor.stop()
    },
  }
}
