import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Usuarios'

export const usuarioListado = z.object({
  id: z.uuid(),
  email: z.string(),
  nombre: z.string(),
  apellido: z.string(),
  activo: z.boolean(),
  ultimoAcceso: z.iso.datetime().nullable(),
  roles: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
  sucursales: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
  /**
   * Si quien pide puede modificar a este usuario. No puede si es él mismo, o si el otro
   * tiene algún permiso que él no tiene: tocar a alguien con más permisos —cambiarle la
   * contraseña, sacarle el rol— es una forma de quedarse con lo suyo.
   */
  editable: z.boolean(),
})

/** Lo que hace falta para armar el formulario, ya filtrado para quien pide. */
export const opcionesUsuario = z.object({
  roles: z.array(
    z.object({
      id: z.uuid(),
      nombre: z.string(),
      descripcion: z.string().nullable(),
      /**
       * Los permisos de este rol que quien pide no tiene. Vacío: lo puede asignar. Si no,
       * la pantalla lo muestra deshabilitado y dice por qué.
       */
      leFalta: z.array(z.string()),
    }),
  ),
  sucursales: z.array(z.object({ id: z.uuid(), nombre: z.string(), razonSocial: z.string() })),
})

const datosUsuario = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre'),
  apellido: z.string().trim().min(1, 'Falta el apellido'),
  rolIds: z.array(z.uuid()),
  sucursalIds: z.array(z.uuid()).min(1, 'Elegí al menos una sucursal'),
})

/** La contraseña recién generada. Se muestra una sola vez y no se guarda más que su hash. */
const conPasswordInicial = z.object({ usuario: usuarioListado, passwordInicial: z.string() })

const ROL_NO_OTORGABLE = {
  ROL_NO_OTORGABLE: {
    status: 403,
    message: 'No podés asignar un rol con permisos que vos no tenés',
    data: z.object({ rol: z.string(), leFalta: z.array(z.string()) }),
  },
} as const

const REFERENCIA_INVALIDA = {
  REFERENCIA_INVALIDA: {
    status: 422,
    message: 'Algún rol o sucursal elegido no existe en la concesionaria',
  },
} as const

/** Lo que no se puede hacer sobre un usuario ya existente. */
const NO_ALCANZABLE = {
  NO_ENCONTRADO: { status: 404, message: 'No existe ese usuario' },
  ES_USTED: {
    status: 403,
    message:
      'No podés cambiar tus propios roles, sucursales ni tu estado. Pedíselo a otra persona ' +
      'que administre usuarios.',
  },
  USUARIO_CON_MAS_PERMISOS: {
    status: 403,
    message: 'Ese usuario tiene permisos que vos no tenés, así que no lo podés modificar',
  },
} as const

export const contratoUsuarios = {
  listar: conPermiso('nucleo', 'ver', 'Usuario')
    .route({
      method: 'GET',
      path: '/usuarios',
      tags: [TAG],
      operationId: 'listarUsuarios',
      summary: 'Usuarios de la concesionaria',
    })
    .output(z.object({ datos: z.array(usuarioListado) })),

  opciones: conPermiso('nucleo', 'ver', 'Usuario')
    .route({
      method: 'GET',
      path: '/usuarios/opciones',
      tags: [TAG],
      operationId: 'opcionesUsuario',
      summary: 'Roles y sucursales para asignar',
      description: 'Cada rol dice qué permisos le faltan a quien pide para poder asignarlo.',
    })
    .output(opcionesUsuario),

  crear: conPermiso('nucleo', 'crear', 'Usuario')
    .route({
      method: 'POST',
      path: '/usuarios',
      tags: [TAG],
      operationId: 'crearUsuario',
      summary: 'Alta de usuario',
      successStatus: 201,
      description:
        'Genera una contraseña inicial y la devuelve una sola vez. Crea también sus ' +
        'preferencias y su mapa de teclas.',
    })
    .input(datosUsuario.extend({ email: z.email() }))
    .errors({
      ...ROL_NO_OTORGABLE,
      ...REFERENCIA_INVALIDA,
      EMAIL_DUPLICADO: {
        status: 409,
        message: 'Ese correo ya es de un usuario del sistema, en esta u otra concesionaria',
      },
    })
    .output(conPasswordInicial),

  editar: conPermiso('nucleo', 'editar', 'Usuario')
    .route({
      method: 'PUT',
      path: '/usuarios/{id}',
      tags: [TAG],
      operationId: 'editarUsuario',
      summary: 'Modificar un usuario: datos, roles, sucursales y estado',
      description:
        'Dar de baja no borra: el usuario deja de poder entrar en el próximo pedido y su ' +
        'historia queda.',
    })
    .input(datosUsuario.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors({ ...NO_ALCANZABLE, ...ROL_NO_OTORGABLE, ...REFERENCIA_INVALIDA })
    .output(usuarioListado),

  nuevaPassword: conPermiso('nucleo', 'editar', 'Usuario')
    .route({
      method: 'POST',
      path: '/usuarios/{id}/password',
      tags: [TAG],
      operationId: 'nuevaPasswordUsuario',
      summary: 'Generar una contraseña nueva',
      description: 'Para quien se la olvidó. Cierra todas sus sesiones abiertas.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ALCANZABLE)
    .output(conPasswordInicial),
}
