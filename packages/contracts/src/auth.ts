import { MODULOS } from '@gpb/core'
import { z } from 'zod'
import { conSesion, publico, reglaPermiso } from './acceso.ts'

const TAG = 'Sesión'

export const sucursalSalida = z.object({
  id: z.uuid(),
  nombre: z.string(),
  empresaId: z.uuid(),
  razonSocial: z.string(),
})

export const usuarioSalida = z.object({
  id: z.uuid(),
  email: z.string(),
  nombre: z.string(),
  apellido: z.string(),
})

export const configSalida = z.object({
  tema: z.enum(['claro', 'oscuro', 'sistema']),
  densidad: z.enum(['compacta', 'comoda']),
  filasPorPagina: z.number().int(),
  /**
   * A qué sucursal entra sin preguntar.
   *
   * Si es `null` y el usuario tiene más de una, la aplicación le pregunta al entrar.
   * Con una sola sucursal nunca se pregunta: elegir entre una opción no es elegir.
   */
  sucursalPredeterminadaId: z.uuid().nullable(),
})

/**
 * Todo lo que el front necesita para arrancar, en una sola respuesta.
 *
 * Se manda junto y no en cinco pedidos porque son cinco cosas que la aplicación no
 * puede dibujar sin tener: sin permisos no sabe qué botones mostrar, sin el mapa de
 * teclas no sabe qué escribir en ellos, y una pantalla que aparece y después se
 * reacomoda es peor que una que tarda un instante más.
 */
export const sesionSalida = z.object({
  /** JWT de vida corta. Va en el encabezado de cada pedido. */
  access: z.string(),
  expiraEn: z.string(),
  /**
   * Cadena opaca, de vida larga y **de un solo uso**: cada refresco emite otra.
   *
   * Sólo aparece si se pidió `entrega: 'cuerpo'`. En un navegador se omite a propósito
   * y viaja en una cookie `httpOnly`: si estuviera acá, un script malicioso podría
   * leerla y quedarse con treinta días de sesión.
   */
  refresh: z.string().optional(),

  usuario: usuarioSalida,
  tenant: z.object({ id: z.uuid(), nombre: z.string(), slug: z.string() }),
  sucursalActiva: sucursalSalida,
  sucursales: z.array(sucursalSalida),
  /**
   * Todavía tiene que elegir a qué sucursal entra: tiene varias y ninguna predeterminada, y no
   * eligió. Lo recuerda el servidor, así que sobrevive a recargar la página.
   */
  sucursalPendiente: z.boolean(),

  /**
   * Los módulos que la concesionaria tiene prendidos hoy. Se evalúan antes que los
   * permisos: lo que no está contratado no se muestra, ni siquiera atenuado.
   */
  modulos: z.array(z.enum(MODULOS)),
  /**
   * Lo que le pasó a este usuario y todavía no leyó: «Tu contraseña la cambió Juan Pérez».
   * La aplicación lo muestra apenas entra, hasta que lo marca como leído.
   */
  avisos: z.array(z.object({ id: z.uuid(), texto: z.string(), creadoEn: z.iso.datetime() })),
  /** Reglas de CASL, ya resueltas contra este usuario. */
  habilidades: z.array(reglaPermiso),
  /** Sólo aquello en lo que el usuario se apartó del valor por omisión. */
  atajos: z.record(z.string(), z.string()),
  config: configSalida,
})

export const contratoAuth = {
  iniciar: publico
    .route({
      method: 'POST',
      path: '/auth/iniciar',
      tags: [TAG],
      operationId: 'iniciarSesion',
      summary: 'Iniciar sesión',
      description:
        'Devuelve el token de acceso y todo lo que la aplicación necesita para arrancar: ' +
        'usuario, sucursales, permisos, mapa de teclas y preferencias.',
    })
    .input(
      z.object({
        /**
         * No se pide la concesionaria: el correo es único en todo el sistema y de él
         * sale a cuál pertenece el usuario. Preguntarle a alguien dónde trabaja antes
         * de dejarlo entrar es hacerle recordar algo que el sistema ya sabe.
         */
        email: z.email(),
        password: z.string().min(1),
        sucursalId: z.uuid().optional(),
        /**
         * Dónde recibir el token de refresco.
         *
         * 'cookie' (por omisión) lo manda en una cookie `httpOnly` que el JavaScript de
         * la página no puede leer. Es lo correcto para un navegador.
         *
         * 'cuerpo' lo devuelve en la respuesta, para clientes que no manejan cookies
         * — la app mobile, una integración de terceros. Quien lo pide se hace cargo de
         * guardarlo en un lugar seguro del sistema operativo.
         */
        entrega: z.enum(['cookie', 'cuerpo']).default('cookie'),
      }),
    )
    .errors({
      CREDENCIALES_INVALIDAS: {
        // El mismo mensaje para usuario inexistente y contraseña equivocada: distinguirlos
        // le confirma a quien prueba direcciones cuáles existen.
        status: 401,
        message: 'El correo o la contraseña no son correctos',
      },
      SIN_ACCESO: { status: 403, message: 'El usuario no tiene ninguna sucursal habilitada' },
    })
    .output(sesionSalida),

  refrescar: publico
    .route({
      method: 'POST',
      path: '/auth/refrescar',
      tags: [TAG],
      operationId: 'refrescarSesion',
      summary: 'Renovar la sesión',
      description:
        'El token de refresco es de un solo uso: cada llamada emite uno nuevo y anula el ' +
        'anterior. Reusar uno ya rotado anula la sesión entera.',
    })
    .input(z.object({ refresh: z.string().min(1).optional() }))
    .errors({
      REFRESCO_INVALIDO: { status: 401, message: 'La sesión expiró o fue cerrada' },
    })
    .output(sesionSalida),

  cerrar: publico
    .route({
      method: 'POST',
      path: '/auth/cerrar',
      tags: [TAG],
      operationId: 'cerrarSesion',
      summary: 'Cerrar sesión',
      description: 'Anula la sesión completa, no sólo el token presentado.',
    })
    .input(z.object({ refresh: z.string().min(1).optional() }))
    .output(z.object({ cerrada: z.boolean() })),

  cambiarSucursal: publico
    .route({
      method: 'POST',
      path: '/auth/sucursal',
      tags: [TAG],
      operationId: 'cambiarSucursal',
      summary: 'Cambiar de sucursal',
      description: 'Emite tokens nuevos apuntando a otra sucursal del mismo usuario.',
    })
    .input(z.object({ refresh: z.string().min(1).optional(), sucursalId: z.uuid() }))
    .errors({
      SIN_ACCESO: { status: 403, message: 'No tenés acceso a esa sucursal' },
      REFRESCO_INVALIDO: { status: 401, message: 'La sesión expiró o fue cerrada' },
    })
    .output(sesionSalida),

  yo: conSesion
    .route({
      method: 'GET',
      path: '/auth/yo',
      tags: [TAG],
      operationId: 'sesionActual',
      summary: 'Datos de la sesión actual',
      description: 'Lo mismo que devuelve el inicio de sesión, sin emitir credenciales nuevas.',
    })
    .output(sesionSalida.omit({ access: true, refresh: true, expiraEn: true })),

  leerAvisos: conSesion
    .route({
      method: 'POST',
      path: '/auth/avisos/leidos',
      tags: [TAG],
      operationId: 'marcarAvisosLeidos',
      summary: 'Marcar avisos como leídos',
      description: 'Sólo los propios: los de otro usuario se ignoran.',
    })
    .input(z.object({ ids: z.array(z.uuid()).min(1) }))
    .output(z.object({ leidos: z.number().int() })),
}
