import 'reflect-metadata'
import { createPrivateKey, webcrypto } from 'node:crypto'
import * as x509 from '@peculiar/x509'

/**
 * Certificados «de AFIP» para los tests: firma un pedido como lo haría ARCA, con una
 * autoridad inventada que se llama igual. Sólo para pruebas: AFIP no los acepta.
 */

const ALGORITMO = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
} as const

let autoridad: webcrypto.CryptoKeyPair | undefined

export async function firmarComoAfip(
  pedidoPem: string,
  opciones: {
    entorno?: 'produccion' | 'homologacion'
    emisor?: string
    desde?: Date
    hasta?: Date
    /** Para simular un certificado de otro CUIT, otro sujeto. */
    sujeto?: string
  } = {},
): Promise<string> {
  autoridad ??= await webcrypto.subtle.generateKey(ALGORITMO, true, ['sign', 'verify'])
  const pedido = new x509.Pkcs10CertificateRequest(pedidoPem)
  const desde = opciones.desde ?? new Date(Date.now() - 86_400_000)
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: Date.now().toString(16),
    subject: opciones.sujeto ?? pedido.subject,
    issuer:
      opciones.emisor ??
      `C=AR, O=AFIP, CN=${opciones.entorno === 'produccion' ? 'Computadores' : 'Computadores Test'}`,
    notBefore: desde,
    notAfter: opciones.hasta ?? new Date(desde.getTime() + 2 * 365 * 86_400_000),
    publicKey: await pedido.publicKey.export(ALGORITMO, ['verify']),
    signingKey: autoridad.privateKey,
    signingAlgorithm: ALGORITMO,
  })
  return cert.toString('pem')
}

/** Una clave privada cualquiera, para simular un certificado de otro pedido. */
export async function otraClavePrivada(): Promise<string> {
  const claves = await webcrypto.subtle.generateKey(ALGORITMO, true, ['sign', 'verify'])
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', claves.privateKey)
  return createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' })
    .export({ format: 'pem', type: 'pkcs8' })
    .toString()
}
