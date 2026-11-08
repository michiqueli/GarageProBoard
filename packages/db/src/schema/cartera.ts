import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { entidadComercial } from './comercial.ts'
import { empresa, sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'
import { vehiculo } from './vehiculo.ts'

/**
 * Lo que cada concesionaria elige sobre su stock. Sin fila, los valores por omisión de
 * `CONFIG_CARTERA_POR_OMISION`. Ver `docs/tecnicos/ventas-de-unidades.md`.
 */
export const carteraConfig = pgTable(
  'cartera_config',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    trasladoEntreEmpresas: text().notNull(),
    reservaModo: text().notNull(),
    reservaDias: smallint(),
    reservaExigeSena: boolean().notNull(),
    tenenciaUsado: text().notNull(),
    moneda: text().notNull(),
    actualizadoEn: actualizadoEn(),
    actualizadoPor: uuid().references(() => usuario.id),
  },
  (t) => [
    unique('cartera_config_tenant_uq').on(t.tenantId),
    check(
      'cartera_config_traslado_valido',
      sql`${t.trasladoEntreEmpresas} in ('solo_ubicacion', 'con_comprobante')`,
    ),
    check('cartera_config_reserva_valida', sql`${t.reservaModo} in ('bloquea', 'avisa')`),
    check(
      'cartera_config_dias_validos',
      sql`${t.reservaDias} is null or ${t.reservaDias} between 1 and 365`,
    ),
    check('cartera_config_tenencia_valida', sql`${t.tenenciaUsado} in ('propia', 'consignacion')`),
    check('cartera_config_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
  ],
)

/**
 * El paso de un vehículo por el stock. Un auto que se vendió y vuelve como usado es la misma ficha
 * de vehículo y una unidad nueva: por eso el índice único mira sólo las que están en stock.
 */
export const unidad = pgTable(
  'unidad',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    vehiculoId: uuid()
      .notNull()
      .references(() => vehiculo.id),
    condicion: text().notNull(),
    tenencia: text().notNull(),
    origen: text().notNull(),
    estado: text().notNull().default('disponible'),
    /** Quién la tiene a su nombre, si es propia. */
    empresaId: uuid().references(() => empresa.id),
    /** De quién es, si está en consignación. */
    consignanteId: uuid().references(() => entidadComercial.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    precio: numeric({ precision: 18, scale: 2 }),
    moneda: text().notNull().default('ARS'),
    fechaIngreso: date().notNull().default(sql`current_date`),
    observaciones: text(),
    retiroMotivo: text(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
    creadoPor: uuid().references(() => usuario.id),
  },
  (t) => [
    uniqueIndex('unidad_en_stock_uq')
      .on(t.tenantId, t.vehiculoId)
      .where(sql`estado in ('disponible', 'reservada')`),
    index('unidad_estado_idx').on(t.tenantId, t.estado),
    index('unidad_sucursal_idx').on(t.sucursalId),
    check('unidad_condicion_valida', sql`${t.condicion} in ('0km', 'usado')`),
    check('unidad_tenencia_valida', sql`${t.tenencia} in ('propia', 'consignacion')`),
    check(
      'unidad_origen_valido',
      sql`${t.origen} in ('fabrica', 'compra', 'parte_de_pago', 'consignacion', 'otro')`,
    ),
    check(
      'unidad_estado_valido',
      sql`${t.estado} in ('disponible', 'reservada', 'vendida', 'retirada')`,
    ),
    check('unidad_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
    check('unidad_precio_no_negativo', sql`${t.precio} is null or ${t.precio} >= 0`),
    check(
      'unidad_dueno_valido',
      sql`(${t.tenencia} = 'propia' and ${t.empresaId} is not null and ${t.consignanteId} is null)
          or (${t.tenencia} = 'consignacion' and ${t.consignanteId} is not null and ${t.empresaId} is null)`,
    ),
  ],
)

/** Una reserva de una unidad. Las cerradas quedan: es lo que se mira cuando alguien reclama. */
export const unidadReserva = pgTable(
  'unidad_reserva',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    unidadId: uuid()
      .notNull()
      .references(() => unidad.id),
    clienteId: uuid()
      .notNull()
      .references(() => entidadComercial.id),
    estado: text().notNull().default('activa'),
    sena: numeric({ precision: 18, scale: 2 }),
    moneda: text().notNull().default('ARS'),
    vence: date(),
    nota: text(),
    cierreMotivo: text(),
    cerradaEn: timestamp({ withTimezone: true }),
    cerradaPor: uuid().references(() => usuario.id),
    creadoEn: creadoEn(),
    creadoPor: uuid().references(() => usuario.id),
  },
  (t) => [
    index('unidad_reserva_unidad_idx').on(t.unidadId, t.estado),
    check(
      'unidad_reserva_estado_valido',
      sql`${t.estado} in ('activa', 'vencida', 'liberada', 'desplazada')`,
    ),
    check('unidad_reserva_sena_no_negativa', sql`${t.sena} is null or ${t.sena} >= 0`),
    check('unidad_reserva_moneda_valida', sql`${t.moneda} in ('ARS', 'USD')`),
  ],
)

/** La historia de una unidad, contada en palabras. Sólo se agrega. */
export const unidadMovimiento = pgTable(
  'unidad_movimiento',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    unidadId: uuid()
      .notNull()
      .references(() => unidad.id),
    tipo: text().notNull(),
    detalle: text().notNull(),
    /** El remito o la factura del traslado, si la concesionaria los pide. */
    comprobante: text(),
    creadoEn: creadoEn(),
    creadoPor: uuid().references(() => usuario.id),
  },
  (t) => [
    index('unidad_movimiento_unidad_idx').on(t.unidadId, t.creadoEn),
    check(
      'unidad_movimiento_tipo_valido',
      sql`${t.tipo} in ('ingreso', 'traslado', 'reserva', 'liberacion', 'precio', 'retiro')`,
    ),
  ],
)
