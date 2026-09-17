import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { cuit, importe, paginado } from './comunes.ts'

const TAG = 'Comprobantes'

export const ESTADOS_COMPROBANTE = ['emitiendo', 'autorizado', 'rechazado', 'incierto'] as const
export const CODIGOS_ALICUOTA = [3, 4, 5, 6, 8, 9] as const

const fecha = z.iso.date()
const mensajeAfip = z.object({ codigo: z.number().int(), mensaje: z.string() })

export const renglonEntrada = z.object({
  codigo: z.string().trim().max(30).nullish(),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: importe.refine((v) => Number(v) > 0, 'La cantidad tiene que ser mayor a cero'),
  unidad: z.string().trim().max(20).default('unidades'),
  /** Precio final, con IVA. Lo que se le dice al cliente. */
  precioUnitario: importe.refine((v) => Number(v) >= 0, 'El precio no puede ser negativo'),
  bonificacionPorcentaje: importe
    .refine((v) => Number(v) >= 0 && Number(v) < 100, 'La bonificación va de 0 a 99,99%')
    .default('0'),
  codigoAlicuota: z.union(CODIGOS_ALICUOTA.map((c) => z.literal(c))),
})

/**
 * A quién se le factura. Con CUIT se consulta el padrón al emitir, siempre: la condición
 * frente al IVA de un cliente cambia, y la letra de la factura depende de ella.
 */
export const receptorEntrada = z.union([
  z.object({ clienteId: z.uuid() }),
  z.object({ cuit }),
  /** Consumidor final sin cargar como cliente. Nombre y DNI, opcionales. */
  z.object({
    consumidorFinal: z.object({
      nombre: z.string().trim().max(120).nullish(),
      dni: z
        .string()
        .regex(/^[0-9]{7,8}$/, 'El DNI son 7 u 8 números')
        .nullish(),
    }),
  }),
])

export const receptorResuelto = z.object({
  clienteId: z.uuid().nullable(),
  /** 80 CUIT, 86 CUIL, 96 DNI, 99 consumidor final sin identificar. */
  tipoDocReceptor: z.number().int(),
  numeroDocReceptor: z.string(),
  nombre: z.string(),
  condicionIva: z.number().int(),
  domicilio: z.string().nullable(),
  tipoComprobante: z.number().int(),
  letra: z.string(),
  nombreComprobante: z.string(),
  /** Lo que conviene saber antes de confirmar: «AFIP no contestó, se usa la condición guardada». */
  avisos: z.array(z.string()),
})

/** Lo que puede salir mal al resolver el receptor, en la vista previa y al emitir. */
const ERRORES_RECEPTOR = {
  NO_ENCONTRADO: { status: 404, message: 'Ese punto de venta o cliente no existe' },
  SIN_REGLA: {
    status: 422,
    message: 'No hay un comprobante previsto para esa combinación de condiciones frente al IVA',
  },
  CUIT_INEXISTENTE: {
    status: 422,
    message: 'AFIP no tiene ese CUIT en el padrón: revisá los números',
  },
  CUIT_INACTIVO: {
    status: 422,
    message:
      'AFIP informa ese CUIT como inactivo: no se le puede facturar con CUIT. Si corresponde, facturale como consumidor final',
  },
  CONDICION_DESCONOCIDA: {
    status: 422,
    message:
      'AFIP no informa su condición frente al IVA. Cargalo como cliente con su condición y facturale desde ahí',
  },
  PADRON_NO_DISPONIBLE: {
    status: 503,
    message:
      'El padrón de AFIP no contesta y sin él no se sabe qué factura corresponde. Probá en un rato, o cargalo como cliente',
  },
} as const

export const comprobanteResumen = z.object({
  id: z.uuid(),
  estado: z.enum(ESTADOS_COMPROBANTE),
  tipoComprobante: z.number().int(),
  nombre: z.string(),
  letra: z.string(),
  puntoVenta: z.number().int(),
  numero: z.number().int(),
  fecha,
  receptorNombre: z.string(),
  importeTotal: z.string(),
  cae: z.string().nullable(),
  entorno: z.enum(['produccion', 'homologacion']),
  /** Una factura con su nota de crédito. */
  anulado: z.boolean(),
})

const referencia = z.object({
  id: z.uuid(),
  nombre: z.string(),
  puntoVenta: z.number().int(),
  numero: z.number().int(),
})

export const comprobanteDetalle = comprobanteResumen.omit({ anulado: true }).extend({
  /** En una nota de crédito, la factura que anula. */
  comprobanteAsociado: referencia.nullable(),
  /** En una factura, la nota de crédito que la anula. */
  anuladoPor: referencia.nullable(),
  empresa: z.object({ id: z.uuid(), razonSocial: z.string(), cuit: z.string() }),
  concepto: z.number().int(),
  servicio: z.object({ desde: fecha, hasta: fecha, vencimientoPago: fecha }).nullable(),
  clienteId: z.uuid().nullable(),
  tipoDocReceptor: z.number().int(),
  numeroDocReceptor: z.string(),
  receptorCondicionIva: z.number().int(),
  receptorDomicilio: z.string().nullable(),
  condicionVenta: z.string(),
  importeNeto: z.string(),
  importeIva: z.string(),
  importeExento: z.string(),
  alicuotas: z.array(
    z.object({ codigoAlicuota: z.number().int(), baseImponible: z.string(), importe: z.string() }),
  ),
  vencimientoCae: fecha.nullable(),
  observaciones: z.array(mensajeAfip),
  errores: z.array(mensajeAfip),
  renglones: z.array(renglonEntrada.extend({ total: z.string(), codigo: z.string().nullable() })),
  emitidoPor: z.string(),
  creadoEn: z.iso.datetime(),
})

const conId = z.object({ id: z.uuid() })

export const contratoComprobantes = {
  opciones: conPermiso('contable', 'facturar', 'Comprobante')
    .route({
      method: 'GET',
      path: '/facturacion/opciones',
      tags: [TAG],
      operationId: 'opcionesFacturacion',
      summary: 'Con qué se puede facturar desde la sucursal activa',
      description:
        'Los puntos de venta de facturación de la sucursal, de qué razón social son, y si ' +
        'esa razón social tiene un certificado de AFIP vigente.',
    })
    .output(
      z.object({
        puntosVenta: z.array(
          z.object({
            id: z.uuid(),
            numero: z.number().int(),
            predeterminado: z.boolean(),
            empresa: z.object({
              id: z.uuid(),
              razonSocial: z.string(),
              condicionIva: z.number().int(),
            }),
            certificado: z.enum(['vigente', 'vencido', 'falta']),
            entorno: z.enum(['produccion', 'homologacion']).nullable(),
          }),
        ),
      }),
    ),

  receptor: conPermiso('contable', 'facturar', 'Comprobante')
    .route({
      method: 'GET',
      path: '/facturacion/receptor',
      tags: [TAG],
      operationId: 'resolverReceptor',
      summary: 'A quién se le factura y qué comprobante corresponde',
      description:
        'Con CUIT —de un cliente cargado o escrito en el momento— se consulta el padrón de ' +
        'AFIP: la letra sale de la condición que AFIP informa hoy, no de la guardada. Sin ' +
        'cliente ni CUIT es consumidor final. Es lo mismo que resuelve la emisión, para ' +
        'mostrarlo antes de confirmar.',
    })
    .input(
      z.object({
        puntoVentaId: z.uuid(),
        clienteId: z.uuid().optional(),
        cuit: cuit.optional(),
      }),
    )
    .errors(ERRORES_RECEPTOR)
    .output(receptorResuelto),

  emitir: conPermiso('contable', 'facturar', 'Comprobante')
    .route({
      method: 'POST',
      path: '/comprobantes',
      tags: [TAG],
      operationId: 'emitirComprobante',
      summary: 'Emitir una factura con CAE',
      successStatus: 201,
      description:
        'El número se le pide a AFIP. Si AFIP rechaza, el comprobante queda rechazado con los ' +
        'motivos y el número libre. Si AFIP no contesta, queda incierto: hay que verificarlo ' +
        'antes de emitir otro con ese punto de venta.',
    })
    .input(
      z
        .object({
          puntoVentaId: z.uuid(),
          receptor: receptorEntrada,
          concepto: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          servicio: z.object({ desde: fecha, hasta: fecha, vencimientoPago: fecha }).nullish(),
          condicionVenta: z.string().trim().min(1).max(60).default('Contado'),
          renglones: z.array(renglonEntrada).min(1, 'Un comprobante sin renglones no se emite'),
        })
        .refine((d) => d.concepto === 1 || d.servicio, {
          message: 'Facturar servicios pide el período y el vencimiento del pago',
          path: ['servicio'],
        }),
    )
    .errors({
      ...ERRORES_RECEPTOR,
      PUNTO_VENTA_INVALIDO: {
        status: 422,
        message: 'Ese punto de venta no es de facturación, está desactivado o es de otra sucursal',
      },
      SIN_CERTIFICADO: {
        status: 409,
        message: 'La razón social no tiene un certificado de AFIP activo',
      },
      CERTIFICADO_VENCIDO: {
        status: 409,
        message: 'El certificado de AFIP de la razón social está vencido: hay que renovarlo',
      },
      SERIE_OCUPADA: {
        status: 409,
        message:
          'Hay un comprobante de este punto de venta sin confirmar por AFIP: verificalo antes de emitir otro',
        data: z.object({ comprobanteId: z.uuid() }),
      },
      RECHAZADO: {
        status: 422,
        message: 'AFIP rechazó el comprobante',
        data: z.object({
          comprobanteId: z.uuid(),
          errores: z.array(mensajeAfip),
          observaciones: z.array(mensajeAfip),
        }),
      },
      NUMERACION_DESFASADA: {
        status: 409,
        message:
          'AFIP informa como último un número que en el sistema ya está usado. Revisá los comprobantes de ese punto de venta antes de seguir',
        data: z.object({ numero: z.number().int() }),
      },
      AFIP_NO_RESPONDE: {
        status: 503,
        message:
          'AFIP no contestó. No se sabe si la factura quedó emitida: se verifica antes de seguir',
        data: z.object({ comprobanteId: z.uuid() }),
      },
    })
    .output(comprobanteDetalle),

  anular: conPermiso('contable', 'anular', 'Comprobante')
    .route({
      method: 'POST',
      path: '/comprobantes/{id}/nota-credito',
      tags: [TAG],
      operationId: 'anularComprobante',
      summary: 'Anular una factura con una nota de crédito por el total',
      successStatus: 201,
      description:
        'Mismos renglones, mismo receptor y mismo punto de venta que la factura, que viaja ' +
        'asociada. Una factura se anula una sola vez.',
    })
    .input(conId)
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Ese comprobante no existe' },
      NO_ANULABLE: {
        status: 409,
        message: 'Ese comprobante no se puede anular',
        data: z.object({ motivo: z.string() }),
      },
      SIN_CERTIFICADO: {
        status: 409,
        message: 'La razón social no tiene un certificado de AFIP activo',
      },
      CERTIFICADO_VENCIDO: {
        status: 409,
        message: 'El certificado de AFIP de la razón social está vencido: hay que renovarlo',
      },
      SERIE_OCUPADA: {
        status: 409,
        message:
          'Hay una nota de crédito de este punto de venta sin confirmar por AFIP: verificala antes de emitir otra',
        data: z.object({ comprobanteId: z.uuid() }),
      },
      NUMERACION_DESFASADA: {
        status: 409,
        message:
          'AFIP informa como último un número que en el sistema ya está usado. Revisá los comprobantes de ese punto de venta antes de seguir',
        data: z.object({ numero: z.number().int() }),
      },
      RECHAZADO: {
        status: 422,
        message: 'AFIP rechazó la nota de crédito',
        data: z.object({
          comprobanteId: z.uuid(),
          errores: z.array(mensajeAfip),
          observaciones: z.array(mensajeAfip),
        }),
      },
      AFIP_NO_RESPONDE: {
        status: 503,
        message:
          'AFIP no contestó. No se sabe si la nota de crédito quedó emitida: se verifica antes de seguir',
        data: z.object({ comprobanteId: z.uuid() }),
      },
    })
    .output(comprobanteDetalle),

  verificar: conPermiso('contable', 'facturar', 'Comprobante')
    .route({
      method: 'POST',
      path: '/comprobantes/{id}/verificar',
      tags: [TAG],
      operationId: 'verificarComprobante',
      summary: 'Preguntarle a AFIP si un comprobante incierto quedó emitido',
    })
    .input(conId)
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Ese comprobante no existe' },
      AFIP_NO_RESPONDE: {
        status: 503,
        message: 'AFIP sigue sin contestar. Probá en unos minutos',
        data: z.object({ comprobanteId: z.uuid() }),
      },
    })
    .output(comprobanteDetalle),

  listar: conPermiso('contable', 'ver', 'Comprobante')
    .route({
      method: 'GET',
      path: '/comprobantes',
      tags: [TAG],
      operationId: 'listarComprobantes',
      summary: 'Comprobantes emitidos, los últimos primero',
    })
    .input(
      paginado.extend({
        buscar: z.string().trim().max(60).optional(),
        estado: z.enum(ESTADOS_COMPROBANTE).optional(),
      }),
    )
    .output(z.object({ datos: z.array(comprobanteResumen), total: z.number().int() })),

  ficha: conPermiso('contable', 'ver', 'Comprobante')
    .route({
      method: 'GET',
      path: '/comprobantes/{id}',
      tags: [TAG],
      operationId: 'fichaComprobante',
      summary: 'Un comprobante, con sus renglones y lo que contestó AFIP',
    })
    .input(conId)
    .errors({ NO_ENCONTRADO: { status: 404, message: 'Ese comprobante no existe' } })
    .output(comprobanteDetalle),

  pdf: conPermiso('contable', 'ver', 'Comprobante')
    .route({
      method: 'GET',
      path: '/comprobantes/{id}/pdf',
      tags: [TAG],
      operationId: 'pdfComprobante',
      summary: 'El PDF del comprobante, con el formato de ARCA',
      description: 'Sólo de comprobantes autorizados: sin CAE no hay comprobante que imprimir.',
    })
    .input(conId)
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Ese comprobante no existe' },
      SIN_CAE: { status: 409, message: 'El comprobante no está autorizado por AFIP' },
    })
    .output(z.file()),
}
