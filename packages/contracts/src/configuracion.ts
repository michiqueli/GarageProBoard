import { z } from 'zod'
import { conSesion } from './acceso.ts'
import { configSalida } from './auth.ts'

const TAG = 'Configuración'

/**
 * La configuración personal: el tema, la densidad, cuántas filas se ven y el mapa de teclas.
 *
 * **Va con `conSesion` y no con un permiso**, a diferencia de casi todo el resto del
 * sistema. Es lo propio de cada uno: nadie necesita autorización para cambiarse el tema, y
 * un permiso acá significaría que el gerente le elige las teclas al repuestero. Por el mismo
 * motivo ninguna de estas rutas recibe un id de usuario: el único que se puede tocar es el
 * de la sesión.
 */

export const preferencias = z.object({
  tema: z.enum(['claro', 'oscuro', 'sistema']),
  densidad: z.enum(['compacta', 'comoda']),
  /** Entre 10 y 200, igual que el check de la base. */
  filasPorPagina: z.number().int().min(10).max(200),
  /** `null` vuelve a preguntar la sucursal al entrar, si tiene más de una. */
  sucursalPredeterminadaId: z.uuid().nullable(),
})

export const problemaAtajo = z.object({
  accion: z.string(),
  /** Por qué no se puede, escrito para leer: «El navegador se queda con F11…». */
  motivo: z.string(),
})

export const contratoConfiguracion = {
  guardar: conSesion
    .route({
      method: 'PUT',
      path: '/configuracion',
      tags: [TAG],
      operationId: 'guardarConfiguracion',
      summary: 'Guardar las preferencias propias',
      description:
        'Tema, densidad, filas por página y a qué sucursal entrar. Siempre las del usuario ' +
        'de la sesión.',
    })
    .input(preferencias)
    .errors({
      SUCURSAL_INVALIDA: {
        status: 422,
        message: 'No tenés acceso a esa sucursal',
      },
    })
    .output(configSalida),

  /**
   * El mapa de teclas, **como diferencias**: sólo las acciones en las que el usuario se
   * apartó del valor por omisión.
   *
   * Mandar el mapa completo congelaría en la base las teclas de hoy, y el día que
   * cambiemos una por omisión no le llegaría a nadie. Con `{}` vuelve todo a los valores
   * de fábrica.
   */
  guardarAtajos: conSesion
    .route({
      method: 'PUT',
      path: '/configuracion/atajos',
      tags: [TAG],
      operationId: 'guardarAtajos',
      summary: 'Guardar el mapa de teclas propio',
      description:
        'Recibe sólo lo que difiere del valor por omisión. Un objeto vacío restaura el mapa ' +
        'de fábrica.',
    })
    .input(z.object({ atajos: z.record(z.string(), z.string()) }))
    .errors({
      ATAJOS_INVALIDOS: {
        status: 422,
        message: 'Alguna tecla no se puede usar',
        data: z.object({ problemas: z.array(problemaAtajo) }),
      },
    })
    /** El mapa completo ya resuelto, para que el front no tenga que recomponerlo. */
    .output(z.object({ atajos: z.record(z.string(), z.string()) })),
}
