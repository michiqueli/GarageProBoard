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
 * Auditoría **narrada**: lo que la operación quiso contar.
 *
 * La escribe la aplicación, y por eso guarda lo que una foto de la fila no tiene: los
 * nombres de los roles que se le dieron a un usuario, el medio por el que autorizaron un
 * presupuesto, que un comprobante se mandó por mail —que no cambia una sola columna—.
 *
 * Es la mitad linda del registro. La que no se puede perder es `auditoria_cambio`.
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
    /**
     * La transacción que la produjo (`pg_current_xact_id()`), como texto.
     *
     * Es lo que junta esta narración con los cambios crudos que la misma operación dejó en
     * `auditoria_cambio`. Sin esto habría que adivinar por fecha, y un registro de
     * auditoría no se arma adivinando.
     */
    transaccion: text(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('auditoria_tabla_registro_idx').on(t.tenantId, t.tabla, t.registroId),
    index('auditoria_fecha_idx').on(t.tenantId, t.creadoEn),
    index('auditoria_transaccion_idx').on(t.tenantId, t.transaccion),
    check('auditoria_accion_valida', sql`${t.accion} in ('alta', 'modificacion', 'baja')`),
  ],
)

/**
 * Auditoría **cruda**: lo que efectivamente cambió en la base.
 *
 * La escribe un trigger de Postgres, tabla por tabla, con la fila entera antes y después.
 * No depende de que nadie se acuerde de llamar a nada: es la misma idea que RLS, y por el
 * mismo motivo —vamos a seguir sumando módulos, y la disciplina no escala—.
 *
 * **La aplicación la lee y no la escribe.** El rol `gpb_app` no tiene `insert`, `update` ni
 * `delete` sobre esta tabla; sólo el trigger, que corre como dueño. Una bitácora que el
 * mismo proceso auditado puede reescribir no prueba nada.
 *
 * Las claves de los campos vienen en el vocabulario de la aplicación y no en el de
 * Postgres (`razonSocial`, no `razon_social`), para que la pantalla las cuente con las
 * mismas frases que las narradas. Los secretos —el hash de la contraseña, la clave privada
 * del certificado— no entran nunca: ver `TABLAS_AUDITADAS` en `rls/auditoria.ts`.
 */
export const auditoriaCambio = pgTable(
  'auditoria_cambio',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    /** Quién lo hizo, según la sesión. Vacío si el cambio no salió de un pedido con sesión. */
    usuarioId: uuid(),
    tabla: text().notNull(),
    registroId: uuid(),
    accion: text().notNull(),
    antes: jsonb(),
    despues: jsonb(),
    ip: text(),
    /** La misma transacción que la fila narrada, cuando la operación narró algo. */
    transaccion: text().notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('auditoria_cambio_fecha_idx').on(t.tenantId, t.creadoEn),
    index('auditoria_cambio_registro_idx').on(t.tenantId, t.tabla, t.registroId),
    index('auditoria_cambio_transaccion_idx').on(t.tenantId, t.transaccion),
    check('auditoria_cambio_accion_valida', sql`${t.accion} in ('alta', 'modificacion', 'baja')`),
  ],
)

/**
 * Algo que le pasó a un usuario y tiene que saber la próxima vez que entre: «Tu contraseña
 * la cambió Juan Pérez el 16/09 a las 10:32».
 *
 * Es la otra mitad de dejar que el administrador de sistema modifique a cualquiera: si lo
 * hace mal, el afectado se entera por el sistema y no cuando algo deja de andar.
 */
export const aviso = pgTable(
  'aviso',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),
    texto: text().notNull(),
    creadoEn: creadoEn(),
    leidoEn: timestamp({ withTimezone: true }),
  },
  (t) => [index('aviso_usuario_idx').on(t.usuarioId, t.leidoEn)],
)
