import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { pk, tenantId } from './_comunes.ts'
import { empleado } from './comercial.ts'
import { tenant } from './tenant.ts'

/**
 * La credencial con la que un empleado ficha: el QR `GT1:M:…` impreso en una tarjeta.
 *
 * Cuelga de `empleado` y no de `usuario` a propósito. **La mayoría de los que fichan no
 * entran al sistema**: el lavador y el de limpieza marcan entrada y no tienen cuenta, y
 * pedirles un correo único y una contraseña para que puedan apoyar una tarjeta sobre un
 * lector sería inventarles una identidad que no usan. El que además entra al sistema tiene
 * su `usuario`, apuntando a este mismo empleado.
 *
 * **Guarda el código, no el QR.** El texto impreso es `GT1:M:<codigo>:<firma>` y la firma la
 * calcula el servidor al imprimir y la verifica al escanear (`apps/api/src/comun/qr.ts`).
 * Guardar el QR entero sería guardar la firma, y entonces rotar `QR_SECRET` obligaría a
 * reescribir la tabla en vez de reimprimir las tarjetas.
 *
 * **No se borra: se revoca, con motivo.** Una credencial perdida sigue existiendo en el
 * mundo —una tarjeta se lleva en el bolsillo— y lo que hay que poder contestar el día que
 * aparezca un fichaje raro es cuándo dejó de valer y por qué. Por eso tampoco se reutiliza
 * el código: emitir una nueva es una fila nueva.
 */
export const credencial = pgTable(
  'credencial',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    empleadoId: uuid()
      .notNull()
      .references(() => empleado.id),
    /** Los 8 caracteres al azar del QR, en el alfabeto de Crockford. */
    codigo: text().notNull(),
    emitidaEn: timestamp('emitida_en', { withTimezone: true }).notNull().default(sql`now()`),
    revocadaEn: timestamp({ withTimezone: true }),
    /** «La perdió», «renunció», «se arruinó». Sin motivo no se revoca. */
    motivoRevocacion: text(),
  },
  (t) => [
    // Único en todo el sistema, igual que el de la orden: el lector manda un código pelado
    // y el servidor tiene que poder resolverlo sin preguntar antes de qué concesionaria es.
    unique('credencial_codigo_uq').on(t.codigo),
    // Una sola vigente por empleado. Parcial, porque las revocadas se acumulan: es un
    // historial, y el índice tiene que dejar que haya diez viejas y una sola en uso.
    uniqueIndex('credencial_vigente_uq').on(t.empleadoId).where(sql`${t.revocadaEn} is null`),
    index('credencial_empleado_idx').on(t.tenantId, t.empleadoId),
    check('credencial_codigo_formato', sql`${t.codigo} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
    // Revocada y sin motivo, o con motivo y sin revocar, son las dos formas de que el
    // registro no explique nada. La base no las deja entrar.
    check(
      'credencial_revocacion_con_motivo',
      sql`(${t.revocadaEn} is null) = (${t.motivoRevocacion} is null)`,
    ),
  ],
)
