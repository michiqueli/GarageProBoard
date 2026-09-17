import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { entidadComercial } from './comercial.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'
import { vehiculo } from './vehiculo.ts'

export const ESTADOS_ORDEN = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
  'terminada',
  'facturada',
  'entregada',
  'anulada',
] as const

export const NIVELES_COMBUSTIBLE = ['vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno'] as const

/**
 * La orden de trabajo: el auto que entró, qué pidió el cliente, qué se le hizo y qué se
 * le cobra.
 *
 * **Cuatro roles, no uno** (ver `docs/tecnicos/nucleo-modelo-datos.md`): el titular sale de
 * la titularidad del vehículo al abrir; quien trae es un contacto de palabra; quien paga es
 * el receptor de la factura, editable. Si la orden asumiera «se le factura al titular»,
 * garantías y siniestros no entrarían nunca.
 *
 * El número es correlativo **por sucursal**: es el que dice el asesor en voz alta y el que
 * tipea el mecánico cuando el QR está arruinado. El `codigo_qr` es otra cosa: ocho
 * caracteres al azar, firmados al imprimir, para que nadie arme un QR con el celular.
 *
 * Los estados, en el orden del día del auto: recibida → en proceso ↔ esperando (repuesto
 * o autorización) → terminada, que es cuando pasa a caja → facturada → entregada. Anulada
 * se puede llegar desde cualquiera antes de facturar.
 *
 * La factura apunta a la orden (`comprobante.orden_id`) y no al revés: así el índice único de
 * ese lado impide facturar dos veces la misma orden, y anular la factura la devuelve a caja.
 */
export const orden = pgTable(
  'orden',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    numero: bigint({ mode: 'number' }).notNull(),
    codigoQr: text().notNull(),
    estado: text().notNull().default('recibida'),

    vehiculoId: uuid()
      .notNull()
      .references(() => vehiculo.id),
    /** El titular al momento de abrir: si el auto se vende después, la orden no cambia. */
    titularId: uuid().references(() => entidadComercial.id),
    /** A quién se le factura. Por omisión el titular; en garantía, la terminal. */
    pagaId: uuid().references(() => entidadComercial.id),
    traeNombre: text(),
    traeTelefono: text(),

    kilometraje: integer(),
    combustible: text(),
    /** Lo que pidió el cliente, con sus palabras: «hace ruido al frenar». */
    pedido: text().notNull(),
    /** El estado del auto al recibirlo: rayones, golpes, lo que falta. */
    observaciones: text(),
    prometidaPara: date(),

    asesorId: uuid()
      .notNull()
      .references(() => usuario.id),
    mecanicoId: uuid().references(() => usuario.id),

    terminadaEn: timestamp({ withTimezone: true }),
    entregadaEn: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('orden_sucursal_numero_uq').on(t.sucursalId, t.numero),
    unique('orden_codigo_qr_uq').on(t.codigoQr),
    index('orden_estado_idx').on(t.sucursalId, t.estado),
    index('orden_vehiculo_idx').on(t.vehiculoId),
    check(
      'orden_estado_valido',
      sql`${t.estado} in ('recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion', 'terminada', 'facturada', 'entregada', 'anulada')`,
    ),
    check(
      'orden_combustible_valido',
      sql`${t.combustible} is null or ${t.combustible} in ('vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno')`,
    ),
    check('orden_kilometraje_positivo', sql`${t.kilometraje} is null or ${t.kilometraje} >= 0`),
    check('orden_codigo_qr_formato', sql`${t.codigoQr} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
  ],
)

/**
 * Qué se le hace al auto y qué se cobra: trabajos con su mano de obra, y repuestos. Una sola
 * tabla con `tipo`, porque en la factura son renglones iguales y en la orden se listan
 * juntos. Precio **final, con IVA**, como en la caja.
 */
export const ordenItem = pgTable(
  'orden_item',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ordenId: uuid()
      .notNull()
      .references(() => orden.id),
    tipo: text().notNull(),
    orden: smallint().notNull(),
    codigo: text(),
    descripcion: text().notNull(),
    cantidad: numeric({ precision: 18, scale: 4 }).notNull().default('1'),
    precioUnitario: numeric({ precision: 18, scale: 4 }).notNull().default('0'),
    /** Código de alícuota de AFIP. 21% por omisión: la mano de obra y casi todo repuesto. */
    codigoAlicuota: smallint().notNull().default(5),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('orden_item_orden_idx').on(t.ordenId, t.orden),
    check('orden_item_tipo_valido', sql`${t.tipo} in ('trabajo', 'repuesto')`),
    check('orden_item_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('orden_item_precio_no_negativo', sql`${t.precioUnitario} >= 0`),
  ],
)

/** El último número de orden de cada sucursal. Se toma con `for update`: sin huecos ni repetidos. */
export const ordenSecuencia = pgTable(
  'orden_secuencia',
  {
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    ultimo: bigint({ mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sucursalId] })],
)
