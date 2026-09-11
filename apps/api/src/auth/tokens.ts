import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * El token de refresco es una cadena opaca, no un JWT.
 *
 * Un JWT de refresco es válido hasta que vence y no hay forma de anularlo sin llevar
 * una lista negra — es decir, sin el estado que el JWT prometía evitar. Como acá el
 * estado hace falta igual (rotación y detección de reuso), conviene una cadena al azar:
 * más corta, imposible de leer, y su única verdad está en la base.
 *
 * Lleva el tenant adelante por una razón práctica: al refrescar todavía no hay sesión
 * de la que sacarlo, y sin tenant las políticas de RLS no dejan leer la tabla. El
 * prefijo no es un secreto — el secreto es la parte al azar.
 */

const BYTES_SECRETO = 48

export interface RefrescoPartido {
  tenantId: string
  secreto: string
}

export function generarRefresco(tenantId: string): string {
  return `${tenantId}.${randomBytes(BYTES_SECRETO).toString('base64url')}`
}

export function partirRefresco(token: string): RefrescoPartido | null {
  const punto = token.indexOf('.')
  if (punto <= 0) return null

  const tenantId = token.slice(0, punto)
  const secreto = token.slice(punto + 1)

  // El tenant tiene que ser un uuid: si no, ni vale la pena tocar la base.
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)
  if (!esUuid || secreto.length < 32) return null

  return { tenantId, secreto }
}

/** Lo que se guarda. Un volcado de la base no alcanza para entrar. */
export function hashearRefresco(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Comparación de tiempo constante, para no filtrar cuántos caracteres coincidían. */
export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Lo que viaja adentro del token de acceso. */
export interface ClaimsAcceso {
  /** Usuario. */
  sub: string
  /** Tenant. */
  ten: string
  /** Sucursal activa. */
  suc: string
  /** Sesión, para poder cortar un access todavía vigente si hace falta. */
  ses: string
}
