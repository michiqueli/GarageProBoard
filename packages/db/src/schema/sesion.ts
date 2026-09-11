import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/**
 * Sesión abierta: un token de refresco vivo.
 *
 * Existe porque el token de refresco **rota**: cada uso emite uno nuevo y anula el
 * anterior. Sin guardarlos no hay forma de anular nada, y un token robado serviría
 * hasta su vencimiento.
 *
 * La rotación habilita además la detección de reuso, que es lo que realmente protege:
 * si alguien presenta un token ya rotado, o lo robaron o el legítimo se quedó con una
 * copia vieja. En cualquiera de los dos casos no se puede distinguir al ladrón del
 * dueño, así que **se anula la familia entera** y los dos vuelven a autenticarse. Es
 * molesto una vez y cierra el robo; lo contrario es dejarlo abierto para siempre.
 */
export const sesion = pgTable(
  'sesion',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),

    /**
     * SHA-256 del token, nunca el token. Si alguien se lleva un volcado de la base,
     * se lleva hashes que no sirven para entrar.
     */
    hashRefresco: text().notNull(),

    /**
     * Todas las rotaciones de un mismo inicio de sesión comparten familia. Es la
     * unidad que se anula cuando se detecta un reuso.
     */
    familia: uuid().notNull(),

    /** La sucursal elegida al entrar. Viaja en el token para acotar los permisos. */
    sucursalId: uuid().references(() => sucursal.id),

    expiraEn: timestamp({ withTimezone: true }).notNull(),
    /** Se completa al rotar o al cerrar sesión. Una fila con fecha acá ya no sirve. */
    anuladaEn: timestamp({ withTimezone: true }),
    motivoAnulacion: text(),

    /** Para que el usuario pueda revisar sus sesiones y reconocer una que no es suya. */
    agente: text(),
    ip: text(),

    creadoEn: creadoEn(),
    ultimoUsoEn: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('sesion_hash_idx').on(t.hashRefresco),
    index('sesion_familia_idx').on(t.familia),
    index('sesion_usuario_idx').on(t.usuarioId),
  ],
)
