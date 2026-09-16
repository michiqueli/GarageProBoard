import { MODULOS } from '@gpb/core'
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { cuit } from './comunes.ts'

/**
 * El contrato del back-office: lo que usamos nosotros para dar de alta concesionarias y
 * manejar lo que contrataron.
 *
 * Vive en un archivo y una entrada del paquete aparte (`@gpb/contracts/backoffice`)
 * y **no** adentro de `contrato`: la aplicación de los clientes no tiene por qué cargar,
 * ni siquiera en tipos, las rutas que apagan concesionarias.
 *
 * El acceso se declara igual que en el contrato principal, pero con otro vocabulario:
 * acá no hay permisos ni módulos, hay operadores. Cerrado por omisión — una ruta sin
 * declarar no deja arrancar el back-office.
 */

export type AccesoBackoffice = 'publico' | 'operador'

export interface MetaBackoffice {
  acceso?: AccesoBackoffice
}

const base = oc.$meta<MetaBackoffice>({})

const publico = base.meta({ acceso: 'publico' })

const conOperador = base.meta({ acceso: 'operador' }).errors({
  NO_AUTENTICADO: { status: 401, message: 'Falta iniciar sesión' },
})

export interface RutaBackoffice {
  '~orpc': { meta: MetaBackoffice; route?: { method?: string; path?: string } }
}

/** Quién puede usar esta ruta. Revienta si no lo declara, igual que `accesoDeRuta`. */
export function accesoDeRutaBackoffice(ruta: RutaBackoffice): AccesoBackoffice {
  const acceso = ruta['~orpc'].meta.acceso
  if (acceso === undefined) {
    const { method, path } = ruta['~orpc'].route ?? {}
    throw new Error(
      `La ruta ${`${method ?? ''} ${path ?? ''}`.trim()} del back-office no declara quién puede usarla.`,
    )
  }
  return acceso
}

const TAG_SESION = 'Sesión'
const TAG_CONCESIONARIAS = 'Concesionarias'

export const operadorSalida = z.object({
  id: z.uuid(),
  email: z.string(),
  nombre: z.string(),
})

export const modulo = z.enum(MODULOS)

/** Una fila de `tenant_modulo`, con la cuenta de si hoy está prendido ya hecha. */
export const contratoModulo = z.object({
  modulo,
  activo: z.boolean(),
  vigenteDesde: z.iso.datetime(),
  vigenteHasta: z.iso.datetime().nullable(),
  /** La llave puesta y el período corriendo. Es lo que ve la concesionaria. */
  vigente: z.boolean(),
})

export const concesionariaResumen = z.object({
  id: z.uuid(),
  nombre: z.string(),
  slug: z.string(),
  activo: z.boolean(),
  creadoEn: z.iso.datetime(),
  /** Los que tiene prendidos hoy. */
  modulos: z.array(modulo),
})

export const movimiento = z.object({
  fecha: z.iso.datetime(),
  operador: z.string(),
  accion: z.string(),
  motivo: z.string().nullable(),
})

export const concesionariaDetalle = concesionariaResumen.extend({
  /** Todos los módulos del catálogo, contratados o no: los que no, con `null`. */
  contratos: z.array(z.object({ modulo, contrato: contratoModulo.nullable() })),
  /** Lo último que le hicimos, lo más nuevo primero. */
  historial: z.array(movimiento),
})

/**
 * Por qué se rechaza un cambio: «Servicios necesita Núcleo». Se devuelven todos juntos
 * para que quien opera arregle todo de una vez y no de a uno por intento.
 */
const errorDependencias = z.object({ motivos: z.array(z.string()) })

const ERRORES_DEPENDENCIAS = {
  DEPENDENCIAS_ROTAS: {
    status: 422,
    message: 'La combinación de módulos deja a alguno sin algo que necesita',
    data: errorDependencias,
  },
} as const

const NO_ENCONTRADA = {
  NO_ENCONTRADA: { status: 404, message: 'No existe esa concesionaria' },
} as const

/**
 * Por qué se hizo. Obligatorio en todo lo que cambia una concesionaria: dentro de un año,
 * «¿por qué le apagamos contable?» tiene que tener respuesta sin preguntarle a nadie.
 */
const motivo = z.string().trim().min(3, 'Escribí por qué')

export const contratoBackoffice = {
  auth: {
    iniciar: publico
      .route({
        method: 'POST',
        path: '/auth/iniciar',
        tags: [TAG_SESION],
        operationId: 'iniciarSesionOperador',
        summary: 'Iniciar sesión como operador',
      })
      .input(z.object({ email: z.email(), password: z.string().min(1) }))
      .errors({
        CREDENCIALES_INVALIDAS: {
          status: 401,
          message: 'El correo o la contraseña no son correctos',
        },
      })
      .output(operadorSalida),

    cerrar: publico
      .route({
        method: 'POST',
        path: '/auth/cerrar',
        tags: [TAG_SESION],
        operationId: 'cerrarSesionOperador',
        summary: 'Cerrar sesión',
      })
      .output(z.object({ cerrada: z.boolean() })),

    yo: conOperador
      .route({
        method: 'GET',
        path: '/auth/yo',
        tags: [TAG_SESION],
        operationId: 'operadorActual',
        summary: 'Quién está operando',
      })
      .output(operadorSalida),
  },

  concesionarias: {
    listar: conOperador
      .route({
        method: 'GET',
        path: '/concesionarias',
        tags: [TAG_CONCESIONARIAS],
        operationId: 'listarConcesionarias',
        summary: 'Todas las concesionarias, con sus módulos prendidos',
      })
      .output(z.object({ datos: z.array(concesionariaResumen) })),

    ver: conOperador
      .route({
        method: 'GET',
        path: '/concesionarias/{id}',
        tags: [TAG_CONCESIONARIAS],
        operationId: 'verConcesionaria',
        summary: 'Una concesionaria, con sus contratos y su historial',
      })
      .input(z.object({ id: z.uuid() }))
      .errors(NO_ENCONTRADA)
      .output(concesionariaDetalle),

    crear: conOperador
      .route({
        method: 'POST',
        path: '/concesionarias',
        tags: [TAG_CONCESIONARIAS],
        operationId: 'crearConcesionaria',
        summary: 'Alta de una concesionaria',
        successStatus: 201,
        description:
          'Crea la concesionaria con sus módulos, su primera razón social y sucursal, los ' +
          'roles predefinidos y su gerente. Todo o nada: si algo falla, no queda nada a medias.',
      })
      .input(
        z.object({
          nombre: z.string().trim().min(2),
          /** Para subdominios y URLs: minúsculas, números y guiones. */
          slug: z
            .string()
            .regex(
              /^[a-z0-9]+(-[a-z0-9]+)*$/,
              'Minúsculas, números y guiones: automotores-litoral',
            ),
          modulos: z.array(modulo).min(1, 'Elegí al menos un módulo'),
          empresa: z.object({
            razonSocial: z.string().trim().min(2),
            cuit,
            condicionIva: z.number().int(),
          }),
          sucursal: z.string().trim().min(2),
          gerente: z.object({
            email: z.email(),
            nombre: z.string().trim().min(1),
            apellido: z.string().trim().min(1),
          }),
        }),
      )
      .errors({
        ...ERRORES_DEPENDENCIAS,
        SLUG_DUPLICADO: { status: 409, message: 'Ya hay una concesionaria con ese identificador' },
        EMAIL_DUPLICADO: { status: 409, message: 'Ese correo ya es de un usuario del sistema' },
        CONDICION_IVA_DESCONOCIDA: {
          status: 422,
          message: 'Esa condición frente al IVA no está en el catálogo de AFIP',
        },
      })
      .output(
        z.object({
          concesionaria: concesionariaResumen,
          /**
           * La contraseña del gerente, generada acá y devuelta **una sola vez**: no se
           * guarda en ningún lado más que como hash. Se le pasa al cliente por un canal
           * aparte.
           */
          passwordInicial: z.string(),
        }),
      ),

    cambiarEstado: conOperador
      .route({
        method: 'POST',
        path: '/concesionarias/{id}/estado',
        tags: [TAG_CONCESIONARIAS],
        operationId: 'cambiarEstadoConcesionaria',
        summary: 'Suspender o rehabilitar una concesionaria entera',
        description:
          'Suspendida, nadie de la concesionaria entra ni sigue trabajando: las sesiones ' +
          'abiertas caen en el próximo pedido. Los datos quedan intactos.',
      })
      .input(z.object({ id: z.uuid(), activo: z.boolean(), motivo }))
      .errors(NO_ENCONTRADA)
      .output(concesionariaResumen),

    cambiarModulo: conOperador
      .route({
        method: 'PUT',
        path: '/concesionarias/{id}/modulos/{modulo}',
        tags: [TAG_CONCESIONARIAS],
        operationId: 'cambiarModuloConcesionaria',
        summary: 'Prender, apagar o cambiar la vigencia de un módulo',
        description:
          'Apagar un módulo del que dependen otros prendidos se rechaza, salvo que se pida ' +
          'apagarDependientes: entonces se apagan todos juntos. Prender uno sin lo que ' +
          'necesita se rechaza siempre.',
      })
      .input(
        z.object({
          id: z.uuid(),
          modulo,
          activo: z.boolean(),
          /** Sin fecha, no vence. */
          vigenteHasta: z.iso.datetime().nullable(),
          motivo,
          /**
           * Al apagar, apagar también los módulos prendidos que dependen de éste. Tiene que
           * pedirse: apagar el núcleo apaga la concesionaria entera, y eso no puede pasar
           * por una llamada que no sabía lo que arrastraba.
           */
          apagarDependientes: z.boolean().default(false),
        }),
      )
      .errors({
        ...NO_ENCONTRADA,
        ...ERRORES_DEPENDENCIAS,
        VIGENCIA_INVALIDA: {
          status: 422,
          message: 'El vencimiento tiene que ser posterior al inicio del contrato',
        },
      })
      .output(concesionariaDetalle),
  },
}

export type ContratoBackoffice = typeof contratoBackoffice
