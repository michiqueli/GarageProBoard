import { Decimal } from 'decimal.js'

// 4 decimales de trabajo, redondeo bancario nunca: AFIP espera redondeo comercial
// (medio hacia arriba) en el total del comprobante.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type Importe = Decimal

/** Entrada única a la aritmética de plata. Nunca construir Decimal desde un number. */
export function plata(valor: string | Decimal): Importe {
  return valor instanceof Decimal ? valor : new Decimal(valor)
}

/** Cómo se guarda en `numeric(18,4)` y cómo viaja por la API: siempre string. */
export function aColumna(valor: Importe): string {
  return valor.toFixed(4)
}

/** Dos decimales para mostrar y para el total que se le manda a AFIP. */
export function aFacturable(valor: Importe): string {
  return valor.toFixed(2)
}

export const CERO = plata('0')

export function sumar(...valores: Importe[]): Importe {
  return valores.reduce<Importe>((acc, v) => acc.plus(v), CERO)
}
