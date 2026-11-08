import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { repuesto } from './repuestos.ts'
import { tenant } from './tenant.ts'

/**
 * Un service del catálogo del taller: «10.000 km de la Kangoo», con sus trabajos, sus repuestos y
 * cuánto debería llevar. Ver `docs/tecnicos/catalogo-de-services.md`.
 *
 * Sin marca es genérico, y se ofrece para cualquier auto. **La orden copia los renglones**: cambiar
 * el catálogo no le cambia nada a un auto que ya se recibió. Por eso uno que no se usa más se
 * apaga, sin baja, y reimportarlo reemplaza sus renglones sin riesgo.
 */
export const serviceCatalogo = pgTable(
  'service_catalogo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    marca: text(),
    modelo: text(),
    nombre: text().notNull(),
    kilometros: integer(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('service_catalogo_uq').on(
      t.tenantId,
      sql`lower(coalesce(${t.marca}, ''))`,
      sql`lower(coalesce(${t.modelo}, ''))`,
      sql`lower(${t.nombre})`,
    ),
    check('service_catalogo_km_valido', sql`${t.kilometros} is null or ${t.kilometros} >= 0`),
  ],
)

/**
 * Un renglón de un service. El precio de una pieza del catálogo de repuestos no sale de acá sino
 * del catálogo, al cargarlo en la orden: el precio de hoy, no el del día que se importó.
 */
export const serviceCatalogoItem = pgTable(
  'service_catalogo_item',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    serviceId: uuid()
      .notNull()
      .references(() => serviceCatalogo.id),
    orden: smallint().notNull(),
    tipo: text().notNull(),
    repuestoId: uuid().references(() => repuesto.id),
    codigo: text(),
    descripcion: text().notNull(),
    cantidad: numeric({ precision: 18, scale: 4 }).notNull().default('1'),
    precioUnitario: numeric({ precision: 18, scale: 4 }).notNull().default('0'),
    codigoAlicuota: smallint().notNull().default(5),
    /** El tiempo estipulado. Sólo en los trabajos: es contra lo que se compara el real. */
    minutos: integer(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('service_catalogo_item_service_idx').on(t.serviceId, t.orden),
    check('service_catalogo_item_tipo_valido', sql`${t.tipo} in ('trabajo', 'repuesto')`),
    check('service_catalogo_item_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('service_catalogo_item_precio_no_negativo', sql`${t.precioUnitario} >= 0`),
    check(
      'service_catalogo_item_minutos_validos',
      sql`${t.minutos} is null or (${t.minutos} >= 0 and ${t.tipo} = 'trabajo')`,
    ),
  ],
)
