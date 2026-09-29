import { describe, expect, it } from 'vitest'
import { CARROCERIAS } from '../src/carroceria.ts'
import { HOJA_DE, medirImagen, TIPOS_HOJA, VISTAS, VISTAS_NOMBRE } from '../src/hoja.ts'

/** Un PNG de verdad hasta el IHDR, que es todo lo que se lee. */
function png(ancho: number, alto: number): Uint8Array {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  new DataView(b.buffer).setUint32(16, ancho)
  new DataView(b.buffer).setUint32(20, alto)
  return b
}

/** Un JPEG con un segmento cualquiera antes del SOF0, para que haya que saltearlo. */
function jpeg(ancho: number, alto: number): Uint8Array {
  const relleno = [0xff, 0xe0, 0x00, 0x08, 1, 2, 3, 4, 5, 6]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, alto >> 8, alto & 0xff, ancho >> 8, ancho & 0xff]
  return Uint8Array.from([0xff, 0xd8, ...relleno, ...sof])
}

describe('la hoja de recepción', () => {
  it('toda carrocería sabe con qué juego se dibuja', () => {
    for (const c of CARROCERIAS) expect(TIPOS_HOJA).toContain(HOJA_DE[c])
  })

  it('las cinco vistas tienen nombre propio', () => {
    expect(VISTAS).toHaveLength(5)
    const nombres = VISTAS.map((v) => VISTAS_NOMBRE[v])
    expect(new Set(nombres).size).toBe(5)
  })
})

describe('medir una imagen', () => {
  it('lee el tamaño de un PNG y de un JPEG', () => {
    expect(medirImagen(png(1200, 800))).toEqual({
      formato: 'image/png',
      ancho: 1200,
      alto: 800,
    })
    expect(medirImagen(jpeg(640, 480))).toEqual({
      formato: 'image/jpeg',
      ancho: 640,
      alto: 480,
    })
  })

  /**
   * El que importa: el archivo que **dice** ser una imagen en su tipo y no lo es. Si el
   * formato saliera del encabezado que manda el navegador, subir un ejecutable llamado
   * `frente.png` lo dejaría guardado como imagen.
   */
  it('lo que no es PNG ni JPEG no se mide, diga lo que diga', () => {
    expect(medirImagen(new TextEncoder().encode('MZ\x90\x00 esto es un ejecutable'))).toBeNull()
    expect(
      medirImagen(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBeNull()
    // Un WebP es una imagen de verdad, y aun así no va: el PDF no la sabe embeber.
    expect(
      medirImagen(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBeNull()
    expect(medirImagen(new Uint8Array(0))).toBeNull()
  })

  it('un PNG cortado no devuelve medidas inventadas', () => {
    expect(medirImagen(png(100, 100).slice(0, 20))).toBeNull()
  })
})
