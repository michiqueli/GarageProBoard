import {
  ACCIONES_PERMISO,
  type AccionPermiso,
  type Habilidades,
  MODULOS,
  type Modulo,
  SUJETOS,
  type Sujeto,
} from '@garagepro/core'
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
 * - `{ modulo, accion, sujeto }`: el módulo que la concesionaria tiene que tener
 *   contratado y el permiso de CASL que habilita la operación. Van juntos porque toda
 *   operación con permiso es de algún módulo: declararla sin módulo no compila.
 *
 * Una ruta sin acceso declarado no deja arrancar la API: cerrado por omisión, como el
 * resto del sistema.
 */
export type Acceso =
  | 'publico'
  | 'sesion'
  | { modulo: Modulo; accion: AccionPermiso; sujeto: Sujeto }

export interface MetaRuta {
  acceso?: Acceso
}

const base = oc.$meta<MetaRuta>({})

const ERRORES_DE_SESION = {
  NO_AUTENTICADO: { status: 401, message: 'Falta iniciar sesión' },
} as const

export const errorModuloApagado = z.object({ modulo: z.enum(MODULOS) })

export const errorSinPermiso = z.object({
  accion: z.enum(ACCIONES_PERMISO),
  sujeto: z.enum(SUJETOS),
})

/** Rutas que se usan sin sesión. */
export const publico = base.meta({ acceso: 'publico' })

/** Rutas que sólo piden estar adentro, sin un permiso en particular. */
export const conSesion = base.meta({ acceso: 'sesion' }).errors(ERRORES_DE_SESION)

/**
 * Rutas de un módulo que piden un permiso. Los dos 403 quedan documentados junto con el
 * 401, y son dos códigos distintos a propósito: a quien no tiene el módulo no hay
 * permiso que le sirva, y el mensaje no puede mandarlo a pedir uno.
 */
export function conPermiso(modulo: Modulo, accion: AccionPermiso, sujeto: Sujeto) {
  return base.meta({ acceso: { modulo, accion, sujeto } }).errors({
    ...ERRORES_DE_SESION,
    MODULO_APAGADO: {
      status: 403,
      message: 'Esta función no está habilitada para la concesionaria',
      data: errorModuloApagado,
    },
    SIN_PERMISO: {
      status: 403,
      message: 'Tu usuario no tiene permiso para esta operación',
      data: errorSinPermiso,
    },
  })
}

/** Una regla de CASL tal como viaja: la guarda el rol y la evalúan los dos lados. */
export const reglaPermiso = z.object({
  action: z.union([z.enum(ACCIONES_PERMISO), z.array(z.enum(ACCIONES_PERMISO))]),
  subject: z.union([z.enum(SUJETOS), z.array(z.enum(SUJETOS))]),
  conditions: z.record(z.string(), z.unknown()).optional(),
  fields: z.array(z.string()).optional(),
  inverted: z.boolean().optional(),
  reason: z.string().optional(),
})

/**
 * La forma interna de una ruta del contrato.
 *
 * Leerla es meter la mano adentro de oRPC, así que se hace **una sola vez, acá**: la
 * API y el front piden el acceso con las funciones de abajo y no saben que existe
 * un `~orpc`.
 */
export interface RutaDelContrato {
  '~orpc': { meta: MetaRuta; route?: { method?: string; path?: string } }
}

/**
 * Quién puede usar esta ruta, según su propia declaración.
 *
 * Revienta si la ruta no lo declara, y eso es lo que mantiene el sistema **cerrado por
 * omisión**: la API no llega a arrancar con una ruta así, y la pantalla que la use
 * tampoco se dibuja. Devolver `undefined` obligaría a cada quien a decidir qué hacer con
 * ese caso, y alguna vez alguien iba a decidir «dejala pasar».
 */
export function accesoDeRuta(ruta: RutaDelContrato): Acceso {
  const acceso = ruta['~orpc'].meta.acceso
  if (acceso === undefined) {
    throw new Error(
      `La ruta ${nombreDeRuta(ruta)} no declara quién puede usarla. ` +
        'Armala con publico, conSesion o conPermiso() de @garagepro/contracts.',
    )
  }
  return acceso
}

/** «POST /vehiculos», para que un error diga de qué ruta está hablando. */
export function nombreDeRuta(ruta: RutaDelContrato): string {
  const { method, path } = ruta['~orpc'].route ?? {}
  return `${method ?? ''} ${path ?? ''}`.trim()
}

/** Lo que una sesión trae para decidir: qué contrató la concesionaria y qué puede la persona. */
export interface Autorizacion {
  modulos: readonly Modulo[]
  habilidades: Habilidades
}

/**
 * Por qué sí o por qué no. Los dos «no» se muestran distinto y por eso no es un booleano:
 * al que le falta el módulo no se le habla de permisos.
 */
export type Veredicto = 'permitido' | 'modulo-apagado' | 'sin-permiso'

/**
 * Qué pasa con un acceso declarado, para esta sesión.
 *
 * Es **la misma función de los dos lados**: la API la usa para decidir si ejecuta la
 * operación y el front para decidir si dibuja el botón. Dos implementaciones de la
 * misma regla se desincronizan, y el síntoma es un botón que al apretarlo contesta
 * «no tenés permiso».
 *
 * **Primero el módulo, después el permiso.** El gerente puede todo, pero no puede
 * facturar en una concesionaria que no contrató contable.
 *
 * Da por hecho que hay sesión: `publico` y `sesion` ya se verificaron antes de llegar
 * acá. Y ocultar no es proteger — el front oculta, la API decide.
 */
export function evaluarAcceso(autorizacion: Autorizacion, acceso: Acceso): Veredicto {
  if (acceso === 'publico' || acceso === 'sesion') return 'permitido'
  if (!autorizacion.modulos.includes(acceso.modulo)) return 'modulo-apagado'
  if (!autorizacion.habilidades.can(acceso.accion, acceso.sujeto)) return 'sin-permiso'
  return 'permitido'
}

/** Si alcanza, sin importar por qué no. Para decidir si se dibuja algo. */
export function permite(autorizacion: Autorizacion, acceso: Acceso): boolean {
  return evaluarAcceso(autorizacion, acceso) === 'permitido'
}
