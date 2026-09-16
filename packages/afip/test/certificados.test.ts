import 'reflect-metadata'
import { X509Certificate } from 'node:crypto'
import * as x509 from '@peculiar/x509'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CertificadoRechazado,
  generarPedido,
  type PedidoCertificado,
  verificarCertificado,
} from '../src/certificados.ts'
import { firmarComoAfip, otraClavePrivada } from '../src/pruebas.ts'

const CUIT = '30712345671'
let pedido: PedidoCertificado

beforeAll(async () => {
  pedido = await generarPedido({ cuit: CUIT, razonSocial: 'PÉREZ, JUAN S.A.', alias: 'gpb-taller' })
})

function motivo(fn: () => unknown) {
  try {
    fn()
  } catch (error) {
    if (error instanceof CertificadoRechazado) return error.motivo
    throw error
  }
  return null
}

describe('el pedido de certificado', () => {
  it('lleva en el sujeto lo que exige AFIP, aunque la razón social tenga coma', () => {
    const csr = new x509.Pkcs10CertificateRequest(pedido.pedidoPem)
    expect(csr.subjectName.getField('C')).toEqual(['AR'])
    expect(csr.subjectName.getField('O')).toEqual(['PÉREZ, JUAN S.A.'])
    expect(csr.subjectName.getField('CN')).toEqual(['gpb-taller'])
    expect(csr.subjectName.getField('2.5.4.5')).toEqual([`CUIT ${CUIT}`])
  })

  it('está firmado con la clave que se guarda', async () => {
    expect(await new x509.Pkcs10CertificateRequest(pedido.pedidoPem).verify()).toBe(true)
    expect(pedido.clavePrivadaPem).toMatch(/^-----BEGIN PRIVATE KEY-----/)
  })

  it('un alias con espacios no se pide', async () => {
    await expect(
      generarPedido({ cuit: CUIT, razonSocial: 'X', alias: 'con espacio' }),
    ).rejects.toThrow()
  })
})

describe('el certificado que devuelve ARCA', () => {
  it('de homologación y de producción, con su vigencia', async () => {
    const test = verificarCertificado({
      certificadoPem: await firmarComoAfip(pedido.pedidoPem),
      clavePrivadaPem: pedido.clavePrivadaPem,
      cuit: CUIT,
    })
    expect(test).toMatchObject({ cuit: CUIT, alias: 'gpb-taller', entorno: 'homologacion' })

    const pem = await firmarComoAfip(pedido.pedidoPem, { entorno: 'produccion' })
    const prod = verificarCertificado({
      certificadoPem: pem,
      clavePrivadaPem: pedido.clavePrivadaPem,
      cuit: CUIT,
    })
    expect(prod.entorno).toBe('produccion')
    expect(prod.vigenteHasta.getTime()).toBe(new Date(new X509Certificate(pem).validTo).getTime())
  })

  it('lo que no es un certificado', () => {
    expect(
      motivo(() =>
        verificarCertificado({
          certificadoPem: pedido.pedidoPem,
          clavePrivadaPem: pedido.clavePrivadaPem,
          cuit: CUIT,
        }),
      ),
    ).toBe('ILEGIBLE')
  })

  it('uno que no firmó AFIP', async () => {
    const pem = await firmarComoAfip(pedido.pedidoPem, { emisor: 'C=AR, O=Otra, CN=Computadores' })
    expect(
      motivo(() =>
        verificarCertificado({
          certificadoPem: pem,
          clavePrivadaPem: pedido.clavePrivadaPem,
          cuit: CUIT,
        }),
      ),
    ).toBe('NO_ES_DE_AFIP')
  })

  it('el de otro pedido: la clave no corresponde', async () => {
    const pem = await firmarComoAfip(pedido.pedidoPem)
    const otra = await otraClavePrivada()
    expect(
      motivo(() =>
        verificarCertificado({ certificadoPem: pem, clavePrivadaPem: otra, cuit: CUIT }),
      ),
    ).toBe('NO_CORRESPONDE_AL_PEDIDO')
  })

  it('el de otro CUIT', async () => {
    const pem = await firmarComoAfip(pedido.pedidoPem, {
      sujeto: 'C=AR, O=Otra, CN=gpb, 2.5.4.5=CUIT 20111111112',
    })
    expect(
      motivo(() =>
        verificarCertificado({
          certificadoPem: pem,
          clavePrivadaPem: pedido.clavePrivadaPem,
          cuit: CUIT,
        }),
      ),
    ).toBe('OTRO_CUIT')
  })

  it('vencido', async () => {
    const pem = await firmarComoAfip(pedido.pedidoPem, {
      desde: new Date('2020-01-01'),
      hasta: new Date('2022-01-01'),
    })
    expect(
      motivo(() =>
        verificarCertificado({
          certificadoPem: pem,
          clavePrivadaPem: pedido.clavePrivadaPem,
          cuit: CUIT,
        }),
      ),
    ).toBe('VENCIDO')
  })
})
