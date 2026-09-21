import { atajosParaSembrar } from '@gpb/core'
import argon2 from 'argon2'
import { and, eq } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  empleado,
  entidadComercial,
  orden,
  rol,
  sucursal,
  tenant,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '../src/schema/index.ts'

/**
 * Completa la concesionaria de ejemplo con las dos cuentas que le faltaban: el **asesor de
 * servicios** y el **cajero**.
 *
 *     pnpm --filter @gpb/db asesor-prueba
 *
 * Existe porque sin un asesor todas las órdenes quedan a nombre del gerente: el asesor de una
 * orden no se elige, sale de la sesión de quien la abrió. Una base de prueba donde el gerente
 * recibió todos los autos no se parece a ninguna concesionaria y confunde al mirar la pantalla.
 *
 * También le pasa las órdenes ya abiertas al asesor, por el mismo motivo.
 *
 * Sólo en desarrollo, y no pisa nada: la cuenta que ya existe se saltea.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('No se siembran datos de prueba en producción.')
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL.')
  process.exit(1)
}

const pool = crearPool(url)
const db = crearDb(pool)

const CUENTAS = [
  {
    email: 'asesor@litoral.test',
    nombre: 'Andrea',
    apellido: 'Villalba',
    rol: 'Asesor de servicios',
  },
  { email: 'caja@litoral.test', nombre: 'Laura', apellido: 'Paz', rol: 'Cajero' },
]

async function sembrar(db: Db) {
  const [t] = await db.select().from(tenant).where(eq(tenant.slug, 'litoral')).limit(1)
  if (!t) {
    console.error('No existe la concesionaria «litoral». Corré primero: pnpm db:sembrar')
    return
  }
  const tenantId = t.id

  const roles = await db.select().from(rol).where(eq(rol.tenantId, tenantId))
  const sucursales = await db.select().from(sucursal).where(eq(sucursal.tenantId, tenantId))

  let creadas = 0
  for (const datos of CUENTAS) {
    const [ya] = await db.select().from(usuario).where(eq(usuario.email, datos.email)).limit(1)
    if (ya) continue

    const [u] = await db
      .insert(usuario)
      .values({
        tenantId,
        email: datos.email,
        hashPassword: await argon2.hash(process.env.ADMIN_PASSWORD ?? 'garageproboard', {
          type: argon2.argon2id,
        }),
        nombre: datos.nombre,
        apellido: datos.apellido,
      })
      .returning()
    if (!u) throw new Error(`No se pudo crear ${datos.email}.`)

    const suRol = roles.find((r) => r.nombre === datos.rol)
    if (suRol) await db.insert(usuarioRol).values({ tenantId, usuarioId: u.id, rolId: suRol.id })
    if (sucursales.length) {
      await db
        .insert(usuarioSucursal)
        .values(sucursales.map((s) => ({ tenantId, usuarioId: u.id, sucursalId: s.id })))
    }
    await db.insert(usuarioConfig).values({ tenantId, usuarioId: u.id })
    await db.insert(usuarioAtajo).values(
      atajosParaSembrar().map((a) => ({
        tenantId,
        usuarioId: u.id,
        ambito: a.ambito,
        accion: a.accion,
        tecla: a.tecla,
      })),
    )

    // Si ya está como empleada en el personal, se le engancha el legajo.
    const [suLegajo] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .where(
        and(
          eq(empleado.tenantId, tenantId),
          eq(entidadComercial.nombre, datos.nombre),
          eq(entidadComercial.apellido, datos.apellido),
        ),
      )
      .limit(1)
    if (suLegajo) {
      await db.update(usuario).set({ empleadoId: suLegajo.id }).where(eq(usuario.id, u.id))
    }

    creadas++
    console.log(`✓ ${datos.email} — ${datos.rol}`)
  }

  if (creadas === 0) console.log('› Las dos cuentas ya existían. No se tocó nada.')

  // Las órdenes abiertas por el gerente pasan al asesor: recibir autos es su trabajo, y así la
  // pantalla cuenta algo verosímil.
  const [asesora] = await db
    .select()
    .from(usuario)
    .where(eq(usuario.email, 'asesor@litoral.test'))
    .limit(1)
  const [gerente] = await db
    .select()
    .from(usuario)
    .where(eq(usuario.email, 'admin@litoral.test'))
    .limit(1)

  if (asesora && gerente) {
    const movidas = await db
      .update(orden)
      .set({ asesorId: asesora.id })
      .where(and(eq(orden.tenantId, tenantId), eq(orden.asesorId, gerente.id)))
      .returning({ id: orden.id })
    if (movidas.length) console.log(`✓ ${movidas.length} órdenes ahora las recibió el asesor.`)
  }
}

try {
  await sembrar(db)
} finally {
  await pool.end()
}
