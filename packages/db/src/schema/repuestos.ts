import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, dinero, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { entidadComercial, proveedor } from './comercial.ts'
import { orden } from './orden.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'
import { vehiculo } from './vehiculo.ts'

const cantidad = (nombre: string) => numeric(nombre, { precision: 18, scale: 4 })

/**
 * El catálogo de repuestos de la concesionaria: **qué es** cada pieza, no cuántas hay. Es del
 * tenant, porque la pieza es la misma en Casa Central y en Rafaela; el stock es de cada
 * sucursal y vive en `repuesto_stock`.
 *
 * El código es el de fábrica, normalizado (mayúsculas, sin espacios ni guiones): es lo que
 * devuelve la base de la marca cuando se busca por chasis, y lo que se pega en el buscador.
 *
 * Precio de venta **final, con IVA**, como en la caja y en la orden. El costo es el de la
 * última compra, **sin IVA**, como viene en la factura del proveedor.
 */
export const repuesto = pgTable(
  'repuesto',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    codigo: text().notNull(),
    descripcion: text().notNull(),
    /** Quién la fabrica: «Renault», «Bosch», «SKF». */
    marca: text(),
    /** «Filtros», «Frenos», «Embrague»: para agrupar y filtrar. */
    rubro: text(),
    /** A qué modelos le va, en palabras: «Kangoo II 1.6 16v, Clio Mío». */
    aplicacion: text(),
    precioVenta: dinero('precio_venta').notNull().default('0'),
    costo: dinero('costo'),
    /** Código de alícuota de AFIP. 21% por omisión: casi todo repuesto. */
    codigoAlicuota: smallint().notNull().default(5),
    /** A quién se le compra normalmente. */
    proveedorId: uuid().references(() => proveedor.id),
    activo: boolean().notNull().default(true),
    observaciones: text(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('repuesto_codigo_uq').on(t.tenantId, t.codigo),
    index('repuesto_descripcion_idx').on(t.tenantId, t.descripcion),
    check('repuesto_codigo_formato', sql`${t.codigo} ~ '^[A-Z0-9./]{2,40}$'`),
    check('repuesto_precio_no_negativo', sql`${t.precioVenta} >= 0`),
    check('repuesto_costo_no_negativo', sql`${t.costo} is null or ${t.costo} >= 0`),
  ],
)

/**
 * Cuántas hay de cada pieza en cada sucursal, y dónde están.
 *
 * La cantidad **puede quedar negativa**: si el depósito está mal contado y el mecánico
 * tiene la pieza en la mano, el sistema no frena el taller. Se muestra en rojo y se corrige
 * con un ajuste, que queda en los movimientos con su motivo.
 *
 * Nunca se escribe directo: cada cambio pasa por un `movimiento_stock`, y la fila se
 * actualiza en la misma sentencia que devuelve el saldo.
 */
export const repuestoStock = pgTable(
  'repuesto_stock',
  {
    tenantId: tenantId().references(() => tenant.id),
    repuestoId: uuid()
      .notNull()
      .references(() => repuesto.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    cantidad: cantidad('cantidad').notNull().default('0'),
    /** Por debajo de esto hay que reponer. Sin mínimo, no avisa. */
    minimo: cantidad('minimo'),
    /** «Estante 4, cajón B». */
    ubicacion: text(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [primaryKey({ columns: [t.sucursalId, t.repuestoId] })],
)

export const TIPOS_MOVIMIENTO_STOCK = [
  'inicial',
  'ajuste',
  'compra',
  'orden',
  'mostrador',
  'transferencia',
] as const

/**
 * El libro del stock: cada pieza que entra o sale, de dónde vino y quién la movió. La
 * cantidad lleva signo (entra positivo, sale negativo) y el saldo queda anotado, así que la
 * historia se lee sin recalcular.
 *
 * Nada se borra ni se corrige: un error se arregla con otro movimiento. Un ajuste pide
 * motivo, porque es la forma de esconder un faltante.
 */
export const movimientoStock = pgTable(
  'movimiento_stock',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    repuestoId: uuid()
      .notNull()
      .references(() => repuesto.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    tipo: text().notNull(),
    cantidad: cantidad('cantidad').notNull(),
    saldo: cantidad('saldo').notNull(),
    /** En una compra, lo que costó cada una, sin IVA. */
    costoUnitario: dinero('costo_unitario'),
    ordenId: uuid().references(() => orden.id),
    pedidoId: uuid().references((): AnyPgColumn => pedidoRepuestos.id),
    compraId: uuid().references((): AnyPgColumn => compra.id),
    /** En una transferencia, la otra punta. */
    otraSucursalId: uuid().references(() => sucursal.id),
    motivo: text(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('movimiento_stock_repuesto_idx').on(t.repuestoId, t.sucursalId, t.creadoEn),
    check(
      'movimiento_stock_tipo_valido',
      sql`${t.tipo} in ('inicial', 'ajuste', 'compra', 'orden', 'mostrador', 'transferencia')`,
    ),
    check('movimiento_stock_cantidad_no_cero', sql`${t.cantidad} <> 0`),
    check(
      'movimiento_stock_ajuste_con_motivo',
      sql`${t.tipo} <> 'ajuste' or coalesce(trim(${t.motivo}), '') <> ''`,
    ),
  ],
)

export const ESTADOS_PEDIDO_REPUESTOS = [
  'abierto',
  'en_caja',
  'facturado',
  'entregado',
  'anulado',
] as const

/**
 * Un pedido de repuestos: alguien necesita piezas y el repuestero las busca.
 *
 * **Siempre con chasis**, porque es con lo que se busca en la base de datos de la marca. A
 * quién va es opcional y excluyente:
 *
 * - **A una orden de trabajo**: al entregarlo, las piezas pasan a la orden y salen del stock
 *   como consumo del taller. Se cobran con la orden.
 * - **A un cliente, o a nadie** (mostrador, consumidor final): al mandarlo a caja salen del
 *   stock, y se factura desde caja como cualquier venta.
 */
export const pedidoRepuestos = pgTable(
  'pedido_repuestos',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    numero: bigint({ mode: 'number' }).notNull(),
    estado: text().notNull().default('abierto'),
    chasis: text().notNull(),
    /** El vehículo cargado con ese chasis, si lo hay. Un auto de paso no tiene por qué estar. */
    vehiculoId: uuid().references(() => vehiculo.id),
    ordenId: uuid().references(() => orden.id),
    clienteId: uuid().references(() => entidadComercial.id),
    /** Quién lo pide, si no es quien lo carga: «Diego, box 3», «cliente por teléfono». */
    solicitante: text(),
    nota: text(),
    creadoPor: uuid()
      .notNull()
      .references(() => usuario.id),
    enCajaEn: timestamp({ withTimezone: true }),
    entregadoEn: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('pedido_repuestos_numero_uq').on(t.sucursalId, t.numero),
    index('pedido_repuestos_estado_idx').on(t.sucursalId, t.estado),
    index('pedido_repuestos_orden_idx').on(t.ordenId),
    check(
      'pedido_repuestos_estado_valido',
      sql`${t.estado} in ('abierto', 'en_caja', 'facturado', 'entregado', 'anulado')`,
    ),
    check('pedido_repuestos_chasis_formato', sql`${t.chasis} ~ '^[A-HJ-NPR-Z0-9]{6,17}$'`),
    check('pedido_repuestos_orden_o_cliente', sql`${t.ordenId} is null or ${t.clienteId} is null`),
    // Entregado es sólo del taller; en caja y facturado, sólo del mostrador.
    check(
      'pedido_repuestos_estado_segun_destino',
      sql`(${t.ordenId} is not null and ${t.estado} in ('abierto', 'entregado', 'anulado')) or (${t.ordenId} is null and ${t.estado} in ('abierto', 'en_caja', 'facturado', 'anulado'))`,
    ),
  ],
)

/**
 * Las piezas del pedido. Una del catálogo lleva `repuesto_id` y mueve stock; una que no está
 * cargada (hay que pedirla a fábrica) va con su código y descripción y no mueve nada.
 */
export const pedidoRepuestosItem = pgTable(
  'pedido_repuestos_item',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidoRepuestos.id),
    orden: smallint().notNull(),
    repuestoId: uuid().references(() => repuesto.id),
    codigo: text(),
    descripcion: text().notNull(),
    cantidad: cantidad('cantidad').notNull().default('1'),
    precioUnitario: dinero('precio_unitario').notNull().default('0'),
    codigoAlicuota: smallint().notNull().default(5),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('pedido_repuestos_item_pedido_idx').on(t.pedidoId, t.orden),
    check('pedido_repuestos_item_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('pedido_repuestos_item_precio_no_negativo', sql`${t.precioUnitario} >= 0`),
  ],
)

export const ESTADOS_COMPRA = ['pedida', 'recibida', 'anulada'] as const

/**
 * Lo que se le pide a un proveedor —la fábrica, un distribuidor— y cómo llegó.
 *
 * Pedida → recibida: al recibir se anota la factura del proveedor, cuánto llegó de cada
 * renglón y a qué costo, y entra al stock de la sucursal. Lo que no llegó no entra.
 */
export const compra = pgTable(
  'compra',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    numero: bigint({ mode: 'number' }).notNull(),
    estado: text().notNull().default('pedida'),
    proveedorId: uuid()
      .notNull()
      .references(() => proveedor.id),
    /** «FA A 0003-00012345»: tal cual la factura o el remito del proveedor. */
    comprobanteProveedor: text(),
    fechaComprobante: date(),
    nota: text(),
    creadoPor: uuid()
      .notNull()
      .references(() => usuario.id),
    recibidaPor: uuid().references(() => usuario.id),
    recibidaEn: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('compra_numero_uq').on(t.sucursalId, t.numero),
    index('compra_estado_idx').on(t.sucursalId, t.estado),
    check('compra_estado_valido', sql`${t.estado} in ('pedida', 'recibida', 'anulada')`),
    check(
      'compra_recibida_con_fecha',
      sql`${t.estado} <> 'recibida' or ${t.recibidaEn} is not null`,
    ),
  ],
)

export const compraRenglon = pgTable(
  'compra_renglon',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    compraId: uuid()
      .notNull()
      .references(() => compra.id),
    orden: smallint().notNull(),
    repuestoId: uuid()
      .notNull()
      .references(() => repuesto.id),
    cantidad: cantidad('cantidad').notNull(),
    /** Sin IVA, como en la factura del proveedor. */
    costoUnitario: dinero('costo_unitario').notNull().default('0'),
    cantidadRecibida: cantidad('cantidad_recibida'),
  },
  (t) => [
    index('compra_renglon_compra_idx').on(t.compraId, t.orden),
    check('compra_renglon_cantidad_positiva', sql`${t.cantidad} > 0`),
    check(
      'compra_renglon_recibida_no_negativa',
      sql`${t.cantidadRecibida} is null or ${t.cantidadRecibida} >= 0`,
    ),
    check('compra_renglon_costo_no_negativo', sql`${t.costoUnitario} >= 0`),
  ],
)

/** El último número de pedido y de compra de cada sucursal. */
export const repuestosSecuencia = pgTable(
  'repuestos_secuencia',
  {
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    tipo: text().notNull(),
    ultimo: bigint({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.sucursalId, t.tipo] }),
    check('repuestos_secuencia_tipo_valido', sql`${t.tipo} in ('pedido', 'compra')`),
  ],
)
