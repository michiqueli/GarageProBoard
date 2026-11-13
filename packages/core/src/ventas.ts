import { Decimal } from 'decimal.js'
import type { MonedaUnidad } from './cartera.ts'

/**
 * La operación de venta de una unidad. Ver `docs/tecnicos/ventas-de-unidades.md`, paso 3.
 */

export const ESTADOS_VENTA = ['borrador', 'confirmada', 'anulada'] as const
export type EstadoVenta = (typeof ESTADOS_VENTA)[number]

/**
 * - `gasto_cliente`: lo que se le cobra al comprador además del precio: patente, flete, formularios.
 * - `descuento`: lo que se le resta al precio.
 * - `costo_venta`: lo que le cuesta a la concesionaria esta venta y no se le cobra a nadie: una
 *   comisión externa, la gestoría que paga ella. No toca el total; sí la rentabilidad.
 */
export const TIPOS_CONCEPTO_VENTA = ['gasto_cliente', 'descuento', 'costo_venta'] as const
export type TipoConceptoVenta = (typeof TIPOS_CONCEPTO_VENTA)[number]

export const MEDIOS_PAGO_VENTA = [
  'efectivo',
  'transferencia',
  'cheque',
  'tarjeta',
  'financiacion',
  'usado',
  'sena',
  'otro',
] as const
export type MedioPagoVenta = (typeof MEDIOS_PAGO_VENTA)[number]

export interface ConfigVentas {
  /** Hasta qué porcentaje de descuento se confirma sin autorización. Null: sin límite. */
  descuentoMaximo: number | null
  /** Si una venta se confirma sólo con todo pagado, o puede quedar saldo para la entrega. */
  exigeSaldoCero: boolean
}

export const CONFIG_VENTAS_POR_OMISION: Readonly<ConfigVentas> = {
  descuentoMaximo: null,
  exigeSaldoCero: false,
}

export interface ImporteEnMoneda {
  importe: string
  moneda: MonedaUnidad
  /** Pesos por dólar, cuando está en otra moneda que la venta. */
  cotizacion: string | null
}

/** Un importe en otra moneda, o `null` si hace falta cotización y no la hay. */
export function aMoneda(c: ImporteEnMoneda, moneda: MonedaUnidad): Decimal | null {
  const importe = new Decimal(c.importe)
  if (c.moneda === moneda) return importe
  if (!c.cotizacion) return null
  const cotizacion = new Decimal(c.cotizacion)
  return c.moneda === 'USD' ? importe.times(cotizacion) : importe.div(cotizacion)
}

export interface TotalesVenta {
  precio: string
  gastosCliente: string
  descuentos: string
  /** Lo que paga el comprador: precio, más sus gastos, menos los descuentos. */
  total: string
  pagado: string
  saldo: string
  /** Porcentaje del descuento sobre el precio. */
  descuentoPorcentaje: string
  /** Conceptos y pagos en otra moneda sin cotización: no entran en la suma. */
  sinConvertir: number
  /** Null si quien pide no puede ver lo que costó la unidad, o si está en otra moneda. */
  rentabilidad: {
    costoUnidad: string
    costosVenta: string
    margen: string
    margenPorcentaje: string | null
  } | null
}

/**
 * Lo que paga el comprador, lo que falta y lo que deja la venta. Los gastos del cliente no son
 * ganancia: entran y salen, así que no suman al margen.
 */
export function totalesDeVenta(datos: {
  precio: string
  moneda: MonedaUnidad
  conceptos: ReadonlyArray<ImporteEnMoneda & { tipo: TipoConceptoVenta }>
  pagos: readonly ImporteEnMoneda[]
  /** En la moneda de la venta, o null. */
  costoUnidad: string | null
}): TotalesVenta {
  const suma = {
    gasto_cliente: new Decimal(0),
    descuento: new Decimal(0),
    costo_venta: new Decimal(0),
  }
  let sinConvertir = 0
  for (const c of datos.conceptos) {
    const v = aMoneda(c, datos.moneda)
    if (v === null) sinConvertir++
    else suma[c.tipo] = suma[c.tipo].plus(v)
  }
  let pagado = new Decimal(0)
  for (const p of datos.pagos) {
    const v = aMoneda(p, datos.moneda)
    if (v === null) sinConvertir++
    else pagado = pagado.plus(v)
  }

  const precio = new Decimal(datos.precio)
  const total = precio.plus(suma.gasto_cliente).minus(suma.descuento)
  const neto = precio.minus(suma.descuento)
  const costo = datos.costoUnidad === null ? null : new Decimal(datos.costoUnidad)
  const margen = costo === null ? null : neto.minus(costo).minus(suma.costo_venta)

  return {
    precio: precio.toFixed(2),
    gastosCliente: suma.gasto_cliente.toFixed(2),
    descuentos: suma.descuento.toFixed(2),
    total: total.toFixed(2),
    pagado: pagado.toFixed(2),
    saldo: total.minus(pagado).toFixed(2),
    descuentoPorcentaje: precio.greaterThan(0)
      ? suma.descuento.div(precio).times(100).toFixed(1)
      : '0.0',
    sinConvertir,
    rentabilidad:
      costo === null || margen === null
        ? null
        : {
            costoUnidad: costo.toFixed(2),
            costosVenta: suma.costo_venta.toFixed(2),
            margen: margen.toFixed(2),
            margenPorcentaje: costo.plus(suma.costo_venta).greaterThan(0)
              ? margen.div(costo.plus(suma.costo_venta)).times(100).toFixed(1)
              : null,
          },
  }
}
