import { Decimal } from 'decimal.js'
import type { MonedaUnidad } from './cartera.ts'

export const TIPOS_CONCEPTO_UNIDAD = ['compra', 'gasto', 'bonificacion'] as const
export type TipoConceptoUnidad = (typeof TIPOS_CONCEPTO_UNIDAD)[number]

/** Con lo que arranca una concesionaria. Cada una apaga las que no usa y suma las suyas. */
export const CATEGORIAS_GASTO_POR_OMISION = [
  'Flete',
  'Patentamiento',
  'Preparación',
  'Comisión',
  'Otros',
] as const

export const MAXIMO_NOMBRE_CATEGORIA_GASTO = 60

export interface ConceptoParaTotal {
  tipo: TipoConceptoUnidad
  importe: string
  moneda: MonedaUnidad
  /** Pesos por dólar. Sólo hace falta si está en otra moneda que la unidad. */
  cotizacion: string | null
}

export interface TotalesUnidad {
  compra: string
  gastos: string
  bonificaciones: string
  costo: string
  /** Null si la unidad no tiene precio. */
  margen: string | null
  margenPorcentaje: string | null
  /** Conceptos en otra moneda sin cotización: no entran en la suma, y hay que decirlo. */
  sinConvertir: number
}

function aMonedaDeLaUnidad(c: ConceptoParaTotal, moneda: MonedaUnidad): Decimal | null {
  const importe = new Decimal(c.importe)
  if (c.moneda === moneda) return importe
  if (!c.cotizacion) return null
  const cotizacion = new Decimal(c.cotizacion)
  return c.moneda === 'USD' ? importe.times(cotizacion) : importe.div(cotizacion)
}

/**
 * Lo que costó una unidad y lo que deja, en la moneda en que se publica. Las bonificaciones
 * restan: es plata que la terminal devuelve por esa unidad.
 */
export function totalesDeUnidad(
  conceptos: readonly ConceptoParaTotal[],
  moneda: MonedaUnidad,
  precio: string | null,
): TotalesUnidad {
  const suma = { compra: new Decimal(0), gasto: new Decimal(0), bonificacion: new Decimal(0) }
  let sinConvertir = 0
  for (const c of conceptos) {
    const importe = aMonedaDeLaUnidad(c, moneda)
    if (importe === null) sinConvertir++
    else suma[c.tipo] = suma[c.tipo].plus(importe)
  }
  const costo = suma.compra.plus(suma.gasto).minus(suma.bonificacion)
  const margen = precio === null ? null : new Decimal(precio).minus(costo)
  return {
    compra: suma.compra.toFixed(2),
    gastos: suma.gasto.toFixed(2),
    bonificaciones: suma.bonificacion.toFixed(2),
    costo: costo.toFixed(2),
    margen: margen?.toFixed(2) ?? null,
    margenPorcentaje:
      margen && costo.greaterThan(0) ? margen.div(costo).times(100).toFixed(1) : null,
    sinConvertir,
  }
}
