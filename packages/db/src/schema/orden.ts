import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
import { repuesto } from './repuestos.ts'
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
    /** Quién dice que sí a los trabajos: el dueño de la flota, no el chofer que trajo el auto. */
    autorizaNombre: text(),
    autorizaTelefono: text(),

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
    /** Si la pieza es del catálogo: cargarla descuenta el stock de la sucursal, sacarla lo devuelve. */
    repuestoId: uuid().references((): AnyPgColumn => repuesto.id),
    codigo: text(),
    descripcion: text().notNull(),
    cantidad: numeric({ precision: 18, scale: 4 }).notNull().default('1'),
    precioUnitario: numeric({ precision: 18, scale: 4 }).notNull().default('0'),
    /** Código de alícuota de AFIP. 21% por omisión: la mano de obra y casi todo repuesto. */
    codigoAlicuota: smallint().notNull().default(5),
    /**
     * Sin valor, el renglón no pasó por un presupuesto: lo pidió el cliente al dejar el auto, o
     * el asesor lo carga sin consultar. Pendiente, está en un presupuesto esperando respuesta y
     * no se toca. Rechazado, queda a la vista pero no se cobra ni consume stock.
     */
    autorizacion: text(),
    presupuestoId: uuid().references((): AnyPgColumn => ordenPresupuesto.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('orden_item_orden_idx').on(t.ordenId, t.orden),
    check(
      'orden_item_autorizacion_valida',
      sql`${t.autorizacion} is null or ${t.autorizacion} in ('pendiente', 'autorizado', 'rechazado')`,
    ),
    check(
      'orden_item_autorizacion_con_presupuesto',
      sql`(${t.autorizacion} is null) = (${t.presupuestoId} is null)`,
    ),
    check('orden_item_tipo_valido', sql`${t.tipo} in ('trabajo', 'repuesto')`),
    check('orden_item_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('orden_item_precio_no_negativo', sql`${t.precioUnitario} >= 0`),
  ],
)

export const MEDIOS_AUTORIZACION = ['presencial', 'telefono', 'whatsapp', 'mail'] as const

/**
 * Un presupuesto: los trabajos y repuestos que se le consultan al cliente antes de hacerlos.
 *
 * No copia los renglones: los marca (`orden_item.presupuesto_id`). Lo que se presupuestó es lo
 * que está en la orden, y mientras espera respuesta no se modifica, así que la foto y la orden
 * no pueden divergir. El total sí queda anotado: es lo que se le dijo al cliente.
 *
 * La respuesta dice quién autorizó y por qué medio. Por teléfono o WhatsApp no hay firma, y
 * «¿quién dijo que sí?» es la primera pregunta cuando el cliente no quiere pagar.
 */
export const ordenPresupuesto = pgTable(
  'orden_presupuesto',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ordenId: uuid()
      .notNull()
      .references((): AnyPgColumn => orden.id),
    /** 1, 2, 3… dentro de la orden: «OT 123, presupuesto 2». */
    numero: smallint().notNull(),
    estado: text().notNull().default('pendiente'),
    total: numeric({ precision: 18, scale: 2 }).notNull(),
    enviadoA: text(),
    creadoPor: uuid()
      .notNull()
      .references(() => usuario.id),
    autorizaNombre: text(),
    autorizaMedio: text(),
    nota: text(),
    respondidoPor: uuid().references(() => usuario.id),
    respondidoEn: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [
    unique('orden_presupuesto_numero_uq').on(t.ordenId, t.numero),
    check('orden_presupuesto_estado_valido', sql`${t.estado} in ('pendiente', 'respondido')`),
    check(
      'orden_presupuesto_medio_valido',
      sql`${t.autorizaMedio} is null or ${t.autorizaMedio} in ('presencial', 'telefono', 'whatsapp', 'mail')`,
    ),
    check(
      'orden_presupuesto_respuesta_completa',
      sql`${t.estado} <> 'respondido' or (${t.respondidoEn} is not null and ${t.autorizaNombre} is not null and ${t.autorizaMedio} is not null)`,
    ),
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
