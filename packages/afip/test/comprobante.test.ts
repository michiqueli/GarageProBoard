import { describe, expect, it } from 'vitest'
import {
  armarComprobante,
  type DatosComprobante,
  interpretarRespuestaCae,
  urlQr,
} from '../src/comprobante.ts'
import { aVoucherWsfe } from '../src/facturacion-arca.ts'

const BASE: DatosComprobante = {
  puntoVenta: 8,
  tipoComprobante: 6,
  numero: 7,
  fecha: '2026-09-16',
  concepto: 1,
  tipoDocReceptor: 99,
  numeroDocReceptor: '0',
  condicionIvaReceptor: 5,
  renglones: [{ total: '1', codigoAlicuota: 5 }],
}

/** Lo que AFIP valida: neto + IVA = total, y el detalle de IVA suma lo mismo que la cabecera. */
function cierra(s: ReturnType<typeof armarComprobante>) {
  const cent = (x: string) => Math.round(Number(x) * 100)
  expect(cent(s.importeNeto) + cent(s.importeIva) + cent(s.importeExento)).toBe(
    cent(s.importeTotal),
  )
  if (s.alicuotas.length) {
    expect(s.alicuotas.reduce((a, r) => a + cent(r.baseImponible), 0)).toBe(cent(s.importeNeto))
    expect(s.alicuotas.reduce((a, r) => a + cent(r.importe), 0)).toBe(cent(s.importeIva))
  }
}

describe('armar el comprobante desde el precio final', () => {
  it('una Factura B de $1 con IVA 21%: 0,83 de neto y 0,17 de IVA', () => {
    const s = armarComprobante(BASE)
    expect(s).toMatchObject({ importeNeto: '0.83', importeIva: '0.17', importeTotal: '1.00' })
    expect(s.alicuotas).toEqual([{ codigoAlicuota: 5, baseImponible: '0.83', importe: '0.17' }])
    cierra(s)
  })

  it('agrupa por alícuota: repuesto al 21% y un libro al 10,5%', () => {
    const s = armarComprobante({
      ...BASE,
      renglones: [
        { total: '60.50', codigoAlicuota: 5 },
        { total: '60.50', codigoAlicuota: 5 },
        { total: '110.50', codigoAlicuota: 4 },
      ],
    })
    expect(s.alicuotas).toEqual([
      { codigoAlicuota: 4, baseImponible: '100.00', importe: '10.50' },
      { codigoAlicuota: 5, baseImponible: '100.00', importe: '21.00' },
    ])
    expect(s.importeTotal).toBe('231.50')
    cierra(s)
  })

  it('con precios que no dividen justo, igual cierra al centavo', () => {
    const s = armarComprobante({
      ...BASE,
      renglones: [
        { total: '33.33', codigoAlicuota: 5 },
        { total: '33.33', codigoAlicuota: 5 },
        { total: '33.33', codigoAlicuota: 5 },
      ],
    })
    expect(s.importeTotal).toBe('99.99')
    cierra(s)
  })

  it('una C no informa IVA: el neto es el total', () => {
    const s = armarComprobante({ ...BASE, tipoComprobante: 11 })
    expect(s).toMatchObject({ importeNeto: '1.00', importeIva: '0.00', alicuotas: [] })
  })

  it('facturar servicios sin el período no se arma', () => {
    expect(() => armarComprobante({ ...BASE, concepto: 2 })).toThrow(/período del servicio/)
  })

  it('una alícuota inventada no se arma', () => {
    expect(() =>
      armarComprobante({ ...BASE, renglones: [{ total: '1', codigoAlicuota: 99 }] }),
    ).toThrow(/Alícuota de IVA desconocida/)
  })
})

describe('el formato de WSFE', () => {
  it('fechas sin guiones, importes como números y el detalle de IVA', () => {
    const v = aVoucherWsfe(
      armarComprobante({
        ...BASE,
        concepto: 2,
        servicio: { desde: '2026-09-01', hasta: '2026-09-16', vencimientoPago: '2026-09-30' },
      }),
    )
    expect(v).toMatchObject({
      CbteFch: '20260916',
      FchServDesde: '20260901',
      FchVtoPago: '20260930',
      ImpTotal: 1,
      ImpNeto: 0.83,
      ImpIVA: 0.17,
      CondicionIVAReceptorId: 5,
      Iva: [{ Id: 5, BaseImp: 0.83, Importe: 0.17 }],
    })
  })

  it('una nota de crédito lleva la factura que anula', () => {
    const v = aVoucherWsfe(
      armarComprobante({
        ...BASE,
        tipoComprobante: 8,
        asociado: { tipo: 6, puntoVenta: 8, numero: 7, cuit: '30712345671', fecha: '2026-09-16' },
      }),
    )
    expect(v).toMatchObject({
      CbteTipo: 8,
      CbtesAsoc: [{ Tipo: 6, PtoVta: 8, Nro: 7, Cuit: '30712345671', CbteFch: '20260916' }],
    })
  })

  it('una C no manda el bloque de IVA', () => {
    expect(aVoucherWsfe(armarComprobante({ ...BASE, tipoComprobante: 11 }))).not.toHaveProperty(
      'Iva',
    )
  })
})

describe('lo que contesta AFIP', () => {
  it('aprobado, con sus observaciones', () => {
    expect(
      interpretarRespuestaCae({
        FeDetResp: {
          FECAEDetResponse: [
            {
              Resultado: 'A',
              CAE: '76381234567890',
              CAEFchVto: '20260926',
              Observaciones: { Obs: [{ Code: 10217, Msg: 'Observación de prueba' }] },
            },
          ],
        },
      }),
    ).toEqual({
      resultado: 'aprobado',
      cae: '76381234567890',
      vencimientoCae: '2026-09-26',
      observaciones: [{ codigo: 10217, mensaje: 'Observación de prueba' }],
    })
  })

  it('rechazado, con el motivo', () => {
    const r = interpretarRespuestaCae({
      FeDetResp: {
        FECAEDetResponse: [
          {
            Resultado: 'R',
            CAE: '',
            Observaciones: {
              Obs: [
                {
                  Code: 10016,
                  Msg: 'El numero o fecha del comprobante no se corresponde con el proximo a autorizar.',
                },
              ],
            },
          },
        ],
      },
    })
    expect(r).toMatchObject({ resultado: 'rechazado', observaciones: [{ codigo: 10016 }] })
  })

  it('una A sin CAE no se da por buena', () => {
    const r = interpretarRespuestaCae({
      FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '' }] },
    })
    expect(r.resultado).toBe('rechazado')
  })

  it('un error general, sin detalle', () => {
    const r = interpretarRespuestaCae({
      Errors: {
        Err: [{ Code: 600, Msg: 'ValidacionDeToken: No aparecio CUIT en lista de relaciones' }],
      },
    })
    expect(r).toMatchObject({ resultado: 'rechazado', errores: [{ codigo: 600 }] })
  })
})

describe('el QR', () => {
  it('lleva los datos del comprobante en JSON y base64, como pide AFIP', () => {
    const url = urlQr({
      fecha: '2026-09-16',
      cuitEmisor: '30712345671',
      puntoVenta: 8,
      tipoComprobante: 6,
      numero: 7,
      importeTotal: '1.00',
      tipoDocReceptor: 99,
      numeroDocReceptor: '0',
      cae: '76381234567890',
    })
    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true)
    const json = JSON.parse(Buffer.from(url.split('?p=')[1] ?? '', 'base64').toString())
    expect(json).toEqual({
      ver: 1,
      fecha: '2026-09-16',
      cuit: 30712345671,
      ptoVta: 8,
      tipoCmp: 6,
      nroCmp: 7,
      importe: 1,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 76381234567890,
    })
  })
})
