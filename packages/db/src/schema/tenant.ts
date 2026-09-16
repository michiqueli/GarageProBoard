import { MODULOS } from '@garagepro/core'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'

/**
 * La concesionaria que contrata el sistema. Es el límite de aislamiento: todo lo
 * que tiene `tenant_id` vive detrás de una política de RLS que lo compara contra
 * `app.tenant_id` de la sesión.
 */
export const tenant = pgTable(
  'tenant',
  {
    id: pk(),
    nombre: text().notNull(),
    /** Identificador corto para URLs y subdominios: 'automotores-litoral'. */
    slug: text().notNull(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('tenant_slug_uq').on(t.slug)],
)

/**
 * Qué módulos contrató cada concesionaria.
 *
 * **Sin fila, el módulo está apagado**: cerrado por omisión, como los permisos. Un
 * módulo nuevo no le aparece a nadie hasta que se lo den de alta.
 *
 * Dos cosas distintas deciden si está prendido, y se guardan separadas:
 *
 * - `activo` es la llave: la movemos nosotros para suspender o rehabilitar, sin
 *   perder las fechas del contrato.
 * - `vigente_desde` / `vigente_hasta` es el período contratado: una prueba de treinta
 *   días se apaga sola, sin que nadie tenga que acordarse.
 *
 * La aplicación **lee pero no escribe** esta tabla: el rol de la API no tiene permiso
 * de escritura (ver `ddlAislamiento`). Si pudiera, el administrador de una
 * concesionaria se habilitaría solo el módulo que no pagó. Lo escribe el back-office.
 */
export const tenantModulo = pgTable(
  'tenant_modulo',
  {
    tenantId: tenantId().references(() => tenant.id),
    modulo: text().notNull(),
    activo: boolean().notNull().default(true),
    vigenteDesde: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
    /** Sin fecha, no vence. */
    vigenteHasta: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.modulo] }),
    // La lista sale del catálogo de `core`: un módulo que la aplicación no conoce no
    // puede quedar contratado. Sumar uno al catálogo genera la migración que lo admite.
    check(
      'tenant_modulo_conocido',
      sql`${t.modulo} in (${sql.raw(MODULOS.map((m) => `'${m}'`).join(', '))})`,
    ),
    check(
      'tenant_modulo_vigencia',
      sql`${t.vigenteHasta} is null or ${t.vigenteHasta} > ${t.vigenteDesde}`,
    ),
  ],
)
