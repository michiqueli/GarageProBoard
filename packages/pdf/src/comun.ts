import QRCode from 'qrcode'

/**
 * Lo que comparten los papeles que imprimimos.
 *
 * Existe por el QR: la orden de trabajo y la credencial dibujan el mismo código, celda por
 * celda, y dos copias de ese bucle se desincronizan en cuanto una de las dos cambie el nivel
 * de corrección de errores. El de la factura no está acá a propósito: ése lo manda la RG
 * 4.892 con su propio contenido y su propio lugar en la hoja.
 */

const PULGADA = 72
/** PDFKit mide en puntos; nosotros pensamos en milímetros, como el papel. */
export const mm = (n: number) => (n * PULGADA) / 25.4

/** A4 en puntos, que es el tamaño de todo lo que sale de acá. */
export const ANCHO_A4 = 595.28
export const ALTO_A4 = 841.89

export const NORMAL = 'Helvetica'
export const NEGRITA = 'Helvetica-Bold'

type Doc = PDFKit.PDFDocument

/**
 * El QR, dibujado celda por celda en vez de pegado como imagen: sale vectorial, así que se
 * lee igual impreso en una láser vieja y no pesa nada.
 *
 * Nivel de corrección `M`: en un taller la tarjeta se ensucia, y `L` deja de leerse con una
 * huella de grasa encima.
 */
export function dibujarQr(doc: Doc, texto: string, x: number, y: number, lado: number): void {
  const matriz = QRCode.create(texto, { errorCorrectionLevel: 'M' }).modules
  const celda = lado / matriz.size
  for (let fila = 0; fila < matriz.size; fila++) {
    for (let columna = 0; columna < matriz.size; columna++) {
      if (matriz.get(columna, fila)) {
        doc.rect(x + columna * celda, y + fila * celda, celda, celda)
      }
    }
  }
  doc.fill('#000')
}

/** Junta los pedazos que va soltando PDFKit y devuelve el archivo entero. */
export function recolectar(doc: Doc): Promise<Uint8Array> {
  const partes: Buffer[] = []
  doc.on('data', (b: Buffer) => partes.push(b))
  return new Promise<Uint8Array>((resolver) => {
    doc.on('end', () => resolver(new Uint8Array(Buffer.concat(partes))))
  })
}
