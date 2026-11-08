import { z } from 'zod'
import { publico } from './acceso.ts'

/** Sin saltos de línea: lo que se escribe acá va al asunto del mail. */
const unaLinea = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((v) => v.replace(/[\r\n]+/g, ' '))

export const contratoContacto = {
  enviar: publico
    .route({
      method: 'POST',
      path: '/publico/contacto',
      tags: ['Contacto'],
      operationId: 'enviarContacto',
      summary: 'El pedido de demo de la landing',
      description: 'Llega por mail. No guarda nada.',
    })
    .input(
      z.object({
        nombre: unaLinea(100).pipe(z.string().min(1, 'Falta tu nombre')),
        concesionaria: unaLinea(120).default(''),
        email: z.email('Ese correo no parece bien escrito'),
        telefono: unaLinea(40).default(''),
        mensaje: z.string().trim().max(2000).default(''),
        /** Oculto para las personas: si viene lleno, lo llenó un robot. */
        sitio: z.string().max(200).default(''),
      }),
    )
    .errors({
      DEMASIADOS: { status: 429, message: 'Mandaste varios seguidos. Probá en un rato' },
      NO_ENVIADO: {
        status: 503,
        message: 'No se pudo mandar. Probá de nuevo en un momento',
      },
    })
    .output(z.object({ ok: z.literal(true) })),
}
