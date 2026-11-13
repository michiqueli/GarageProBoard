import {
  ESTADOS_VENTA,
  MAXIMO_MOTIVO_CARTERA,
  MEDIOS_PAGO_VENTA,
  MINIMO_MOTIVO_CARTERA,
  MONEDAS_UNIDAD,
  TIPOS_CONCEPTO_VENTA,
} from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { importe, paginado } from './comunes.ts'

const TAG = 'Ventas'
const moneda = z.enum(MONEDAS_UNIDAD)
const persona = z.object({ id: z.uuid(), nombre: z.string() })
const conId = z.object({ id: z.uuid() })
const positivo = importe.refine((v) => Number(v) > 0, 'Tiene que ser mayor a cero')
const motivo = z
  .string()
  .trim()
  .min(MINIMO_MOTIVO_CARTERA, 'Decí por qué: queda escrito')
  .max(MAXIMO_MOTIVO_CARTERA)
const texto = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((v) => v || null)

export const configVentas = z.object({
  descuentoMaximo: z.number().min(0).max(100).nullable(),
  exigeSaldoCero: z.boolean(),
})

export const ventaResumen = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  estado: z.enum(ESTADOS_VENTA),
  unidad: z.object({
    id: z.uuid(),
    nombre: z.string(),
    dominio: z.string().nullable(),
    chasis: z.string(),
  }),
  cliente: persona,
  vendedor: z.string().nullable(),
  sucursal: z.string(),
  fecha: z.iso.date(),
  moneda,
  total: z.string(),
  saldo: z.string(),
})

const concepto = z.object({
  tipo: z.enum(TIPOS_CONCEPTO_VENTA),
  descripcion: z.string(),
  importe: z.string(),
  moneda,
  cotizacion: z.string().nullable(),
})

const pago = z.object({
  medio: z.enum(MEDIOS_PAGO_VENTA),
  importe: z.string(),
  moneda,
  cotizacion: z.string().nullable(),
  detalle: z.string().nullable(),
  entidad: z.string().nullable(),
  cuotas: z.number().int().nullable(),
  unidadUsada: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
  reservaId: z.uuid().nullable(),
})

export const ventaFicha = ventaResumen.extend({
  precio: z.string(),
  observaciones: z.string().nullable(),
  conceptos: z.array(concepto),
  pagos: z.array(pago),
  totales: z.object({
    precio: z.string(),
    gastosCliente: z.string(),
    descuentos: z.string(),
    total: z.string(),
    pagado: z.string(),
    saldo: z.string(),
    descuentoPorcentaje: z.string(),
    sinConvertir: z.number().int(),
    /** Sólo para quien puede ver lo que costó la unidad. */
    rentabilidad: z
      .object({
        costoUnidad: z.string(),
        costosVenta: z.string(),
        margen: z.string(),
        margenPorcentaje: z.string().nullable(),
      })
      .nullable(),
  }),
  /** Si para confirmarla hace falta autorización, por el descuento. */
  requiereAutorizacion: z.boolean(),
  autorizacionMotivo: z.string().nullable(),
  anulacionMotivo: z.string().nullable(),
})

const conceptoEntrada = z.object({
  tipo: z.enum(TIPOS_CONCEPTO_VENTA),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(200),
  importe: positivo,
  moneda,
  cotizacion: positivo.nullish(),
})

const pagoEntrada = z
  .object({
    medio: z.enum(MEDIOS_PAGO_VENTA),
    importe: positivo,
    moneda,
    cotizacion: positivo.nullish(),
    detalle: texto(200),
    entidad: texto(100),
    cuotas: z.number().int().min(1).max(120).nullish(),
    unidadUsadaId: z.uuid().nullish(),
    reservaId: z.uuid().nullish(),
  })
  .refine((p) => p.medio !== 'usado' || p.unidadUsadaId, {
    path: ['unidadUsadaId'],
    message: 'Elegí el usado que entra en parte de pago',
  })

const NO_ENCONTRADA = { NO_ENCONTRADA: { status: 404, message: 'Esa venta no existe' } } as const
const ESTADO_INVALIDO = {
  ESTADO_INVALIDO: { status: 409, message: 'Confirmada ya no se modifica: anulala y hacé otra' },
} as const
const DATO_INVALIDO = {
  DATO_INVALIDO: {
    status: 422,
    message: 'El cliente, el usado o la reserva no existen, o el usado no está en stock',
  },
} as const

/** La operación de venta. Ver `docs/tecnicos/ventas-de-unidades.md`, paso 3. */
export const contratoVentas = {
  config: conPermiso('ventas', 'ver', 'Venta')
    .route({
      method: 'GET',
      path: '/ventas/configuracion',
      tags: [TAG],
      operationId: 'configuracionDeVentas',
      summary: 'Cómo trabaja las ventas esta concesionaria',
    })
    .output(configVentas),

  guardarConfig: conPermiso('ventas', 'configurar', 'Venta')
    .route({
      method: 'PUT',
      path: '/ventas/configuracion',
      tags: [TAG],
      operationId: 'guardarConfiguracionDeVentas',
      summary: 'Elegir cómo trabaja las ventas',
    })
    .input(configVentas)
    .output(configVentas),

  listar: conPermiso('ventas', 'ver', 'Venta')
    .route({
      method: 'GET',
      path: '/ventas',
      tags: [TAG],
      operationId: 'listarVentas',
      summary: 'Las ventas, las más nuevas primero',
      description: 'Por omisión, las vivas: en borrador y confirmadas.',
    })
    .input(
      paginado.extend({
        estado: z.enum([...ESTADOS_VENTA, 'vivas', 'todas']).default('vivas'),
        buscar: z.string().trim().max(60).optional(),
      }),
    )
    .output(z.object({ datos: z.array(ventaResumen), total: z.number().int() })),

  ficha: conPermiso('ventas', 'ver', 'Venta')
    .route({
      method: 'GET',
      path: '/ventas/{id}',
      tags: [TAG],
      operationId: 'fichaVenta',
      summary: 'Una venta, con sus conceptos, sus pagos y lo que deja',
    })
    .input(conId)
    .errors(NO_ENCONTRADA)
    .output(ventaFicha),

  crear: conPermiso('ventas', 'crear', 'Venta')
    .route({
      method: 'POST',
      path: '/ventas',
      tags: [TAG],
      operationId: 'crearVenta',
      summary: 'Empezar la venta de una unidad, en borrador',
      successStatus: 201,
      description:
        'Arranca con el precio de la unidad y, si el comprador la tenía reservada con seña, ' +
        'con esa seña como primer pago.',
    })
    .input(z.object({ unidadId: z.uuid(), clienteId: z.uuid() }))
    .errors({
      ...DATO_INVALIDO,
      UNIDAD_NO_DISPONIBLE: {
        status: 409,
        message: 'Esa unidad no está en stock o ya tiene una venta en curso',
      },
    })
    .output(ventaFicha),

  guardar: conPermiso('ventas', 'editar', 'Venta')
    .route({
      method: 'PUT',
      path: '/ventas/{id}',
      tags: [TAG],
      operationId: 'guardarVenta',
      summary: 'Guardar el borrador entero: precio, conceptos y pagos',
    })
    .input(
      conId.extend({
        clienteId: z.uuid(),
        precio: importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo'),
        moneda,
        observaciones: texto(1000),
        conceptos: z.array(conceptoEntrada).max(50),
        pagos: z.array(pagoEntrada).max(50),
      }),
    )
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO, ...DATO_INVALIDO })
    .output(ventaFicha),

  confirmar: conPermiso('ventas', 'editar', 'Venta')
    .route({
      method: 'POST',
      path: '/ventas/{id}/confirmar',
      tags: [TAG],
      operationId: 'confirmarVenta',
      summary: 'Confirmar la venta: la unidad queda vendida',
      description:
        'Las reservas de la unidad se cierran: la del comprador queda cumplida, las demás ' +
        'liberadas. Pasar el descuento máximo pide la acción `autorizar` y un motivo.',
    })
    .input(conId.extend({ autorizacion: motivo.nullish() }))
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      SALDO_PENDIENTE: {
        status: 409,
        message: 'Esta concesionaria confirma sólo con todo pagado',
        data: z.object({ saldo: z.string() }),
      },
      REQUIERE_AUTORIZACION: {
        status: 409,
        message: 'El descuento pasa el máximo: hace falta autorización',
        data: z.object({ descuento: z.string(), maximo: z.number() }),
      },
      SIN_AUTORIZACION: {
        status: 403,
        message: 'Autorizar un descuento mayor lo hace quien tenga ese permiso',
      },
      RESERVADA_PARA_OTRO: {
        status: 409,
        message: 'La unidad está reservada para otro cliente',
        data: z.object({ cliente: z.string() }),
      },
      UNIDAD_NO_DISPONIBLE: { status: 409, message: 'La unidad ya no está en stock' },
    })
    .output(ventaFicha),

  anular: conPermiso('ventas', 'anular', 'Venta')
    .route({
      method: 'POST',
      path: '/ventas/{id}/anular',
      tags: [TAG],
      operationId: 'anularVenta',
      summary: 'Anular una venta, con motivo',
      description: 'Si estaba confirmada, la unidad vuelve a estar disponible.',
    })
    .input(conId.extend({ motivo }))
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ventaFicha),
}
