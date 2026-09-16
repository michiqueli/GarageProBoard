import { ACCIONES_PERMISO, SUJETOS } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Roles'

const permiso = z.object({
  accion: z.enum(ACCIONES_PERMISO),
  sujeto: z.enum(SUJETOS).exclude(['all']),
})

export const rolSalida = z.object({
  id: z.uuid(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  /** Puede todo (`administrar all`). No se edita desde la aplicación: se clona. */
  todo: z.boolean(),
  permisos: z.array(permiso),
  /** Las reglas que no caben en la grilla, dichas en palabras. Se conservan al guardar. */
  especiales: z.array(z.string()),
  /** Cuántos usuarios lo tienen. */
  usuarios: z.number().int(),
  /**
   * Por qué quien pide no lo puede modificar, o `null` si puede. Es la misma respuesta que
   * da la API al intentarlo, para que la pantalla no ofrezca lo que después se rechaza.
   */
  noEditable: z.string().nullable(),
})

const datosRol = z.object({
  nombre: z.string().trim().min(2, 'Falta el nombre del rol'),
  descripcion: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable(),
  permisos: z.array(permiso),
})

const PERMISO_NO_OTORGABLE = {
  PERMISO_NO_OTORGABLE: {
    status: 403,
    message: 'No podés dar permisos que vos no tenés',
    data: z.object({ leFalta: z.array(z.string()) }),
  },
} as const

const NOMBRE_DUPLICADO = {
  NOMBRE_DUPLICADO: { status: 409, message: 'Ya hay un rol con ese nombre' },
} as const

export const contratoRoles = {
  listar: conPermiso('nucleo', 'ver', 'Usuario')
    .route({
      method: 'GET',
      path: '/roles',
      tags: [TAG],
      operationId: 'listarRoles',
      summary: 'Los roles de la concesionaria, con sus permisos',
      description: 'Cada rol dice si quien pide lo puede modificar y, si no, por qué.',
    })
    .output(z.object({ datos: z.array(rolSalida) })),

  crear: conPermiso('nucleo', 'administrar', 'Usuario')
    .route({
      method: 'POST',
      path: '/roles',
      tags: [TAG],
      operationId: 'crearRol',
      summary: 'Crear un rol, o clonar uno existente',
      successStatus: 201,
      description:
        'Con `basadoEn`, el rol nuevo conserva también las reglas especiales del original ' +
        '—las que tienen condiciones o prohíben—, que no se editan con casillas.',
    })
    .input(datosRol.extend({ basadoEn: z.uuid().nullish() }))
    .errors({
      ...PERMISO_NO_OTORGABLE,
      ...NOMBRE_DUPLICADO,
      NO_ENCONTRADO: { status: 404, message: 'El rol que se quiere clonar no existe' },
    })
    .output(rolSalida),

  editar: conPermiso('nucleo', 'administrar', 'Usuario')
    .route({
      method: 'PUT',
      path: '/roles/{id}',
      tags: [TAG],
      operationId: 'editarRol',
      summary: 'Modificar un rol',
      description:
        'El cambio vale en el próximo pedido de cada usuario que lo tiene, y a cada uno le ' +
        'llega un aviso. Nadie modifica un rol que tiene él mismo, ni el que puede todo.',
    })
    .input(datosRol.extend({ id: z.uuid() }))
    .errors({
      ...PERMISO_NO_OTORGABLE,
      ...NOMBRE_DUPLICADO,
      NO_ENCONTRADO: { status: 404, message: 'Ese rol no existe' },
      NO_EDITABLE: {
        status: 403,
        message: 'Ese rol no se puede modificar',
        data: z.object({ motivo: z.string() }),
      },
    })
    .output(rolSalida),
}
