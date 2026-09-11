import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { cliente } from './comercial.ts'
import { tenant } from './tenant.ts'

export const marca = pgTable(
  'marca',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    nombre: text().notNull(),
    /** Marca que representa la concesionaria: habilita garantías y pedidos a fábrica. */
    esTerminal: boolean().notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [unique('marca_nombre_uq').on(t.tenantId, t.nombre)],
)

export const modelo = pgTable(
  'modelo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    marcaId: uuid()
      .notNull()
      .references(() => marca.id),
    nombre: text().notNull(),
    version: text(),
    anioDesde: integer(),
    anioHasta: integer(),
    creadoEn: creadoEn(),
  },
  (t) => [
    unique('modelo_nombre_uq').on(t.tenantId, t.marcaId, t.nombre, t.version),
    index('modelo_marca_idx').on(t.marcaId),
  ],
)

/**
 * El vehículo es el centro del sistema, no el cliente.
 *
 * Su identidad es el número de chasis, que no cambia nunca. El dominio sí puede
 * faltar: un 0km existe con chasis desde que la terminal lo factura y puede pasar
 * semanas sin chapa mientras se patenta. Por eso la columna es nullable y su índice
 * único es parcial.
 */
export const vehiculo = pgTable(
  'vehiculo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    /**
     * SUPUESTO A VALIDAR CON UN PILOTO: aceptamos de 6 a 17 caracteres en vez de
     * exigir un VIN de 17. Los vehículos de fabricación nacional anteriores a los
     * noventa llevan números de chasis que no siguen la norma ISO, y un taller
     * multimarca los recibe. Un check demasiado estricto bloquea la carga de un
     * auto real, que es peor que aceptar un dato raro.
     */
    chasis: text().notNull(),
    motor: text(),
    dominio: text(),
    modeloId: uuid().references(() => modelo.id),
    anio: integer(),
    color: text(),
    combustible: text(),
    /** Última lectura conocida. La histórica vive en cada orden de trabajo. */
    kilometraje: integer(),
    fechaVenta: date(),
    observaciones: text(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('vehiculo_chasis_uq').on(t.tenantId, t.chasis),
    // Parcial: tolera los 0km sin patentar sin dejar de impedir dominios repetidos.
    uniqueIndex('vehiculo_dominio_uq').on(t.tenantId, t.dominio).where(sql`dominio is not null`),
    check('vehiculo_chasis_formato', sql`${t.chasis} ~ '^[A-HJ-NPR-Z0-9]{6,17}$'`),
    // Los dos formatos que conviven en la calle. No hace falta historizar el
    // dominio: en la Argentina de hoy la patente no se recambia.
    check(
      'vehiculo_dominio_formato',
      sql`${t.dominio} is null
          or ${t.dominio} ~ '^[A-Z]{3}[0-9]{3}$'
          or ${t.dominio} ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$'`,
    ),
  ],
)

/**
 * De quién es el auto, y desde cuándo.
 *
 * «Un vehículo tiene un solo dueño» es cierto en un momento dado, y es eso lo que lo
 * convierte en una relación con vigencia y no en una clave foránea. Una columna
 * `cliente_id` en `vehiculo` se pisa el día de la venta, y con ella se va la
 * respuesta a la única pregunta que el historial existe para contestar: a quién se
 * le hizo cada trabajo.
 */
export const titularidad = pgTable(
  'titularidad',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    vehiculoId: uuid()
      .notNull()
      .references(() => vehiculo.id),
    clienteId: uuid()
      .notNull()
      .references(() => cliente.id),
    desde: date().notNull(),
    hasta: date(),
    creadoEn: creadoEn(),
  },
  (t) => [
    // Un solo titular vigente por vehículo, sin impedir que existan los anteriores.
    uniqueIndex('titularidad_vigente_uq').on(t.vehiculoId).where(sql`hasta is null`),
    index('titularidad_cliente_idx').on(t.clienteId),
    check('titularidad_rango_valido', sql`${t.hasta} is null or ${t.hasta} >= ${t.desde}`),
  ],
)
