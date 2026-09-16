import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { creadoEn, pk } from './_comunes.ts'
import { tenant } from './tenant.ts'

/**
 * Las tablas del back-office: quiénes somos nosotros y qué hicimos.
 *
 * No pertenecen a ninguna concesionaria y por eso **no llevan `tenant_id`** ni RLS. Lo que
 * las protege es otra cosa: el rol de la API no tiene ningún permiso sobre ellas. Un
 * usuario de una concesionaria no puede ni saber que existen.
 */

/**
 * Alguien de GaragePro que administra concesionarias.
 *
 * Es una tabla aparte y no un usuario de una concesionaria interna: un operador no
 * pertenece a ningún tenant, y mezclarlo con los usuarios de los clientes obligaría a
 * que la API de los clientes supiera saltearse el aislamiento.
 *
 * Se crean desde la línea de comandos (`pnpm db:operador`), no desde el panel: el panel
 * no tiene cómo darse más operadores a sí mismo.
 */
export const operador = pgTable(
  'operador',
  {
    id: pk(),
    email: text().notNull(),
    /** argon2id, igual que los usuarios. */
    hashPassword: text().notNull(),
    nombre: text().notNull(),
    activo: boolean().notNull().default(true),
    ultimoAcceso: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('operador_email_uq').on(t.email),
    check('operador_email_minuscula', sql`${t.email} = lower(${t.email})`),
  ],
)

/**
 * Una sesión de operador: un token opaco en una cookie `httpOnly`.
 *
 * Sin refresco ni rotación, a diferencia de las sesiones de usuarios: dura una jornada y
 * después hay que volver a entrar. Es un panel que se usa un rato por día, y cada
 * sesión viva es una llave para apagarle el sistema a un cliente.
 */
export const sesionOperador = pgTable(
  'sesion_operador',
  {
    id: pk(),
    operadorId: uuid()
      .notNull()
      .references(() => operador.id),
    /** SHA-256 del token, nunca el token. */
    hashToken: text().notNull(),
    expiraEn: timestamp({ withTimezone: true }).notNull(),
    anuladaEn: timestamp({ withTimezone: true }),
    agente: text(),
    ip: text(),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('sesion_operador_hash_uq').on(t.hashToken)],
)

/**
 * Todo lo que un operador cambió.
 *
 * Aparte de `auditoria` porque ésa es de cada concesionaria y la ve su gerente; ésta es
 * nuestra. El rol del back-office puede insertar y leer, **nunca modificar ni borrar**:
 * una auditoría que el auditado puede editar no sirve para nada.
 *
 * La concesionaria afectada va en `tenant_afectado` y no en `tenant_id` a propósito: la
 * fila no es de la concesionaria, es sobre ella.
 */
export const auditoriaBackoffice = pgTable(
  'auditoria_backoffice',
  {
    id: pk(),
    operadorId: uuid()
      .notNull()
      .references(() => operador.id),
    tenantAfectado: uuid().references(() => tenant.id),
    /** Qué se hizo: 'alta_concesionaria', 'modulo', 'estado_concesionaria'. */
    accion: text().notNull(),
    /** Por qué. Obligatorio para apagar algo: dentro de un año nadie se va a acordar. */
    motivo: text(),
    datosAntes: jsonb(),
    datosDespues: jsonb(),
    ip: text(),
    creadoEn: creadoEn(),
  },
  (t) => [index('auditoria_backoffice_tenant_idx').on(t.tenantAfectado, t.creadoEn)],
)
