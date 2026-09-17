import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { CODIGOS_ALICUOTA } from './comprobantes.ts'
import { importe, paginado } from './comunes.ts'

const TAG = 'Órdenes de trabajo'

export const ESTADOS_ORDEN = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
  'terminada',
  'facturada',
  'entregada',
  'anulada',
] as const

/** Los que se eligen a mano mientras se trabaja. Terminar, facturar, entregar y anular son acciones. */
export const ESTADOS_EN_TALLER = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
] as const

export const NIVELES_COMBUSTIBLE = ['vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno'] as const
export const TIPOS_ITEM = ['trabajo', 'repuesto'] as const

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullish()

const persona = z.object({ id: z.uuid(), razonSocial: z.string() })

export const ordenResumen = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  estado: z.enum(ESTADOS_ORDEN),
  vehiculo: z.object({
    id: z.uuid(),
    dominio: z.string().nullable(),
    chasis: z.string(),
    marca: z.string().nullable(),
    modelo: z.string().nullable(),
  }),
  titular: persona.nullable(),
  paga: persona.nullable(),
  pedido: z.string(),
  asesor: z.string(),
  mecanico: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
  prometidaPara: z.iso.date().nullable(),
  creadoEn: z.iso.datetime(),
  /** Con IVA: lo que se va a cobrar. */
  total: z.string(),
})

export const itemOrden = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_ITEM),
  /** Si es del catálogo: cargarlo descontó el stock de la sucursal. */
  repuestoId: z.uuid().nullable(),
  codigo: z.string().nullable(),
  descripcion: z.string(),
  cantidad: z.string(),
  precioUnitario: z.string(),
  codigoAlicuota: z.number().int(),
  total: z.string(),
})

export const ordenDetalle = ordenResumen.extend({
  traeNombre: z.string().nullable(),
  traeTelefono: z.string().nullable(),
  kilometraje: z.number().int().nullable(),
  combustible: z.enum(NIVELES_COMBUSTIBLE).nullable(),
  observaciones: z.string().nullable(),
  terminadaEn: z.iso.datetime().nullable(),
  entregadaEn: z.iso.datetime().nullable(),
  items: z.array(itemOrden),
  /** La factura vigente, si ya se facturó. */
  factura: z
    .object({
      id: z.uuid(),
      nombre: z.string(),
      puntoVenta: z.number().int(),
      numero: z.number().int(),
    })
    .nullable(),
})

const datosRecepcion = z.object({
  pagaId: z.uuid().nullish(),
  traeNombre: opcional,
  traeTelefono: opcional,
  kilometraje: z.number().int().min(0, 'Los kilómetros no pueden ser negativos').nullish(),
  combustible: z.enum(NIVELES_COMBUSTIBLE).nullish(),
  pedido: z.string().trim().min(3, 'Anotá qué pide el cliente'),
  observaciones: opcional,
  prometidaPara: z.iso.date().nullish(),
  mecanicoId: z.uuid().nullish(),
})

const itemEntrada = z.object({
  tipo: z.enum(TIPOS_ITEM),
  repuestoId: z.uuid().nullish(),
  codigo: opcional,
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: importe.refine((v) => Number(v) > 0, 'La cantidad tiene que ser mayor a cero'),
  precioUnitario: importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo'),
  codigoAlicuota: z.union(CODIGOS_ALICUOTA.map((c) => z.literal(c))).default(5),
})

const conId = z.object({ id: z.uuid() })
const NO_ENCONTRADA = { NO_ENCONTRADA: { status: 404, message: 'Esa orden no existe' } } as const
const ESTADO_INVALIDO = {
  ESTADO_INVALIDO: {
    status: 409,
    message: 'La orden no está en un estado que permita eso',
    data: z.object({ motivo: z.string() }),
  },
} as const

export const contratoOrdenes = {
  listar: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes',
      tags: [TAG],
      operationId: 'listarOrdenes',
      summary: 'Órdenes de la sucursal activa, las más nuevas primero',
      description:
        'Por omisión, las que están en el taller: todo lo que no está entregado ni anulado.',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        estado: z.enum([...ESTADOS_ORDEN, 'en_taller', 'todas']).default('en_taller'),
      }),
    )
    .output(z.object({ datos: z.array(ordenResumen), total: z.number().int() })),

  personal: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/personal',
      tags: [TAG],
      operationId: 'personalOrdenes',
      summary: 'Quiénes trabajan en la sucursal activa, para asignarles una orden',
    })
    .output(z.object({ datos: z.array(z.object({ id: z.uuid(), nombre: z.string() })) })),

  ficha: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}',
      tags: [TAG],
      operationId: 'fichaOrden',
      summary: 'Una orden, con sus trabajos y repuestos',
    })
    .input(conId)
    .errors(NO_ENCONTRADA)
    .output(ordenDetalle),

  abrir: conPermiso('servicios', 'crear', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes',
      tags: [TAG],
      operationId: 'abrirOrden',
      summary: 'Recibir un vehículo: abrir la orden de trabajo',
      successStatus: 201,
      description:
        'En la sucursal activa, con el número siguiente. El titular sale de la titularidad ' +
        'vigente del vehículo; quien paga es el titular salvo que se diga otro.',
    })
    .input(
      datosRecepcion.extend({
        vehiculoId: z.uuid(),
        items: z.array(itemEntrada).default([]),
      }),
    )
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Ese vehículo, cliente o mecánico no existe' },
      VEHICULO_CON_ORDEN: {
        status: 409,
        message: 'Ese vehículo ya tiene una orden abierta',
        data: z.object({ ordenId: z.uuid(), numero: z.number().int() }),
      },
    })
    .output(ordenDetalle),

  editar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'PUT',
      path: '/ordenes/{id}',
      tags: [TAG],
      operationId: 'editarOrden',
      summary: 'Modificar la recepción, quién paga o el mecánico asignado',
    })
    .input(datosRecepcion.extend({ id: z.uuid() }))
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      NO_ENCONTRADO: { status: 404, message: 'Ese cliente o mecánico no existe' },
    })
    .output(ordenDetalle),

  items: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'PUT',
      path: '/ordenes/{id}/items',
      tags: [TAG],
      operationId: 'itemsOrden',
      summary: 'Los trabajos y repuestos de la orden',
      description:
        'Reemplaza la lista entera: es lo que se ve y se guarda de una. Sólo mientras la orden ' +
        'está en el taller; terminada ya es de caja, y para cambiarla hay que reabrirla.',
    })
    .input(conId.extend({ items: z.array(itemEntrada) }))
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      REPUESTO_INVALIDO: {
        status: 422,
        message: 'Alguno de los repuestos no existe en el catálogo',
      },
    })
    .output(ordenDetalle),

  cambiarEstado: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/estado',
      tags: [TAG],
      operationId: 'cambiarEstadoOrden',
      summary: 'Dónde está el auto: en proceso, esperando repuesto o autorización',
    })
    .input(conId.extend({ estado: z.enum(ESTADOS_EN_TALLER) }))
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ordenDetalle),

  terminar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/terminar',
      tags: [TAG],
      operationId: 'terminarOrden',
      summary: 'Terminar la orden y mandarla a caja',
      description:
        'Pide al menos un trabajo o repuesto: una orden sin nada que cobrar no va a caja.',
    })
    .input(conId)
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      SIN_ITEMS: { status: 422, message: 'La orden no tiene trabajos ni repuestos para cobrar' },
    })
    .output(ordenDetalle),

  reabrir: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/reabrir',
      tags: [TAG],
      operationId: 'reabrirOrden',
      summary: 'Volver a taller una orden terminada que todavía no se facturó',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ordenDetalle),

  entregar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/entregar',
      tags: [TAG],
      operationId: 'entregarOrden',
      summary: 'Entregar el vehículo al cliente',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ordenDetalle),

  anular: conPermiso('servicios', 'anular', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/anular',
      tags: [TAG],
      operationId: 'anularOrden',
      summary: 'Anular una orden que todavía no se facturó',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ordenDetalle),

  pdf: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}/pdf',
      tags: [TAG],
      operationId: 'pdfOrden',
      summary: 'La orden impresa: copia para el taller con el QR, y copia para el cliente',
    })
    .input(conId)
    .errors({
      ...NO_ENCONTRADA,
      SIN_SECRETO_QR: {
        status: 503,
        message: 'El servidor no tiene configurada la firma de los QR. Avisale a soporte',
      },
    })
    .output(z.file()),
}
