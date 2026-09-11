import { atajosParaSembrar, ROLES_PREDEFINIDOS } from '@garagetick/core'
import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  empresa,
  puntoVenta,
  rol,
  sucursal,
  tenant,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '../src/schema/index.ts'
import {
  CONDICIONES_IVA,
  PROVINCIAS,
  REGLAS_COMPROBANTE,
  TIPOS_COMPROBANTE,
} from '../src/semillas/catalogos.ts'
import { sembrarCatalogos } from '../src/semillas/sembrar.ts'

/**
 * Siembra la base.
 *
 * Es idempotente: se puede correr las veces que haga falta. Los catálogos se insertan
 * ignorando lo que ya está, y la concesionaria de ejemplo sólo se crea si no existe.
 *
 * Corre con el usuario dueño del esquema, que es superusuario y por lo tanto ignora
 * las políticas de RLS. Es el único lugar del sistema donde eso es correcto.
 */

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL.')
  process.exit(1)
}

const pool = crearPool(url)
const db = crearDb(pool)

try {
  await informarCatalogos(db)

  if (process.env.NODE_ENV === 'production') {
    console.log('✓ Catálogos al día. No se siembran datos de ejemplo en producción.')
  } else {
    await sembrarConcesionariaDeEjemplo(db)
  }
} catch (error) {
  console.error('✗ Falló la siembra:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}

async function informarCatalogos(db: Db): Promise<void> {
  console.log('› Catálogos…')
  await sembrarCatalogos(db)
  console.log(
    `  ${PROVINCIAS.length} provincias · ${CONDICIONES_IVA.length} condiciones de IVA · ` +
      `${TIPOS_COMPROBANTE.length} tipos de comprobante · ${REGLAS_COMPROBANTE.length} reglas`,
  )
}

/**
 * Una concesionaria completa para poder trabajar: dos razones sociales, dos sucursales,
 * sus puntos de venta y un usuario con todos los permisos.
 *
 * Es a propósito el caso incómodo y no el fácil — dos SAS bajo el mismo tenant, cada
 * una con su CUIT y su PDV 0001. Si el sistema se desarrolla siempre contra una sola
 * empresa, el día que aparezca la segunda se rompe todo a la vez.
 */
async function sembrarConcesionariaDeEjemplo(db: Db): Promise<void> {
  const SLUG = 'automotores-litoral'

  const [existente] = await db.select().from(tenant).where(eq(tenant.slug, SLUG)).limit(1)
  if (existente) {
    console.log(`✓ La concesionaria de ejemplo ya existe (${SLUG}).`)
    return
  }

  console.log('› Concesionaria de ejemplo…')

  const [t] = await db
    .insert(tenant)
    .values({ nombre: 'Grupo Automotores del Litoral', slug: SLUG })
    .returning()
  if (!t) throw new Error('No se pudo crear el tenant.')

  const [taller] = await db
    .insert(empresa)
    .values({
      tenantId: t.id,
      razonSocial: 'Automotores Litoral SAS',
      nombreFantasia: 'Automotores Litoral',
      cuit: '30712345679',
      condicionIva: 1,
      provinciaCodigo: 12,
      domicilioFiscal: 'Av. Freyre 2350, Santa Fe',
    })
    .returning()

  const [repuestos] = await db
    .insert(empresa)
    .values({
      tenantId: t.id,
      razonSocial: 'Litoral Repuestos SAS',
      cuit: '30719876543',
      condicionIva: 1,
      provinciaCodigo: 12,
      domicilioFiscal: 'Av. Freyre 2360, Santa Fe',
    })
    .returning()

  if (!taller || !repuestos) throw new Error('No se pudieron crear las empresas.')

  const [casaCentral] = await db
    .insert(sucursal)
    .values({
      tenantId: t.id,
      empresaId: taller.id,
      nombre: 'Casa Central',
      domicilio: 'Av. Freyre 2350',
      localidad: 'Santa Fe',
      provinciaCodigo: 12,
    })
    .returning()

  const [rafaela] = await db
    .insert(sucursal)
    .values({
      tenantId: t.id,
      empresaId: taller.id,
      nombre: 'Rafaela',
      domicilio: 'Bv. Roca 1180',
      localidad: 'Rafaela',
      provinciaCodigo: 12,
    })
    .returning()

  const [deposito] = await db
    .insert(sucursal)
    .values({
      tenantId: t.id,
      empresaId: repuestos.id,
      nombre: 'Depósito Central',
      localidad: 'Santa Fe',
      provinciaCodigo: 12,
    })
    .returning()

  if (!casaCentral || !rafaela || !deposito) throw new Error('No se pudieron crear las sucursales.')

  // Los dos PDV 0001 conviven porque la unicidad es por CUIT, no por tenant. Sembrar
  // este caso a propósito es lo que hace que el bug no llegue nunca a producción.
  await db.insert(puntoVenta).values([
    {
      tenantId: t.id,
      empresaId: taller.id,
      sucursalId: casaCentral.id,
      numero: 1,
      uso: 'facturacion',
      predeterminado: true,
    },
    {
      tenantId: t.id,
      empresaId: taller.id,
      sucursalId: casaCentral.id,
      numero: 2,
      uso: 'remito',
      predeterminado: true,
    },
    {
      tenantId: t.id,
      empresaId: taller.id,
      sucursalId: rafaela.id,
      numero: 3,
      uso: 'facturacion',
      predeterminado: true,
    },
    {
      tenantId: t.id,
      empresaId: repuestos.id,
      sucursalId: deposito.id,
      numero: 1,
      uso: 'facturacion',
      predeterminado: true,
    },
  ])

  const roles = await db
    .insert(rol)
    .values(
      ROLES_PREDEFINIDOS.map((r) => ({
        tenantId: t.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        habilidades: r.habilidades,
      })),
    )
    .returning()

  const gerente = roles.find((r) => r.nombre === 'Gerente')
  if (!gerente) throw new Error('No se creó el rol de gerente.')

  const clave = process.env.ADMIN_PASSWORD ?? 'garagetick'
  const [admin] = await db
    .insert(usuario)
    .values({
      tenantId: t.id,
      email: 'admin@litoral.test',
      hashPassword: await argon2.hash(clave, { type: argon2.argon2id }),
      nombre: 'Martín',
      apellido: 'Gutiérrez',
    })
    .returning()

  if (!admin) throw new Error('No se pudo crear el usuario.')

  await db.insert(usuarioRol).values({ tenantId: t.id, usuarioId: admin.id, rolId: gerente.id })
  await db.insert(usuarioSucursal).values([
    { tenantId: t.id, usuarioId: admin.id, sucursalId: casaCentral.id },
    { tenantId: t.id, usuarioId: admin.id, sucursalId: rafaela.id },
    { tenantId: t.id, usuarioId: admin.id, sucursalId: deposito.id },
  ])

  await db.insert(usuarioConfig).values({
    tenantId: t.id,
    usuarioId: admin.id,
    sucursalPredeterminadaId: casaCentral.id,
  })

  // El mapa de teclas se siembra completo al crear el usuario.
  await db.insert(usuarioAtajo).values(
    atajosParaSembrar().map((a) => ({
      tenantId: t.id,
      usuarioId: admin.id,
      ambito: a.ambito,
      accion: a.accion,
      tecla: a.tecla,
    })),
  )

  console.log(`  2 empresas · 3 sucursales · 4 puntos de venta · ${roles.length} roles`)
  console.log('')
  console.log('  Para entrar:')
  console.log('    admin@litoral.test')
  console.log(`    ${clave}`)
  console.log('')
}
