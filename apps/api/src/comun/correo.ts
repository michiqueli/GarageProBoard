import { createTransport } from 'nodemailer'

export interface Adjunto {
  nombre: string
  contenido: Uint8Array
  tipo: string
}

export interface Mensaje {
  para: string
  asunto: string
  texto: string
  /** La versión con formato. El texto queda para quien no la pueda ver. */
  html?: string | undefined
  /** A quién le llega la respuesta, si no es el remitente. */
  responderA?: string | undefined
  /** El nombre que ve quien lo recibe. La dirección sigue siendo la del remitente configurado. */
  nombreRemitente?: string | undefined
  adjuntos?: Adjunto[] | undefined
}

/** El correo saliente, detrás de un puerto: los tests no mandan mails. */
export interface ServicioCorreo {
  enviar(mensaje: Mensaje): Promise<void>
}

export class CorreoNoConfigurado extends Error {
  constructor() {
    super('Falta SMTP_URL: el servidor no tiene configurado el correo saliente.')
    this.name = 'CorreoNoConfigurado'
  }
}

export class CorreoNoEnviado extends Error {
  constructor(readonly causa: unknown) {
    super('El servidor de correo no aceptó el mensaje.')
    this.name = 'CorreoNoEnviado'
  }
}

/**
 * Correo por SMTP, configurado con `SMTP_URL` (`smtp://usuario:clave@servidor:587`) y
 * `CORREO_REMITENTE`. En desarrollo apunta a Mailpit, que atrapa todo sin mandarlo.
 *
 * Sin configurar, la API arranca igual y enviar falla con un error que dice qué falta: el
 * correo es una comodidad, y su falta no puede impedir facturar.
 */
export function crearCorreoSmtp(
  url: string | undefined,
  remitente: string | undefined,
): ServicioCorreo {
  if (!url) {
    return { enviar: () => Promise.reject(new CorreoNoConfigurado()) }
  }
  const transporte = createTransport(url)
  const origen = remitente ?? 'GarageProBoard <no-responder@garageproboard.com>'
  const direccion = origen.match(/<([^>]+)>/)?.[1] ?? origen
  return {
    async enviar(m) {
      try {
        await transporte.sendMail({
          from: m.nombreRemitente ? { name: m.nombreRemitente, address: direccion } : origen,
          to: m.para,
          subject: m.asunto,
          text: m.texto,
          ...(m.responderA ? { replyTo: m.responderA } : {}),
          ...(m.html ? { html: m.html } : {}),
          attachments: (m.adjuntos ?? []).map((a) => ({
            filename: a.nombre,
            content: Buffer.from(a.contenido),
            contentType: a.tipo,
          })),
        })
      } catch (error) {
        throw new CorreoNoEnviado(error)
      }
    },
  }
}
