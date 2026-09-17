import { describe, expect, it } from 'vitest'
import { armarQr, esCargaManual, leerQr } from '../src/qr.ts'

describe('el QR', () => {
  it('se arma y se lee, sin importar mayúsculas ni espacios', () => {
    const qr = armarQr('O', 'A7K2P9QX', '4F8B2C1D9E')
    expect(qr).toBe('GT1:O:A7K2P9QX:4F8B2C1D9E')
    expect(leerQr(` ${qr.toLowerCase()} `)).toEqual({
      tipo: 'O',
      codigo: 'A7K2P9QX',
      firma: '4F8B2C1D9E',
    })
  })

  it('lo que no es nuestro no se lee: código de barras, letras prohibidas, otro formato', () => {
    expect(leerQr('7791234567890')).toBeNull()
    expect(leerQr('GT1:O:A7K2P9QI:4F8B2C1D9E')).toBeNull() // la I no está en el alfabeto
    expect(leerQr('GT2:O:A7K2P9QX:4F8B2C1D9E')).toBeNull()
    expect(leerQr('GT1:X:A7K2P9QX:4F8B2C1D9E')).toBeNull()
  })

  it('la carga a mano es un número corto, sin dos puntos', () => {
    expect(esCargaManual('1234')).toBe(true)
    expect(esCargaManual('GT1:O:A7K2P9QX:4F8B2C1D9E')).toBe(false)
  })
})
