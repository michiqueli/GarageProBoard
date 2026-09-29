/**
 * La hoja de recepción: las vistas del vehículo sobre las que se marca lo que trae.
 *
 * Son las cinco de la hoja de VW, que es la que el rubro reconoce. Las imágenes **no las
 * dibujamos nosotros**: las carga cada concesionaria, y el sistema trae un juego por omisión
 * para que un taller que recién entra pueda recibir un auto el primer día. El porqué está en
 * `docs/tecnicos/hoja-de-recepcion.md`.
 */

import type { Carroceria } from './carroceria.ts'

export const VISTAS = ['frente', 'atras', 'izquierda', 'derecha', 'arriba'] as const
export type Vista = (typeof VISTAS)[number]

export const VISTAS_NOMBRE: Record<Vista, string> = {
  frente: 'Frente',
  atras: 'Atrás',
  izquierda: 'Lado izquierdo',
  derecha: 'Lado derecho',
  arriba: 'Desde arriba',
}

/**
 * Tres juegos de imágenes, no uno por carrocería.
 *
 * Es la misma economía que tenían las siluetas dibujadas: lo que cambia de verdad entre un
 * sedán y un SUV, mirados de frente y de costado, no alcanza para pedirle a cada taller que
 * consiga y cargue cinco dibujos más.
 */
export const TIPOS_HOJA = ['sedan', 'hatchback', 'pickup'] as const
export type TipoHoja = (typeof TIPOS_HOJA)[number]

export const TIPOS_HOJA_NOMBRE: Record<TipoHoja, string> = {
  sedan: 'Sedán',
  hatchback: 'Hatchback',
  pickup: 'Pickup',
}

/**
 * Con qué juego se dibuja cada carrocería. El furgón va con la pickup por ahora: de las tres
 * es la única con la que comparte la trompa alta y la caja atrás.
 */
export const HOJA_DE: Record<Carroceria, TipoHoja> = {
  sedan: 'sedan',
  coupe: 'sedan',
  hatchback: 'hatchback',
  familiar: 'hatchback',
  suv: 'hatchback',
  pickup: 'pickup',
  furgon: 'pickup',
}

/** Con qué se dibuja mientras nadie dijo qué es el vehículo. Es el caso de la mayoría. */
export const HOJA_POR_OMISION: TipoHoja = 'sedan'

/**
 * PNG y JPEG, y nada más.
 *
 * No es una restricción de gusto: **la hoja se imprime**, y el generador de PDF sólo sabe
 * embeber esos dos. Un WebP se vería bien en la tablet y dejaría la orden impresa sin el
 * dibujo, que es justo la copia que vale.
 */
export const FORMATOS_HOJA = ['image/png', 'image/jpeg'] as const
export type FormatoHoja = (typeof FORMATOS_HOJA)[number]

/**
 * Dos megas por imagen. Son dibujos de línea, no fotos: con eso sobra de lejos, y el límite
 * está para que nadie suba la foto de 12 MP que sacó con el teléfono.
 */
export const MAXIMO_BYTES_HOJA = 2 * 1024 * 1024

/** Debajo de esto el dibujo se ve pixelado en una tablet, y peor impreso. */
export const MINIMO_LADO_HOJA = 300
/** Y arriba de esto no aporta nada y sólo pesa. */
export const MAXIMO_LADO_HOJA = 4000

/**
 * El tamaño y el formato de una imagen, leídos de sus primeros bytes.
 *
 * Se lee acá y no con una biblioteca de imágenes porque lo único que hace falta es el
 * encabezado: sumar un módulo nativo que compila distinto en cada sistema operativo, para no
 * redimensionar nada, sería pagar mucho por nada.
 *
 * Devuelve `null` si no es un PNG ni un JPEG — incluido el caso del archivo que **dice** ser
 * una imagen en su tipo y no lo es, que es el que importa.
 */
export function medirImagen(
  bytes: Uint8Array,
): { formato: FormatoHoja; ancho: number; alto: number } | null {
  return medirPng(bytes) ?? medirJpeg(bytes)
}

const PNG_FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function medirPng(b: Uint8Array) {
  if (b.length < 24) return null
  if (PNG_FIRMA.some((x, i) => b[i] !== x)) return null
  // El IHDR es siempre el primer trozo, y ahí están el ancho y el alto en 32 bits.
  const leer = (i: number) =>
    ((b[i] as number) << 24) |
    ((b[i + 1] as number) << 16) |
    ((b[i + 2] as number) << 8) |
    (b[i + 3] as number)
  return { formato: 'image/png' as const, ancho: leer(16) >>> 0, alto: leer(20) >>> 0 }
}

function medirJpeg(b: Uint8Array) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  // Un SOF ocupa nueve bytes desde `i`, así que el último que entra arranca en `length - 9`.
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) return null
    const marca = b[i + 1] as number
    // Los SOF llevan el tamaño. El C4, el C8 y el CC son otra cosa aunque caigan en el rango.
    const esSof =
      (marca >= 0xc0 && marca <= 0xc3) ||
      (marca >= 0xc5 && marca <= 0xc7) ||
      (marca >= 0xc9 && marca <= 0xcb) ||
      (marca >= 0xcd && marca <= 0xcf)
    if (esSof) {
      const alto = ((b[i + 5] as number) << 8) | (b[i + 6] as number)
      const ancho = ((b[i + 7] as number) << 8) | (b[i + 8] as number)
      return { formato: 'image/jpeg' as const, ancho, alto }
    }
    const largo = ((b[i + 2] as number) << 8) | (b[i + 3] as number)
    if (largo < 2) return null
    i += 2 + largo
  }
  return null
}
