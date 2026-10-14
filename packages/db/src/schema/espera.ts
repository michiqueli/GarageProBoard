import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { orden } from './orden.ts'
import { tenant } from './tenant.ts'

/**
 * Por qué puede estar parado un auto en el taller. Ver
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 *
 * **Es un catálogo de la concesionaria**, como los puntos de la revisión: arranca con los del
 * sistema y cada taller apaga los que no usa y agrega los suyos. Un motivo no se borra nunca, se
 * apaga: una espera de hace ocho meses tiene que poder leerse.
 */
export const motivoEspera = pgTable(
  'motivo_espera',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    /**
     * De cuál de la semilla viene. Es lo que deja que un estado de la orden —«esperando
     * repuesto»— abra el suyo solo, y por eso los que agrega el taller no la tienen.
     */
    clave: text(),
    nombre: text().notNull(),
    orden: smallint().notNull(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('motivo_espera_clave_uq').on(t.tenantId, t.clave).where(sql`clave is not null`),
    check('motivo_espera_nombre_valido', sql`length(btrim(${t.nombre})) between 1 and 60`),
  ],
)

/**
 * Un rato en que el auto estuvo parado, con su motivo. Abierta mientras no tiene `hasta`.
 *
 * **Una sola abierta por orden**: un auto espera una cosa por vez, y si aparece otra, la anterior
 * se cierra ahí. Así la suma de las esperas nunca pasa del tiempo en el taller.
 */
export const ordenEspera = pgTable(
  'orden_espera',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ordenId: uuid()
      .notNull()
      .references(() => orden.id),
    motivoId: uuid()
      .notNull()
      .references(() => motivoEspera.id),
    /** Una línea: «la bomba viene de Pacheco, llega el jueves». */
    nota: text(),
    desde: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
    hasta: timestamp({ withTimezone: true }),
    abiertaPor: uuid().references(() => usuario.id),
    cerradaPor: uuid().references(() => usuario.id),
  },
  (t) => [
    index('orden_espera_orden_idx').on(t.ordenId),
    uniqueIndex('orden_espera_abierta_uq').on(t.ordenId).where(sql`hasta is null`),
    check('orden_espera_rango_valido', sql`${t.hasta} is null or ${t.hasta} >= ${t.desde}`),
  ],
)
