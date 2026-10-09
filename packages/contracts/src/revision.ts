import { MAXIMO_NOMBRE_PUNTO, SECCIONES_REVISION } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Hoja de recepción'

/**
 * Un punto de la revisión de la hoja, como lo tiene configurado la concesionaria.
 *
 * Los apagados vienen igual: la pantalla de configuración los muestra para volver a
 * prenderlos, y la recepción los filtra.
 */
export const puntoRevision = z.object({
  id: z.uuid(),
  seccion: z.enum(SECCIONES_REVISION),
  nombre: z.string(),
  orden: z.number().int(),
  activo: z.boolean(),
  /** Si lo agregó el taller. Los demás vienen con el sistema. */
  propio: z.boolean(),
})

const nombre = z
  .string()
  .trim()
  .min(1, 'Escribí qué se revisa')
  .max(MAXIMO_NOMBRE_PUNTO, `El nombre es corto: hasta ${MAXIMO_NOMBRE_PUNTO} letras`)

const NO_ENCONTRADO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese punto de la revisión no existe' },
} as const

const salida = z.object({ datos: z.array(puntoRevision) })

/**
 * El catálogo de puntos que se revisan cuando entra un auto. **No hay baja**: un punto se apaga,
 * porque hay órdenes firmadas que lo contestaron. Las respuestas guardan el nombre que tenía.
 */
export const contratoRevision = {
  listar: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/revision/puntos',
      tags: [TAG],
      operationId: 'listarPuntosDeRevision',
      summary: 'Los puntos que se revisan cuando entra un auto, por sección y en su orden',
      description:
        'Una concesionaria que todavía no tiene ninguno recibe los que trae el sistema la ' +
        'primera vez que los pide.',
    })
    .output(salida),

  crear: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/revision/puntos',
      tags: [TAG],
      operationId: 'crearPuntoDeRevision',
      summary: 'Agregar un punto propio, al final de su sección',
      successStatus: 201,
    })
    .input(z.object({ seccion: z.enum(SECCIONES_REVISION), nombre }))
    .output(salida),

  editar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'PUT',
      path: '/revision/puntos/{id}',
      tags: [TAG],
      operationId: 'editarPuntoDeRevision',
      summary: 'Cambiarle el nombre a un punto, apagarlo o volver a prenderlo',
      description:
        'Las órdenes ya revisadas no cambian: guardan el nombre que tenía el punto al ' +
        'contestarse.',
    })
    .input(z.object({ id: z.uuid(), nombre, activo: z.boolean() }))
    .errors(NO_ENCONTRADO)
    .output(salida),

  mover: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/revision/puntos/{id}/mover',
      tags: [TAG],
      operationId: 'moverPuntoDeRevision',
      summary: 'Subir o bajar un punto dentro de su sección',
    })
    .input(z.object({ id: z.uuid(), hacia: z.enum(['arriba', 'abajo']) }))
    .errors(NO_ENCONTRADO)
    .output(salida),
}
