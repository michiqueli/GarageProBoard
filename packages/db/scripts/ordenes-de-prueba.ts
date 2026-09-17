import { randomBytes } from 'node:crypto'
import { cuitValido } from '@gpb/core'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  cliente,
  entidadComercial,
  marca,
  modelo,
  orden,
  ordenItem,
  ordenSecuencia,
  sucursal,
  tenant,
  titularidad,
  usuario,
  vehiculo,
} from '../src/schema/index.ts'

/**
 * Órdenes de trabajo de prueba para la concesionaria de ejemplo («litoral»), sobre los
 * vehículos que ya siembra `sembrar`: les pone titular, marca y modelo, crea clientes
 * creíbles y abre órdenes en todos los estados del taller.
 *
 *     pnpm --filter @gpb/db ordenes-prueba
 *
 * Sólo en desarrollo, y sólo si la concesionaria todavía no tiene órdenes: no pisa nada.
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

/** El CUIT con su dígito verificador bien calculado, a partir de los diez primeros. */
function cuit(base: string): string {
  for (let dv = 0; dv <= 9; dv++) if (cuitValido(base + dv)) return base + dv
  throw new Error(`No hay dígito verificador para ${base}`)
}

const hace = (dias: number, hora = 9) => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(hora, 15, 0, 0)
  return d
}
const fecha = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

interface ClientePrueba {
  clave: string
  tipoDocumento: number
  numeroDocumento: string
  tipoPersona: 'fisica' | 'juridica'
  razonSocial: string
  condicionIva: number
  domicilio: string
  localidad: string
  telefono: string
  email: string | null
}

const CLIENTES: ClientePrueba[] = [
  {
    clave: 'transportes',
    tipoDocumento: 80,
    numeroDocumento: cuit('3071523894'),
    tipoPersona: 'juridica',
    razonSocial: 'Transportes del Sur SRL',
    condicionIva: 1,
    domicilio: 'Ruta 11 km 452',
    localidad: 'Santa Fe',
    telefono: '342 411-2233',
    email: 'flota@transportesdelsur.test',
  },
  {
    clave: 'lopez',
    tipoDocumento: 96,
    numeroDocumento: '28456123',
    tipoPersona: 'fisica',
    razonSocial: 'López, María Fernanda',
    condicionIva: 5,
    domicilio: 'Bv. Gálvez 1520',
    localidad: 'Santa Fe',
    telefono: '342 155-889900',
    email: 'mflopez@correo.test',
  },
  {
    clave: 'rios',
    tipoDocumento: 80,
    numeroDocumento: cuit('2032789456'),
    tipoPersona: 'fisica',
    razonSocial: 'Ríos, Juan Pablo',
    condicionIva: 6,
    domicilio: 'San Martín 845',
    localidad: 'Rafaela',
    telefono: '3492 44-5566',
    email: null,
  },
  {
    clave: 'alamos',
    tipoDocumento: 80,
    numeroDocumento: cuit('3068912345'),
    tipoPersona: 'juridica',
    razonSocial: 'Agropecuaria Los Álamos SA',
    condicionIva: 1,
    domicilio: 'Zona rural',
    localidad: 'Esperanza',
    telefono: '3496 42-1100',
    email: 'administracion@losalamos.test',
  },
]

/** Qué es cada vehículo que ya está sembrado, y de quién. */
const VEHICULOS: Array<{
  dominio: string | null
  marca: string
  modelo: string
  titular: string | null
}> = [
  { dominio: 'AB123CD', marca: 'Volkswagen', modelo: 'Amarok', titular: 'transportes' },
  { dominio: 'ABC123', marca: 'Fiat', modelo: 'Palio', titular: 'lopez' },
  { dominio: 'MFV872', marca: 'Ford', modelo: 'Ranger', titular: 'rios' },
  { dominio: 'AC844KL', marca: 'Renault', modelo: 'Kardian', titular: 'alamos' },
  { dominio: null, marca: 'Toyota', modelo: 'Hilux', titular: null },
]

type Item = { tipo: 'trabajo' | 'repuesto'; descripcion: string; cantidad: string; precio: string }

interface OrdenPrueba {
  dominio: string | null
  sucursal: string
  estado: string
  dias: number
  paga?: string | null
  trae?: [string, string]
  km: number | null
  combustible: string
  pedido: string
  observaciones: string | null
  prometida: number | null
  conMecanico: boolean
  items: Item[]
}

const ORDENES: OrdenPrueba[] = [
  {
    dominio: 'AB123CD',
    sucursal: 'Casa Central',
    estado: 'en_proceso',
    dias: 1,
    trae: ['Ramón Acosta (chofer)', '342 555-7788'],
    km: 60120,
    combustible: 'medio',
    pedido: 'Service de 60.000 km. Ruido en el tren delantero al pasar lomas de burro.',
    observaciones: 'Rayón en puerta trasera derecha. Falta tapa de la rueda de auxilio.',
    prometida: 1,
    conMecanico: true,
    items: [
      { tipo: 'trabajo', descripcion: 'Service de 60.000 km', cantidad: '1', precio: '185000' },
      {
        tipo: 'trabajo',
        descripcion: 'Revisión de tren delantero',
        cantidad: '1',
        precio: '45000',
      },
      { tipo: 'repuesto', descripcion: 'Aceite 5W30 sintético', cantidad: '7', precio: '14800' },
      { tipo: 'repuesto', descripcion: 'Filtro de aceite', cantidad: '1', precio: '18500' },
      { tipo: 'repuesto', descripcion: 'Filtro de aire', cantidad: '1', precio: '26900' },
      {
        tipo: 'repuesto',
        descripcion: 'Bieleta de barra estabilizadora',
        cantidad: '2',
        precio: '38400',
      },
    ],
  },
  {
    dominio: 'ABC123',
    sucursal: 'Casa Central',
    estado: 'esperando_repuesto',
    dias: 4,
    km: 148300,
    combustible: 'cuarto',
    pedido: 'Patina el embrague en las subidas.',
    observaciones: 'Paragolpes delantero despegado del lado izquierdo.',
    prometida: 2,
    conMecanico: true,
    items: [
      {
        tipo: 'trabajo',
        descripcion: 'Cambio de kit de embrague',
        cantidad: '1',
        precio: '210000',
      },
      {
        tipo: 'repuesto',
        descripcion: 'Kit de embrague (pedido a proveedor)',
        cantidad: '1',
        precio: '325000',
      },
    ],
  },
  {
    dominio: 'MFV872',
    sucursal: 'Casa Central',
    estado: 'terminada',
    dias: 2,
    km: 97450,
    combustible: 'tres_cuartos',
    pedido: 'Tira hacia la derecha. Cambiar las dos cubiertas delanteras.',
    observaciones: null,
    prometida: 0,
    conMecanico: true,
    items: [
      { tipo: 'trabajo', descripcion: 'Alineación y balanceo', cantidad: '1', precio: '48000' },
      { tipo: 'repuesto', descripcion: 'Cubierta 265/65 R17', cantidad: '2', precio: '289000' },
      { tipo: 'repuesto', descripcion: 'Válvula de aire', cantidad: '2', precio: '3500' },
    ],
  },
  {
    dominio: 'AC844KL',
    sucursal: 'Casa Central',
    estado: 'recibida',
    dias: 0,
    trae: ['Esteban Morales (encargado)', '3496 15-667788'],
    km: 10480,
    combustible: 'lleno',
    pedido: 'Se prendió la luz de check engine. Primer service de 10.000 km.',
    observaciones: 'Sin observaciones. Auto impecable.',
    prometida: 1,
    conMecanico: false,
    items: [],
  },
  {
    dominio: null,
    sucursal: 'Rafaela',
    estado: 'esperando_autorizacion',
    dias: 3,
    paga: null,
    km: 12,
    combustible: 'cuarto',
    pedido: 'Preparación para la entrega (PDI) de 0 km en stock.',
    observaciones:
      'Golpe en el guardabarros trasero izquierdo por el traslado: consultar con la terminal.',
    prometida: 3,
    conMecanico: true,
    items: [
      {
        tipo: 'trabajo',
        descripcion: 'PDI: preparación para entrega',
        cantidad: '1',
        precio: '95000',
      },
      {
        tipo: 'trabajo',
        descripcion: 'Chapa y pintura guardabarros trasero',
        cantidad: '1',
        precio: '380000',
      },
    ],
  },
]

async function principal() {
  try {
    const [t] = await db.select().from(tenant).where(eq(tenant.slug, 'litoral'))
    if (!t)
      throw new Error(
        'No existe la concesionaria «litoral»: corré primero pnpm --filter @gpb/db sembrar.',
      )

    const [ya] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orden)
      .where(eq(orden.tenantId, t.id))
    if ((ya?.n ?? 0) > 0) {
      console.log(`✓ «${t.nombre}» ya tiene ${ya?.n} órdenes: no se toca nada.`)
      return
    }

    await db.transaction(async (tx) => {
      const ids = await sembrarClientes(tx as unknown as Db, t.id)
      await completarVehiculos(tx as unknown as Db, t.id, ids)
      await abrirOrdenes(tx as unknown as Db, t.id)
    })
  } catch (error) {
    console.error('✗ No se pudieron sembrar las órdenes de prueba:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

async function sembrarClientes(tx: Db, tenantId: string) {
  const ids = new Map<string, string>()
  for (const c of CLIENTES) {
    const [existente] = await tx
      .select({ id: entidadComercial.id })
      .from(entidadComercial)
      .where(
        and(
          eq(entidadComercial.tenantId, tenantId),
          eq(entidadComercial.tipoDocumento, c.tipoDocumento),
          eq(entidadComercial.numeroDocumento, c.numeroDocumento),
        ),
      )
    let id = existente?.id
    if (!id) {
      const [e] = await tx
        .insert(entidadComercial)
        .values({
          tenantId,
          tipoDocumento: c.tipoDocumento,
          numeroDocumento: c.numeroDocumento,
          tipoPersona: c.tipoPersona,
          razonSocial: c.razonSocial,
          condicionIva: c.condicionIva,
          domicilio: c.domicilio,
          localidad: c.localidad,
          provinciaCodigo: 12,
          telefono: c.telefono,
          email: c.email,
        })
        .returning({ id: entidadComercial.id })
      id = e?.id as string
      await tx.insert(cliente).values({ id, tenantId }).onConflictDoNothing()
    }
    ids.set(c.clave, id)
  }
  console.log(`› ${CLIENTES.length} clientes`)
  return ids
}

async function completarVehiculos(tx: Db, tenantId: string, clientes: Map<string, string>) {
  for (const v of VEHICULOS) {
    const [auto] = await tx
      .select()
      .from(vehiculo)
      .where(
        and(
          eq(vehiculo.tenantId, tenantId),
          v.dominio ? eq(vehiculo.dominio, v.dominio) : isNull(vehiculo.dominio),
        ),
      )
    if (!auto) continue

    let [m] = await tx
      .select()
      .from(marca)
      .where(and(eq(marca.tenantId, tenantId), eq(marca.nombre, v.marca)))
    if (!m) [m] = await tx.insert(marca).values({ tenantId, nombre: v.marca }).returning()
    let [mo] = await tx
      .select()
      .from(modelo)
      .where(and(eq(modelo.marcaId, m?.id as string), eq(modelo.nombre, v.modelo)))
    if (!mo)
      [mo] = await tx
        .insert(modelo)
        .values({ tenantId, marcaId: m?.id as string, nombre: v.modelo })
        .returning()
    if (!auto.modeloId) {
      await tx.update(vehiculo).set({ modeloId: mo?.id }).where(eq(vehiculo.id, auto.id))
    }

    const clienteId = v.titular ? clientes.get(v.titular) : undefined
    if (clienteId) {
      const [vigente] = await tx
        .select()
        .from(titularidad)
        .where(and(eq(titularidad.vehiculoId, auto.id), isNull(titularidad.hasta)))
      if (!vigente) {
        await tx
          .insert(titularidad)
          .values({ tenantId, vehiculoId: auto.id, clienteId, desde: '2024-03-01' })
      }
    }
  }
  console.log(`› Titulares, marcas y modelos de ${VEHICULOS.length} vehículos`)
}

async function abrirOrdenes(tx: Db, tenantId: string) {
  const [asesor] = await tx.select().from(usuario).where(eq(usuario.email, 'admin@litoral.test'))
  const [mecanico] = await tx.select().from(usuario).where(eq(usuario.email, 'taller@litoral.test'))
  if (!asesor) throw new Error('Falta el usuario admin@litoral.test')
  const sucursales = await tx.select().from(sucursal).where(eq(sucursal.tenantId, tenantId))

  for (const o of ORDENES) {
    const suc = sucursales.find((s) => s.nombre === o.sucursal)
    const [auto] = await tx
      .select()
      .from(vehiculo)
      .where(
        and(
          eq(vehiculo.tenantId, tenantId),
          o.dominio ? eq(vehiculo.dominio, o.dominio) : isNull(vehiculo.dominio),
        ),
      )
    if (!suc || !auto) continue

    const [titular] = await tx
      .select({ id: titularidad.clienteId })
      .from(titularidad)
      .where(and(eq(titularidad.vehiculoId, auto.id), isNull(titularidad.hasta)))

    const [secuencia] = await tx
      .insert(ordenSecuencia)
      .values({ tenantId, sucursalId: suc.id, ultimo: 1 })
      .onConflictDoUpdate({
        target: ordenSecuencia.sucursalId,
        set: { ultimo: sql`${ordenSecuencia.ultimo} + 1` },
      })
      .returning({ ultimo: ordenSecuencia.ultimo })

    const creadoEn = hace(o.dias)
    const [creada] = await tx
      .insert(orden)
      .values({
        tenantId,
        sucursalId: suc.id,
        numero: secuencia?.ultimo as number,
        codigoQr: codigoQr(),
        estado: o.estado,
        vehiculoId: auto.id,
        titularId: titular?.id ?? null,
        pagaId: o.paga === null ? null : (titular?.id ?? null),
        traeNombre: o.trae?.[0] ?? null,
        traeTelefono: o.trae?.[1] ?? null,
        kilometraje: o.km,
        combustible: o.combustible,
        pedido: o.pedido,
        observaciones: o.observaciones,
        prometidaPara: o.prometida === null ? null : fecha(o.prometida),
        asesorId: asesor.id,
        mecanicoId: o.conMecanico ? (mecanico?.id ?? null) : null,
        terminadaEn: o.estado === 'terminada' ? hace(0, 11) : null,
        creadoEn,
        actualizadoEn: creadoEn,
      })
      .returning({ id: orden.id, numero: orden.numero })

    if (o.items.length) {
      await tx.insert(ordenItem).values(
        o.items.map((i, n) => ({
          tenantId,
          ordenId: creada?.id as string,
          tipo: i.tipo,
          orden: n + 1,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: i.precio,
        })),
      )
    }
    if (o.km !== null && (auto.kilometraje ?? 0) < o.km) {
      await tx.update(vehiculo).set({ kilometraje: o.km }).where(eq(vehiculo.id, auto.id))
    }
    console.log(
      `  OT ${String(creada?.numero).padStart(6, '0')} · ${o.sucursal} · ${o.dominio ?? '0 km'} · ${o.estado}`,
    )
  }
  console.log(`✓ ${ORDENES.length} órdenes de prueba`)
}

await principal()
