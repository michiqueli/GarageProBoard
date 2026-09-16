import { crearPool } from '../src/index.ts'
import { ROL_APP, ROL_BACKOFFICE } from '../src/rls/index.ts'

/**
 * Les da credenciales de login a los roles que crea la migración: el de la API y el del
 * back-office.
 *
 * El reparto es deliberado: la migración define los roles y sus permisos y va
 * versionada; las contraseñas vienen del entorno y nunca entran al repositorio.
 *
 * La del back-office es opcional: un entorno que no corre el back-office no tiene por
 * qué tener ese rol habilitado para conectarse.
 */
const url = process.env.DATABASE_URL
const passwordApp = process.env.APP_DB_PASSWORD
const passwordBackoffice = process.env.BACKOFFICE_DB_PASSWORD

if (!url || !passwordApp) {
  console.error('Faltan DATABASE_URL y/o APP_DB_PASSWORD.')
  process.exit(1)
}

const pool = crearPool(url)

async function habilitar(rol: string, password: string): Promise<void> {
  // La contraseña no puede ir como parámetro en un ALTER ROLE, así que se escapa
  // con el cuoteo de literales del propio Postgres.
  const { rows } = await pool.query<{ literal: string }>('select quote_literal($1) as literal', [
    password,
  ])
  const literal = rows[0]?.literal
  if (!literal) throw new Error('No se pudo escapar la contraseña.')

  await pool.query(`alter role ${rol} with login password ${literal}`)
  console.log(`✓ El rol ${rol} ya puede conectarse.`)
}

try {
  await habilitar(ROL_APP, passwordApp)
  if (passwordBackoffice) {
    await habilitar(ROL_BACKOFFICE, passwordBackoffice)
  } else {
    console.log(`· Sin BACKOFFICE_DB_PASSWORD: ${ROL_BACKOFFICE} queda sin login.`)
  }
} catch (error) {
  console.error('✗ No se pudieron configurar los roles:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
