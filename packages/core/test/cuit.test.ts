import { describe, expect, it } from 'vitest'
import { cuitValido, formatearCuit, normalizarCuit } from '../src/cuit.ts'

describe('el CUIT', () => {
  it('acepta uno con el dígito verificador correcto, con o sin guiones', () => {
    expect(cuitValido('30712345671')).toBe(true)
    expect(cuitValido('30-71234567-1')).toBe(true)
    // El de AFIP, que figura en todas sus facturas.
    expect(cuitValido('33-69345023-9')).toBe(true)
  })

  it('rechaza uno con un dígito cambiado: el error de tipeo de siempre', () => {
    expect(cuitValido('30712345679')).toBe(false)
    expect(cuitValido('30712345761')).toBe(false)
  })

  it('rechaza lo que no tiene once dígitos', () => {
    expect(cuitValido('3071234567')).toBe(false)
    expect(cuitValido('30A12345671')).toBe(false)
    expect(cuitValido('')).toBe(false)
  })

  it('se escribe como en una factura', () => {
    expect(formatearCuit('30712345671')).toBe('30-71234567-1')
    expect(normalizarCuit('30-71234567-1')).toBe('30712345671')
  })
})
