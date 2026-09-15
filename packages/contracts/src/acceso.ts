import { ACCIONES_PERMISO, type AccionPermiso, SUJETOS, type Sujeto } from '@garagepro/core'
import { oc } from '@orpc/contract'
import { z } from 'zod'

/**
 * Quién puede llamar a cada ruta, declarado **en el contrato**.
 *
 * Vive acá y no en un decorador de la API por la misma razón que el contrato entero:
 * es una sola declaración que leen tres lados. La API la aplica, el documento OpenAPI
 * la publica con sus 401 y 403, y el front sabe qué botón mostrar sin repetir la regla.
 *
 * - `publico`: sin sesión. El login, el refresco, el chequeo de vida.
 * - `sesion`: alcanza con estar adentro. Datos de la propia sesión.
 * - `{ accion, sujeto }`: el permiso de CASL que habilita la operación.
 *
 * Una ruta sin acceso declarado no deja arrancar la API: cerrado por omisión, como el
 * resto del sistema.
 */
export type Acceso = 'publico' | 'sesion' | { accion: AccionPermiso; sujeto: Sujeto }

export interface MetaRuta {
  acceso?: Acceso
}

const base = oc.$meta<MetaRuta>({})

const ERRORES_DE_SESION = {
  NO_AUTENTICADO: { status: 401, message: 'Falta iniciar sesión' },
} as const

export const errorSinPermiso = z.object({
  accion: z.enum(ACCIONES_PERMISO),
  sujeto: z.enum(SUJETOS),
})

/** Rutas que se usan sin sesión. */
export const publico = base.meta({ acceso: 'publico' })

/** Rutas que sólo piden estar adentro, sin un permiso en particular. */
export const conSesion = base.meta({ acceso: 'sesion' }).errors(ERRORES_DE_SESION)

/** Rutas que piden un permiso: el 403 queda documentado junto con el 401. */
export function conPermiso(accion: AccionPermiso, sujeto: Sujeto) {
  return base.meta({ acceso: { accion, sujeto } }).errors({
    ...ERRORES_DE_SESION,
    SIN_PERMISO: {
      status: 403,
      message: 'Tu usuario no tiene permiso para esta operación',
      data: errorSinPermiso,
    },
  })
}
