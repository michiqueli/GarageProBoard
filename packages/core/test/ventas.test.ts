import { describe, expect, it } from 'vitest'
import { totalesDeVenta } from '../src/ventas.ts'

const pesos = (importe: string) => ({ importe, moneda: 'ARS' as const, cotizacion: null })

describe('los totales de una venta', () => {
  it('el comprador paga precio y gastos, menos descuentos; el saldo es lo que falta', () => {
    const t = totalesDeVenta({
      precio: '1000',
      moneda: 'ARS',
      conceptos: [
        { tipo: 'gasto_cliente', ...pesos('100') },
        { tipo: 'descuento', ...pesos('50') },
        { tipo: 'costo_venta', ...pesos('30') },
      ],
      pagos: [pesos('600')],
      costoUnidad: '700',
    })
    expect(t).toMatchObject({
      total: '1050.00',
      pagado: '600.00',
      saldo: '450.00',
      descuentoPorcentaje: '5.0',
    })
    // Los gastos del cliente entran y salen: no son ganancia.
    expect(t.rentabilidad).toEqual({
      costoUnidad: '700.00',
      costosVenta: '30.00',
      margen: '220.00',
      margenPorcentaje: '30.1',
    })
  })

  it('un pago en dólares se convierte con su cotización, y sin ella no suma y se cuenta', () => {
    const t = totalesDeVenta({
      precio: '1000000',
      moneda: 'ARS',
      conceptos: [],
      pagos: [
        { importe: '500', moneda: 'USD', cotizacion: '1000' },
        { importe: '100', moneda: 'USD', cotizacion: null },
      ],
      costoUnidad: null,
    })
    expect(t).toMatchObject({ pagado: '500000.00', sinConvertir: 1, rentabilidad: null })
  })
})
