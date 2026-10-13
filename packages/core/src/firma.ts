/**
 * La firma del cliente en la pantalla: al recibir el auto y al devolverlo. Ver
 * `docs/tecnicos/egreso.md`.
 */

export const MOMENTOS_FIRMA = ['ingreso', 'egreso'] as const
export type MomentoFirma = (typeof MOMENTOS_FIRMA)[number]

/**
 * Una firma es un trazo sobre fondo blanco: un PNG de pocos kilobytes. El tope es para que nadie
 * mande otra cosa por esta puerta, no para la firma.
 */
export const MAXIMO_BYTES_FIRMA = 512 * 1024

/** Medidas de la imagen: lo bastante grande para leerse impresa, sin ser una foto. */
export const MINIMO_LADO_FIRMA = 100
export const MAXIMO_LADO_FIRMA = 2000
