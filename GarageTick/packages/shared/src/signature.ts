/**
 * QR signing and code generation — SERVER ONLY (uses node:crypto).
 * Never import this from the front end: the browser never sees QR_SECRET.
 *
 * Why sign at all: if the QR were a bare `12345`, anyone could generate one on
 * their phone and clock in as someone else, or open a work order that does not
 * exist.
 *
 * Honest limit: a printed credential can be photocopied. This stops casual
 * forgery, not deliberate impersonation. If the system ever feeds payroll or
 * bonuses, it needs a PIN on top of the QR.
 * See docs/00-relevamiento.md A3.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  BASE32_ALPHABET,
  QR_CODE_LENGTH,
  QR_SIGNATURE_LENGTH,
  formatQr,
  parseQr,
  type QrType,
} from './qr.js'

/** Random 8-char code with a uniform distribution (no modulo bias). */
export function generateCode(length: number = QR_CODE_LENGTH): string {
  const alphabet = BASE32_ALPHABET
  const maxUnbiased = 256 - (256 % alphabet.length)
  let out = ''

  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= maxUnbiased) continue
      out += alphabet[byte % alphabet.length]
      if (out.length === length) break
    }
  }

  return out
}

export function signCode(type: QrType, code: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(`${type}:${code}`).digest()

  let out = ''
  for (const byte of hmac) {
    out += BASE32_ALPHABET[byte % BASE32_ALPHABET.length]
    if (out.length === QR_SIGNATURE_LENGTH) break
  }
  return out
}

/** Builds the complete string ready to be printed in the QR. */
export function buildQr(type: QrType, code: string, secret: string): string {
  return formatQr(type, code, signCode(type, code, secret))
}

export type VerificationResult =
  | { valid: true; type: QrType; code: string }
  | { valid: false; reason: 'format' | 'signature' }

export function verifyQr(raw: string, secret: string): VerificationResult {
  const parsed = parseQr(raw)
  if (!parsed) return { valid: false, reason: 'format' }

  const expected = signCode(parsed.type, parsed.code, secret)
  if (!safeCompare(expected, parsed.signature)) {
    return { valid: false, reason: 'signature' }
  }

  return { valid: true, type: parsed.type, code: parsed.code }
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
