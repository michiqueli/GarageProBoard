import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { crearDb, crearPool, sincronizarRolesPredefinidos } from '../src/index.ts'
import { ddlAislamiento, ddlAuditoria, ROL_APP } from '../src/rls/index.ts'

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

  console.log('› Aplicando la auditoría por trigger…')
  await pool.query(ddlAuditoria(ROL_APP))

  console.log('› Llevando los roles predefinidos a la versión del sistema…')
  const roles = await sincronizarRolesPredefinidos(db)
  for (const linea of roles.creados) console.log(`  + ${linea}`)
  for (const linea of roles.actualizados) console.log(`  ↻ ${linea}`)
  for (const linea of roles.pendientes) {
    console.log(`  · ${linea}: lo editaron, y lo decide la concesionaria en Roles`)
  }
  for (const linea of roles.omitidos) {
    console.log(`  ! ${linea}: no se creó, ya tiene un rol propio con ese nombre`)
  }

  console.log('✓ Base al día.')
} catch (error) {
  console.error('✗ Falló la migración:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
