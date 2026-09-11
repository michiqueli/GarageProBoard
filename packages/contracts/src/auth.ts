import { oc } from '@orpc/contract'
import { z } from 'zod'

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
  /** Cadena opaca, de vida larga y **de un solo uso**: cada refresco emite otra. */
  refresh: z.string(),

  usuario: usuarioSalida,
  tenant: z.object({ id: z.uuid(), nombre: z.string(), slug: z.string() }),
  sucursalActiva: sucursalSalida,
  sucursales: z.array(sucursalSalida),

  /** Reglas de CASL, ya resueltas contra este usuario. */
  habilidades: z.array(z.unknown()),
  /** Sólo aquello en lo que el usuario se apartó del valor por omisión. */
  atajos: z.record(z.string(), z.string()),
  config: configSalida,
})

export const contratoAuth = {
  iniciar: oc
    .route({ method: 'POST', path: '/auth/iniciar', summary: 'Iniciar sesión' })
    .input(
      z.object({
        /**
         * En producción sale del subdominio (`litoral.garagetick.com`) y el usuario
         * nunca lo escribe. Viaja en el cuerpo para que también funcione en
         * desarrollo y desde una app mobile, donde no hay subdominio del que leerlo.
         */
        tenant: z.string().min(1),
        email: z.email(),
        password: z.string().min(1),
        sucursalId: z.uuid().optional(),
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

  refrescar: oc
    .route({ method: 'POST', path: '/auth/refrescar', summary: 'Renovar la sesión' })
    .input(z.object({ refresh: z.string().min(1) }))
    .errors({
      REFRESCO_INVALIDO: { status: 401, message: 'La sesión expiró o fue cerrada' },
    })
    .output(sesionSalida),

  cerrar: oc
    .route({ method: 'POST', path: '/auth/cerrar', summary: 'Cerrar sesión' })
    .input(z.object({ refresh: z.string().min(1) }))
    .output(z.object({ cerrada: z.boolean() })),

  cambiarSucursal: oc
    .route({ method: 'POST', path: '/auth/sucursal', summary: 'Cambiar de sucursal' })
    .input(z.object({ refresh: z.string().min(1), sucursalId: z.uuid() }))
    .errors({
      SIN_ACCESO: { status: 403, message: 'No tenés acceso a esa sucursal' },
      REFRESCO_INVALIDO: { status: 401, message: 'La sesión expiró o fue cerrada' },
    })
    .output(sesionSalida),

  yo: oc
    .route({ method: 'GET', path: '/auth/yo', summary: 'Datos de la sesión actual' })
    .errors({ NO_AUTENTICADO: { status: 401, message: 'Falta iniciar sesión' } })
    .output(sesionSalida.omit({ access: true, refresh: true, expiraEn: true })),
}
