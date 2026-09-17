/**
 * El QR de GarageProBoard, la mitad que no necesita secretos: armar y leer. Tomado de
 * GarageTick, el formato ya probado en un taller.
 *
 *     GT1:O:A7K2P9QX:4F8B2C1D9E
 *     │   │ │        └─ firma HMAC truncada, 10 caracteres (la pone el servidor)
 *     │   │ └─ código al azar, 8 caracteres
 *     │   └─ tipo: O orden de trabajo, M credencial de una persona
 *     └─ formato y versión
 *
 * 25 caracteres: QR versión 2, que se lee rápido y con poca luz.
 *
 * **Nunca el id pelado.** Con un `12345`, cualquiera arma un QR en el celular y ficha por
 * otro. La firma evita la falsificación casual; una fotocopia sigue siendo una fotocopia.
 *
 * Este archivo no importa `node:crypto`: el kiosco del taller lee y resuelve contra su
 * caché sin red. La firma se verifica en el servidor.
 *
 * El mismo formato sirve para la credencial de cualquier empleado: el fichaje del taller
 * y, más adelante, la entrada y salida en el control de asistencia de RRHH.
 */

export const QR_PREFIJO = 'GT1'
export const QR_LARGO_CODIGO = 8
export const QR_LARGO_FIRMA = 10

/** Base32 de Crockford: sin I, L, O ni U, que se leen y se tipean mal. */
export const ALFABETO_QR = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const TIPOS_QR = {
  /** La credencial de una persona: mecánico hoy, cualquier empleado mañana. */
  credencial: 'M',
  orden: 'O',
} as const

export type TipoQr = (typeof TIPOS_QR)[keyof typeof TIPOS_QR]

export interface QrLeido {
  tipo: TipoQr
  codigo: string
  firma: string
}

export function armarQr(tipo: TipoQr, codigo: string, firma: string): string {
  return `${QR_PREFIJO}:${tipo}:${codigo}:${firma}`
}

/**
 * Lee sin verificar la firma. `null` si no tiene la forma de uno nuestro: puede ser el
 * código de barras de un repuesto, o basura del lector.
 */
export function leerQr(crudo: string): QrLeido | null {
  const partes = crudo.trim().toUpperCase().split(':')
  if (partes.length !== 4) return null
  const [prefijo, tipo, codigo, firma] = partes
  if (prefijo !== QR_PREFIJO) return null
  if (tipo !== TIPOS_QR.credencial && tipo !== TIPOS_QR.orden) return null
  if (!esCodigo(codigo, QR_LARGO_CODIGO) || !esCodigo(firma, QR_LARGO_FIRMA)) return null
  return { tipo, codigo, firma }
}

export function esCodigo(valor: string | undefined, largo: number): valor is string {
  if (!valor || valor.length !== largo) return false
  for (const letra of valor) if (!ALFABETO_QR.includes(letra)) return false
  return true
}

/**
 * La carga a mano, cuando el QR está arruinado: el número de orden o el legajo. En un
 * taller se arruinan; no es un caso raro.
 */
export function esCargaManual(crudo: string): boolean {
  const limpio = crudo.trim()
  return limpio.length > 0 && limpio.length <= 20 && !limpio.includes(':')
}
