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
  return {
    async enviar(m) {
      try {
        await transporte.sendMail({
          from: remitente ?? 'GarageProBoard <no-responder@garageproboard.com>',
          to: m.para,
          subject: m.asunto,
          text: m.texto,
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
