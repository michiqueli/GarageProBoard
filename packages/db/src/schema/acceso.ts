import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

export const usuario = pgTable(
  'usuario',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    email: text().notNull(),
    /** argon2id. Nunca sale de la base ni aparece en un log. */
    hashPassword: text().notNull(),
    nombre: text().notNull(),
    apellido: text().notNull(),
    activo: boolean().notNull().default(true),
    ultimoAcceso: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    // Único en **todo el sistema**, no por concesionaria.
    //
    // Cada usuario pertenece a una sola concesionaria, así que su correo alcanza para
    // identificarlo sin preguntarle a cuál entra. Eso es lo que permite que el login
    // sea sólo correo y contraseña: si el mismo correo pudiera existir en dos
    // concesionarias, habría que preguntar en cuál antes de poder buscarlo.
    //
    // La contrapartida, aceptada a propósito: una persona que trabaje en dos
    // concesionarias necesita dos correos. Es el precio de no armar un modelo de
    // identidad global, que para este producto sería complicarse de más.
    uniqueIndex('usuario_email_uq').on(t.email),
    // En minúsculas siempre: sin esto, Admin@taller.com y admin@taller.com serían dos
    // usuarios distintos y uno de los dos no podría entrar nunca.
    check('usuario_email_minuscula', sql`${t.email} = lower(${t.email})`),
  ],
)

/**
 * Rol con sus habilidades en formato CASL, para que la misma definición se evalúe
 * en la API y en el front sin duplicar reglas.
 */
export const rol = pgTable(
  'rol',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    nombre: text().notNull(),
    descripcion: text(),
    /** Reglas CASL: [{ action, subject, conditions?, fields? }]. */
    habilidades: jsonb().notNull().default(sql`'[]'::jsonb`),
    creadoEn: creadoEn(),
  },
  (t) => [unique('rol_nombre_uq').on(t.tenantId, t.nombre)],
)

export const usuarioRol = pgTable(
  'usuario_rol',
  {
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),
    rolId: uuid()
      .notNull()
      .references(() => rol.id),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.rolId] })],
)

/** A qué sucursales entra cada usuario. Un cajero no factura desde otra boca. */
export const usuarioSucursal = pgTable(
  'usuario_sucursal',
  {
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.sucursalId] })],
)

/**
 * Auditoría. Un sistema que maneja comprobantes fiscales y legajos tiene que poder
 * responder quién cambió qué y cuándo, aunque nadie lo pida hasta el día que lo piden.
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid().references(() => usuario.id),
    tabla: text().notNull(),
    registroId: uuid(),
    accion: text().notNull(),
    datosAntes: jsonb(),
    datosDespues: jsonb(),
    ip: text(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('auditoria_tabla_registro_idx').on(t.tenantId, t.tabla, t.registroId),
    index('auditoria_fecha_idx').on(t.tenantId, t.creadoEn),
    check('auditoria_accion_valida', sql`${t.accion} in ('alta', 'modificacion', 'baja')`),
  ],
)
