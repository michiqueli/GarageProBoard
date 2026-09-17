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
  /** AAAA-MM-DD. */
  fecha: string
  /** 1 productos, 2 servicios, 3 productos y servicios. */
  concepto: 1 | 2 | 3
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
  /** Obligatorio si el concepto incluye servicios. AAAA-MM-DD. */
  servicio?: { desde: string; hasta: string; vencimientoPago: string } | undefined
}

export interface ComprobanteAutorizado {
  cae: string
  /** AAAA-MM-DD. */
  vencimientoCae: string
  numero: number
  /** Avisos de AFIP en un comprobante aprobado. Se guardan: alguien los tiene que leer. */
  observaciones: Array<{ codigo: number; mensaje: string }>
  /** Lo que AFIP devolvió tal cual, para poder auditar un rechazo meses después. */
  respuestaCruda: unknown
}

/** AFIP rechazó el comprobante: el número no se usó y se puede volver a intentar. */
export class ComprobanteRechazado extends Error {
  constructor(
    readonly errores: Array<{ codigo: number; mensaje: string }>,
    readonly observaciones: Array<{ codigo: number; mensaje: string }>,
    readonly respuestaCruda: unknown,
  ) {
    super(
      `AFIP rechazó el comprobante: ${[...errores, ...observaciones].map((e) => `${e.codigo} ${e.mensaje}`).join('; ')}`,
    )
  }
}

/**
 * AFIP no contestó. **No se sabe** si el comprobante quedó autorizado: antes de reintentar
 * hay que preguntar por el último número, o se emite dos veces.
 */
export class FacturacionNoDisponible extends Error {
  constructor(causa: unknown) {
    super('El servicio de facturación de AFIP no está disponible', { cause: causa })
  }
}

export interface PuntoVentaAfip {
  numero: number
  /** «CAE - Ri Iva», «CAE - Monotributo»: con qué régimen se dio de alta. */
  tipoEmision: string
  bloqueado: boolean
  dadoDeBaja: boolean
}

/** Lo que AFIP tiene registrado de un comprobante. */
export interface ComprobanteConsultado {
  cae: string
  /** AAAA-MM-DD. */
  vencimientoCae: string
  /** AAAA-MM-DD. */
  fecha: string
  importeTotal: string
  tipoDocReceptor: number
  numeroDocReceptor: string
}

export interface ServicioFiscal {
  autorizar(cred: Credenciales, solicitud: SolicitudComprobante): Promise<ComprobanteAutorizado>
  ultimoAutorizado(cred: Credenciales, puntoVenta: number, tipo: number): Promise<number>
  /** Los puntos de venta habilitados para web services de ese CUIT. */
  puntosDeVenta(cred: Credenciales): Promise<PuntoVentaAfip[]>
  /**
   * Lo que AFIP tiene de un comprobante, o `null` si no existe. Resuelve los inciertos:
   * cuando AFIP no contestó al emitir, esto dice si lo emitió o no.
   */
  consultarComprobante(
    cred: Credenciales,
    puntoVenta: number,
    tipo: number,
    numero: number,
  ): Promise<ComprobanteConsultado | null>
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
