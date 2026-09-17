import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  ALFABETO_QR,
  armarQr,
  leerQr,
  QR_LARGO_CODIGO,
  QR_LARGO_FIRMA,
  type TipoQr,
} from '@gpb/core'

/**
 * La mitad del QR que necesita el secreto: generar códigos y firmarlos. **Sólo servidor**:
 * el navegador nunca ve `QR_SECRET`. Ver `packages/core/src/qr.ts`.
 */

export class SecretoQrFaltante extends Error {
  constructor() {
    super('Falta QR_SECRET: sin él no se pueden firmar los QR de las órdenes.')
    this.name = 'SecretoQrFaltante'
  }
}

/** Un código de 8 caracteres al azar, uniforme: sin el sesgo del módulo. */
export function generarCodigoQr(largo = QR_LARGO_CODIGO): string {
  const tope = 256 - (256 % ALFABETO_QR.length)
  let salida = ''
  while (salida.length < largo) {
    for (const byte of randomBytes(largo * 2)) {
      if (byte >= tope) continue
      salida += ALFABETO_QR[byte % ALFABETO_QR.length]
      if (salida.length === largo) break
    }
  }
  return salida
}

function secreto(): string {
  const valor = process.env.QR_SECRET
  if (!valor || valor.length < 32) throw new SecretoQrFaltante()
  return valor
}

export function firmarCodigo(tipo: TipoQr, codigo: string, clave = secreto()): string {
  const hmac = createHmac('sha256', clave).update(`${tipo}:${codigo}`).digest()
  let salida = ''
  for (const byte of hmac) {
    salida += ALFABETO_QR[byte % ALFABETO_QR.length]
    if (salida.length === QR_LARGO_FIRMA) break
  }
  return salida
}

/** El texto completo, listo para imprimir en el QR. */
export function qrFirmado(tipo: TipoQr, codigo: string, clave = secreto()): string {
  return armarQr(tipo, codigo, firmarCodigo(tipo, codigo, clave))
}

export type Verificacion =
  | { valido: true; tipo: TipoQr; codigo: string }
  | { valido: false; motivo: 'formato' | 'firma' }

export function verificarQr(crudo: string, clave = secreto()): Verificacion {
  const leido = leerQr(crudo)
  if (!leido) return { valido: false, motivo: 'formato' }
  const esperada = firmarCodigo(leido.tipo, leido.codigo, clave)
  const iguales =
    esperada.length === leido.firma.length &&
    timingSafeEqual(Buffer.from(esperada), Buffer.from(leido.firma))
  return iguales
    ? { valido: true, tipo: leido.tipo, codigo: leido.codigo }
    : { valido: false, motivo: 'firma' }
}
