import { describe, expect, it } from 'vitest'
import { armarCorreoComprobante } from '../src/comprobantes/correo-comprobante.ts'

const DATOS = {
  titulo: 'Factura B 00008-00000012',
  receptor: 'Gómez, Ana',
  empresa: 'Autos del Litoral',
  sucursal: 'Casa Central',
  razonSocial: 'MENNICHELLI, NICOLAS GUSTAVO',
  cuit: '20295544040',
  fecha: '2026-11-08',
  total: '1234.5',
  cae: '86373382230591',
}

describe('el mail de un comprobante', () => {
  it('dice la empresa y la sucursal, con el total y el CAE', () => {
    const m = armarCorreoComprobante(DATOS)
    expect(m.asunto).toBe('Factura B 00008-00000012 · Autos del Litoral (Casa Central)')
    expect(m.html).toContain('Autos del Litoral')
    expect(m.html).toContain('Casa Central')
    expect(m.html).toContain('$ 1.234,50')
    expect(m.html).toContain('08/11/2026')
    expect(m.html).toContain('20-29554404-0')
    expect(m.texto).toContain('Hola, Gómez, Ana:')
  })

  it('lo que cargó alguien no se interpreta como HTML', () => {
    const m = armarCorreoComprobante({ ...DATOS, receptor: '<img src=x onerror=alert(1)>' })
    expect(m.html).not.toContain('<img')
    expect(m.html).toContain('&lt;img')
  })
})
