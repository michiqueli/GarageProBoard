/**
 * Nuestra interfaz de dominio contra AFIP/ARCA.
 *
 * Existe para que el SDK sea reemplazable. `@arcasdk/core` habla SOAP directo y
 * firma el CMS localmente — es la elección correcta y nos ahorra escribir el WSAA
 * a mano — pero pasó por 0.3.x → 1.x → 2.x en nueve meses y lo mantiene una sola
 * persona. Envolverlo desde el principio no es diferir la decisión: es conservar
 * la salida de emergencia sin pagar por ella.
 *
 * Nada de lo que está acá abajo menciona al SDK. Ese es el punto.
 */

import type { Contribuyente } from './padron.ts'

export type Entorno = 'homologacion' | 'produccion'

export interface Credenciales {
  cuit: string
  /** Certificado y clave privada de la empresa, descifrados recién en el momento de usarlos. */
  certificadoPem: string
  clavePrivadaPem: string
}

export interface RenglonIva {
  codigoAlicuota: number
  baseImponible: string
  importe: string
}

export interface SolicitudComprobante {
  puntoVenta: number
  tipoComprobante: number
  numero: number
  fecha: string
  /** Documento del receptor: 80 CUIT, 86 CUIL, 96 DNI, 99 sin identificar. */
  tipoDocReceptor: number
  numeroDocReceptor: string
  /** Obligatoria desde la RG 5.616. */
  condicionIvaReceptor: number
  importeNeto: string
  importeIva: string
  importeTotal: string
  importeExento: string
  alicuotas: RenglonIva[]
}

export interface ComprobanteAutorizado {
  cae: string
  vencimientoCae: string
  numero: number
  /** Lo que AFIP devolvió tal cual, para poder auditar un rechazo meses después. */
  respuestaCruda: unknown
}

export interface ServicioFiscal {
  autorizar(cred: Credenciales, solicitud: SolicitudComprobante): Promise<ComprobanteAutorizado>
  ultimoAutorizado(cred: Credenciales, puntoVenta: number, tipo: number): Promise<number>
  condicionesIvaReceptor(
    cred: Credenciales,
  ): Promise<Array<{ codigo: number; descripcion: string }>>
}

/**
 * El padrón, aparte de la facturación: usa **nuestra** credencial y no la de cada empresa.
 * Autocompletar un CUIT es un servicio que da el sistema; no tiene por qué esperar a que
 * la concesionaria cargue sus certificados.
 */
export interface ServicioPadron {
  /** `null` si AFIP no lo encuentra en ningún padrón. */
  consultar(cuit: string): Promise<Contribuyente | null>
}
