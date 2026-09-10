import { boolean, char, pgTable, primaryKey, smallint, text } from 'drizzle-orm/pg-core'

/**
 * Catálogos de AFIP y de geografía. No llevan `tenant_id` ni RLS: son los mismos
 * para todos los clientes y se sincronizan desde los web services.
 */

export const provincia = pgTable('provincia', {
  codigo: smallint().primaryKey(),
  nombre: text().notNull(),
  /** Para Convenio Multilateral: cada jurisdicción liquida Ingresos Brutos aparte. */
  codigoIibb: text(),
})

/**
 * Condición frente al IVA. Desde la RG 5.616 la del receptor viaja obligatoriamente
 * en el comprobante, así que dejó de ser un dato informativo del cliente.
 *
 * Se siembra desde `FEParamGetCondicionIvaReceptor` del WSFEv1 en vez de escribirse
 * a mano: cuando AFIP agrega una condición, la tabla se actualiza sin un deploy.
 */
export const condicionIva = pgTable('condicion_iva', {
  codigo: smallint().primaryKey(),
  descripcion: text().notNull(),
  /** Si es Responsable Inscripto, el IVA se discrimina en el comprobante. */
  discriminaIva: boolean().notNull().default(false),
})

export const tipoComprobante = pgTable('tipo_comprobante', {
  codigo: smallint().primaryKey(),
  descripcion: text().notNull(),
  letra: char({ length: 1 }),
  /** +1 factura y nota de débito, -1 nota de crédito: simplifica todo saldo. */
  signo: smallint().notNull().default(1),
})

/**
 * Qué comprobante corresponde según quién emite y quién recibe.
 *
 * Vive en la base y no como condicionales en el código porque cambia por normativa,
 * y no queremos desplegar la aplicación para adaptarnos a una resolución general.
 */
export const reglaComprobante = pgTable(
  'regla_comprobante',
  {
    condicionEmisor: smallint()
      .notNull()
      .references(() => condicionIva.codigo),
    condicionReceptor: smallint()
      .notNull()
      .references(() => condicionIva.codigo),
    tipoComprobante: smallint()
      .notNull()
      .references(() => tipoComprobante.codigo),
  },
  (t) => [primaryKey({ columns: [t.condicionEmisor, t.condicionReceptor] })],
)
