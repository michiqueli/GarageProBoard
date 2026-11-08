import { describe, expect, it } from 'vitest'
import { type ConceptoParaTotal, totalesDeUnidad } from '../src/costos-unidad.ts'

const concepto = (parcial: Partial<ConceptoParaTotal>): ConceptoParaTotal => ({
  tipo: 'gasto',
  importe: '100',
  moneda: 'ARS',
  cotizacion: null,
  ...parcial,
})

describe('lo que costó una unidad y lo que deja', () => {
  it('suma compra y gastos, y la bonificación resta', () => {
    const t = totalesDeUnidad(
      [
        concepto({ tipo: 'compra', importe: '1000' }),
        concepto({ importe: '50.50' }),
        concepto({ tipo: 'bonificacion', importe: '25' }),
      ],
      'ARS',
      '1500',
    )
    expect(t).toMatchObject({
      compra: '1000.00',
      gastos: '50.50',
      bonificaciones: '25.00',
      costo: '1025.50',
      margen: '474.50',
      margenPorcentaje: '46.3',
      sinConvertir: 0,
    })
  })

  it('convierte con la cotización, para los dos lados', () => {
    expect(
      totalesDeUnidad([concepto({ moneda: 'USD', importe: '10', cotizacion: '1000' })], 'ARS', null)
        .gastos,
    ).toBe('10000.00')
    expect(
      totalesDeUnidad([concepto({ importe: '10000', cotizacion: '1000' })], 'USD', null).gastos,
    ).toBe('10.00')
  })

  it('lo que no se puede convertir no se inventa: queda afuera y se cuenta', () => {
    const t = totalesDeUnidad([concepto({ moneda: 'USD' }), concepto({})], 'ARS', null)
    expect(t).toMatchObject({ gastos: '100.00', sinConvertir: 1 })
  })

  it('sin precio no hay margen, y sin costo no hay porcentaje', () => {
    expect(totalesDeUnidad([concepto({})], 'ARS', null).margen).toBeNull()
    expect(totalesDeUnidad([], 'ARS', '100')).toMatchObject({
      margen: '100.00',
      margenPorcentaje: null,
    })
  })
})
