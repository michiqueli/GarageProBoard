import {
  type ControlInventario,
  DANIOS,
  ELEMENTOS_INVENTARIO,
  type ElementoInventario,
  INVENTARIO,
  type TipoDanio,
} from '@gpb/core'
import PDFDocument from 'pdfkit'
import { dibujarQr } from './comun.ts'
import { formatearImporte } from './factura.ts'

/**
 * La orden de trabajo impresa: la que sale en la recepción.
 *
 * Dos hojas, porque dos personas la usan distinto:
 *
 * - **Taller**: va con el auto. Lleva el QR grande para fichar y el número para tipear
 *   cuando el QR se ensucie. Sin precios: al mecánico no le sirven y no tienen por qué
 *   andar por el taller.
 * - **Cliente**: el comprobante de que dejó el auto, en qué estado y qué pidió, con la
 *   firma de conformidad. Si ya hay precios, van.
 */

export interface DatosOrdenImpresa {
  concesionaria: string
  sucursal: { nombre: string; domicilio: string | null; telefono: string | null }
  numero: number
  /** El texto del QR, ya firmado: `GT1:O:…`. */
  qr: string
  /** AAAA-MM-DDTHH:mm, en la hora de Argentina. */
  ingreso: string
  entregaEstimada: string | null
  vehiculo: {
    dominio: string | null
    marcaModelo: string | null
    anio: number | null
    color: string | null
    chasis: string
    kilometraje: number | null
    combustible: string | null
  }
  titular: { nombre: string; telefono: string | null } | null
  trae: { nombre: string | null; telefono: string | null }
  paga: string | null
  pedido: string
  observaciones: string | null
  /**
   * El dibujo del vehículo con el que se recibió, tal cual: los bytes de la imagen que el
   * taller tenía cargada ese día. Sin él —un taller que todavía no subió ninguna— la hoja sale
   * con las marcas en texto y sin dibujo, que es mejor que no salir.
   */
  hoja: { imagen: Uint8Array; ancho: number; alto: number } | null
  /** Las marcas, en fracción del ancho y del alto del dibujo. */
  danios: Array<{ tipo: TipoDanio; x: number; y: number; nota: string | null }>
  inventario: Partial<Record<ElementoInventario, ControlInventario>>
  asesor: string
  mecanico: string | null
  items: Array<{
    tipo: 'trabajo' | 'repuesto'
    descripcion: string
    cantidad: string
    total: string
  }>
  total: string
}

const MM = 72 / 25.4
const mm = (n: number) => n * MM
const ANCHO = 595.28
const IZQ = mm(12)
const DER = ANCHO - mm(12)
const UTIL = DER - IZQ
const NORMAL = 'Helvetica'
const NEGRITA = 'Helvetica-Bold'

type Doc = PDFKit.PDFDocument

const COMBUSTIBLE: Record<string, string> = {
  vacio: 'Vacío',
  cuarto: '1/4',
  medio: '1/2',
  tres_cuartos: '3/4',
  lleno: 'Lleno',
}

const fecha = (iso: string) => {
  const [d, h] = iso.split('T')
  const [a, m, dia] = (d ?? '').split('-')
  return `${dia}/${m}/${a}${h ? ` ${h.slice(0, 5)}` : ''}`
}
const patente = (d: string | null) =>
  !d
    ? 'Sin patentar'
    : d.length === 7
      ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
      : `${d.slice(0, 3)} ${d.slice(3)}`

function etiquetaValor(
  doc: Doc,
  x: number,
  y: number,
  etiqueta: string,
  valor: string,
  ancho: number,
) {
  doc
    .font(NORMAL)
    .fontSize(7)
    .fillColor('#555')
    .text(etiqueta.toUpperCase(), x, y, { width: ancho, lineBreak: false })
  doc
    .font(NEGRITA)
    .fontSize(10)
    .fillColor('#000')
    .text(valor || '—', x, y + mm(3.2), {
      width: ancho,
      lineBreak: false,
      ellipsis: true,
      height: doc.currentLineHeight(),
    })
}

function caja(doc: Doc, y: number, alto: number, titulo?: string) {
  doc.lineWidth(0.8).roundedRect(IZQ, y, UTIL, alto, 3).stroke()
  if (titulo) {
    doc
      .font(NEGRITA)
      .fontSize(7.5)
      .fillColor('#555')
      .text(titulo.toUpperCase(), IZQ + mm(3), y + mm(2))
    doc.fillColor('#000')
  }
}

const ALTO_DIBUJO = mm(58)
const ANCHO_MAXIMO_DIBUJO = mm(62)

/**
 * El auto dibujado con sus marcas, al lado la lista con el nombre de cada zona, lo que vino
 * con el auto y las observaciones. Devuelve el alto que ocupó.
 *
 * Va en las dos copias: la del cliente es la que firma, y la del taller le dice al mecánico
 * qué rayón ya estaba — que es lo que después lo salva de que se lo achaquen.
 *
 * En negro y blanco a propósito: la orden se imprime en la láser del mostrador. La marca es un
 * círculo lleno con la letra calada, que se distingue igual en una fotocopia.
 */
function estadoDelVehiculo(doc: Doc, o: DatosOrdenImpresa, y: number): number {
  const x0 = IZQ + mm(3)
  const y0 = y + mm(7)

  // El dibujo entra en su caja sin deformarse: el taller sube la imagen que quiere y la hoja
  // no puede estirar un auto para que llene el hueco.
  const escala = o.hoja
    ? Math.min(ALTO_DIBUJO / o.hoja.alto, ANCHO_MAXIMO_DIBUJO / o.hoja.ancho)
    : 0
  const anchoDibujo = o.hoja ? o.hoja.ancho * escala : 0
  const altoDibujo = o.hoja ? o.hoja.alto * escala : 0

  if (o.hoja) {
    doc.image(Buffer.from(o.hoja.imagen), x0, y0, { width: anchoDibujo, height: altoDibujo })
  }

  const radio = mm(1.9)
  for (const d of o.danios) {
    if (!o.hoja) break
    const cx = x0 + d.x * anchoDibujo
    const cy = y0 + d.y * altoDibujo
    doc.circle(cx, cy, radio).fill('#000')
    doc
      .font(NEGRITA)
      .fontSize(6.5)
      .fillColor('#fff')
      .text(DANIOS[d.tipo].letra, cx - radio, cy - mm(1.1), {
        width: radio * 2,
        align: 'center',
        lineBreak: false,
      })
  }
  doc.fillColor('#000')

  // La columna de la derecha: marcas, inventario y observaciones.
  const xt = x0 + (o.hoja ? anchoDibujo : 0) + mm(6)
  const ancho = DER - mm(3) - xt
  let yt = y + mm(7)

  const subtitulo = (texto: string) => {
    doc
      .font(NEGRITA)
      .fontSize(7)
      .fillColor('#555')
      .text(texto.toUpperCase(), xt, yt, { width: ancho })
    doc.fillColor('#000')
    yt += mm(3.8)
  }

  subtitulo('Marcas')
  doc.font(NORMAL).fontSize(8.5)
  if (!o.danios.length) {
    doc.text(
      'Sin marcas: el vehículo se recibe sin rayones, golpes ni faltantes a la vista.',
      xt,
      yt,
      {
        width: ancho,
      },
    )
    yt = doc.y + mm(1.5)
  } else {
    for (const d of o.danios) {
      doc
        .font(NEGRITA)
        .text(`${DANIOS[d.tipo].letra}  `, xt, yt, { continued: true, width: ancho })
        .font(NORMAL)
        .text(`${DANIOS[d.tipo].nombre}${d.nota ? ` — ${d.nota}` : ''}`)
      yt = doc.y + mm(0.6)
    }
    yt += mm(1)
  }

  subtitulo('Vino con el auto')
  const mitad = (ancho - mm(4)) / 2
  ELEMENTOS_INVENTARIO.forEach((e, i) => {
    const control = o.inventario[e]
    const cx = xt + (i % 2) * (mitad + mm(4))
    const cy = yt + Math.floor(i / 2) * mm(4)
    doc
      .font(control === 'falta' ? NEGRITA : NORMAL)
      .fontSize(8.5)
      .text(
        `${INVENTARIO[e]}: ${control === 'esta' ? 'sí' : control === 'falta' ? 'FALTA' : '—'}`,
        cx,
        cy,
        { width: mitad, lineBreak: false, ellipsis: true },
      )
  })
  yt += Math.ceil(ELEMENTOS_INVENTARIO.length / 2) * mm(4) + mm(1.5)

  if (o.observaciones) {
    subtitulo('Observaciones')
    doc.font(NORMAL).fontSize(8.5).text(o.observaciones, xt, yt, { width: ancho })
    yt = doc.y
  }

  const alto = Math.max(ALTO_DIBUJO + mm(10), yt - y + mm(3))
  caja(doc, y, alto, 'Estado del vehículo al recibirlo')
  return alto
}

function hoja(doc: Doc, o: DatosOrdenImpresa, copia: 'TALLER' | 'CLIENTE') {
  doc.addPage()
  let y = mm(12)
  const conQr = copia === 'TALLER'
  const ladoQr = mm(34)
  const anchoTexto = conQr ? UTIL - ladoQr - mm(4) : UTIL

  // Encabezado
  doc
    .font(NEGRITA)
    .fontSize(9)
    .fillColor('#555')
    .text(`COPIA ${copia}`, IZQ, y, { width: anchoTexto })
  doc
    .fillColor('#000')
    .font(NEGRITA)
    .fontSize(12)
    .text(o.concesionaria, IZQ, y + mm(4.5), { width: anchoTexto })
  doc
    .font(NORMAL)
    .fontSize(8)
    .text(
      [
        o.sucursal.nombre,
        o.sucursal.domicilio,
        o.sucursal.telefono && `Tel. ${o.sucursal.telefono}`,
      ]
        .filter(Boolean)
        .join(' · '),
      IZQ,
      y + mm(10),
      { width: anchoTexto },
    )
  doc
    .font(NORMAL)
    .fontSize(9)
    .text('ORDEN DE TRABAJO', IZQ, y + mm(16), { width: anchoTexto })
  doc
    .font(NEGRITA)
    .fontSize(30)
    .text(`N° ${String(o.numero).padStart(6, '0')}`, IZQ, y + mm(20), { width: anchoTexto })

  if (conQr) {
    const xQr = DER - ladoQr
    dibujarQr(doc, o.qr, xQr, y, ladoQr)
    doc
      .font(NORMAL)
      .fontSize(7)
      .text(`Escaneá para fichar · o tipeá ${o.numero}`, xQr - mm(4), y + ladoQr + mm(1), {
        width: ladoQr + mm(8),
        align: 'center',
      })
  }
  y += mm(40)

  // Fechas y personas
  const col = UTIL / 4
  caja(doc, y, mm(12))
  etiquetaValor(doc, IZQ + mm(3), y + mm(2), 'Ingreso', fecha(o.ingreso), col - mm(4))
  etiquetaValor(
    doc,
    IZQ + col,
    y + mm(2),
    'Entrega estimada',
    o.entregaEstimada ? fecha(o.entregaEstimada) : '',
    col - mm(4),
  )
  etiquetaValor(doc, IZQ + col * 2, y + mm(2), 'Asesor', o.asesor, col - mm(4))
  etiquetaValor(doc, IZQ + col * 3, y + mm(2), 'Mecánico', o.mecanico ?? '', col - mm(4))
  y += mm(15)

  // Vehículo
  caja(doc, y, mm(26), 'Vehículo')
  doc
    .font(NEGRITA)
    .fontSize(20)
    .text(patente(o.vehiculo.dominio), IZQ + mm(3), y + mm(6), {
      width: col * 1.4,
      lineBreak: false,
    })
  etiquetaValor(
    doc,
    IZQ + col * 1.5,
    y + mm(6),
    'Marca y modelo',
    [o.vehiculo.marcaModelo, o.vehiculo.anio, o.vehiculo.color].filter(Boolean).join(' · '),
    col * 2.4,
  )
  etiquetaValor(doc, IZQ + mm(3), y + mm(15), 'Chasis', o.vehiculo.chasis, col * 1.4)
  etiquetaValor(
    doc,
    IZQ + col * 1.5,
    y + mm(15),
    'Kilómetros',
    o.vehiculo.kilometraje != null ? o.vehiculo.kilometraje.toLocaleString('es-AR') : '',
    col,
  )
  etiquetaValor(
    doc,
    IZQ + col * 2.6,
    y + mm(15),
    'Combustible',
    o.vehiculo.combustible ? (COMBUSTIBLE[o.vehiculo.combustible] ?? o.vehiculo.combustible) : '',
    col,
  )
  y += mm(29)

  // Cliente
  caja(doc, y, mm(17), 'Cliente')
  etiquetaValor(
    doc,
    IZQ + mm(3),
    y + mm(6),
    'Titular',
    o.titular ? [o.titular.nombre, o.titular.telefono].filter(Boolean).join(' · ') : '',
    col * 1.65,
  )
  etiquetaValor(
    doc,
    IZQ + col * 1.7,
    y + mm(6),
    'Lo trajo',
    [o.trae.nombre, o.trae.telefono].filter(Boolean).join(' · '),
    col * 1.15,
  )
  etiquetaValor(doc, IZQ + col * 2.9, y + mm(6), 'Paga', o.paga ?? '', col * 1.05)
  y += mm(20)

  // Pedido y estado
  const altoTexto = (texto: string) =>
    doc
      .font(NORMAL)
      .fontSize(10)
      .heightOfString(texto, { width: UTIL - mm(6) })
  const altoPedido = Math.max(mm(16), altoTexto(o.pedido) + mm(9))
  caja(doc, y, altoPedido, 'Qué pide el cliente')
  doc
    .font(NORMAL)
    .fontSize(10)
    .text(o.pedido, IZQ + mm(3), y + mm(6), { width: UTIL - mm(6) })
  y += altoPedido + mm(3)

  y += estadoDelVehiculo(doc, o, y) + mm(3)

  // Trabajos y repuestos
  if (o.items.length) {
    const conPrecios = copia === 'CLIENTE'
    const filas = o.items.length
    const alto = mm(10) + filas * mm(5.5) + (conPrecios ? mm(7) : 0)
    caja(doc, y, alto, 'Trabajos y repuestos')
    let yy = y + mm(7)
    for (const i of o.items) {
      doc.font(NORMAL).fontSize(9)
      doc.text(i.tipo === 'trabajo' ? 'Trabajo' : 'Repuesto', IZQ + mm(3), yy, {
        width: mm(18),
        lineBreak: false,
      })
      doc.text(i.descripcion, IZQ + mm(22), yy, {
        width: UTIL - mm(22) - (conPrecios ? mm(50) : mm(20)),
        lineBreak: false,
        ellipsis: true,
        height: doc.currentLineHeight(),
      })
      doc.text(
        formatearImporte(i.cantidad).replace(/,00$/, ''),
        DER - (conPrecios ? mm(48) : mm(18)),
        yy,
        {
          width: mm(15),
          align: 'right',
          lineBreak: false,
        },
      )
      if (conPrecios) {
        doc.text(`$ ${formatearImporte(i.total)}`, DER - mm(31), yy, {
          width: mm(28),
          align: 'right',
          lineBreak: false,
        })
      }
      yy += mm(5.5)
    }
    if (conPrecios) {
      doc
        .font(NEGRITA)
        .fontSize(10)
        .text(`Total estimado: $ ${formatearImporte(o.total)}`, IZQ, yy + mm(1), {
          width: UTIL - mm(3),
          align: 'right',
        })
    }
    y += alto + mm(3)
  }

  if (copia === 'CLIENTE') {
    const yFirma = Math.max(y + mm(12), 297 * MM - mm(45))
    doc
      .font(NORMAL)
      .fontSize(7.5)
      .fillColor('#444')
      .text(
        'El cliente deja el vehículo en el estado descripto y autoriza los trabajos pedidos. Los ' +
          'importes son estimados y pueden cambiar si aparecen trabajos no previstos, que se ' +
          'consultan antes de hacerse. El taller no se responsabiliza por objetos dejados dentro ' +
          'del vehículo.',
        IZQ,
        yFirma - mm(14),
        { width: UTIL },
      )
      .fillColor('#000')
    doc
      .lineWidth(0.6)
      .moveTo(IZQ, yFirma + mm(10))
      .lineTo(IZQ + mm(75), yFirma + mm(10))
      .stroke()
    doc
      .moveTo(DER - mm(75), yFirma + mm(10))
      .lineTo(DER, yFirma + mm(10))
      .stroke()
    doc
      .font(NORMAL)
      .fontSize(8)
      .text('Firma y aclaración del cliente', IZQ, yFirma + mm(12), {
        width: mm(75),
        align: 'center',
      })
    doc.text('Firma del asesor', DER - mm(75), yFirma + mm(12), { width: mm(75), align: 'center' })
  }
}

export async function generarOrdenPdf(o: DatosOrdenImpresa): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `Orden de trabajo ${o.numero}`,
      Author: o.concesionaria,
      Creator: 'GarageProBoard',
    },
  })
  const partes: Buffer[] = []
  doc.on('data', (b: Buffer) => partes.push(b))
  const fin = new Promise<void>((resolver) => doc.on('end', () => resolver()))
  hoja(doc, o, 'TALLER')
  hoja(doc, o, 'CLIENTE')
  doc.end()
  await fin
  return new Uint8Array(Buffer.concat(partes))
}

/**
 * El presupuesto: lo que se le consulta al cliente antes de hacerlo. Una hoja, con una casilla
 * por renglón para que marque lo que autoriza y la firma de conformidad. Si autoriza por
 * teléfono o WhatsApp no hay firma, y la respuesta queda registrada en la orden.
 */
export interface DatosPresupuestoImpreso {
  concesionaria: string
  sucursal: { nombre: string; domicilio: string | null; telefono: string | null }
  ordenNumero: number
  numero: number
  /** AAAA-MM-DDTHH:mm, en la hora de Argentina. */
  fecha: string
  vehiculo: {
    dominio: string | null
    marcaModelo: string | null
    chasis: string
    kilometraje: number | null
  }
  cliente: string | null
  autoriza: { nombre: string | null; telefono: string | null }
  asesor: string
  items: Array<{
    tipo: 'trabajo' | 'repuesto'
    descripcion: string
    cantidad: string
    precioUnitario: string
    total: string
  }>
  total: string
  /** Hasta cuándo vale el precio, AAAA-MM-DD. */
  validoHasta: string
}

export async function generarPresupuestoPdf(p: DatosPresupuestoImpreso): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `Presupuesto ${p.numero} de la orden ${p.ordenNumero}`,
      Author: p.concesionaria,
      Creator: 'GarageProBoard',
    },
  })
  const partes: Buffer[] = []
  doc.on('data', (b: Buffer) => partes.push(b))
  const fin = new Promise<void>((resolver) => doc.on('end', () => resolver()))

  doc.addPage()
  let y = mm(12)
  doc
    .font(NEGRITA)
    .fontSize(12)
    .text(p.concesionaria, IZQ, y, { width: UTIL * 0.6 })
  doc
    .font(NORMAL)
    .fontSize(8)
    .text(
      [
        p.sucursal.nombre,
        p.sucursal.domicilio,
        p.sucursal.telefono && `Tel. ${p.sucursal.telefono}`,
      ]
        .filter(Boolean)
        .join(' · '),
      IZQ,
      y + mm(5.5),
      { width: UTIL * 0.6 },
    )
  doc.font(NORMAL).fontSize(9).text('PRESUPUESTO', IZQ, y, { width: UTIL, align: 'right' })
  doc
    .font(NEGRITA)
    .fontSize(20)
    .text(`OT ${String(p.ordenNumero).padStart(6, '0')} · N° ${p.numero}`, IZQ, y + mm(4), {
      width: UTIL,
      align: 'right',
    })
  doc
    .font(NORMAL)
    .fontSize(8)
    .text(`${fecha(p.fecha)} · válido hasta el ${fecha(p.validoHasta)}`, IZQ, y + mm(12), {
      width: UTIL,
      align: 'right',
    })
  y += mm(22)

  const col = UTIL / 4
  caja(doc, y, mm(26), 'Vehículo y cliente')
  doc
    .font(NEGRITA)
    .fontSize(16)
    .text(patente(p.vehiculo.dominio), IZQ + mm(3), y + mm(6), {
      width: col * 1.3,
      lineBreak: false,
    })
  etiquetaValor(
    doc,
    IZQ + col * 1.4,
    y + mm(6),
    'Marca y modelo',
    p.vehiculo.marcaModelo ?? '',
    col * 1.3,
  )
  etiquetaValor(doc, IZQ + col * 2.8, y + mm(6), 'Chasis', p.vehiculo.chasis, col * 1.15)
  etiquetaValor(doc, IZQ + mm(3), y + mm(15), 'Cliente', p.cliente ?? '', col * 1.3)
  etiquetaValor(
    doc,
    IZQ + col * 1.4,
    y + mm(15),
    'Autoriza',
    [p.autoriza.nombre, p.autoriza.telefono].filter(Boolean).join(' · '),
    col * 1.3,
  )
  etiquetaValor(doc, IZQ + col * 2.8, y + mm(15), 'Asesor', p.asesor, col * 1.15)
  y += mm(30)

  // Renglones, con la casilla para marcar
  const alto = mm(14) + p.items.length * mm(6.5)
  caja(doc, y, alto, 'Trabajos y repuestos a autorizar')
  let yy = y + mm(7)
  doc.font(NEGRITA).fontSize(7).fillColor('#555')
  doc.text('OK', IZQ + mm(3), yy, { width: mm(6), lineBreak: false })
  doc.text('DESCRIPCIÓN', IZQ + mm(24), yy, { width: mm(80), lineBreak: false })
  doc.text('CANT.', DER - mm(78), yy, { width: mm(14), align: 'right', lineBreak: false })
  doc.text('UNITARIO', DER - mm(60), yy, { width: mm(26), align: 'right', lineBreak: false })
  doc.text('TOTAL', DER - mm(31), yy, { width: mm(28), align: 'right', lineBreak: false })
  doc.fillColor('#000')
  yy += mm(5)
  for (const i of p.items) {
    doc
      .lineWidth(0.7)
      .rect(IZQ + mm(3), yy - mm(0.4), mm(3.6), mm(3.6))
      .stroke()
    doc.font(NORMAL).fontSize(8).fillColor('#555')
    doc.text(i.tipo === 'trabajo' ? 'Trabajo' : 'Repuesto', IZQ + mm(9), yy, {
      width: mm(15),
      lineBreak: false,
    })
    doc.fillColor('#000').fontSize(9.5)
    doc.text(i.descripcion, IZQ + mm(24), yy, {
      width: UTIL - mm(24) - mm(80),
      lineBreak: false,
      ellipsis: true,
      height: doc.currentLineHeight(),
    })
    doc.text(formatearImporte(i.cantidad).replace(/,00$/, ''), DER - mm(78), yy, {
      width: mm(14),
      align: 'right',
      lineBreak: false,
    })
    doc.text(`$ ${formatearImporte(i.precioUnitario)}`, DER - mm(60), yy, {
      width: mm(26),
      align: 'right',
      lineBreak: false,
    })
    doc.text(`$ ${formatearImporte(i.total)}`, DER - mm(31), yy, {
      width: mm(28),
      align: 'right',
      lineBreak: false,
    })
    yy += mm(6.5)
  }
  y += alto + mm(3)
  doc
    .font(NEGRITA)
    .fontSize(13)
    .text(`Total: $ ${formatearImporte(p.total)}`, IZQ, y, { width: UTIL - mm(3), align: 'right' })
  doc
    .font(NORMAL)
    .fontSize(8)
    .text('Precios finales con IVA incluido.', IZQ, y + mm(6), {
      width: UTIL - mm(3),
      align: 'right',
    })

  const yFirma = Math.max(y + mm(30), 297 * MM - mm(45))
  doc
    .font(NORMAL)
    .fontSize(7.5)
    .fillColor('#444')
    .text(
      'Marque los trabajos que autoriza. Lo que no se autoriza no se hace ni se cobra. Si durante el ' +
        'trabajo aparece algo no previsto, se consulta antes de hacerlo. Los precios valen hasta la ' +
        'fecha indicada; los repuestos quedan sujetos a disponibilidad.',
      IZQ,
      yFirma - mm(14),
      { width: UTIL },
    )
    .fillColor('#000')
  doc
    .lineWidth(0.6)
    .moveTo(IZQ, yFirma + mm(10))
    .lineTo(IZQ + mm(75), yFirma + mm(10))
    .stroke()
  doc
    .moveTo(DER - mm(45), yFirma + mm(10))
    .lineTo(DER, yFirma + mm(10))
    .stroke()
  doc
    .font(NORMAL)
    .fontSize(8)
    .text('Firma y aclaración de quien autoriza', IZQ, yFirma + mm(12), {
      width: mm(75),
      align: 'center',
    })
  doc.text('Fecha', DER - mm(45), yFirma + mm(12), { width: mm(45), align: 'center' })

  doc.end()
  await fin
  return new Uint8Array(Buffer.concat(partes))
}
