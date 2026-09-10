import { boolean, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { creadoEn, pk } from './_comunes.ts'

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
