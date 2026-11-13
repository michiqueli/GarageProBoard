export interface DatosCorreoComprobante {
  /** «Factura B 00008-00000012». */
  titulo: string
  receptor: string
  /** El nombre con el que la conoce el cliente: el de fantasía o, si no tiene, la razón social. */
  empresa: string
  /** Dónde lo atendieron. */
  sucursal: string
  razonSocial: string
  cuit: string
  /** AAAA-MM-DD. */
  fecha: string
  total: string
  cae: string
}

const escapar = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const importe = (t: string) =>
  `$ ${Number(t).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fechaLarga = (iso: string) => iso.split('-').reverse().join('/')

const cuitConGuiones = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`

const fila = (nombre: string, valor: string) =>
  `<tr><td style="padding:6px 0;color:#61706b;font-size:13px">${nombre}</td><td align="right" style="padding:6px 0;color:#151d1a;font-size:13px;font-weight:600">${valor}</td></tr>`

/**
 * El mail de un comprobante. Los colores van escritos acá y no como tokens: un correo no lee
 * hojas de estilo, y cada cliente de mail se queda sólo con lo que está en la etiqueta.
 *
 * Lleva también la versión en texto, para los lectores que no muestran HTML.
 */
export function armarCorreoComprobante(d: DatosCorreoComprobante) {
  const total = importe(d.total)
  const sucursal = escapar(d.sucursal)
  const empresa = escapar(d.empresa)
  const titulo = escapar(d.titulo)

  const html = `<!doctype html>
<html lang="es-AR">
<body style="margin:0;padding:0;background:#eef1ef">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ef;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#0e1412;border-bottom:4px solid #f0a621;padding:20px 24px">
<div style="color:#ffffff;font-size:20px;font-weight:700">${empresa}</div>
<div style="color:#f0a621;font-size:13px;margin-top:4px">${sucursal}</div>
</td></tr>
<tr><td style="padding:24px 24px 8px;color:#151d1a;font-size:15px;line-height:1.5">
Hola, <b>${escapar(d.receptor)}</b>:<br>te enviamos tu comprobante. Va adjunto en PDF.
</td></tr>
<tr><td style="padding:12px 24px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6e7;border-radius:6px">
<tr><td style="padding:16px;color:#61706b;font-size:13px">Total
<div style="color:#151d1a;font-size:28px;font-weight:700;margin-top:2px">${escapar(total)}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:8px 24px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${fila('Comprobante', titulo)}
${fila('Fecha', escapar(fechaLarga(d.fecha)))}
${fila('CAE', escapar(d.cae))}
</table>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e3e8e5;color:#61706b;font-size:12px;line-height:1.5">
${escapar(d.razonSocial)} · CUIT ${escapar(cuitConGuiones(d.cuit))}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const texto = [
    `Hola, ${d.receptor}:`,
    '',
    `Te enviamos la ${d.titulo} por ${total}. Va adjunta en PDF.`,
    '',
    `${d.empresa} · ${d.sucursal}`,
    `${d.razonSocial} · CUIT ${cuitConGuiones(d.cuit)}`,
  ].join('\n')

  return { asunto: `${d.titulo} · ${d.empresa} (${d.sucursal})`, texto, html }
}
