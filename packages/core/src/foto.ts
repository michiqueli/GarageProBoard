/**
 * Las fotos del vehículo: al recibirlo y al devolverlo. Son optativas —el dibujo de la hoja
 * sigue siendo lo que se firma—, pero una foto zanja la discusión de si el rayón ya estaba.
 */

export const MOMENTOS_FOTO = ['ingreso', 'egreso'] as const
export type MomentoFoto = (typeof MOMENTOS_FOTO)[number]

/**
 * El navegador las achica antes de subirlas: una foto de celular pesa varios megas y en la
 * tablet del mostrador eso es esperar. A este lado se ve el rayón y pesa unos cientos de KB.
 */
export const LADO_FOTO = 1600

/** El tope del servidor: holgado para la foto achicada, corto para que no entre cualquier cosa. */
export const MAXIMO_BYTES_FOTO = 3 * 1024 * 1024
export const MAXIMO_LADO_FOTO = 4000

/** Por momento. Más que esto es filmar el auto, y el que mira la orden no las va a ver todas. */
export const MAXIMO_FOTOS = 12

export const MAXIMO_NOTA_FOTO = 120
