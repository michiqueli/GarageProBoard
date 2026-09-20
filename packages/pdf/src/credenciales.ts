import PDFDocument from 'pdfkit'
import { ALTO_A4, ANCHO_A4, dibujarQr, mm, NEGRITA, NORMAL, recolectar } from './comun.ts'

/**
 * Las credenciales del personal, para imprimir y recortar.
 *
 * Diez por hoja A4, del tamaño de una tarjeta —85,6 × 54 mm, el de una tarjeta de crédito—
 * porque es lo que entra en una funda de las que ya se usan para el carnet y en un bolsillo
 * de camisa. Una tarjeta más grande termina doblada, y doblada no se lee.
 *
 * **El legajo va grande y arriba del QR.** Es la carga a mano de la regla 6 de
 * `docs/tecnicos/taller-control-de-tiempos.md`: los QR se arruinan, es un taller, y cuando
 * eso pasa el mecánico tiene que poder tipear algo sin ir a buscar a nadie. Que el número que
 * hay que tipear esté en la misma tarjeta que dejó de leerse es todo el punto.
 */
export interface CredencialImpresa {
  nombre: string
  legajo: string
  /** «Mecánico», ya traducido: en la tarjeta no va una clave del sistema. */
  puesto: string
  sucursal: string | null
  /** El texto del QR, ya firmado: `GT1:M:…`. */
  qr: string
}

export interface DatosCredenciales {
  concesionaria: string
  credenciales: readonly CredencialImpresa[]
}

const ANCHO_TARJETA = mm(85.6)
const ALTO_TARJETA = mm(54)
const COLUMNAS = 2
const FILAS = 5
const POR_HOJA = COLUMNAS * FILAS

/** Los márgenes que sobran, repartidos en partes iguales. */
const MARGEN_X = (ANCHO_A4 - COLUMNAS * ANCHO_TARJETA) / 2
const MARGEN_Y = (ALTO_A4 - FILAS * ALTO_TARJETA) / 2

type Doc = PDFKit.PDFDocument

/**
 * El borde de corte, punteado y gris: con una línea llena parece parte del diseño de la
 * tarjeta y queda impresa en el borde después de recortar.
 */
function bordeDeCorte(doc: Doc, x: number, y: number) {
  doc
    .save()
    .lineWidth(0.4)
    .strokeColor('#bbb')
    .dash(3, { space: 2 })
    .rect(x, y, ANCHO_TARJETA, ALTO_TARJETA)
    .stroke()
    .undash()
    .restore()
}

function tarjeta(doc: Doc, c: CredencialImpresa, concesionaria: string, x: number, y: number) {
  bordeDeCorte(doc, x, y)

  const padding = mm(4)
  const ladoQr = mm(30)
  const xQr = x + ANCHO_TARJETA - padding - ladoQr
  const anchoTexto = ANCHO_TARJETA - ladoQr - padding * 3

  // El QR, centrado en su mitad de la tarjeta.
  dibujarQr(doc, c.qr, xQr, y + (ALTO_TARJETA - ladoQr) / 2, ladoQr)

  doc
    .fillColor('#666')
    .font(NORMAL)
    .fontSize(6.5)
    .text(concesionaria.toUpperCase(), x + padding, y + padding, {
      width: anchoTexto,
      lineBreak: false,
      ellipsis: true,
    })

  // El nombre, lo único que se lee de lejos cuando alguien busca su tarjeta en un cajón.
  doc
    .fillColor('#000')
    .font(NEGRITA)
    .fontSize(11)
    .text(c.nombre, x + padding, y + padding + mm(3.5), {
      width: anchoTexto,
      height: doc.currentLineHeight() * 2,
      ellipsis: true,
    })

  doc
    .fillColor('#444')
    .font(NORMAL)
    .fontSize(7.5)
    .text([c.puesto, c.sucursal].filter(Boolean).join(' · '), x + padding, y + mm(19), {
      width: anchoTexto,
      lineBreak: false,
      ellipsis: true,
    })

  // El legajo: lo que se tipea cuando el QR ya no se lee.
  doc
    .fillColor('#666')
    .font(NORMAL)
    .fontSize(6.5)
    .text('LEGAJO', x + padding, y + ALTO_TARJETA - padding - mm(9))
  doc
    .fillColor('#000')
    .font(NEGRITA)
    .fontSize(15)
    .text(c.legajo, x + padding, y + ALTO_TARJETA - padding - mm(6.5), {
      width: anchoTexto,
      lineBreak: false,
      ellipsis: true,
    })
}

export async function generarCredencialesPdf(d: DatosCredenciales): Promise<Uint8Array> {
  if (d.credenciales.length === 0) {
    throw new Error('No hay credenciales vigentes para imprimir.')
  }

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: 'Credenciales del personal',
      Author: d.concesionaria,
      Creator: 'GarageProBoard',
    },
  })
  const fin = recolectar(doc)

  d.credenciales.forEach((credencial, i) => {
    const lugar = i % POR_HOJA
    if (lugar === 0) doc.addPage()
    const columna = lugar % COLUMNAS
    const fila = Math.floor(lugar / COLUMNAS)
    tarjeta(
      doc,
      credencial,
      d.concesionaria,
      MARGEN_X + columna * ANCHO_TARJETA,
      MARGEN_Y + fila * ALTO_TARJETA,
    )
  })

  doc.end()
  return fin
}
