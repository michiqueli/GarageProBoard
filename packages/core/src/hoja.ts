/**
 * La hoja de recepción: el dibujo del vehículo sobre el que se marca lo que trae al entrar.
 *
 * **Una imagen por carrocería**, con todas las vistas adentro —la planta en el medio, los
 * costados arriba y abajo, el frente y la cola a los lados—, que es como vienen las hojas de
 * inspección de siempre. La decisión de que sea una y no cinco separadas está en
 * `docs/tecnicos/hoja-de-recepcion.md`: los dibujos que existen vienen así.
 *
 * Las imágenes **no las dibujamos nosotros**: las carga cada concesionaria, y el sistema trae
 * un juego para que un taller que recién entra pueda recibir un auto el primer día.
 */

import type { Carroceria } from './carroceria.ts'

/**
 * Cuatro dibujos. No uno por carrocería: un sedán y un coupé se marcan igual, y pedirle a cada
 * taller que consiga dos dibujos casi idénticos no le compra nada a nadie.
 */
export const TIPOS_HOJA = ['sedan', 'hatchback', 'suv', 'pickup'] as const
export type TipoHoja = (typeof TIPOS_HOJA)[number]

export const TIPOS_HOJA_NOMBRE: Record<TipoHoja, string> = {
  sedan: 'Sedán',
  hatchback: 'Hatchback',
  suv: 'SUV',
  pickup: 'Pickup',
}

/** Con qué dibujo se recibe cada carrocería. El furgón va con la pickup, que es lo más cerca. */
export const HOJA_DE: Record<Carroceria, TipoHoja> = {
  sedan: 'sedan',
  coupe: 'sedan',
  hatchback: 'hatchback',
  familiar: 'hatchback',
  suv: 'suv',
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
