/**
 * QR code codec — the browser-safe half.
 *
 * It does NOT import node:crypto: the kiosk has to parse a scan and resolve it
 * against its local cache in under 50 ms, with no network and without knowing
 * the secret. Signature verification is the server's job (see signature.ts).
 *
 * Format:  GT1:M:A7K2P9QX:4F8B2C1D9E
 *          │   │ │        └─ truncated HMAC signature, 10 chars
 *          │   │ └─ code, 8 chars
 *          │   └─ type: M = mechanic credential, O = work order
 *          └─ format prefix and version
 *
 * 25 characters → QR version 2 with M correction. Reads fast and in poor light,
 * which is exactly what a workshop needs.
 */

export const QR_PREFIX = 'GT1'
export const QR_CODE_LENGTH = 8
export const QR_SIGNATURE_LENGTH = 10

/** Crockford base32: no I, L, O or U — they are misread and mistyped. */
export const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const QR_TYPES = {
  MECHANIC: 'M',
  WORK_ORDER: 'O',
} as const

export type QrType = (typeof QR_TYPES)[keyof typeof QR_TYPES]

export interface ParsedQr {
  type: QrType
  code: string
  signature: string
}

/** Builds the string printed in the QR. The signature is computed on the server. */
export function formatQr(type: QrType, code: string, signature: string): string {
  return `${QR_PREFIX}:${type}:${code}:${signature}`
}

/**
 * Parses without verifying the signature. Returns null if it is not shaped like
 * one of our codes — it could be a part's barcode or junk from the scanner.
 */
export function parseQr(raw: string): ParsedQr | null {
  const clean = raw.trim().toUpperCase()
  const parts = clean.split(':')
  if (parts.length !== 4) return null

  const [prefix, type, code, signature] = parts
  if (prefix !== QR_PREFIX) return null
  if (type !== QR_TYPES.MECHANIC && type !== QR_TYPES.WORK_ORDER) return null
  if (!isValidCode(code, QR_CODE_LENGTH)) return null
  if (!isValidCode(signature, QR_SIGNATURE_LENGTH)) return null

  return { type, code, signature }
}

function isValidCode(value: string | undefined, length: number): value is string {
  if (!value || value.length !== length) return false
  for (const char of value) {
    if (!BASE32_ALPHABET.includes(char)) return false
  }
  return true
}

/**
 * Numeric fallback: the mechanic types the employee number or the work order
 * number when the QR is wrecked. In a workshop they do get wrecked; this is not
 * an edge case.
 */
export function isManualEntry(raw: string): boolean {
  const clean = raw.trim()
  return clean.length > 0 && clean.length <= 20 && !clean.includes(':')
}
