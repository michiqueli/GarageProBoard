import { describe, expect, it } from 'vitest'
import {
  type DatosFacturaImpresa,
  formatearImporte,
  generarFacturaPdf,
  type RenglonImpreso,
} from '../src/factura.ts'
import { FACTURA_B } from './ejemplos.ts'

const paginas = (pdf: Uint8Array) =>
  (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? []
  ).length

describe('los importes', () => {
  it('con punto de miles y coma decimal, siempre dos decimales', () => {
    expect(formatearImporte('1')).toBe('1,00')
    expect(formatearImporte('0.83')).toBe('0,83')
    expect(formatearImporte('1234567.5')).toBe('1.234.567,50')
    expect(formatearImporte('-1000')).toBe('-1.000,00')
  })

  it('no pasa por number: no pierde centavos en importes grandes', () => {
    expect(formatearImporte('90071992547409.99')).toBe('90.071.992.547.409,99')
  })
})

describe('el PDF', () => {
  it('es un PDF, con una hoja por copia', async () => {
    const pdf = await generarFacturaPdf(FACTURA_B)
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(paginas(pdf)).toBe(3)
  })

  it('las copias se pueden elegir', async () => {
    expect(paginas(await generarFacturaPdf({ ...FACTURA_B, copias: ['ORIGINAL'] }))).toBe(1)
  })

  it('muchos renglones siguen en otra hoja, en cada copia', async () => {
    const renglon = FACTURA_B.renglones[0] as RenglonImpreso
    const f: DatosFacturaImpresa = {
      ...FACTURA_B,
      copias: ['ORIGINAL', 'DUPLICADO'],
      renglones: Array.from({ length: 90 }, (_, i) => ({ ...renglon, descripcion: `Item ${i}` })),
    }
    const n = paginas(await generarFacturaPdf(f))
    expect(n % 2).toBe(0)
    expect(n).toBeGreaterThanOrEqual(4)
  })

  it('sin renglones no se imprime', async () => {
    await expect(generarFacturaPdf({ ...FACTURA_B, renglones: [] })).rejects.toThrow(
      /sin renglones/,
    )
  })
})
