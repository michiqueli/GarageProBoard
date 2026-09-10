import { crearPool } from '../src/index.ts'
import { ROL_APP } from '../src/rls/index.ts'

/**
 * Le da credenciales de login al rol de aplicación que crea la migración.
 *
 * El reparto es deliberado: la migración define el rol y sus permisos y va
 * versionada; la contraseña viene del entorno y nunca entra al repositorio.
 */
const url = process.env.DATABASE_URL
const password = process.env.APP_DB_PASSWORD

if (!url || !password) {
  console.error('Faltan DATABASE_URL y/o APP_DB_PASSWORD.')
  process.exit(1)
}

const pool = crearPool(url)

try {
  // La contraseña no puede ir como parámetro en un ALTER ROLE, así que se escapa
  // con el cuoteo de literales del propio Postgres.
  const { rows } = await pool.query<{ literal: string }>('select quote_literal($1) as literal', [
    password,
  ])
  const literal = rows[0]?.literal
  if (!literal) throw new Error('No se pudo escapar la contraseña.')

  await pool.query(`alter role ${ROL_APP} with login password ${literal}`)
  console.log(`✓ El rol ${ROL_APP} ya puede conectarse.`)
} catch (error) {
  console.error('✗ No se pudo configurar el rol de aplicación:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
