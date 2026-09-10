import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, dinero, pk, tenantId } from './_comunes.ts'
import { condicionIva, provincia } from './catalogos.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/**
 * Identidad fiscal: lo que AFIP trata como una sola cosa.
 *
 * El mismo CUIT es cliente y proveedor con muchísima frecuencia — la empresa de
 * transporte que hace el service de su flota y además te vende neumáticos, el
 * mecánico que compra un usado. Con tablas independientes, ese CUIT vive dos veces:
 * el domicilio fiscal se desincroniza en silencio, el padrón se consulta dos veces,
 * y la administración pierde la compensación de saldos.
 *
 * Los roles sí son tablas aparte, cada una con sus campos y sus permisos: el legajo
 * con sueldos no lo ve el asesor de servicios.
 */
export const entidadComercial = pgTable(
  'entidad_comercial',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    /** Códigos de AFIP: 80 CUIT, 86 CUIL, 96 DNI, 99 sin identificar. */
    tipoDocumento: smallint().notNull(),
    numeroDocumento: text().notNull(),
    tipoPersona: text().notNull(),
    /** Denominación fiscal. Para una persona física: 'Apellido, Nombre'. */
    razonSocial: text().notNull(),
    nombre: text(),
    apellido: text(),
    condicionIva: smallint()
      .notNull()
      .references(() => condicionIva.codigo),
    domicilio: text(),
    provinciaCodigo: smallint().references(() => provincia.codigo),
    localidad: text(),
    codigoPostal: text(),
    email: text(),
    telefono: text(),
    numeroIibb: text(),
    /** 'local' | 'convenio' | 'exento' | 'no_inscripto' — define qué se le retiene. */
    condicionIibb: text().notNull().default('no_inscripto'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('entidad_documento_uq').on(t.tenantId, t.tipoDocumento, t.numeroDocumento),
    index('entidad_razon_social_idx').on(t.tenantId, t.razonSocial),
    check('entidad_tipo_persona_valido', sql`${t.tipoPersona} in ('fisica', 'juridica')`),
    check(
      'entidad_condicion_iibb_valida',
      sql`${t.condicionIibb} in ('local', 'convenio', 'exento', 'no_inscripto')`,
    ),
  ],
)

/**
 * Rol de cliente. Arranca casi vacía a propósito: se le agregan campos cuando cada
 * módulo los pide. Sumar una columna es barato; deduplicar CUITs a los dos años, no.
 *
 * La clave primaria es la misma que la de la entidad comercial: un solo uuid
 * identifica a la persona y a su rol de cliente.
 */
export const cliente = pgTable('cliente', {
  id: uuid()
    .primaryKey()
    .references(() => entidadComercial.id),
  tenantId: tenantId().references(() => tenant.id),
  limiteCredito: dinero('limite_credito'),
  diasCredito: integer().notNull().default(0),
  activo: boolean().notNull().default(true),
  observaciones: text(),
  creadoEn: creadoEn(),
})

export const proveedor = pgTable('proveedor', {
  id: uuid()
    .primaryKey()
    .references(() => entidadComercial.id),
  tenantId: tenantId().references(() => tenant.id),
  condicionPago: text(),
  cuentaContable: text(),
  activo: boolean().notNull().default(true),
  creadoEn: creadoEn(),
})

/**
 * Rol de empleado. Sus datos son sensibles (sueldos, categoría) y por eso viven acá
 * y no en la identidad compartida: los permisos se aplican sobre esta tabla.
 */
export const empleado = pgTable(
  'empleado',
  {
    id: uuid()
      .primaryKey()
      .references(() => entidadComercial.id),
    tenantId: tenantId().references(() => tenant.id),
    legajo: text().notNull(),
    sucursalId: uuid().references(() => sucursal.id),
    /** El convenio del sector es SMATA; hay personal fuera de convenio también. */
    convenio: text(),
    categoria: text(),
    fechaIngreso: text(),
    fechaEgreso: text(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [unique('empleado_legajo_uq').on(t.tenantId, t.legajo)],
)
