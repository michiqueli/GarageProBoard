import {
  FORMATOS_HOJA,
  MAXIMO_BYTES_HOJA,
  MAXIMO_LADO_HOJA,
  MINIMO_LADO_HOJA,
  TIPOS_HOJA,
  VISTAS,
} from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Hoja de recepción'

const casillero = z.object({ tipo: z.enum(TIPOS_HOJA), vista: z.enum(VISTAS) })

export const imagenDeHoja = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_HOJA),
  vista: z.enum(VISTAS),
  formato: z.enum(FORMATOS_HOJA),
  ancho: z.number().int(),
  alto: z.number().int(),
  bytes: z.number().int(),
  creadoEn: z.string(),
  /** Quién la subió. La del juego por omisión no la subió nadie. */
  creadoPor: z.string().nullable(),
})

/**
 * Un casillero de la hoja: el tipo de carrocería y la vista, con la imagen que hay puesta.
 * Sin imagen propia va la del juego por omisión, que es lo que ve un taller el primer día.
 */
export const casilleroDeHoja = casillero.extend({
  propia: imagenDeHoja.nullable(),
})

const NO_ENCONTRADA = {
  NO_ENCONTRADA: { status: 404, message: 'Esa imagen no existe' },
} as const

export const contratoHojas = {
  listar: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/hojas',
      tags: [TAG],
      operationId: 'listarHojas',
      summary: 'Las quince casillas de la hoja de recepción, y cuáles tienen imagen propia',
    })
    .output(z.object({ datos: z.array(casilleroDeHoja) })),

  subir: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/hojas/{tipo}/{vista}',
      tags: [TAG],
      operationId: 'subirImagenDeHoja',
      summary: 'Reemplazar el dibujo de una vista',
      successStatus: 201,
      description:
        'PNG o JPEG, porque son los dos que la orden impresa sabe embeber. La imagen ' +
        'anterior no se borra: queda marcada como reemplazada, porque hay órdenes ya ' +
        'firmadas que la apuntan.',
    })
    .input(casillero.extend({ imagen: z.file() }))
    .errors({
      FORMATO_INVALIDO: {
        status: 422,
        message: 'Esa imagen tiene que ser un PNG o un JPEG: son los que salen impresos',
      },
      DEMASIADO_GRANDE: {
        status: 413,
        message: `La imagen no puede pasar de ${Math.round(MAXIMO_BYTES_HOJA / 1024 / 1024)} MB`,
      },
      MEDIDAS_INVALIDAS: {
        status: 422,
        message:
          `El dibujo tiene que medir entre ${MINIMO_LADO_HOJA} y ${MAXIMO_LADO_HOJA} ` +
          'píxeles de lado: más chico se ve pixelado, y más grande no aporta',
      },
      SIN_ALMACEN: {
        status: 503,
        message: 'El servidor no tiene configurado dónde guardar los archivos. Avisale a soporte',
      },
    })
    .output(imagenDeHoja),

  /**
   * Los bytes los sirve la API y no una URL firmada: una URL que alguien reenvía sigue
   * abriendo la hoja hasta que vence, y acá el permiso se evalúa en cada pedido.
   */
  imagen: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/hojas/imagenes/{id}',
      tags: [TAG],
      operationId: 'imagenDeHoja',
      summary: 'El dibujo, para mostrarlo en pantalla',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADA })
    .output(z.file()),

  quitar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'DELETE',
      path: '/hojas/{tipo}/{vista}',
      tags: [TAG],
      operationId: 'quitarImagenDeHoja',
      summary: 'Volver al dibujo que trae el sistema',
      description:
        'No borra nada: marca la imagen propia como reemplazada. Las órdenes que se ' +
        'recibieron con ella la siguen mostrando.',
    })
    .input(casillero)
    .errors({ ...NO_ENCONTRADA })
    .output(z.object({ hecho: z.literal(true) })),
}
