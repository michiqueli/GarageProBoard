import 'reflect-metadata'
import { createPrivateKey, webcrypto, X509Certificate } from 'node:crypto'
import * as x509 from '@peculiar/x509'
import type { Entorno } from './puerto.ts'

/**
 * El certificado con el que una empresa factura: generar el pedido y revisar lo que
 * devuelve ARCA. Ver `docs/tecnicos/afip-certificados.md`.
 *
 * La clave privada nace acá y no sale nunca en claro hacia el usuario: ARCA no la pide, y
 * cada copia suelta en una PC es una forma de facturar con ese CUIT.
 */

// `@peculiar/x509` usa inyección de dependencias con decoradores: de ahí `reflect-metadata`.
x509.cryptoProvider.set(webcrypto as never)

const ALGORITMO = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
} as const

/** El OID de `serialNumber`, donde AFIP espera «CUIT 30123456789». */
const OID_SERIAL_NUMBER = '2.5.4.5'

/** Letras, números y guiones: lo que ARCA acepta como nombre del computador. */
export const ALIAS_VALIDO = /^[A-Za-z0-9-]{3,30}$/

export interface PedidoCertificado {
  /** El CSR, para cargar en ARCA. */
  pedidoPem: string
  /** PKCS#8. Se cifra antes de guardarse. */
  clavePrivadaPem: string
}

/**
 * La clave privada y el pedido de certificado, con los datos que AFIP exige en el sujeto:
 * `C=AR, O=<razón social>, CN=<alias>, serialNumber=CUIT <cuit>`.
 *
 * El nombre se arma como lista de atributos y no como texto: una razón social con coma
 * —«PÉREZ, JUAN»— rompería el texto y saldría un pedido con otro sujeto.
 */
export async function generarPedido(datos: {
  cuit: string
  razonSocial: string
  alias: string
}): Promise<PedidoCertificado> {
  if (!/^\d{11}$/.test(datos.cuit)) throw new Error('El CUIT son 11 dígitos.')
  if (!ALIAS_VALIDO.test(datos.alias)) throw new Error('Alias inválido.')

  const claves = await webcrypto.subtle.generateKey(ALGORITMO, true, ['sign', 'verify'])
  const pedido = await x509.Pkcs10CertificateRequestGenerator.create({
    name: [
      { C: ['AR'] },
      { O: [datos.razonSocial] },
      { CN: [datos.alias] },
      { [OID_SERIAL_NUMBER]: [`CUIT ${datos.cuit}`] },
    ],
    keys: claves,
    signingAlgorithm: ALGORITMO,
  })
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', claves.privateKey)
  return {
    pedidoPem: pedido.toString('pem'),
    clavePrivadaPem: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY'),
  }
}

export type MotivoRechazoCertificado =
  | 'ILEGIBLE'
  | 'NO_ES_DE_AFIP'
  | 'NO_CORRESPONDE_AL_PEDIDO'
  | 'OTRO_CUIT'
  | 'VENCIDO'
  | 'TODAVIA_NO_VIGENTE'

export class CertificadoRechazado extends Error {
  constructor(readonly motivo: MotivoRechazoCertificado) {
    super(motivo)
    this.name = 'CertificadoRechazado'
  }
}

export interface CertificadoLeido {
  cuit: string
  alias: string
  entorno: Entorno
  vigenteDesde: Date
  vigenteHasta: Date
}

/** Los atributos de un nombre X.500 tal como los imprime Node: una línea por atributo. */
function atributos(nombre: string): Map<string, string> {
  return new Map(
    nombre.split('\n').map((linea) => {
      const i = linea.indexOf('=')
      return [linea.slice(0, i), linea.slice(i + 1)] as [string, string]
    }),
  )
}

/**
 * Un certificado que ARCA emitió, para el CUIT de la empresa, a partir de **nuestro** pedido
 * y vigente. Si no, dice por qué, en el orden en que conviene arreglarlo.
 *
 * El entorno sale del emisor: «Computadores» firma los de producción y «Computadores Test»
 * los de homologación.
 */
export function verificarCertificado(datos: {
  certificadoPem: string
  clavePrivadaPem: string
  cuit: string
  ahora?: Date | undefined
}): CertificadoLeido {
  let cert: X509Certificate
  try {
    cert = new X509Certificate(datos.certificadoPem)
  } catch {
    throw new CertificadoRechazado('ILEGIBLE')
  }

  const emisor = atributos(cert.issuer)
  const entorno: Entorno | null =
    emisor.get('O') !== 'AFIP'
      ? null
      : emisor.get('CN') === 'Computadores'
        ? 'produccion'
        : emisor.get('CN') === 'Computadores Test'
          ? 'homologacion'
          : null
  if (!entorno) throw new CertificadoRechazado('NO_ES_DE_AFIP')

  if (!cert.checkPrivateKey(createPrivateKey(datos.clavePrivadaPem))) {
    throw new CertificadoRechazado('NO_CORRESPONDE_AL_PEDIDO')
  }

  const sujeto = atributos(cert.subject)
  const cuit = /^CUIT (\d{11})$/.exec(sujeto.get('serialNumber') ?? '')?.[1]
  if (cuit !== datos.cuit) throw new CertificadoRechazado('OTRO_CUIT')

  const ahora = datos.ahora ?? new Date()
  const vigenteDesde = new Date(cert.validFrom)
  const vigenteHasta = new Date(cert.validTo)
  if (vigenteHasta <= ahora) throw new CertificadoRechazado('VENCIDO')
  if (vigenteDesde > ahora) throw new CertificadoRechazado('TODAVIA_NO_VIGENTE')

  return { cuit, alias: sujeto.get('CN') ?? '', entorno, vigenteDesde, vigenteHasta }
}
