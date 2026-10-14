import { MAXIMO_NOMBRE_MOTIVO } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Taller'

/**
 * Un motivo de espera, como lo tiene la concesionaria. Los apagados vienen igual: la
 * configuración los muestra para volver a prenderlos, y la orden los filtra.
 */
export const motivoEspera = z.object({
  id: z.uuid(),
  nombre: z.string(),
  activo: z.boolean(),
  /** Si lo agregó el taller. Los demás vienen con el sistema, y algunos los abre un estado solo. */
  propio: z.boolean(),
})

const nombre = z
  .string()
  .trim()
  .min(1, 'Escribí por qué espera el auto')
  .max(MAXIMO_NOMBRE_MOTIVO, `El nombre es corto: hasta ${MAXIMO_NOMBRE_MOTIVO} letras`)

const salida = z.object({ datos: z.array(motivoEspera) })

/**
 * Por qué puede estar parado un auto. **No hay baja**: un motivo se apaga, porque hay esperas que
 * lo usaron. Ver `docs/tecnicos/taller-control-de-tiempos.md`.
 */
export const contratoMotivosEspera = {
  listar: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/taller/motivos-espera',
      tags: [TAG],
      operationId: 'listarMotivosDeEspera',
      summary: 'Los motivos por los que un auto puede estar parado, en su orden',
      description:
        'Una concesionaria que todavía no tiene ninguno recibe los que trae el sistema la ' +
        'primera vez que los pide.',
    })
    .output(salida),

  crear: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/taller/motivos-espera',
      tags: [TAG],
      operationId: 'crearMotivoDeEspera',
      summary: 'Agregar un motivo propio, al final',
      successStatus: 201,
    })
    .input(z.object({ nombre }))
    .output(salida),

  editar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'PUT',
      path: '/taller/motivos-espera/{id}',
      tags: [TAG],
      operationId: 'editarMotivoDeEspera',
      summary: 'Cambiarle el nombre a un motivo, apagarlo o volver a prenderlo',
      description: 'Las esperas que ya lo usaron lo siguen mostrando.',
    })
    .input(z.object({ id: z.uuid(), nombre, activo: z.boolean() }))
    .errors({ NO_ENCONTRADO: { status: 404, message: 'Ese motivo de espera no existe' } })
    .output(salida),
}
