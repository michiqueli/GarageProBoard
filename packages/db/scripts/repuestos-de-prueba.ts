import { cuitValido } from '@gpb/core'
import { and, eq, sql } from 'drizzle-orm'
import { crearDb, crearPool, type Db } from '../src/index.ts'
import {
  compra,
  compraRenglon,
  entidadComercial,
  movimientoStock,
  orden,
  pedidoRepuestos,
  pedidoRepuestosItem,
  proveedor,
  repuesto,
  repuestoStock,
  repuestosSecuencia,
  sucursal,
  tenant,
  usuario,
  vehiculo,
} from '../src/schema/index.ts'

/**
 * Repuestos de prueba para «litoral»: proveedores, un catálogo con stock en Casa Central y
 * Rafaela (algunos por debajo del mínimo), compras pedidas y recibidas, y pedidos abiertos
 * para el taller y el mostrador. Va después de `ordenes-prueba`, porque un pedido es para la
 * OT del embrague.
 *
 *     pnpm --filter @gpb/db repuestos-prueba
 *
 * Sólo en desarrollo, y sólo si la concesionaria no tiene repuestos: no pisa nada.
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

function cuit(base: string): string {
  for (let dv = 0; dv <= 9; dv++) if (cuitValido(base + dv)) return base + dv
  throw new Error(`No hay dígito verificador para ${base}`)
}

const PROVEEDORES = [
  {
    clave: 'renault',
    numeroDocumento: cuit('3050025001'),
    razonSocial: 'Renault Argentina SA',
    domicilio: 'Fray Justo Santa María de Oro 1744',
    localidad: 'Buenos Aires',
    provinciaCodigo: 0,
    telefono: '0800-777-7368',
    condicionPago: 'Cuenta corriente 30 días',
  },
  {
    clave: 'distri',
    numeroDocumento: cuit('3071234567'),
    razonSocial: 'Distribuidora Litoral Repuestos SRL',
    domicilio: 'Av. Freyre 2450',
    localidad: 'Santa Fe',
    provinciaCodigo: 12,
    telefono: '342 452-8800',
    condicionPago: 'Contado contra entrega',
  },
]

// [código, descripción, marca, rubro, aplicación, precio final, costo, proveedor, stock central, stock rafaela, mínimo, ubicación]
type Fila = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number | null,
  string,
]
const CATALOGO: Fila[] = [
  [
    '7701208174',
    'Filtro de aceite',
    'Renault',
    'Filtros',
    'Clio, Kangoo, Logan, Sandero 1.6 8v/16v',
    '18500',
    '9200',
    'renault',
    14,
    4,
    6,
    'Estante 1 A',
  ],
  [
    '8200431051',
    'Filtro de aire',
    'Renault',
    'Filtros',
    'Kangoo II, Logan, Sandero 1.6',
    '26900',
    '13400',
    'renault',
    5,
    2,
    4,
    'Estante 1 B',
  ],
  [
    '272778712R',
    'Filtro de habitáculo',
    'Renault',
    'Filtros',
    'Duster, Oroch, Kardian',
    '21300',
    '10600',
    'renault',
    2,
    0,
    3,
    'Estante 1 B',
  ],
  [
    '164003265R',
    'Filtro de combustible',
    'Renault',
    'Filtros',
    'Duster 2.0, Oroch 2.0',
    '32400',
    '16100',
    'renault',
    3,
    1,
    2,
    'Estante 1 C',
  ],
  [
    '7711943692',
    'Aceite Elf Evolution 5W30 (1 l)',
    'Elf',
    'Lubricantes',
    'Motores nafta y diésel',
    '14800',
    '7300',
    'distri',
    48,
    12,
    20,
    'Góndola lubricantes',
  ],
  [
    '7711945338',
    'Aceite Elf Evolution 10W40 (4 l)',
    'Elf',
    'Lubricantes',
    'Motores nafta',
    '52000',
    '26000',
    'distri',
    9,
    3,
    5,
    'Góndola lubricantes',
  ],
  [
    '410608481R',
    'Pastillas de freno delanteras',
    'Renault',
    'Frenos',
    'Duster, Oroch, Logan II',
    '45000',
    '22500',
    'renault',
    6,
    2,
    4,
    'Estante 3 A',
  ],
  [
    '402064151R',
    'Disco de freno delantero',
    'Renault',
    'Frenos',
    'Duster 4x2, Logan II',
    '68500',
    '34000',
    'renault',
    4,
    0,
    2,
    'Estante 3 B',
  ],
  [
    '302050716R',
    'Kit de embrague',
    'Valeo',
    'Embrague',
    'Kangoo II 1.6, Sandero 1.6',
    '325000',
    '171000',
    'distri',
    0,
    1,
    1,
    'Estante 5 A',
  ],
  [
    '8200735039',
    'Bieleta de barra estabilizadora',
    'Renault',
    'Suspensión',
    'Kangoo II, Clio II',
    '38400',
    '18800',
    'renault',
    3,
    0,
    2,
    'Estante 4 C',
  ],
  [
    '224011331R',
    'Bujía',
    'NGK',
    'Encendido',
    'Sandero, Logan, Kwid 1.0 SCe',
    '11200',
    '5400',
    'distri',
    16,
    8,
    8,
    'Cajón 2',
  ],
  [
    '7701478448',
    'Correa de distribución (kit)',
    'Gates',
    'Motor',
    'Clio, Kangoo 1.6 8v',
    '189000',
    '98000',
    'distri',
    2,
    1,
    1,
    'Estante 5 B',
  ],
  [
    '7701049650',
    'Lámpara H4 60/55W',
    'Philips',
    'Iluminación',
    'Universal',
    '6000',
    '2800',
    'distri',
    25,
    10,
    10,
    'Cajón 4',
  ],
  [
    '7711947466',
    'Líquido refrigerante Glaceol (1 l)',
    'Renault',
    'Lubricantes',
    'Todos los modelos',
    '9800',
    '4700',
    'distri',
    1,
    6,
    6,
    'Góndola lubricantes',
  ],
  [
    'CUB26565R17',
    'Cubierta 265/65 R17',
    'Pirelli',
    'Neumáticos',
    'Ranger, Hilux, Amarok',
    '289000',
    '205000',
    'distri',
    6,
    0,
    4,
    'Depósito fondo',
  ],
]

async function principal() {
  try {
    const [t] = await db.select().from(tenant).where(eq(tenant.slug, 'litoral'))
    if (!t) throw new Error('No existe la concesionaria «litoral»: corré primero sembrar.')
    const [ya] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(repuesto)
      .where(eq(repuesto.tenantId, t.id))
    if ((ya?.n ?? 0) > 0) {
      console.log(`✓ «${t.nombre}» ya tiene ${ya?.n} repuestos: no se toca nada.`)
      return
    }
    await db.transaction((tx) => sembrar(tx as unknown as Db, t.id))
  } catch (error) {
    console.error('✗ No se pudieron sembrar los repuestos de prueba:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

async function sembrar(tx: Db, tenantId: string) {
  const [repuestero] = await tx
    .select()
    .from(usuario)
    .where(eq(usuario.email, 'repuestos@litoral.test'))
  const [admin] = await tx.select().from(usuario).where(eq(usuario.email, 'admin@litoral.test'))
  const quien = repuestero ?? admin
  if (!quien) throw new Error('Falta un usuario de litoral')
  const sucursales = await tx.select().from(sucursal).where(eq(sucursal.tenantId, tenantId))
  const central = sucursales.find((s) => s.nombre === 'Casa Central')
  const rafaela = sucursales.find((s) => s.nombre === 'Rafaela')
  if (!central || !rafaela) throw new Error('Faltan Casa Central o Rafaela')

  // Proveedores
  const provs = new Map<string, string>()
  for (const p of PROVEEDORES) {
    const [existente] = await tx
      .select({ id: entidadComercial.id })
      .from(entidadComercial)
      .where(
        and(
          eq(entidadComercial.tenantId, tenantId),
          eq(entidadComercial.numeroDocumento, p.numeroDocumento),
        ),
      )
    let id = existente?.id
    if (!id) {
      const [e] = await tx
        .insert(entidadComercial)
        .values({
          tenantId,
          tipoDocumento: 80,
          numeroDocumento: p.numeroDocumento,
          tipoPersona: 'juridica',
          razonSocial: p.razonSocial,
          condicionIva: 1,
          domicilio: p.domicilio,
          localidad: p.localidad,
          provinciaCodigo: p.provinciaCodigo,
          telefono: p.telefono,
          condicionIibb: 'convenio',
        })
        .returning({ id: entidadComercial.id })
      id = e?.id as string
    }
    await tx
      .insert(proveedor)
      .values({ id, tenantId, condicionPago: p.condicionPago })
      .onConflictDoNothing()
    provs.set(p.clave, id)
  }
  console.log(`› ${PROVEEDORES.length} proveedores`)

  // Catálogo y stock inicial
  const ids = new Map<string, string>()
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000)
  for (const [
    codigo,
    descripcion,
    marca,
    rubro,
    aplicacion,
    precio,
    costo,
    prov,
    enCentral,
    enRafaela,
    minimo,
    ubicacion,
  ] of CATALOGO) {
    const [r] = await tx
      .insert(repuesto)
      .values({
        tenantId,
        codigo,
        descripcion,
        marca,
        rubro,
        aplicacion,
        precioVenta: precio,
        costo,
        proveedorId: provs.get(prov) ?? null,
      })
      .returning({ id: repuesto.id })
    const id = r?.id as string
    ids.set(codigo, id)
    for (const [suc, cant, ubic] of [
      [central.id, enCentral, ubicacion],
      [rafaela.id, enRafaela, null],
    ] as const) {
      await tx.insert(repuestoStock).values({
        tenantId,
        repuestoId: id,
        sucursalId: suc,
        cantidad: String(cant),
        minimo: minimo === null ? null : String(minimo),
        ubicacion: ubic,
      })
      if (cant > 0) {
        await tx.insert(movimientoStock).values({
          tenantId,
          repuestoId: id,
          sucursalId: suc,
          tipo: 'inicial',
          cantidad: String(cant),
          saldo: String(cant),
          costoUnitario: costo,
          usuarioId: quien.id,
          creadoEn: hace(20),
        })
      }
    }
  }
  console.log(`› ${CATALOGO.length} repuestos con stock en Casa Central y Rafaela`)

  // Compras en Casa Central: una esperando que llegue, una ya recibida.
  const numerar = async (tipo: 'pedido' | 'compra') => {
    const [f] = await tx
      .insert(repuestosSecuencia)
      .values({ tenantId, sucursalId: central.id, tipo, ultimo: 1 })
      .onConflictDoUpdate({
        target: [repuestosSecuencia.sucursalId, repuestosSecuencia.tipo],
        set: { ultimo: sql`${repuestosSecuencia.ultimo} + 1` },
      })
      .returning({ ultimo: repuestosSecuencia.ultimo })
    return f?.ultimo as number
  }

  const [recibida] = await tx
    .insert(compra)
    .values({
      tenantId,
      sucursalId: central.id,
      numero: await numerar('compra'),
      estado: 'recibida',
      proveedorId: provs.get('renault') as string,
      comprobanteProveedor: 'FA A 0012-00458812',
      fechaComprobante: hace(6).toISOString().slice(0, 10),
      creadoPor: quien.id,
      recibidaPor: quien.id,
      recibidaEn: hace(6),
      creadoEn: hace(10),
    })
    .returning({ id: compra.id })
  let n = 1
  for (const [codigo, cant, costo] of [
    ['410608481R', 4, '22500'],
    ['7701208174', 10, '9200'],
  ] as const) {
    const repuestoId = ids.get(codigo) as string
    await tx.insert(compraRenglon).values({
      tenantId,
      compraId: recibida?.id as string,
      orden: n++,
      repuestoId,
      cantidad: String(cant),
      costoUnitario: costo,
      cantidadRecibida: String(cant),
    })
    const [s] = await tx
      .select({ cantidad: repuestoStock.cantidad })
      .from(repuestoStock)
      .where(
        and(eq(repuestoStock.repuestoId, repuestoId), eq(repuestoStock.sucursalId, central.id)),
      )
    await tx.insert(movimientoStock).values({
      tenantId,
      repuestoId,
      sucursalId: central.id,
      tipo: 'compra',
      cantidad: String(cant),
      // El stock sembrado ya incluye lo que entró con esta compra.
      saldo: s?.cantidad ?? String(cant),
      costoUnitario: costo,
      compraId: recibida?.id as string,
      usuarioId: quien.id,
      creadoEn: hace(6),
    })
  }

  const [pedida] = await tx
    .insert(compra)
    .values({
      tenantId,
      sucursalId: central.id,
      numero: await numerar('compra'),
      proveedorId: provs.get('distri') as string,
      nota: 'Para la OT del embrague del Palio y reponer refrigerante',
      creadoPor: quien.id,
      creadoEn: hace(3),
    })
    .returning({ id: compra.id })
  n = 1
  for (const [codigo, cant, costo] of [
    ['302050716R', 2, '171000'],
    ['7711947466', 12, '4700'],
    ['272778712R', 6, '10600'],
  ] as const) {
    await tx.insert(compraRenglon).values({
      tenantId,
      compraId: pedida?.id as string,
      orden: n++,
      repuestoId: ids.get(codigo) as string,
      cantidad: String(cant),
      costoUnitario: costo,
    })
  }
  console.log('› 2 compras: una recibida y una esperando que llegue')

  // Pedidos: uno para la OT del Palio (esperando repuesto) y dos de mostrador.
  const [ot] = await tx
    .select({ id: orden.id, chasis: vehiculo.chasis, vehiculoId: vehiculo.id })
    .from(orden)
    .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
    .where(and(eq(orden.sucursalId, central.id), eq(vehiculo.dominio, 'ABC123')))
  const pedidos: Array<{
    ordenId: string | null
    chasis: string
    vehiculoId: string | null
    solicitante: string
    nota: string | null
    items: Array<[string | null, string, string, string]>
  }> = [
    ...(ot
      ? [
          {
            ordenId: ot.id,
            chasis: ot.chasis,
            vehiculoId: ot.vehiculoId,
            solicitante: 'Diego, box 2',
            nota: 'El kit de embrague está pedido a Distribuidora Litoral',
            items: [
              [ids.get('302050716R') as string, '302050716R', 'Kit de embrague', '325000'],
              [
                ids.get('7711947466') as string,
                '7711947466',
                'Líquido refrigerante Glaceol (1 l)',
                '9800',
              ],
            ] as Array<[string | null, string, string, string]>,
          },
        ]
      : []),
    {
      ordenId: null,
      chasis: '93YBSR7RHCJ123456',
      vehiculoId: null,
      solicitante: 'Cliente de mostrador',
      nota: 'Sandero 2012, pasa a buscar a la tarde',
      items: [
        [ids.get('410608481R') as string, '410608481R', 'Pastillas de freno delanteras', '45000'],
        [ids.get('7701049650') as string, '7701049650', 'Lámpara H4 60/55W', '6000'],
      ],
    },
    {
      ordenId: null,
      chasis: '8A1HJ5GB4DL654321',
      vehiculoId: null,
      solicitante: 'Taller Gómez (por teléfono)',
      nota: null,
      items: [
        [ids.get('7701208174') as string, '7701208174', 'Filtro de aceite', '18500'],
        [null, 'SIN-CATALOGO', 'Tapa de válvulas (pedir a fábrica)', '64000'],
      ],
    },
  ]
  for (const p of pedidos) {
    const [creado] = await tx
      .insert(pedidoRepuestos)
      .values({
        tenantId,
        sucursalId: central.id,
        numero: await numerar('pedido'),
        chasis: p.chasis,
        vehiculoId: p.vehiculoId,
        ordenId: p.ordenId,
        solicitante: p.solicitante,
        nota: p.nota,
        creadoPor: quien.id,
      })
      .returning({ id: pedidoRepuestos.id })
    await tx.insert(pedidoRepuestosItem).values(
      p.items.map(([repuestoId, codigo, descripcion, precio], i) => ({
        tenantId,
        pedidoId: creado?.id as string,
        orden: i + 1,
        repuestoId,
        codigo,
        descripcion,
        cantidad: '1',
        precioUnitario: precio,
      })),
    )
  }
  console.log(`✓ ${pedidos.length} pedidos abiertos para atender`)
}

await principal()
