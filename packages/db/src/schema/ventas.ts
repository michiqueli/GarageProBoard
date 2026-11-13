import { sql } from 'drizzle-orm'
import {
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { unidad, unidadReserva } from './cartera.ts'
import { entidadComercial } from './comercial.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/** Lo que cada concesionaria elige sobre sus ventas. Sin fila, `CONFIG_VENTAS_POR_OMISION`. */
export const ventasConfig = pgTable(
  'ventas_config',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    descuentoMaximo: numeric({ precision: 5, scale: 2 }),
    exigeSaldoCero: boolean().notNull(),
    actualizadoEn: actualizadoEn(),
    actualizadoPor: uuid().references(() => usuario.id),
  },
  (t) => [
    unique('ventas_config_tenant_uq').on(t.tenantId),
    check(
      'ventas_config_descuento_valido',
      sql`${t.descuentoMaximo} is null or ${t.descuentoMaximo} between 0 and 100`,
    ),
  ],
)

export const ventaSecuencia = pgTable(
  'venta_secuencia',
  {
    tenantId: tenantId().references(() => tenant.id),
    ultimo: bigint({ mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId] })],
)

/**
 * La venta de una unidad. Mientras es borrador se modifica entera; confirmada, la unidad queda
 * vendida y lo único que se puede hacer es anularla, con motivo.
 */
export const venta = pgTable(
  'venta',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    numero: bigint({ mode: 'number' }).notNull(),
    unidadId: uuid()
      .notNull()
      .references(() => unidad.id),
    clienteId: uuid()
      .notNull()
      .references(() => entidadComercial.id),
    vendedorId: uuid().references(() => usuario.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    estado: text().notNull().default('borrador'),
    precio: numeric({ precision: 18, scale: 2 }).notNull(),
    moneda: text().notNull(),
    fecha: date().notNull().default(sql`current_date`),
    observaciones: text(),
    /** Si se confirmó pasando el descuento máximo: quién lo autorizó y por qué. */
    autorizacionMotivo: text(),
    autorizadaPor: uuid().references(() => usuario.id),
    confirmadaEn: timestamp({ withTimezone: true }),
    anulacionMotivo: text(),
    anuladaEn: timestamp({ withTimezone: true }),
    anuladaPor: uuid().references(() => usuario.id),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('venta_numero_uq').on(t.tenantId, t.numero),
    // Una unidad se vende una vez: una venta viva por unidad.
    uniqueIndex('venta_unidad_viva_uq').on(t.unidadId).where(sql`estado <> 'anulada'`),
    index('venta_estado_idx').on(t.tenantId, t.estado),
    check('venta_estado_valido', sql`${t.estado} in ('borrador', 'confirmada', 'anulada')`),
    check('venta_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
    check('venta_precio_no_negativo', sql`${t.precio} >= 0`),
  ],
)

/** Gastos del cliente, descuentos y costos de la venta. Se reemplazan enteros con el borrador. */
export const ventaConcepto = pgTable(
  'venta_concepto',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ventaId: uuid()
      .notNull()
      .references(() => venta.id),
    orden: smallint().notNull(),
    tipo: text().notNull(),
    descripcion: text().notNull(),
    importe: numeric({ precision: 18, scale: 2 }).notNull(),
    moneda: text().notNull(),
    cotizacion: numeric({ precision: 18, scale: 4 }),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('venta_concepto_venta_idx').on(t.ventaId, t.orden),
    check(
      'venta_concepto_tipo_valido',
      sql`${t.tipo} in ('gasto_cliente', 'descuento', 'costo_venta')`,
    ),
    check('venta_concepto_importe_positivo', sql`${t.importe} > 0`),
    check('venta_concepto_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
  ],
)

/** Cómo se paga. El usado y la seña apuntan a lo suyo: la unidad tomada y la reserva. */
export const ventaPago = pgTable(
  'venta_pago',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ventaId: uuid()
      .notNull()
      .references(() => venta.id),
    orden: smallint().notNull(),
    medio: text().notNull(),
    importe: numeric({ precision: 18, scale: 2 }).notNull(),
    moneda: text().notNull(),
    cotizacion: numeric({ precision: 18, scale: 4 }),
    detalle: text(),
    /** En una financiación: el banco o la financiera, y las cuotas. */
    entidad: text(),
    cuotas: smallint(),
    unidadUsadaId: uuid().references(() => unidad.id),
    reservaId: uuid().references(() => unidadReserva.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('venta_pago_venta_idx').on(t.ventaId, t.orden),
    check(
      'venta_pago_medio_valido',
      sql`${t.medio} in ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'financiacion', 'usado', 'sena', 'otro')`,
    ),
    check('venta_pago_importe_positivo', sql`${t.importe} > 0`),
    check('venta_pago_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
    check('venta_pago_cuotas_validas', sql`${t.cuotas} is null or ${t.cuotas} between 1 and 120`),
  ],
)
