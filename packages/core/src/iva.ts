import type { Decimal } from 'decimal.js'
import { type Importe, plata } from './dinero.ts'

/** Alícuotas de IVA con su código de AFIP. La de servicios de taller es la de 21%. */
export const ALICUOTAS = {
  3: plata('0'),
  4: plata('10.5'),
  5: plata('21'),
  6: plata('27'),
  8: plata('5'),
  9: plata('2.5'),
} as const satisfies Record<number, Decimal>

export type CodigoAlicuota = keyof typeof ALICUOTAS

export interface RenglonGravado {
  neto: Importe
  codigoAlicuota: CodigoAlicuota
}

export interface TotalesComprobante {
  neto: Importe
  iva: Importe
  total: Importe
}

/**
 * Totaliza un comprobante.
 *
 * El IVA se calcula por alícuota y recién después se suma, no renglón por renglón:
 * sumar el IVA de cada línea redondeada da diferencias de centavos contra el cálculo
 * de AFIP, y un comprobante que no cuadra por un centavo es un comprobante rechazado.
 */
export function totalizar(renglones: readonly RenglonGravado[]): TotalesComprobante {
  const netoPorAlicuota = new Map<CodigoAlicuota, Importe>()

  for (const renglon of renglones) {
    const acumulado = netoPorAlicuota.get(renglon.codigoAlicuota) ?? plata('0')
    netoPorAlicuota.set(renglon.codigoAlicuota, acumulado.plus(renglon.neto))
  }

  let neto = plata('0')
  let iva = plata('0')

  for (const [codigo, netoAlicuota] of netoPorAlicuota) {
    neto = neto.plus(netoAlicuota)
    iva = iva.plus(netoAlicuota.times(ALICUOTAS[codigo]).dividedBy(100))
  }

  return { neto, iva, total: neto.plus(iva) }
}
