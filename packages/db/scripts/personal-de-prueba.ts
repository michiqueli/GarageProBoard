import { randomBytes } from 'node:crypto'
import { cuitValido } from '@gpb/core'
import { and, eq, isNull } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  credencial,
  empleado,
  entidadComercial,
  orden,
  sucursal,
  tenant,
  usuario,
} from '../src/schema/index.ts'

/**
 * Personal de prueba para la concesionaria de ejemplo («litoral»): ocho empleados con sus
 * legajos, y credencial emitida para algunos —no para todos, que es el caso interesante—.
 *
 *     pnpm --filter @gpb/db personal-prueba
 *
 * Además engancha a los usuarios de ejemplo con su legajo por el correo, que es lo que hace
 * que la regla «el mecánico sólo edita sus órdenes» tenga contra qué evaluarse, y le pone
 * mecánico a las órdenes abiertas que quedaron sin uno tras la migración 0016.
 *
 * Sólo en desarrollo, y sólo si la concesionaria todavía no tiene personal: no pisa nada.
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

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const codigoQr = () => [...randomBytes(8)].map((b) => ALFABETO[b % ALFABETO.length]).join('')

/**
 * El CUIL con su dígito verificador bien calculado, a partir de los diez primeros.
 *
 * Uno de cada once números no tiene verificador posible —el cálculo daría 10, que no es un
 * dígito—, así que en ese caso se corre el último del cuerpo hasta encontrar uno que sirva.
 * Son documentos inventados: lo único que importa es que pasen la validación del contrato.
 */
function cuil(base: string): string {
  for (let corrimiento = 0; corrimiento < 10; corrimiento++) {
    const cuerpo = base.slice(0, 9) + ((Number(base[9]) + corrimiento) % 10)
    for (let dv = 0; dv <= 9; dv++) if (cuitValido(cuerpo + dv)) return cuerpo + dv
  }
  throw new Error(`No hay ningún CUIL válido cerca de ${base}`)
}

const hace = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

interface EmpleadoPrueba {
  legajo: string
  nombre: string
  apellido: string
  documento: string
  puesto: string
  convenio: string | null
  categoria: string | null
  desdeHaceDias: number
  telefono: string
  /** El correo del usuario de ejemplo al que corresponde, si entra al sistema. */
  correoUsuario?: string
  /** Si arranca con la credencial ya emitida. Los que no, son la cola de impresión. */
  conCredencial: boolean
}

const PERSONAL: EmpleadoPrueba[] = [
  {
    legajo: '0001',
    nombre: 'Diego',
    apellido: 'Sosa',
    documento: cuil('2028456712'),
    puesto: 'mecanico',
    convenio: 'SMATA',
    categoria: 'Oficial múltiple',
    desdeHaceDias: 2100,
    telefono: '342 155-334455',
    correoUsuario: 'taller@litoral.test',
    conCredencial: true,
  },
  {
    legajo: '0002',
    nombre: 'Ramón',
    apellido: 'Quiroga',
    documento: cuil('2015789234'),
    puesto: 'mecanico',
    convenio: 'SMATA',
    categoria: 'Oficial',
    desdeHaceDias: 1400,
    telefono: '342 155-778899',
    conCredencial: true,
  },
  {
    legajo: '0003',
    nombre: 'Walter',
    apellido: 'Benítez',
    documento: cuil('2034567891'),
    puesto: 'mecanico',
    convenio: 'SMATA',
    categoria: 'Medio oficial',
    desdeHaceDias: 400,
    telefono: '342 155-221100',
    conCredencial: false,
  },
  {
    legajo: '0004',
    nombre: 'Rosa',
    apellido: 'Ledesma',
    documento: cuil('2723456789'),
    puesto: 'lavador',
    convenio: 'SMATA',
    categoria: 'Peón',
    desdeHaceDias: 200,
    telefono: '342 155-443322',
    conCredencial: false,
  },
  {
    legajo: '0005',
    nombre: 'Martín',
    apellido: 'Gutiérrez',
    documento: cuil('2012345678'),
    puesto: 'gerente',
    convenio: null,
    categoria: 'Fuera de convenio',
    desdeHaceDias: 3000,
    telefono: '342 155-101010',
    correoUsuario: 'admin@litoral.test',
    conCredencial: true,
  },
  {
    legajo: '0006',
    nombre: 'Laura',
    apellido: 'Paz',
    documento: cuil('2729876543'),
    puesto: 'cajero',
    convenio: null,
    categoria: 'Administrativo B',
    desdeHaceDias: 900,
    telefono: '342 155-505050',
    correoUsuario: 'caja@litoral.test',
    conCredencial: true,
  },
  {
    legajo: '0007',
    nombre: 'Sergio',
    apellido: 'Ferreyra',
    documento: cuil('2045678912'),
    puesto: 'repuestero',
    convenio: null,
    categoria: 'Administrativo A',
    desdeHaceDias: 1800,
    telefono: '342 155-606060',
    correoUsuario: 'repuestos@litoral.test',
    conCredencial: false,
  },
  {
    legajo: '0008',
    nombre: 'Andrea',
    apellido: 'Villalba',
    documento: cuil('2731245678'),
    puesto: 'asesor',
    convenio: null,
    categoria: 'Administrativo B',
    desdeHaceDias: 700,
    telefono: '342 155-707070',
    correoUsuario: 'asesor@litoral.test',
    conCredencial: true,
  },
]

async function sembrar(db: Db) {
  const [t] = await db.select().from(tenant).where(eq(tenant.slug, 'litoral')).limit(1)
  if (!t) {
    console.error('No existe la concesionaria «litoral». Corré primero: pnpm db:sembrar')
    return
  }
  const tenantId = t.id

  const yaHay = await db
    .select({ id: empleado.id })
    .from(empleado)
    .where(eq(empleado.tenantId, tenantId))
    .limit(1)
  if (yaHay.length) {
    console.log('› La concesionaria ya tiene personal cargado. No se toca nada.')
    return
  }

  const [casaCentral] = await db
    .select({ id: sucursal.id })
    .from(sucursal)
    .where(eq(sucursal.tenantId, tenantId))
    .limit(1)

  const mecanicos: string[] = []

  for (const p of PERSONAL) {
    const [identidad] = await db
      .insert(entidadComercial)
      .values({
        tenantId,
        tipoDocumento: 86,
        numeroDocumento: p.documento,
        tipoPersona: 'fisica',
        razonSocial: `${p.apellido}, ${p.nombre}`,
        nombre: p.nombre,
        apellido: p.apellido,
        // Consumidor final: un empleado no nos factura, su identidad existe por el CUIL.
        condicionIva: 5,
        telefono: p.telefono,
      })
      .onConflictDoNothing()
      .returning({ id: entidadComercial.id })
    if (!identidad) continue

    await db.insert(empleado).values({
      id: identidad.id,
      tenantId,
      legajo: p.legajo,
      puesto: p.puesto,
      sucursalId: casaCentral?.id ?? null,
      convenio: p.convenio,
      categoria: p.categoria,
      fechaIngreso: hace(p.desdeHaceDias),
    })

    if (p.conCredencial) {
      await db.insert(credencial).values({ tenantId, empleadoId: identidad.id, codigo: codigoQr() })
    }

    // El que además entra al sistema queda enganchado a su legajo: es lo que hace que
    // «sólo mis órdenes» tenga contra qué evaluarse.
    if (p.correoUsuario) {
      await db
        .update(usuario)
        .set({ empleadoId: identidad.id })
        .where(eq(usuario.email, p.correoUsuario))
    }

    if (p.puesto === 'mecanico') mecanicos.push(identidad.id)
  }

  // Las órdenes que quedaron sin mecánico tras la migración 0016 vuelven a tener uno, así el
  // listado del taller se ve como se tiene que ver.
  const abiertas = await db
    .select({ id: orden.id })
    .from(orden)
    .where(and(eq(orden.tenantId, tenantId), isNull(orden.mecanicoId)))
  for (const [i, o] of abiertas.entries()) {
    const elegido = mecanicos[i % Math.max(mecanicos.length, 1)]
    if (elegido) await db.update(orden).set({ mecanicoId: elegido }).where(eq(orden.id, o.id))
  }

  const conCredencial = PERSONAL.filter((p) => p.conCredencial).length
  console.log(
    `✓ ${PERSONAL.length} empleados, ${conCredencial} con credencial emitida y ` +
      `${PERSONAL.length - conCredencial} esperando la suya.`,
  )
  if (abiertas.length) console.log(`✓ ${abiertas.length} órdenes con mecánico asignado de nuevo.`)
}

try {
  await sembrar(db)
} finally {
  await pool.end()
}
