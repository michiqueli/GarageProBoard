import { sql } from 'drizzle-orm'
import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Clave primaria uuid v4 generada por Postgres (pgcrypto viene incluido desde PG 13). */
export const pk = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

/**
 * Toda tabla con datos de clientes lleva esta columna, y sobre ella se apoyan las
 * políticas de RLS. La FK a `tenant` no se declara acá para no acoplar este módulo:
 * la agrega cada tabla.
 */
export const tenantId = () => uuid('tenant_id').notNull()

export const creadoEn = () =>
  timestamp('creado_en', { withTimezone: true }).notNull().default(sql`now()`)

export const actualizadoEn = () =>
  timestamp('actualizado_en', { withTimezone: true }).notNull().default(sql`now()`)

/**
 * Plata. Cuatro decimales porque los precios unitarios de repuestos los necesitan,
 * y `numeric` porque un float en una factura es un error de auditoría esperando fecha.
 * Del lado de TypeScript se lee como string y se opera con decimal.js: nunca con Number.
 */
export const dinero = (nombre: string) => numeric(nombre, { precision: 18, scale: 4 })
