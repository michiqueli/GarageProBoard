import {
  CONDICIONES_UNIDAD,
  ESTADOS_RESERVA,
  ESTADOS_UNIDAD,
  MAXIMO_DIAS_RESERVA,
  MAXIMO_MOTIVO_CARTERA,
  MINIMO_MOTIVO_CARTERA,
  MODOS_RESERVA,
  MONEDAS_UNIDAD,
  ORIGENES_UNIDAD,
  TENENCIAS_UNIDAD,
  TRASLADOS_ENTRE_EMPRESAS,
} from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { importe, paginado } from './comunes.ts'

const TAG = 'Stock de unidades'

const persona = z.object({ id: z.uuid(), nombre: z.string() })
const moneda = z.enum(MONEDAS_UNIDAD)

export const configCartera = z.object({
  trasladoEntreEmpresas: z.enum(TRASLADOS_ENTRE_EMPRESAS),
  reservaModo: z.enum(MODOS_RESERVA),
  reservaDias: z.number().int().min(1).max(MAXIMO_DIAS_RESERVA).nullable(),
  reservaExigeSena: z.boolean(),
  tenenciaUsado: z.enum(TENENCIAS_UNIDAD),
  moneda,
})

const reservaVigente = z.object({
  id: z.uuid(),
  cliente: persona,
  sena: z.string().nullable(),
  moneda,
  vence: z.iso.date().nullable(),
})

export const unidadResumen = z.object({
  id: z.uuid(),
  condicion: z.enum(CONDICIONES_UNIDAD),
  tenencia: z.enum(TENENCIAS_UNIDAD),
  origen: z.enum(ORIGENES_UNIDAD),
  estado: z.enum(ESTADOS_UNIDAD),
  vehiculo: z.object({
    id: z.uuid(),
    dominio: z.string().nullable(),
    chasis: z.string(),
    marca: z.string().nullable(),
    modelo: z.string().nullable(),
    anio: z.number().int().nullable(),
    color: z.string().nullable(),
  }),
  empresa: persona.nullable(),
  consignante: persona.nullable(),
  sucursal: persona,
  precio: z.string().nullable(),
  moneda,
  fechaIngreso: z.iso.date(),
  diasEnStock: z.number().int(),
  /** Las vigentes. Puede haber más de una si la concesionaria no las traba. */
  reservas: z.array(reservaVigente),
})

export const unidadFicha = unidadResumen.extend({
  observaciones: z.string().nullable(),
  retiroMotivo: z.string().nullable(),
  historialReservas: z.array(
    z.object({
      id: z.uuid(),
      cliente: persona,
      estado: z.enum(ESTADOS_RESERVA),
      sena: z.string().nullable(),
      moneda,
      vence: z.iso.date().nullable(),
      nota: z.string().nullable(),
      cierreMotivo: z.string().nullable(),
      creadoEn: z.iso.datetime(),
    }),
  ),
  movimientos: z.array(
    z.object({
      id: z.uuid(),
      tipo: z.string(),
      detalle: z.string(),
      comprobante: z.string().nullable(),
      creadoEn: z.iso.datetime(),
      autor: z.string().nullable(),
    }),
  ),
})

const motivo = z
  .string()
  .trim()
  .min(MINIMO_MOTIVO_CARTERA, 'Decí por qué: queda escrito')
  .max(MAXIMO_MOTIVO_CARTERA, `Es largo: hasta ${MAXIMO_MOTIVO_CARTERA} letras`)
const nota = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v || null)
const precio = importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo').nullish()
const conId = z.object({ id: z.uuid() })

const NO_ENCONTRADA = { NO_ENCONTRADA: { status: 404, message: 'Esa unidad no existe' } } as const
const ESTADO_INVALIDO = {
  ESTADO_INVALIDO: {
    status: 409,
    message: 'La unidad ya no está en stock',
  },
} as const

/** El stock de unidades. Ver `docs/tecnicos/ventas-de-unidades.md`. */
export const contratoCartera = {
  config: conPermiso('cartera', 'ver', 'Unidad')
    .route({
      method: 'GET',
      path: '/stock/configuracion',
      tags: [TAG],
      operationId: 'configuracionDeStock',
      summary: 'Cómo trabaja el stock esta concesionaria',
    })
    .output(configCartera),

  guardarConfig: conPermiso('cartera', 'configurar', 'Unidad')
    .route({
      method: 'PUT',
      path: '/stock/configuracion',
      tags: [TAG],
      operationId: 'guardarConfiguracionDeStock',
      summary: 'Elegir cómo trabaja el stock',
    })
    .input(configCartera)
    .output(configCartera),

  listar: conPermiso('cartera', 'ver', 'Unidad')
    .route({
      method: 'GET',
      path: '/stock',
      tags: [TAG],
      operationId: 'listarUnidades',
      summary: 'Las unidades, de todas las sucursales',
      description: 'Por omisión, las que están en stock: disponibles y reservadas.',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        estado: z.enum([...ESTADOS_UNIDAD, 'en_stock', 'todas']).default('en_stock'),
        condicion: z.enum(CONDICIONES_UNIDAD).optional(),
        tenencia: z.enum(TENENCIAS_UNIDAD).optional(),
        sucursalId: z.uuid().optional(),
      }),
    )
    .output(z.object({ datos: z.array(unidadResumen), total: z.number().int() })),

  ficha: conPermiso('cartera', 'ver', 'Unidad')
    .route({
      method: 'GET',
      path: '/stock/{id}',
      tags: [TAG],
      operationId: 'fichaUnidad',
      summary: 'Una unidad, con sus reservas y su historia',
    })
    .input(conId)
    .errors(NO_ENCONTRADA)
    .output(unidadFicha),

  ingresar: conPermiso('cartera', 'crear', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock',
      tags: [TAG],
      operationId: 'ingresarUnidad',
      summary: 'Ingresar una unidad al stock',
      successStatus: 201,
      description:
        'Una propia queda a nombre de la razón social que se indique o, si no, la de la ' +
        'sucursal donde entra. Una en consignación lleva su consignante.',
    })
    .input(
      z
        .object({
          vehiculoId: z.uuid(),
          condicion: z.enum(CONDICIONES_UNIDAD),
          tenencia: z.enum(TENENCIAS_UNIDAD),
          origen: z.enum(ORIGENES_UNIDAD),
          empresaId: z.uuid().nullish(),
          consignanteId: z.uuid().nullish(),
          sucursalId: z.uuid().nullish(),
          precio,
          moneda: moneda.optional(),
          fechaIngreso: z.iso.date().nullish(),
          observaciones: nota,
        })
        .refine((d) => d.tenencia !== 'consignacion' || d.consignanteId, {
          path: ['consignanteId'],
          message: 'Falta de quién es la unidad',
        }),
    )
    .errors({
      YA_EN_STOCK: { status: 409, message: 'Ese vehículo ya está en stock' },
      DATO_INVALIDO: {
        status: 422,
        message: 'El vehículo, la razón social, la sucursal o el consignante no existen',
      },
    })
    .output(unidadFicha),

  editar: conPermiso('cartera', 'editar', 'Unidad')
    .route({
      method: 'PUT',
      path: '/stock/{id}',
      tags: [TAG],
      operationId: 'editarUnidad',
      summary: 'Cambiar el precio o las observaciones',
    })
    .input(conId.extend({ precio, moneda, observaciones: nota }))
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(unidadFicha),

  trasladar: conPermiso('cartera', 'editar', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/traslado',
      tags: [TAG],
      operationId: 'trasladarUnidad',
      summary: 'Mover la unidad a otra sucursal',
      description:
        'Entre razones sociales distintas, según la configuración: cambia sólo la ubicación, ' +
        'o cambia la dueña y pide el comprobante.',
    })
    .input(
      conId.extend({
        sucursalId: z.uuid(),
        comprobante: z
          .string()
          .trim()
          .max(60)
          .nullish()
          .transform((v) => v || null),
        nota,
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      SUCURSAL_INVALIDA: { status: 422, message: 'Elegí otra sucursal' },
      FALTA_COMPROBANTE: {
        status: 422,
        message: 'Entre razones sociales distintas hace falta el número de comprobante',
      },
    })
    .output(unidadFicha),

  reservar: conPermiso('cartera', 'editar', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/reservas',
      tags: [TAG],
      operationId: 'reservarUnidad',
      summary: 'Reservar la unidad para un cliente',
      description:
        'Si las reservas traban y ya hay una, se rechaza. Pasarla por encima pide la acción ' +
        '`autorizar` y un motivo.',
      successStatus: 201,
    })
    .input(
      conId.extend({
        clienteId: z.uuid(),
        sena: precio,
        moneda: moneda.optional(),
        vence: z.iso.date().nullish(),
        nota,
        pasarPorEncima: motivo.nullish(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      YA_RESERVADA: {
        status: 409,
        message: 'Esa unidad ya está reservada',
        data: z.object({ cliente: z.string(), vence: z.iso.date().nullable() }),
      },
      SIN_AUTORIZACION: {
        status: 403,
        message: 'Pasar por encima una reserva lo autoriza quien tenga ese permiso',
      },
      FALTA_SENA: { status: 422, message: 'Esta concesionaria pide seña para reservar' },
      CLIENTE_INVALIDO: { status: 422, message: 'Ese cliente no existe' },
    })
    .output(unidadFicha),

  liberar: conPermiso('cartera', 'editar', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/reservas/{reservaId}/liberar',
      tags: [TAG],
      operationId: 'liberarReservaDeUnidad',
      summary: 'Liberar una reserva, con motivo',
    })
    .input(conId.extend({ reservaId: z.uuid(), motivo }))
    .errors({
      ...NO_ENCONTRADA,
      RESERVA_CERRADA: { status: 409, message: 'Esa reserva ya no está vigente' },
    })
    .output(unidadFicha),

  retirar: conPermiso('cartera', 'anular', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/retiro',
      tags: [TAG],
      operationId: 'retirarUnidad',
      summary: 'Sacar la unidad del stock, con motivo',
      description: 'Una consignación devuelta o un error de carga. No se borra.',
    })
    .input(conId.extend({ motivo }))
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      TIENE_RESERVA: { status: 409, message: 'Primero liberá las reservas de la unidad' },
    })
    .output(unidadFicha),
}
