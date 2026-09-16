import { Decimal } from 'decimal.js'
import type { SolicitudComprobante } from './puerto.ts'

/**
 * Armar un comprobante para AFIP y entender lo que contesta. Todo puro: ni SDK, ni red.
 *
 * Lo que AFIP valida y rechaza por un centavo:
 * - `ImpTotal = ImpNeto + ImpIVA + ImpOpEx + ImpTotConc + ImpTrib`, a dos decimales.
 * - La suma de las `BaseImp` de IVA es `ImpNeto`, y la de sus `Importe` es `ImpIVA`.
 * - En las C no se informa IVA: el neto es el total.
 */

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

/** Alícuotas de IVA de AFIP, en porcentaje. */
export const ALICUOTAS_IVA: Readonly<Record<number, string>> = {
  3: '0',
  4: '10.5',
  5: '21',
  6: '27',
  8: '5',
  9: '2.5',
}

/** Letras de comprobante que discriminan o no el IVA frente a AFIP. */
const SIN_IVA = new Set([11, 12, 13, 15]) // C: factura, ND, NC, recibo

/** 1 productos, 2 servicios, 3 productos y servicios. El taller vende las tres cosas. */
export type Concepto = 1 | 2 | 3

export interface RenglonFacturable {
  /** Precio final, IVA incluido, como string decimal. Lo que se le cobra al cliente. */
  total: string
  codigoAlicuota: number
}

export interface DatosComprobante {
  puntoVenta: number
  tipoComprobante: number
  numero: number
  /** AAAA-MM-DD. */
  fecha: string
  concepto: Concepto
  tipoDocReceptor: number
  numeroDocReceptor: string
  condicionIvaReceptor: number
  renglones: readonly RenglonFacturable[]
  /** Obligatorias para servicios: el período facturado y cuándo vence el pago. AAAA-MM-DD. */
  servicio?: { desde: string; hasta: string; vencimientoPago: string } | undefined
}

const dos = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

/**
 * Parte los renglones en neto e IVA **por alícuota**, a partir del precio final.
 *
 * Se redondea el neto de cada alícuota y el IVA sale por diferencia contra el total: así
 * el total que ve el cliente es exactamente el que se informa, y neto + IVA cierra siempre.
 * Calcular IVA renglón por renglón y sumar redondeos es la forma clásica de que AFIP
 * rechace por un centavo.
 */
export function armarComprobante(datos: DatosComprobante): SolicitudComprobante {
  if (datos.renglones.length === 0) throw new Error('Un comprobante sin renglones no se emite.')

  const totalPorAlicuota = new Map<number, Decimal>()
  for (const r of datos.renglones) {
    if (!(r.codigoAlicuota in ALICUOTAS_IVA)) {
      throw new Error(`Alícuota de IVA desconocida: ${r.codigoAlicuota}`)
    }
    const total = new D(r.total)
    if (total.isNegative())
      throw new Error('Los renglones van en positivo; para restar, una nota de crédito.')
    totalPorAlicuota.set(
      r.codigoAlicuota,
      (totalPorAlicuota.get(r.codigoAlicuota) ?? new D(0)).plus(total),
    )
  }

  const importeTotal = dos([...totalPorAlicuota.values()].reduce((a, b) => a.plus(b), new D(0)))
  const sinIva = SIN_IVA.has(datos.tipoComprobante)

  const alicuotas = sinIva
    ? []
    : [...totalPorAlicuota]
        .sort(([a], [b]) => a - b)
        .map(([codigo, total]) => {
          const totalDos = dos(total)
          const neto = dos(
            totalDos.dividedBy(new D(1).plus(new D(ALICUOTAS_IVA[codigo] ?? '0').dividedBy(100))),
          )
          return {
            codigoAlicuota: codigo,
            baseImponible: neto.toFixed(2),
            importe: totalDos.minus(neto).toFixed(2),
          }
        })

  const importeNeto = sinIva
    ? importeTotal
    : alicuotas.reduce((a, r) => a.plus(r.baseImponible), new D(0))
  const importeIva = sinIva ? new D(0) : alicuotas.reduce((a, r) => a.plus(r.importe), new D(0))

  if (datos.concepto !== 1 && !datos.servicio) {
    throw new Error('Facturar servicios pide el período del servicio y el vencimiento del pago.')
  }

  return {
    puntoVenta: datos.puntoVenta,
    tipoComprobante: datos.tipoComprobante,
    numero: datos.numero,
    fecha: datos.fecha,
    concepto: datos.concepto,
    tipoDocReceptor: datos.tipoDocReceptor,
    numeroDocReceptor: datos.numeroDocReceptor,
    condicionIvaReceptor: datos.condicionIvaReceptor,
    importeNeto: importeNeto.toFixed(2),
    importeIva: importeIva.toFixed(2),
    importeTotal: importeTotal.toFixed(2),
    importeExento: '0.00',
    alicuotas,
    servicio: datos.servicio,
  }
}

export interface MensajeAfip {
  codigo: number
  mensaje: string
}

export type ResultadoCae =
  | { resultado: 'aprobado'; cae: string; vencimientoCae: string; observaciones: MensajeAfip[] }
  | { resultado: 'rechazado'; errores: MensajeAfip[]; observaciones: MensajeAfip[] }

/** La forma de `FECAESolicitarResult` que nos importa. */
export interface RespuestaCae {
  FeCabResp?: { Resultado?: string } | undefined
  FeDetResp?: {
    FECAEDetResponse?:
      | Array<{
          Resultado?: string
          CAE?: string | null
          CAEFchVto?: string | null
          Observaciones?: { Obs?: Array<{ Code: number; Msg: string }> | undefined } | null
        }>
      | undefined
  } | null
  Errors?: { Err?: Array<{ Code: number; Msg: string }> | undefined } | null
}

const mensajes = (lista: Array<{ Code: number; Msg: string }> | undefined): MensajeAfip[] =>
  (lista ?? []).map((m) => ({ codigo: Number(m.Code), mensaje: String(m.Msg) }))

/**
 * Lo que contestó AFIP, sin ambigüedad. Aprobado es `Resultado = A` **con** CAE: un CAE
 * vacío con resultado A no se da por bueno. Todo lo demás es rechazo, con los motivos.
 *
 * Las observaciones pueden venir en un aprobado —«el receptor no está en el padrón»— y se
 * guardan igual: son avisos que alguien tiene que leer.
 */
export function interpretarRespuestaCae(respuesta: RespuestaCae): ResultadoCae {
  const det = respuesta.FeDetResp?.FECAEDetResponse?.[0]
  const observaciones = mensajes(det?.Observaciones?.Obs)
  const errores = mensajes(respuesta.Errors?.Err)

  if (det?.Resultado === 'A' && det.CAE && det.CAEFchVto) {
    return {
      resultado: 'aprobado',
      cae: det.CAE,
      vencimientoCae: `${det.CAEFchVto.slice(0, 4)}-${det.CAEFchVto.slice(4, 6)}-${det.CAEFchVto.slice(6, 8)}`,
      observaciones,
    }
  }
  return {
    resultado: 'rechazado',
    errores:
      errores.length || observaciones.length
        ? errores
        : [{ codigo: 0, mensaje: 'AFIP no autorizó el comprobante y no dijo por qué.' }],
    observaciones,
  }
}

/**
 * El QR del comprobante, según la especificación de AFIP (RG 4.892): una URL con los datos
 * del comprobante en JSON y base64. Quien lo escanea llega a AFIP y ve si el CAE es válido.
 */
export function urlQr(datos: {
  fecha: string
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante: number
  numero: number
  importeTotal: string
  tipoDocReceptor: number
  numeroDocReceptor: string
  cae: string
}): string {
  const json = {
    ver: 1,
    fecha: datos.fecha,
    cuit: Number(datos.cuitEmisor),
    ptoVta: datos.puntoVenta,
    tipoCmp: datos.tipoComprobante,
    nroCmp: datos.numero,
    importe: Number(datos.importeTotal),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: datos.tipoDocReceptor,
    nroDocRec: Number(datos.numeroDocReceptor),
    tipoCodAut: 'E',
    codAut: Number(datos.cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(json)).toString('base64')}`
}
