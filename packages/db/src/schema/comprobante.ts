import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { condicionIva, tipoComprobante } from './catalogos.ts'
import { entidadComercial } from './comercial.ts'
import { orden } from './orden.ts'
import { empresa, puntoVenta, sucursal } from './organizacion.ts'
import { pedidoRepuestos } from './repuestos.ts'
import { tenant } from './tenant.ts'

/** Importes de un comprobante: dos decimales, como los informa AFIP. */
const importe = (nombre: string) => numeric(nombre, { precision: 18, scale: 2 })

/**
 * Un comprobante electrónico: lo que se le pidió a AFIP y lo que contestó.
 *
 * **Todo lo que sale impreso se guarda tal cual se emitió**: el receptor, su condición, su
 * domicilio y los importes. Si mañana el cliente cambia de domicilio, la factura de ayer
 * sigue diciendo el de ayer. Un comprobante fiscal no se recalcula nunca.
 *
 * El ciclo, pensado para no tener una transacción abierta mientras AFIP contesta:
 *
 * - `emitiendo`: el número ya se reservó y el pedido salió hacia AFIP.
 * - `autorizado`: AFIP dio el CAE. Es un comprobante fiscal y no se toca más.
 * - `rechazado`: AFIP dijo que no, con sus motivos. El número queda libre para el próximo.
 * - `incierto`: AFIP no contestó y no se sabe si lo emitió. Antes de emitir otro de la
 *   misma serie hay que preguntarle, o se duplica un número o queda un hueco.
 *
 * Los dos índices de abajo son la numeración sin huecos: un solo comprobante en vuelo por
 * serie (punto de venta y tipo), y un número no se repite entre los que valen.
 */
export const comprobante = pgTable(
  'comprobante',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresa.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    puntoVentaId: uuid()
      .notNull()
      .references(() => puntoVenta.id),
    /** El número de AFIP, copiado: un punto de venta desactivado no cambia la factura. */
    puntoVenta: integer().notNull(),
    tipoComprobante: smallint()
      .notNull()
      .references(() => tipoComprobante.codigo),
    numero: bigint({ mode: 'number' }).notNull(),
    fecha: date().notNull(),
    /** 1 productos, 2 servicios, 3 productos y servicios. */
    concepto: smallint().notNull(),
    servicioDesde: date(),
    servicioHasta: date(),
    vencimientoPago: date(),

    clienteId: uuid().references(() => entidadComercial.id),
    tipoDocReceptor: smallint().notNull(),
    numeroDocReceptor: text().notNull(),
    receptorNombre: text().notNull(),
    receptorCondicionIva: smallint()
      .notNull()
      .references(() => condicionIva.codigo),
    receptorDomicilio: text(),
    condicionVenta: text().notNull(),
    /** En una nota de crédito o débito, el comprobante que modifica. */
    comprobanteAsociadoId: uuid().references((): AnyPgColumn => comprobante.id),
    /** La orden de trabajo que se factura, si viene del taller. */
    ordenId: uuid().references((): AnyPgColumn => orden.id),
    /** El pedido de repuestos de mostrador que se factura. */
    pedidoRepuestosId: uuid().references((): AnyPgColumn => pedidoRepuestos.id),

    importeNeto: importe('importe_neto').notNull(),
    importeIva: importe('importe_iva').notNull(),
    importeExento: importe('importe_exento').notNull(),
    importeTotal: importe('importe_total').notNull(),
    /** El detalle de IVA tal cual se informó: `[{ codigoAlicuota, baseImponible, importe }]`. */
    alicuotas: jsonb().notNull(),

    estado: text().notNull().default('emitiendo'),
    entorno: text().notNull(),
    cae: text(),
    vencimientoCae: date(),
    observaciones: jsonb().notNull().default(sql`'[]'::jsonb`),
    errores: jsonb().notNull().default(sql`'[]'::jsonb`),
    /** Lo que devolvió AFIP, para poder explicar un rechazo meses después. */
    respuestaAfip: jsonb(),

    emitidoPor: uuid()
      .notNull()
      .references(() => usuario.id),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index('comprobante_empresa_fecha_idx').on(t.empresaId, t.fecha),
    index('comprobante_cliente_idx').on(t.clienteId),
    uniqueIndex('comprobante_numero_uq')
      .on(t.puntoVentaId, t.tipoComprobante, t.numero)
      .where(sql`estado in ('emitiendo', 'autorizado', 'incierto')`),
    uniqueIndex('comprobante_en_vuelo_uq')
      .on(t.puntoVentaId, t.tipoComprobante)
      .where(sql`estado in ('emitiendo', 'incierto')`),
    // Una factura se anula una sola vez: dos notas de crédito por el total serían devolverle
    // al cliente el doble. Las rechazadas no cuentan.
    // Una orden se factura una vez. Si la factura se anula, la orden vuelve a caja.
    uniqueIndex('comprobante_orden_uq')
      .on(t.ordenId)
      .where(
        sql`estado in ('emitiendo', 'autorizado', 'incierto') and orden_id is not null and comprobante_asociado_id is null`,
      ),
    uniqueIndex('comprobante_pedido_repuestos_uq')
      .on(t.pedidoRepuestosId)
      .where(
        sql`estado in ('emitiendo', 'autorizado', 'incierto') and pedido_repuestos_id is not null and comprobante_asociado_id is null`,
      ),
    uniqueIndex('comprobante_anulacion_uq')
      .on(t.comprobanteAsociadoId)
      .where(
        sql`estado in ('emitiendo', 'autorizado', 'incierto') and comprobante_asociado_id is not null`,
      ),
    check(
      'comprobante_estado_valido',
      sql`${t.estado} in ('emitiendo', 'autorizado', 'rechazado', 'incierto')`,
    ),
    check('comprobante_entorno_valido', sql`${t.entorno} in ('produccion', 'homologacion')`),
    check('comprobante_concepto_valido', sql`${t.concepto} in (1, 2, 3)`),
    check(
      'comprobante_autorizado_con_cae',
      sql`${t.estado} <> 'autorizado' or (${t.cae} is not null and ${t.vencimientoCae} is not null)`,
    ),
    check(
      'comprobante_servicio_con_periodo',
      sql`${t.concepto} = 1 or (${t.servicioDesde} is not null and ${t.servicioHasta} is not null and ${t.vencimientoPago} is not null)`,
    ),
  ],
)

/**
 * Lo que se vendió. El precio es **final, con IVA**: es lo que se le dice al cliente en el
 * mostrador, y el neto de cada alícuota se calcula una sola vez para todo el comprobante.
 */
export const comprobanteRenglon = pgTable(
  'comprobante_renglon',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    comprobanteId: uuid()
      .notNull()
      .references(() => comprobante.id),
    orden: smallint().notNull(),
    codigo: text(),
    descripcion: text().notNull(),
    cantidad: numeric({ precision: 18, scale: 4 }).notNull(),
    unidad: text().notNull().default('unidades'),
    precioUnitario: numeric({ precision: 18, scale: 4 }).notNull(),
    bonificacionPorcentaje: numeric({ precision: 5, scale: 2 }).notNull().default('0'),
    /** Cantidad × precio, menos la bonificación, con IVA. */
    total: importe('total').notNull(),
    /** Código de alícuota de AFIP: 3 (0%), 4 (10,5%), 5 (21%), 6 (27%), 8 (5%), 9 (2,5%). */
    codigoAlicuota: smallint().notNull(),
  },
  (t) => [
    index('comprobante_renglon_comprobante_idx').on(t.comprobanteId, t.orden),
    check('comprobante_renglon_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('comprobante_renglon_total_positivo', sql`${t.total} >= 0`),
  ],
)
