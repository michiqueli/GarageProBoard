import { atajosParaSembrar, MODULOS, type Modulo, ROLES_PREDEFINIDOS } from '@gpb/core'
import argon2 from 'argon2'
import { and, eq } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  empresa,
  puntoVenta,
  rol,
  sucursal,
  tenant,
  tenantModulo,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
  vehiculo,
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

// Envuelto en una función y llamado al final del archivo: si el trabajo corriera acá
// arriba, las constantes declaradas más abajo todavía no existirían.
async function principal(): Promise<void> {
  try {
    await informarCatalogos(db)

    if (process.env.NODE_ENV === 'production') {
      console.log('✓ Catálogos al día. No se siembran datos de ejemplo en producción.')
    } else {
      await sembrarEjemplos(db)
    }
  } catch (error) {
    console.error('✗ Falló la siembra:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

async function informarCatalogos(db: Db): Promise<void> {
  console.log('› Catálogos…')
  await sembrarCatalogos(db)
  console.log(
    `  ${PROVINCIAS.length} provincias · ${CONDICIONES_IVA.length} condiciones de IVA · ` +
      `${TIPOS_COMPROBANTE.length} tipos de comprobante · ${REGLAS_COMPROBANTE.length} reglas`,
  )
}

interface Boca {
  nombre: string
  /** El CUIT tiene que ser distinto en cada una: hay un único por tenant. */
  cuit: string
  sucursales: string[]
}

interface UsuarioEjemplo {
  email: string
  nombre: string
  apellido: string
  rol: string
}

interface Concesionaria {
  slug: string
  nombre: string
  /** Los que tiene contratados. */
  modulos: readonly Modulo[]
  empresas: Boca[]
  /** El primero es el gerente, que es quien administra; los demás muestran los permisos. */
  usuarios: UsuarioEjemplo[]
  vehiculos: Array<{ chasis: string; dominio: string | null; anio: number; color: string }>
}

/**
 * Dos concesionarias, a propósito.
 *
 * Con una sola, un error de aislamiento no se nota: todo lo que se ve es lo que
 * corresponde porque no hay otra cosa que ver. Con dos, entrar como uno y como el otro
 * muestra listas distintas, y si algún día se cruzan salta a la vista.
 *
 * La primera lleva además el caso incómodo: **dos razones sociales bajo el mismo
 * tenant**, cada una con su CUIT y su punto de venta 0001. Si el sistema se desarrolla
 * siempre contra una sola empresa, el día que aparezca la segunda se rompe todo junto.
 */
const EJEMPLOS: Concesionaria[] = [
  {
    slug: 'litoral',
    nombre: 'Grupo Automotores del Litoral',
    modulos: MODULOS,
    empresas: [
      {
        nombre: 'Automotores Litoral SAS',
        cuit: '30712345671',
        sucursales: ['Casa Central', 'Rafaela'],
      },
      { nombre: 'Litoral Repuestos SAS', cuit: '30719876540', sucursales: ['Depósito Central'] },
    ],
    usuarios: [
      { email: 'admin@litoral.test', nombre: 'Martín', apellido: 'Gutiérrez', rol: 'Gerente' },
      // Uno que ve vehículos pero no los da de alta, y otro que ni los ve: con sólo un
      // gerente, un permiso mal aplicado no se nota nunca, porque el gerente puede todo.
      { email: 'taller@litoral.test', nombre: 'Diego', apellido: 'Sosa', rol: 'Mecánico' },
      { email: 'repuestos@litoral.test', nombre: 'Carla', apellido: 'Benítez', rol: 'Repuestero' },
    ],
    vehiculos: [
      { chasis: '8AWZZZ377KA123456', dominio: 'AB123CD', anio: 2019, color: 'Gris plata' },
      { chasis: '9BWZZZ377KA654321', dominio: 'ABC123', anio: 2014, color: 'Blanco' },
      { chasis: '3VWZZZ377KA999888', dominio: 'AC844KL', anio: 2021, color: 'Negro' },
      { chasis: '93YRBB000LJ445566', dominio: 'MFV872', anio: 2016, color: 'Rojo' },
      // Un 0km sin patentar: existe con chasis y todavía no tiene chapa.
      { chasis: '8AJBA3FS0P0112233', dominio: null, anio: 2026, color: 'Azul' },
    ],
  },
  {
    slug: 'norte',
    nombre: 'Automotores del Norte SA',
    // Sin contable: factura con otro sistema. Entrar como cada una muestra que la Caja
    // desaparece del menú aunque el gerente pueda todo.
    modulos: ['nucleo', 'servicios', 'repuestos'],
    empresas: [
      { nombre: 'Automotores del Norte SA', cuit: '30655443327', sucursales: ['Salta Centro'] },
    ],
    usuarios: [{ email: 'admin@norte.test', nombre: 'Lucía', apellido: 'Quiroga', rol: 'Gerente' }],
    vehiculos: [
      { chasis: '9BFZH55P4NB778899', dominio: 'XY987ZW', anio: 2022, color: 'Blanco' },
      { chasis: '8AGZC5210MR334455', dominio: 'NPQ334', anio: 2013, color: 'Verde' },
      { chasis: '93HGM6650NZ667788', dominio: 'AF220RS', anio: 2020, color: 'Gris' },
    ],
  },
]

async function sembrarEjemplos(db: Db): Promise<void> {
  for (const ejemplo of EJEMPLOS) {
    const [existente] = await db.select().from(tenant).where(eq(tenant.slug, ejemplo.slug)).limit(1)

    if (existente) {
      console.log(`✓ ${ejemplo.nombre} ya existe.`)
    } else {
      await sembrarConcesionaria(db, ejemplo)
    }

    // Los usuarios van aparte y son idempotentes uno por uno: así una base sembrada antes
    // de que existiera un usuario de ejemplo lo recibe sin tener que resetearla.
    await sembrarUsuarios(db, ejemplo)
  }

  console.log('')
  console.log('  Para entrar, todos con la misma contraseña:')
  for (const e of EJEMPLOS) {
    for (const u of e.usuarios) {
      console.log(`    ${u.email.padEnd(24)} ${u.rol.padEnd(12)} ${e.nombre}`)
    }
  }
  console.log(`    contraseña: ${process.env.ADMIN_PASSWORD ?? 'garageproboard'}`)
  console.log('')
}

async function sembrarConcesionaria(db: Db, ej: Concesionaria): Promise<void> {
  console.log(`› ${ej.nombre}…`)

  const [t] = await db.insert(tenant).values({ nombre: ej.nombre, slug: ej.slug }).returning()
  if (!t) throw new Error('No se pudo crear el tenant.')

  await db.insert(tenantModulo).values(ej.modulos.map((modulo) => ({ tenantId: t.id, modulo })))

  const sucursalesCreadas: Array<{ id: string }> = []

  for (const boca of ej.empresas) {
    const [e] = await db
      .insert(empresa)
      .values({
        tenantId: t.id,
        razonSocial: boca.nombre,
        cuit: boca.cuit,
        condicionIva: 1,
        provinciaCodigo: 12,
      })
      .returning()
    if (!e) throw new Error('No se pudo crear la empresa.')

    for (const [indice, nombre] of boca.sucursales.entries()) {
      const [s] = await db
        .insert(sucursal)
        .values({ tenantId: t.id, empresaId: e.id, nombre })
        .returning()
      if (!s) throw new Error('No se pudo crear la sucursal.')

      sucursalesCreadas.push(s)

      // El número de punto de venta es único **por CUIT**, no por tenant: las dos
      // empresas del grupo tienen las dos su 0001. Sembrarlo así a propósito es lo
      // que hace que ese bug no llegue nunca a producción.
      await db.insert(puntoVenta).values({
        tenantId: t.id,
        empresaId: e.id,
        sucursalId: s.id,
        numero: indice + 1,
        uso: 'facturacion',
        predeterminado: true,
      })
    }
  }

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

  await db.insert(vehiculo).values(ej.vehiculos.map((v) => ({ tenantId: t.id, ...v })))

  console.log(
    `  ${ej.empresas.length} empresa(s) · ${sucursalesCreadas.length} sucursal(es) · ` +
      `${ej.vehiculos.length} vehículos · ${roles.length} roles`,
  )
}

async function sembrarUsuarios(db: Db, ej: Concesionaria): Promise<void> {
  const [t] = await db.select().from(tenant).where(eq(tenant.slug, ej.slug)).limit(1)
  if (!t) throw new Error(`No existe la concesionaria ${ej.slug}.`)

  const roles = await db.select().from(rol).where(eq(rol.tenantId, t.id))
  const sucursales = await db.select().from(sucursal).where(eq(sucursal.tenantId, t.id))

  for (const datos of ej.usuarios) {
    const [yaEsta] = await db
      .select({ id: usuario.id })
      .from(usuario)
      .where(and(eq(usuario.tenantId, t.id), eq(usuario.email, datos.email)))
      .limit(1)
    if (yaEsta) continue

    const elegido = roles.find((r) => r.nombre === datos.rol)
    if (!elegido) throw new Error(`No existe el rol ${datos.rol} en ${ej.nombre}.`)

    const [u] = await db
      .insert(usuario)
      .values({
        tenantId: t.id,
        email: datos.email,
        hashPassword: await argon2.hash(process.env.ADMIN_PASSWORD ?? 'garageproboard', {
          type: argon2.argon2id,
        }),
        nombre: datos.nombre,
        apellido: datos.apellido,
      })
      .returning()
    if (!u) throw new Error('No se pudo crear el usuario.')

    await db.insert(usuarioRol).values({ tenantId: t.id, usuarioId: u.id, rolId: elegido.id })
    await db
      .insert(usuarioSucursal)
      .values(sucursales.map((s) => ({ tenantId: t.id, usuarioId: u.id, sucursalId: s.id })))

    // Sin sucursal predeterminada a propósito: así se ve la pantalla de elección cuando
    // hay más de una. Se configura desde la aplicación cuando exista esa pantalla.
    await db.insert(usuarioConfig).values({ tenantId: t.id, usuarioId: u.id })

    await db.insert(usuarioAtajo).values(
      atajosParaSembrar().map((a) => ({
        tenantId: t.id,
        usuarioId: u.id,
        ambito: a.ambito,
        accion: a.accion,
        tecla: a.tecla,
      })),
    )

    console.log(`  + ${datos.email} (${datos.rol})`)
  }
}

await principal()
