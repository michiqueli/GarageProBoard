import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, smallint, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { tenant } from './tenant.ts'

/**
 * Los puntos que se revisan cuando entra un auto, con su semáforo. El porqué, en
 * `docs/tecnicos/hoja-de-recepcion.md`.
 *
 * **Son un catálogo de la concesionaria**, no una lista del código: arranca con los de la hoja
 * de VW y cada taller apaga los que no hace, los ordena y agrega los suyos. Un taller de GNC
 * revisa cosas que a VW no le importan.
 *
 * **Un punto no se borra nunca**: se desactiva. Una revisión firmada hace ocho meses tiene que
 * poder leerse aunque el punto hoy no se use. Y como las respuestas guardan el nombre que tenía
 * el punto al contestarse, cambiarle el nombre tampoco reescribe la historia.
 */
export const revisionPunto = pgTable(
  'revision_punto',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    /**
     * De cuál de la semilla viene. Es lo que impide sembrar dos veces el mismo, y por eso los
     * que agrega el taller no la tienen: ésos no vienen de ningún lado.
     */
    clave: text(),
    seccion: text().notNull(),
    nombre: text().notNull(),
    /** El lugar dentro de su sección. */
    orden: smallint().notNull(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('revision_punto_clave_uq').on(t.tenantId, t.clave).where(sql`clave is not null`),
    index('revision_punto_seccion_idx').on(t.tenantId, t.seccion, t.orden),
    // Escrito a mano y no armado desde `@gpb/core`: drizzle-kit no resuelve los paquetes del
    // workspace al generar, y sumar una sección tiene que generar la migración que la admite.
    check(
      'revision_punto_seccion_valida',
      sql`${t.seccion} in ('exterior', 'interior', 'motor', 'dinamica', 'neumaticos')`,
    ),
    check('revision_punto_nombre_valido', sql`length(btrim(${t.nombre})) between 1 and 60`),
  ],
)
