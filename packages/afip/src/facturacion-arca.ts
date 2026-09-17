import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Arca } from '@arcasdk/core'
import { interpretarRespuestaCae, type RespuestaCae } from './comprobante.ts'
import {
  type ComprobanteConsultado,
  ComprobanteRechazado,
  type Credenciales,
  FacturacionNoDisponible,
  type PuntoVentaAfip,
  type ServicioFiscal,
  type SolicitudComprobante,
} from './puerto.ts'

export interface ConfiguracionFacturacion {
  produccion: boolean
  /** Dónde guarda el SDK los tickets de acceso, que duran doce horas. Uno por CUIT. */
  carpetaTickets?: string | undefined
}

const aaaammdd = (iso: string) => iso.replaceAll('-', '')

/** La solicitud en el formato de WSFE. Exportada para probarla sin AFIP. */
export function aVoucherWsfe(s: SolicitudComprobante) {
  return {
    CantReg: 1,
    PtoVta: s.puntoVenta,
    CbteTipo: s.tipoComprobante,
    Concepto: s.concepto,
    DocTipo: s.tipoDocReceptor,
    DocNro: Number(s.numeroDocReceptor),
    CbteDesde: s.numero,
    CbteHasta: s.numero,
    CbteFch: aaaammdd(s.fecha),
    ImpTotal: Number(s.importeTotal),
    ImpTotConc: 0,
    ImpNeto: Number(s.importeNeto),
    ImpOpEx: Number(s.importeExento),
    ImpIVA: Number(s.importeIva),
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: s.condicionIvaReceptor,
    ...(s.servicio
      ? {
          FchServDesde: aaaammdd(s.servicio.desde),
          FchServHasta: aaaammdd(s.servicio.hasta),
          FchVtoPago: aaaammdd(s.servicio.vencimientoPago),
        }
      : {}),
    ...(s.asociado
      ? {
          CbtesAsoc: [
            {
              Tipo: s.asociado.tipo,
              PtoVta: s.asociado.puntoVenta,
              Nro: s.asociado.numero,
              Cuit: s.asociado.cuit,
              CbteFch: aaaammdd(s.asociado.fecha),
            },
          ],
        }
      : {}),
    ...(s.alicuotas.length
      ? {
          Iva: s.alicuotas.map((a) => ({
            Id: a.codigoAlicuota,
            BaseImp: Number(a.baseImponible),
            Importe: Number(a.importe),
          })),
        }
      : {}),
  }
}

/**
 * La facturación electrónica (WSFEv1) sobre `@arcasdk/core`.
 *
 * Una instancia del SDK por credencial, y se reusa: el SDK guarda el ticket de acceso de
 * cada CUIT y pedir uno por comprobante hace que AFIP rechace por exceso de pedidos.
 *
 * `useHttpsAgent`: el servidor de facturación de producción negocia TLS con una clave
 * Diffie-Hellman que OpenSSL 3 rechaza por débil («dh key too small»). El SDK trae un
 * agente con `SECLEVEL=1` sólo para estas conexiones; el resto del proceso no se toca.
 * Probado contra producción el 16/09/2026.
 */
export function crearFacturacionArca(config: ConfiguracionFacturacion): ServicioFiscal {
  const instancias = new Map<string, Arca>()

  function sdk(cred: Credenciales): Arca {
    const clave = createHash('sha256').update(cred.cuit).update(cred.certificadoPem).digest('hex')
    let arca = instancias.get(clave)
    if (!arca) {
      arca = new Arca({
        cuit: Number(cred.cuit),
        cert: cred.certificadoPem,
        key: cred.clavePrivadaPem,
        production: config.produccion,
        ticketPath: config.carpetaTickets ?? join(tmpdir(), 'gpb-afip-tickets'),
        useHttpsAgent: true,
      })
      instancias.set(clave, arca)
    }
    return arca
  }

  async function llamar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ComprobanteRechazado) throw error
      throw new FacturacionNoDisponible(error)
    }
  }

  return {
    async autorizar(cred, solicitud) {
      const salida = await llamar(() =>
        sdk(cred).electronicBillingService.createVoucher(aVoucherWsfe(solicitud)),
      )
      const respuesta = salida.response as unknown as RespuestaCae
      const resultado = interpretarRespuestaCae(respuesta)
      if (resultado.resultado === 'rechazado') {
        throw new ComprobanteRechazado(resultado.errores, resultado.observaciones, respuesta)
      }
      return {
        cae: resultado.cae,
        vencimientoCae: resultado.vencimientoCae,
        numero: solicitud.numero,
        observaciones: resultado.observaciones,
        respuestaCruda: respuesta,
      }
    },

    async ultimoAutorizado(cred, puntoVenta, tipo) {
      const salida = await llamar(() =>
        sdk(cred).electronicBillingService.getLastVoucher(puntoVenta, tipo),
      )
      return Number(salida.cbteNro)
    },

    async consultarComprobante(
      cred,
      puntoVenta,
      tipo,
      numero,
    ): Promise<ComprobanteConsultado | null> {
      // El SDK devuelve null si AFIP no lo tiene.
      const info = await llamar(() =>
        sdk(cred).electronicBillingService.getVoucherInfo(numero, puntoVenta, tipo),
      )
      if (!info?.codAutorizacion || info.resultado !== 'A') return null
      const iso = (f: string | undefined) =>
        f ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : ''
      return {
        cae: String(info.codAutorizacion),
        vencimientoCae: iso(info.fchVto),
        fecha: iso(info.cbteFch),
        importeTotal: Number(info.impTotal ?? 0).toFixed(2),
        tipoDocReceptor: Number(info.docTipo ?? 99),
        numeroDocReceptor: String(info.docNro ?? 0),
      }
    },

    async puntosDeVenta(cred): Promise<PuntoVentaAfip[]> {
      const salida = await llamar(() => sdk(cred).electronicBillingService.getSalesPoints())
      const lista = (salida as { resultGet?: { ptoVenta?: unknown } }).resultGet?.ptoVenta
      return (
        [] as Array<{ nro: number; emisionTipo: string; bloqueado: string; fechaBaja: string }>
      )
        .concat((lista ?? []) as never)
        .map((p) => ({
          numero: Number(p.nro),
          tipoEmision: String(p.emisionTipo),
          bloqueado: p.bloqueado === 'S',
          dadoDeBaja: Boolean(p.fechaBaja) && p.fechaBaja !== 'NULL',
        }))
    },

    async condicionesIvaReceptor(cred) {
      const salida = await llamar(() => sdk(cred).electronicBillingService.getIvaReceptorTypes())
      const lista =
        (salida as { resultGet?: { condicionIvaReceptor?: unknown } }).resultGet
          ?.condicionIvaReceptor ?? []
      return ([] as Array<{ id: number; desc: string }>)
        .concat(lista as never)
        .map((c) => ({ codigo: Number(c.id), descripcion: String(c.desc) }))
    },
  }
}
