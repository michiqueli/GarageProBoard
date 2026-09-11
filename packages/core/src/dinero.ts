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

const FORMATO_AR = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Cómo se muestra un importe: punto de miles, coma decimal, siempre dos decimales.
 *
 * Recibe la cadena decimal tal como sale de la base y la formatea sin pasar por
 * `Number` en ningún momento — un importe de nueve cifras convertido a float pierde
 * centavos, y en una factura eso es una diferencia que hay que explicar.
 */
export function formatearImporte(valor: string | Importe): string {
  const texto = typeof valor === 'string' ? valor : valor.toFixed(2)
  const [entera = '0', decimal = ''] = texto.replace('-', '').split('.')
  const centavos = `${decimal}00`.slice(0, 2)
  const signo = texto.startsWith('-') ? '-' : ''

  return `${signo}${FORMATO_AR.format(BigInt(entera)).split(',')[0]},${centavos}`
}
