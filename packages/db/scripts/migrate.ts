import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { crearDb, crearPool } from '../src/index.ts'
import { ddlAislamiento } from '../src/rls/index.ts'

const aqui = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL. Copiá .env.example a .env en la raíz del repo.')
  process.exit(1)
}

// Este script corre con el usuario dueño del esquema, no con el de la aplicación.
const pool = crearPool(url)
const db = crearDb(pool)

try {
  console.log('› Aplicando migraciones…')
  await migrate(db, { migrationsFolder: resolve(aqui, '../migrations') })

  console.log('› Aplicando políticas de aislamiento…')
  await pool.query(ddlAislamiento())

  console.log('✓ Base al día.')
} catch (error) {
  console.error('✗ Falló la migración:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
