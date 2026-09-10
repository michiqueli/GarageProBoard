import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { condicionIva, provincia, tipoComprobante } from './catalogos.ts'
import { tenant } from './tenant.ts'

/**
 * Razón social. Un tenant puede tener varias — el caso normal es el taller y el
 * negocio de repuestos separados en dos SAS por conveniencia impositiva.
 *
 * Todo lo fiscal cuelga de acá y no del tenant: el certificado de AFIP, la
 * numeración, los libros de IVA y la cuenta corriente. Son personas jurídicas
 * distintas, y el cliente le debe plata a una SAS, no al grupo.
 */
export const empresa = pgTable(
  'empresa',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    razonSocial: text().notNull(),
    nombreFantasia: text(),
    cuit: char({ length: 11 }).notNull(),
    condicionIva: smallint()
      .notNull()
      .references(() => condicionIva.codigo),
    inicioActividades: text(),
    domicilioFiscal: text(),
    provinciaCodigo: smallint().references(() => provincia.codigo),
    /** Sujeta a Convenio Multilateral si opera en más de una jurisdicción. */
    convenioMultilateral: boolean().notNull().default(false),
    numeroIibb: text(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('empresa_tenant_cuit_uq').on(t.tenantId, t.cuit),
    check('empresa_cuit_formato', sql`${t.cuit} ~ '^[0-9]{11}$'`),
  ],
)

/**
 * Lugar físico: taller, depósito, mostrador, caja, gente.
 *
 * El `unique (id, empresa_id)` de abajo no es redundante con la clave primaria: es
 * el destino de la FK compuesta de `punto_venta`, que es lo que impide que una
 * sucursal termine facturando con el punto de venta de la otra razón social.
 */
export const sucursal = pgTable(
  'sucursal',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresa.id),
    nombre: text().notNull(),
    domicilio: text(),
    provinciaCodigo: smallint().references(() => provincia.codigo),
    localidad: text(),
    telefono: text(),
    activa: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('sucursal_id_empresa_uq').on(t.id, t.empresaId),
    index('sucursal_empresa_idx').on(t.empresaId),
  ],
)

/**
 * Punto de venta de AFIP. Tiene dos padres y los dos mandan:
 *
 *   - `empresa_id`  porque AFIP lo registra bajo un CUIT.
 *   - `sucursal_id` porque es desde ahí que se factura. Sin este vínculo, una
 *     empresa con seis puntos de venta no tiene forma de saber cuál le toca a
 *     cada boca.
 *
 * Al facturar, la resolución es `(sucursal, uso) -> PDV predeterminado`.
 *
 * El número es único **por CUIT**, nunca por tenant: dos SAS del mismo grupo pueden
 * tener las dos su PDV 0001, y un índice sobre `(tenant_id, numero)` sería un bug
 * esperando a que el segundo cliente abra su segunda razón social.
 */
export const puntoVenta = pgTable(
  'punto_venta',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresa.id),
    sucursalId: uuid().notNull(),
    numero: integer().notNull(),
    uso: text().notNull(),
    /** El que toma el sistema cuando la sucursal factura sin elegir a mano. */
    predeterminado: boolean().notNull().default(false),
    /** 'CAE' emite comprobante por comprobante; 'CAEA' pide el lote por adelantado. */
    modo: text().notNull().default('CAE'),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('punto_venta_empresa_numero_uq').on(t.empresaId, t.numero),
    // La sucursal y el punto de venta tienen que ser de la misma razón social.
    foreignKey({
      columns: [t.sucursalId, t.empresaId],
      foreignColumns: [sucursal.id, sucursal.empresaId],
      name: 'punto_venta_sucursal_empresa_fk',
    }),
    // Un solo PDV predeterminado por sucursal y por uso.
    uniqueIndex('punto_venta_predeterminado_uq').on(t.sucursalId, t.uso).where(sql`predeterminado`),
    check('punto_venta_uso_valido', sql`${t.uso} in ('facturacion', 'remito', 'otro')`),
    check('punto_venta_modo_valido', sql`${t.modo} in ('CAE', 'CAEA')`),
    check('punto_venta_numero_rango', sql`${t.numero} between 1 and 99999`),
  ],
)

/**
 * Numeración de comprobantes. Una fila por punto de venta y tipo, porque cada
 * combinación lleva su propia secuencia en AFIP.
 *
 * Se toma con `select ... for update` dentro de la misma transacción que pide el CAE.
 * Nunca `max(numero) + 1`: AFIP rechaza los saltos, y recuperarse de un hueco cuesta
 * pedidos de disponibilidad comprobante por comprobante.
 */
export const comprobanteSecuencia = pgTable(
  'comprobante_secuencia',
  {
    tenantId: tenantId().references(() => tenant.id),
    puntoVentaId: uuid()
      .notNull()
      .references(() => puntoVenta.id),
    tipoComprobante: smallint()
      .notNull()
      .references(() => tipoComprobante.codigo),
    ultimoNumero: bigint({ mode: 'bigint' }).notNull().default(sql`0`),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [primaryKey({ columns: [t.puntoVentaId, t.tipoComprobante] })],
)
