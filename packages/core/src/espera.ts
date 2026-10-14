/**
 * Las esperas del taller: por qué un auto está parado. Sin ellas, el tiempo muerto —lo que
 * estuvo en el taller menos lo que se trabajó— es un número que nadie puede explicar. Ver
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 */

/**
 * Los motivos con los que arranca cada concesionaria. Es un catálogo suyo: apaga los que no usa
 * y agrega los propios. La clave es lo que permite que un estado de la orden abra el suyo solo.
 */
export const MOTIVOS_ESPERA_INICIALES = [
  { clave: 'repuestos', nombre: 'Repuestos' },
  { clave: 'autorizacion_cliente', nombre: 'Autorización del cliente' },
  { clave: 'autorizacion_garantia', nombre: 'Autorización de garantía' },
  { clave: 'diagnostico', nombre: 'Diagnóstico' },
  { clave: 'elevador', nombre: 'Elevador libre' },
] as const

export type ClaveMotivoEspera = (typeof MOTIVOS_ESPERA_INICIALES)[number]['clave']

/**
 * Los estados de la orden que son una espera, y con qué motivo. Pasar a uno abre la espera; salir
 * la cierra. Al revés también: poner en espera por uno de estos motivos pasa la orden al estado.
 */
export const ESPERA_DEL_ESTADO = {
  esperando_repuesto: 'repuestos',
  esperando_autorizacion: 'autorizacion_cliente',
} as const satisfies Record<string, ClaveMotivoEspera>

export const MAXIMO_NOTA_ESPERA = 200
export const MAXIMO_NOMBRE_MOTIVO = 60
