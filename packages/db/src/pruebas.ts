import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { crearDb, crearPool, type Db } from './index.ts'
import { ddlAislamiento, ROL_APP } from './rls/index.ts'

const aqui = dirname(fileURLToPath(import.meta.url))

const PASSWORD_APP = 'test_app'

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
  cerrar: () => Promise<void>
}

export async function levantarPostgres(): Promise<PostgresDePrueba> {
  const contenedor = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('garagetick_test')
    .withUsername('garagetick')
    .withPassword('garagetick')
    .start()

  const urlDuenio = contenedor.getConnectionUri()
  const poolDuenio = crearPool(urlDuenio)
  const dbDuenio = crearDb(poolDuenio)

  await migrate(dbDuenio, { migrationsFolder: resolve(aqui, '../migrations') })
  await poolDuenio.query(ddlAislamiento())
  await poolDuenio.query(`alter role ${ROL_APP} with login password '${PASSWORD_APP}'`)

  const urlApp = urlDuenio.replace('garagetick:garagetick@', `${ROL_APP}:${PASSWORD_APP}@`)
  const poolApp = crearPool(urlApp)
  const dbApp = crearDb(poolApp)

  return {
    contenedor,
    urlDuenio,
    poolDuenio,
    dbDuenio,
    urlApp,
    poolApp,
    dbApp,
    cerrar: async () => {
      await poolApp.end()
      await poolDuenio.end()
      await contenedor.stop()
    },
  }
}
