import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

/**
 * El PDF de un comprobante electrónico, con el mismo formato que «Comprobantes en línea»
 * de ARCA: el que la gente ya conoce y el contador ya sabe leer.
 *
 * Se dibuja en vectores y no como captura de pantalla: pesa decenas de KB, se imprime
 * nítido, el texto se puede copiar, y se genera en el servidor sin abrir un navegador,
 * que es lo que hace falta para mandarlo por mail.
 *
 * **Sin código de barras**: la RG 4.892 lo reemplazó por el QR y eliminó de la RG 1.702 el
 * párrafo que lo regulaba.
 *
 * Este módulo no calcula nada fiscal: recibe los importes ya calculados —los mismos que se
 * informaron a AFIP— y sólo los dibuja. Un PDF que recalcula puede diferir en un centavo
 * del comprobante autorizado.
 */

export type Copia = 'ORIGINAL' | 'DUPLICADO' | 'TRIPLICADO'

export interface RenglonImpreso {
  codigo?: string | null | undefined
  descripcion: string
  /** Decimales como string: «1», «2.5». */
  cantidad: string
  unidad: string
  /** En la A, sin IVA. En la B y la C, con IVA. */
  precioUnitario: string
  bonificacionPorcentaje: string
  importeBonificacion: string
  /** En la A, sin IVA. En la B y la C, con IVA. */
  subtotal: string
  /** Sólo en la A: «21%». */
  alicuota?: string | undefined
  /** Sólo en la A. */
  subtotalConIva?: string | undefined
}

export interface DatosFacturaImpresa {
  emisor: {
    nombreFantasia: string | null
    razonSocial: string
    domicilio: string
    condicionIva: string
    /** Once dígitos, sin guiones. */
    cuit: string
    ingresosBrutos: string
    /** AAAA-MM-DD. */
    inicioActividades: string
  }
  comprobante: {
    letra: 'A' | 'B' | 'C'
    /** Código de AFIP: 1 Factura A, 6 Factura B, 11 Factura C, 8 NC B… */
    codigo: number
    /** «FACTURA», «NOTA DE CRÉDITO», «NOTA DE DÉBITO». */
    nombre: string
    puntoVenta: number
    numero: number
    /** AAAA-MM-DD. */
    fecha: string
    /** Sólo si se facturan servicios. AAAA-MM-DD. */
    periodo?: { desde: string; hasta: string; vencimientoPago: string } | undefined
  }
  receptor: {
    /** «CUIT», «DNI»… o null para consumidor final sin identificar. */
    tipoDocumento: string | null
    documento: string | null
    nombre: string
    condicionIva: string
    domicilio: string | null
    condicionVenta: string
  }
  comprobanteAsociado?: { nombre: string; puntoVenta: number; numero: number } | undefined
  renglones: RenglonImpreso[]
  totales: {
    /** Sólo en la A. */
    netoGravado?: string | undefined
    /** Sólo en la A: una entrada por alícuota, aunque sea cero, como las lista ARCA. */
    ivaPorAlicuota?: Array<{ etiqueta: string; importe: string }> | undefined
    otrosTributos: string
    total: string
    /** Sólo en la B: el IVA contenido de la Ley 27.743. */
    ivaContenido?: string | undefined
  }
  cae: string
  /** AAAA-MM-DD. */
  vencimientoCae: string
  urlQr: string
  copias?: Copia[] | undefined
}

// ── medidas ─────────────────────────────────────────────────────────────────────

const MM = 72 / 25.4
const mm = (n: number) => n * MM
const ANCHO = 595.28
const ALTO = 841.89
const IZQ = mm(10)
const DER = ANCHO - mm(10)
const ARRIBA = mm(8)
const ABAJO = ALTO - mm(8)
const ANCHO_UTIL = DER - IZQ
const FILA = mm(5.2)

const NORMAL = 'Helvetica'
const NEGRITA = 'Helvetica-Bold'
const CURSIVA = 'Helvetica-Oblique'

// ── formatos ────────────────────────────────────────────────────────────────────

/** «1234.5» → «1.234,50». Sobre el string, sin pasar por `Number`: no pierde centavos. */
export function formatearImporte(valor: string): string {
  const negativo = valor.trim().startsWith('-')
  const [enteros = '0', decimales = ''] = valor.trim().replace('-', '').split('.')
  const dec = `${decimales}00`.slice(0, 2)
  const conPuntos = enteros.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativo ? '-' : ''}${conPuntos},${dec}`
}

const fecha = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
const ceros = (n: number, largo: number) => String(n).padStart(largo, '0')
/** Como lo imprime ARCA, con sus dígitos irregulares: «01» la Factura A, «006» la B. */
const codigoImpreso = (codigo: number) =>
  ({ 1: '01', 3: '03', 6: '006', 8: '08', 11: '011', 13: '13' })[codigo] ?? ceros(codigo, 3)
const cuit = (c: string) =>
  c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c

// ── dibujo ──────────────────────────────────────────────────────────────────────

type Doc = PDFKit.PDFDocument

/** Una etiqueta en negrita seguida de su valor, en la misma línea. */
function campo(doc: Doc, x: number, y: number, etiqueta: string, valor: string, ancho: number) {
  doc.font(NEGRITA).fontSize(8)
  const anchoEtiqueta = doc.widthOfString(`${etiqueta} `)
  doc.text(`${etiqueta} `, x, y, { lineBreak: false })
  doc.font(NORMAL).text(valor, x + anchoEtiqueta, y, {
    width: Math.max(ancho - anchoEtiqueta, 10),
    lineBreak: false,
    ellipsis: true,
    height: doc.currentLineHeight(),
  })
}

function caja(doc: Doc, y: number, alto: number) {
  doc.lineWidth(1.4).rect(IZQ, y, ANCHO_UTIL, alto).stroke()
}

function encabezado(doc: Doc, f: DatosFacturaImpresa, copia: Copia): number {
  const y0 = ARRIBA
  const altoCopia = mm(7)
  const altoCuerpo = mm(34)
  caja(doc, y0, altoCopia + altoCuerpo)
  doc
    .lineWidth(0.7)
    .moveTo(IZQ, y0 + altoCopia)
    .lineTo(DER, y0 + altoCopia)
    .stroke()
  doc
    .font(NEGRITA)
    .fontSize(11)
    .text(copia, IZQ, y0 + mm(2), { width: ANCHO_UTIL, align: 'center' })

  const yc = y0 + altoCopia
  const mitad = IZQ + ANCHO_UTIL / 2
  const anchoLetra = mm(28)

  // La letra, en su recuadro colgando del centro.
  doc
    .lineWidth(1.4)
    .rect(mitad - anchoLetra / 2, yc, anchoLetra, mm(17))
    .stroke()
  doc
    .font(NEGRITA)
    .fontSize(28)
    .text(f.comprobante.letra, mitad - anchoLetra / 2, yc + mm(1.5), {
      width: anchoLetra,
      align: 'center',
    })
  doc
    .lineWidth(0.7)
    .moveTo(mitad - anchoLetra / 2, yc + mm(12))
    .lineTo(mitad + anchoLetra / 2, yc + mm(12))
    .stroke()
  doc
    .font(NORMAL)
    .fontSize(7)
    .text(`COD. ${codigoImpreso(f.comprobante.codigo)}`, mitad - anchoLetra / 2, yc + mm(13.5), {
      width: anchoLetra,
      align: 'center',
    })

  // La línea vertical que parte el encabezado, debajo de la letra.
  doc
    .lineWidth(1.4)
    .moveTo(mitad, yc + mm(17))
    .lineTo(mitad, yc + altoCuerpo)
    .stroke()

  // Izquierda: quién emite.
  const xi = IZQ + mm(5)
  const anchoIzq = ANCHO_UTIL / 2 - mm(20)
  doc
    .font(NEGRITA)
    .fontSize(14)
    .text(f.emisor.nombreFantasia || f.emisor.razonSocial, xi, yc + mm(4), {
      width: anchoIzq,
      lineBreak: false,
      ellipsis: true,
      height: doc.currentLineHeight(),
    })
  campo(doc, xi, yc + mm(14), 'Razón Social:', f.emisor.razonSocial, anchoIzq + mm(10))
  campo(doc, xi, yc + mm(19), 'Domicilio Comercial:', f.emisor.domicilio, anchoIzq + mm(10))
  campo(doc, xi, yc + mm(26), 'Condición frente al IVA:', f.emisor.condicionIva, anchoIzq + mm(10))

  // Derecha: qué comprobante es.
  const xd = mitad + mm(18)
  const anchoDer = DER - xd - mm(3)
  doc
    .font(NEGRITA)
    .fontSize(f.comprobante.nombre.length > 8 ? 12 : 14)
    .text(f.comprobante.nombre, xd, yc + mm(4), { width: anchoDer, lineBreak: false })
  campo(doc, xd, yc + mm(11), 'Punto de Venta:', ceros(f.comprobante.puntoVenta, 5), mm(30))
  campo(doc, xd + mm(32), yc + mm(11), 'Comp. Nro:', ceros(f.comprobante.numero, 8), mm(30))
  campo(doc, xd, yc + mm(15.5), 'Fecha de Emisión:', fecha(f.comprobante.fecha), anchoDer)
  campo(doc, xd, yc + mm(20), 'CUIT:', cuit(f.emisor.cuit), anchoDer)
  campo(doc, xd, yc + mm(24.5), 'Ingresos Brutos:', f.emisor.ingresosBrutos, anchoDer)
  campo(
    doc,
    xd,
    yc + mm(29),
    'Fecha de Inicio de Actividades:',
    fecha(f.emisor.inicioActividades),
    anchoDer,
  )

  return y0 + altoCopia + altoCuerpo + mm(2)
}

function periodoYReceptor(doc: Doc, f: DatosFacturaImpresa, y: number): number {
  let yy = y
  {
    // Va siempre, como en ARCA: sin servicios, las tres fechas son la de emisión.
    const e = f.comprobante.fecha
    const p = f.comprobante.periodo ?? { desde: e, hasta: e, vencimientoPago: e }
    caja(doc, yy, mm(7))
    campo(doc, IZQ + mm(4), yy + mm(2.3), 'Período Facturado Desde:', fecha(p.desde), mm(55))
    campo(doc, IZQ + mm(62), yy + mm(2.3), 'Hasta:', fecha(p.hasta), mm(30))
    campo(
      doc,
      IZQ + mm(120),
      yy + mm(2.3),
      'Fecha de Vto. para el pago:',
      fecha(p.vencimientoPago),
      mm(70),
    )
    yy += mm(9)
  }

  const r = f.receptor
  caja(doc, yy, mm(17))
  const documento = !r.documento
    ? '-'
    : r.tipoDocumento === 'CUIT'
      ? cuit(r.documento)
      : r.documento
  campo(doc, IZQ + mm(4), yy + mm(2.3), `${r.tipoDocumento ?? 'CUIT'}:`, documento, mm(48))
  campo(
    doc,
    IZQ + mm(55),
    yy + mm(2.3),
    'Apellido y Nombre / Razón Social:',
    r.nombre,
    ANCHO_UTIL - mm(59),
  )
  campo(doc, IZQ + mm(4), yy + mm(7), 'Condición frente al IVA:', r.condicionIva, mm(80))
  campo(doc, IZQ + mm(90), yy + mm(7), 'Domicilio:', r.domicilio ?? '', ANCHO_UTIL - mm(94))
  campo(
    doc,
    IZQ + mm(4),
    yy + mm(11.7),
    'Condición de venta:',
    r.condicionVenta,
    ANCHO_UTIL - mm(8),
  )
  yy += mm(19)

  if (f.comprobanteAsociado) {
    const a = f.comprobanteAsociado
    caja(doc, yy, mm(7))
    campo(
      doc,
      IZQ + mm(4),
      yy + mm(2.3),
      'Comprobante Asociado:',
      `${a.nombre} ${ceros(a.puntoVenta, 5)}-${ceros(a.numero, 8)}`,
      ANCHO_UTIL - mm(8),
    )
    yy += mm(9)
  }
  return yy
}

interface Columna {
  titulo: string
  ancho: number
  alinear: 'left' | 'right'
  valor: (r: RenglonImpreso) => string
}

function columnas(letra: 'A' | 'B' | 'C'): Columna[] {
  const importe = (fn: (r: RenglonImpreso) => string) => (r: RenglonImpreso) =>
    formatearImporte(fn(r))
  const comunes: Columna[] = [
    { titulo: 'Código', ancho: mm(14), alinear: 'left', valor: (r) => r.codigo ?? '' },
    { titulo: 'Producto / Servicio', ancho: 0, alinear: 'left', valor: (r) => r.descripcion },
    { titulo: 'Cantidad', ancho: mm(16), alinear: 'right', valor: importe((r) => r.cantidad) },
    { titulo: 'U. Medida', ancho: mm(17), alinear: 'right', valor: (r) => r.unidad },
    {
      titulo: 'Precio Unit.',
      ancho: mm(21),
      alinear: 'right',
      valor: importe((r) => r.precioUnitario),
    },
    {
      titulo: '% Bonif',
      ancho: mm(13),
      alinear: 'right',
      valor: importe((r) => r.bonificacionPorcentaje),
    },
  ]
  const finales: Columna[] =
    letra === 'A'
      ? [
          {
            titulo: 'Subtotal',
            ancho: mm(21),
            alinear: 'right',
            valor: importe((r) => r.subtotal),
          },
          {
            titulo: 'Alícuota IVA',
            ancho: mm(20),
            alinear: 'right',
            valor: (r) => r.alicuota ?? '',
          },
          {
            titulo: 'Subtotal c/IVA',
            ancho: mm(23),
            alinear: 'right',
            valor: importe((r) => r.subtotalConIva ?? r.subtotal),
          },
        ]
      : [
          {
            titulo: 'Imp. Bonif.',
            ancho: mm(18),
            alinear: 'right',
            valor: importe((r) => r.importeBonificacion),
          },
          {
            titulo: 'Subtotal',
            ancho: mm(23),
            alinear: 'right',
            valor: importe((r) => r.subtotal),
          },
        ]
  const todas = [...comunes, ...finales]
  const fijo = todas.reduce((a, c) => a + c.ancho, 0)
  const descripcion = todas[1]
  if (descripcion) descripcion.ancho = ANCHO_UTIL - fijo
  return todas
}

/** Una fila, o más si la descripción no entra en una línea. */
function altoRenglon(doc: Doc, cols: Columna[], r: RenglonImpreso): number {
  const descripcion = cols[1] as Columna
  doc.font(NORMAL).fontSize(8)
  const texto = doc.heightOfString(r.descripcion, { width: descripcion.ancho - mm(3) })
  return FILA + Math.max(0, texto - doc.currentLineHeight())
}

function tabla(
  doc: Doc,
  f: DatosFacturaImpresa,
  renglones: RenglonImpreso[],
  y: number,
  alto: number,
) {
  caja(doc, y, alto)
  const cols = columnas(f.comprobante.letra)
  const altoTitulo = mm(7)
  doc.rect(IZQ, y, ANCHO_UTIL, altoTitulo).fillColor('#e6e6e6').fill().fillColor('#000')
  doc
    .lineWidth(1.4)
    .moveTo(IZQ, y + altoTitulo)
    .lineTo(DER, y + altoTitulo)
    .stroke()
  doc.lineWidth(1.4).rect(IZQ, y, ANCHO_UTIL, alto).stroke()

  let x = IZQ
  doc.font(NEGRITA).fontSize(7.5)
  for (const c of cols) {
    doc.text(c.titulo, x + mm(1.5), y + mm(2.4), {
      width: c.ancho - mm(3),
      align: c.alinear,
      lineBreak: false,
      ellipsis: true,
      height: doc.currentLineHeight(),
    })
    x += c.ancho
  }

  let yy = y + altoTitulo + mm(1.5)
  doc.font(NORMAL).fontSize(8)
  for (const r of renglones) {
    x = IZQ
    for (const c of cols) {
      // La descripción usa las líneas que necesite: en un comprobante no se corta el detalle.
      doc.text(
        c.valor(r),
        x + mm(1.5),
        yy,
        c === cols[1]
          ? { width: c.ancho - mm(3) }
          : {
              width: c.ancho - mm(3),
              align: c.alinear,
              lineBreak: false,
              ellipsis: true,
              height: doc.currentLineHeight(),
            },
      )
      x += c.ancho
    }
    yy += altoRenglon(doc, cols, r)
  }
}

type FilaTotal = { etiqueta: string; valor: string; negrita?: boolean } | { linea: string }

const ALTO_FILA_TOTAL = mm(4.6)
const ALTO_LINEA_TOTAL = mm(2.5)

function filasTotales(f: DatosFacturaImpresa): FilaTotal[] {
  const t = f.totales
  const otros = { etiqueta: 'Importe Otros Tributos: $', valor: t.otrosTributos }
  const total = { etiqueta: 'Importe Total: $', valor: t.total, negrita: true }
  if (f.comprobante.letra === 'A') {
    return [
      otros,
      { linea: '#cccccc' },
      { etiqueta: 'Importe Neto Gravado: $', valor: t.netoGravado ?? '0' },
      ...(t.ivaPorAlicuota ?? []).map((i) => ({ etiqueta: `${i.etiqueta}: $`, valor: i.importe })),
      otros,
      { linea: '#000000' },
      total,
    ]
  }
  return [{ etiqueta: 'Subtotal: $', valor: t.total }, otros, { linea: '#000000' }, total]
}

const altoFilas = (filas: FilaTotal[]) =>
  mm(5) + filas.reduce((a, fila) => a + ('linea' in fila ? ALTO_LINEA_TOTAL : ALTO_FILA_TOTAL), 0)

function totales(doc: Doc, f: DatosFacturaImpresa, y: number): number {
  const t = f.totales
  const filas = filasTotales(f)
  const alto = altoFilas(filas)
  caja(doc, y, alto)
  let yy = y + mm(3)
  const xValor = DER - mm(4) - mm(28)
  for (const fila of filas) {
    if ('linea' in fila) {
      doc
        .lineWidth(0.6)
        .strokeColor(fila.linea)
        .moveTo(IZQ + mm(4), yy + mm(0.6))
        .lineTo(DER - mm(4), yy + mm(0.6))
        .stroke()
        .strokeColor('#000')
      yy += ALTO_LINEA_TOTAL
      continue
    }
    doc.font(fila.negrita ? NEGRITA : NORMAL).fontSize(fila.negrita ? 9 : 8)
    doc.text(fila.etiqueta, IZQ, yy, {
      width: xValor - IZQ - mm(3),
      align: 'right',
      lineBreak: false,
    })
    doc.text(formatearImporte(fila.valor), xValor, yy, {
      width: mm(28),
      align: 'right',
      lineBreak: false,
    })
    yy += ALTO_FILA_TOTAL
  }
  let fin = y + alto + mm(2)

  if (f.comprobante.letra === 'B' && t.ivaContenido !== undefined) {
    caja(doc, fin, mm(12))
    doc
      .font(CURSIVA)
      .fontSize(7.5)
      .text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', IZQ + mm(4), fin + mm(2))
    doc
      .lineWidth(0.5)
      .moveTo(IZQ + mm(4), fin + mm(5.5))
      .lineTo(DER - mm(4), fin + mm(5.5))
      .stroke()
    doc
      .font(NEGRITA)
      .fontSize(8)
      .text('IVA Contenido: $', IZQ, fin + mm(7.3), {
        width: ANCHO_UTIL / 2,
        align: 'right',
        lineBreak: false,
      })
    doc
      .font(NORMAL)
      .text(formatearImporte(t.ivaContenido), IZQ + ANCHO_UTIL / 2 + mm(8), fin + mm(7.3), {
        lineBreak: false,
      })
    fin += mm(14)
  }
  return fin
}

function altoTotales(f: DatosFacturaImpresa): number {
  const transparencia = f.comprobante.letra === 'B' && f.totales.ivaContenido !== undefined
  return altoFilas(filasTotales(f)) + mm(2) + (transparencia ? mm(14) : 0)
}

const ALTO_PIE = mm(26)

function pie(
  doc: Doc,
  f: DatosFacturaImpresa,
  matriz: { size: number; get(x: number, y: number): number | boolean },
  pagina: number,
  paginas: number,
) {
  const y = ABAJO - ALTO_PIE + mm(2)
  const lado = mm(22)
  const celda = lado / matriz.size
  doc.fillColor('#000')
  for (let fila = 0; fila < matriz.size; fila++) {
    for (let col = 0; col < matriz.size; col++) {
      if (matriz.get(col, fila)) doc.rect(IZQ + col * celda, y + fila * celda, celda, celda)
    }
  }
  doc.fill()

  const xt = IZQ + lado + mm(4)
  doc
    .font(NEGRITA)
    .fontSize(14)
    .text('ARCA', xt, y + mm(2), { lineBreak: false })
  doc
    .font(CURSIVA)
    .fontSize(8)
    .text('Comprobante Autorizado', xt, y + mm(9), { lineBreak: false })
  doc
    .font(NORMAL)
    .fontSize(6)
    .fillColor('#555')
    .text(
      'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación',
      xt,
      y + mm(14),
      {
        width: mm(62),
      },
    )
    .fillColor('#000')

  doc
    .font(NEGRITA)
    .fontSize(8)
    .text(`Pág. ${pagina}/${paginas}`, IZQ, y + mm(9), {
      width: ANCHO_UTIL,
      align: 'center',
      lineBreak: false,
    })

  const anchoCae = mm(62)
  campo(doc, DER - anchoCae, y + mm(6), 'CAE N°:', f.cae, anchoCae)
  campo(doc, DER - anchoCae, y + mm(11), 'Fecha de Vto. de CAE:', fecha(f.vencimientoCae), anchoCae)
}

/**
 * El PDF, con una serie de hojas por copia. Si los renglones no entran en una hoja, siguen
 * en la próxima con el encabezado repetido, y los totales y el CAE van en la última: como
 * lo hace ARCA.
 */
export async function generarFacturaPdf(f: DatosFacturaImpresa): Promise<Uint8Array> {
  if (f.renglones.length === 0) throw new Error('Un comprobante sin renglones no se imprime.')
  const matriz = QRCode.create(f.urlQr, { errorCorrectionLevel: 'M' }).modules

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `${f.comprobante.nombre} ${f.comprobante.letra} ${ceros(f.comprobante.puntoVenta, 5)}-${ceros(f.comprobante.numero, 8)}`,
      Author: f.emisor.razonSocial,
      Creator: 'GarageProBoard',
    },
  })
  const partes: Buffer[] = []
  doc.on('data', (b: Buffer) => partes.push(b))
  const fin = new Promise<void>((resolver) => doc.on('end', () => resolver()))

  // Qué renglones van en cada hoja, midiendo cada uno: en la última hay que dejar lugar a
  // los totales.
  const medir = new PDFDocument({ size: 'A4', margin: 0 })
  const yTabla = periodoYReceptor(medir, f, encabezado(medir, f, 'ORIGINAL'))
  const cols = columnas(f.comprobante.letra)
  const alturas = new Map(f.renglones.map((r) => [r, altoRenglon(medir, cols, r)]))
  medir.end()
  const altoDe = (hoja: RenglonImpreso[]) => hoja.reduce((a, r) => a + (alturas.get(r) ?? FILA), 0)
  const altoTitulo = mm(7) + mm(1.5)
  const libreSinTotales = ABAJO - ALTO_PIE - mm(2) - yTabla - altoTitulo - mm(1)
  const libreConTotales = libreSinTotales - altoTotales(f)

  const hojas: RenglonImpreso[][] = [[]]
  for (const r of f.renglones) {
    const actual = hojas.at(-1) as RenglonImpreso[]
    if (actual.length && altoDe(actual) + (alturas.get(r) ?? FILA) > libreSinTotales)
      hojas.push([r])
    else actual.push(r)
  }
  const ultimaHoja = hojas.at(-1) as RenglonImpreso[]
  if (ultimaHoja.length > 1 && altoDe(ultimaHoja) > libreConTotales) {
    // No entran los totales: los renglones que sobran pasan a una hoja más.
    const pasan: RenglonImpreso[] = []
    while (ultimaHoja.length > 1 && altoDe(ultimaHoja) > libreConTotales) {
      pasan.unshift(ultimaHoja.pop() as RenglonImpreso)
    }
    hojas.push(pasan)
  }

  for (const copia of f.copias ?? ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO']) {
    hojas.forEach((renglones, i) => {
      doc.addPage()
      const ultima = i === hojas.length - 1
      const y = periodoYReceptor(doc, f, encabezado(doc, f, copia))
      const yPie = ABAJO - ALTO_PIE
      const yTotales = yPie - (ultima ? altoTotales(f) : 0)
      tabla(doc, f, renglones, y, yTotales - y - mm(2))
      if (ultima) totales(doc, f, yTotales)
      pie(doc, f, matriz, i + 1, hojas.length)
    })
  }

  doc.end()
  await fin
  return new Uint8Array(Buffer.concat(partes))
}
