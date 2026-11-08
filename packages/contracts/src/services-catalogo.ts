import { COLUMNAS_IMPORTACION, MAXIMO_FILAS_IMPORTACION } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { importe, paginado } from './comunes.ts'
import { CODIGOS_ALICUOTA } from './comprobantes.ts'

const TAG = 'Taller'

export const serviceResumen = z.object({
  id: z.uuid(),
  /** Sin marca es genérico: se ofrece para cualquier auto. */
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  nombre: z.string(),
  kilometros: z.number().int().nullable(),
  activo: z.boolean(),
  trabajos: z.number().int(),
  repuestos: z.number().int(),
  /** La suma de los trabajos que tienen tiempo. */
  minutos: z.number().int(),
})

const tipo = z.enum(['trabajo', 'repuesto'])

export const renglonService = z.object({
  id: z.uuid(),
  tipo,
  repuestoId: z.uuid().nullable(),
  codigo: z.string().nullable(),
  descripcion: z.string(),
  cantidad: z.string(),
  /** De una pieza del catálogo de repuestos, el precio de hoy. */
  precioUnitario: z.string(),
  codigoAlicuota: z.number().int(),
  minutos: z.number().int().nullable(),
})

export const serviceFicha = serviceResumen.extend({ renglones: z.array(renglonService) })

const opcional = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((v) => v || null)

const renglonEntrada = z
  .object({
    tipo,
    repuestoId: z.uuid().nullish(),
    codigo: z.string().trim().max(40).nullish(),
    descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
    cantidad: importe.refine((v) => Number(v) > 0, 'La cantidad tiene que ser mayor a cero'),
    precioUnitario: importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo'),
    codigoAlicuota: z.union(CODIGOS_ALICUOTA.map((c) => z.literal(c))).default(5),
    minutos: z.number().int().min(0).max(6000).nullish(),
  })
  .refine((r) => r.tipo === 'trabajo' || r.minutos == null, {
    path: ['minutos'],
    message: 'Los minutos van en los trabajos',
  })

const datosService = z.object({
  marca: opcional,
  modelo: opcional,
  nombre: z.string().trim().min(1, 'Falta el nombre: «Service 10.000 km»').max(120),
  kilometros: z.number().int().min(0).nullish(),
  renglones: z.array(renglonEntrada).min(1, 'Un service necesita al menos un renglón').max(200),
})

const fila = z.object(
  Object.fromEntries(COLUMNAS_IMPORTACION.map((c) => [c, z.string().max(600)])) as Record<
    (typeof COLUMNAS_IMPORTACION)[number],
    z.ZodString
  >,
)

const filas = z
  .array(fila)
  .min(1, 'El archivo no tiene filas')
  .max(MAXIMO_FILAS_IMPORTACION, `Son más de ${MAXIMO_FILAS_IMPORTACION} filas: partilo en dos`)

const problemas = z.partialRecord(z.enum(COLUMNAS_IMPORTACION), z.string())

const REPUESTO_INVALIDO = {
  REPUESTO_INVALIDO: { status: 422, message: 'Alguno de esos repuestos no existe' },
} as const
const DUPLICADO = {
  DUPLICADO: {
    status: 409,
    message: 'Ya hay un service con esa marca, ese modelo y ese nombre',
  },
} as const
const NO_ENCONTRADO = { NO_ENCONTRADO: { status: 404, message: 'Ese service no existe' } } as const

/**
 * El catálogo de services del taller: se carga a mano o se importa de una planilla, y se aplica a
 * una orden. Ver `docs/tecnicos/catalogo-de-services.md`.
 */
export const contratoServices = {
  listar: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/taller/services',
      tags: [TAG],
      operationId: 'listarServices',
      summary: 'Los services del catálogo',
      description:
        'Con `marca`, los de esa marca y los genéricos: es lo que se le ofrece a una orden.',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        marca: z.string().trim().max(60).optional(),
        estado: z.enum(['activos', 'todos']).default('activos'),
      }),
    )
    .output(z.object({ datos: z.array(serviceResumen), total: z.number().int() })),

  ficha: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/taller/services/{id}',
      tags: [TAG],
      operationId: 'fichaService',
      summary: 'Un service, con sus renglones',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ENCONTRADO)
    .output(serviceFicha),

  crear: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/taller/services',
      tags: [TAG],
      operationId: 'crearService',
      summary: 'Cargar un service a mano',
      successStatus: 201,
    })
    .input(datosService)
    .errors({ ...DUPLICADO, ...REPUESTO_INVALIDO })
    .output(serviceFicha),

  editar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'PUT',
      path: '/taller/services/{id}',
      tags: [TAG],
      operationId: 'editarService',
      summary: 'Modificar un service, apagarlo o volver a prenderlo',
      description: 'Las órdenes que ya lo usaron copiaron sus renglones: no cambian.',
    })
    .input(datosService.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors({ ...NO_ENCONTRADO, ...DUPLICADO, ...REPUESTO_INVALIDO })
    .output(serviceFicha),

  previsualizar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/taller/services/previsualizar',
      tags: [TAG],
      operationId: 'previsualizarImportacionDeServices',
      summary: 'Qué pasaría si se importan estas filas, sin guardar nada',
      description:
        'Por fila, en el mismo orden: los errores, que frenan la importación, y los avisos, que ' +
        'no. Y por service, si es nuevo o reemplaza a uno que ya estaba.',
    })
    .input(z.object({ filas }))
    .output(
      z.object({
        filas: z.array(z.object({ errores: problemas, avisos: problemas })),
        services: z.array(
          z.object({
            marca: z.string().nullable(),
            modelo: z.string().nullable(),
            nombre: z.string(),
            accion: z.enum(['nuevo', 'reemplaza']),
            trabajos: z.number().int(),
            repuestos: z.number().int(),
            minutos: z.number().int(),
          }),
        ),
      }),
    ),

  importar: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/taller/services/importar',
      tags: [TAG],
      operationId: 'importarServices',
      summary: 'Importar las filas: todas o ninguna',
      description:
        'Vuelve a validar. Un service que ya estaba se reemplaza entero y queda prendido. Las ' +
        'órdenes que lo usaron no cambian.',
    })
    .input(z.object({ filas }))
    .errors({
      FILAS_INVALIDAS: {
        status: 422,
        message: 'Hay filas con errores: corregilas y volvé a importar',
      },
    })
    .output(z.object({ creados: z.number().int(), reemplazados: z.number().int() })),
}
