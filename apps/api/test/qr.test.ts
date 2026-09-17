import { describe, expect, it } from 'vitest'
import { generarCodigoQr, qrFirmado, verificarQr } from '../src/comun/qr.ts'

const CLAVE = 'una-clave-de-prueba-de-mas-de-32-caracteres'

describe('la firma del QR', () => {
  it('un QR firmado se verifica; con otra clave o tocado, no', () => {
    const codigo = generarCodigoQr()
    expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    const qr = qrFirmado('O', codigo, CLAVE)
    expect(verificarQr(qr, CLAVE)).toEqual({ valido: true, tipo: 'O', codigo })
    expect(verificarQr(qr, `${CLAVE}x`)).toEqual({ valido: false, motivo: 'firma' })
    // Cambiar el tipo invalida la firma: la de una orden no sirve como credencial.
    expect(verificarQr(qr.replace(':O:', ':M:'), CLAVE)).toEqual({ valido: false, motivo: 'firma' })
    expect(verificarQr('12345', CLAVE)).toEqual({ valido: false, motivo: 'formato' })
  })
})
