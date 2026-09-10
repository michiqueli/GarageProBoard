import { describe, expect, it } from 'vitest'
import { aFacturable, plata } from '../src/dinero.ts'
import { totalizar } from '../src/iva.ts'

describe('totalización de comprobantes', () => {
  it('suma el neto y aplica la alícuota que corresponde', () => {
    const { neto, iva, total } = totalizar([
      { neto: plata('10000'), codigoAlicuota: 5 },
      { neto: plata('2500'), codigoAlicuota: 5 },
    ])

    expect(aFacturable(neto)).toBe('12500.00')
    expect(aFacturable(iva)).toBe('2625.00')
    expect(aFacturable(total)).toBe('15125.00')
  })

  it('agrupa por alícuota antes de calcular', () => {
    const { iva } = totalizar([
      { neto: plata('1000'), codigoAlicuota: 5 },
      { neto: plata('1000'), codigoAlicuota: 4 },
    ])
    // 210 + 105
    expect(aFacturable(iva)).toBe('315.00')
  })

  it('no arrastra el error de coma flotante que tendría un number', () => {
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004. Acá no.
    const { neto } = totalizar([
      { neto: plata('0.1'), codigoAlicuota: 3 },
      { neto: plata('0.2'), codigoAlicuota: 3 },
    ])
    expect(neto.toFixed(4)).toBe('0.3000')
  })
})
