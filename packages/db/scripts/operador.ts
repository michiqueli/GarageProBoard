import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { crearDb, crearPool } from '../src/index.ts'
import { operador } from '../src/schema/index.ts'

/**
 * Da de alta un operador del back-office.
 *
 *     pnpm db:operador <correo> "<nombre>"
 *
 * Es un script y no una pantalla a propósito: si el panel pudiera crear operadores, quien
 * se lleve una sesión se daría a sí mismo un acceso que no se puede cortar cerrándola.
 *
 * La contraseña se genera acá y se muestra **una sola vez**. No se acepta por argumento
 * para que no quede en el historial de la terminal.
 */
const url = process.env.DATABASE_URL
const [email, nombre] = process.argv.slice(2)

if (!url || !email || !nombre) {
  console.error('Uso: pnpm db:operador <correo> "<nombre>"  (con DATABASE_URL en el entorno)')
  process.exit(1)
}

const pool = crearPool(url)
const db = crearDb(pool)

try {
  const password = randomBytes(18).toString('base64url')
  await db.insert(operador).values({
    email: email.toLowerCase(),
    nombre,
    hashPassword: await argon2.hash(password, { type: argon2.argon2id }),
  })

  console.log(`✓ Operador ${email.toLowerCase()} creado.`)
  console.log(`  Contraseña: ${password}`)
  console.log('  Guardala ahora: no se vuelve a mostrar.')
} catch (error) {
  console.error('✗ No se pudo crear el operador:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
