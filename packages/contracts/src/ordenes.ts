import {
  CARROCERIAS,
  CONTROLES_INVENTARIO,
  ELEMENTOS_INVENTARIO,
  ESTADOS_REVISION,
  MAXIMO_BYTES_FIRMA,
  MAXIMO_BYTES_FOTO,
  MAXIMO_FOTOS,
  MAXIMO_NOTA_ESPERA,
  MAXIMO_NOTA_FOTO,
  MAXIMO_NOTA_PUNTO,
  MOMENTOS_FIRMA,
  MOMENTOS_FOTO,
  SECCIONES_REVISION,
  TIPOS_DANIO,
  TIPOS_HOJA,
} from '@gpb/core'
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
export const AUTORIZACIONES = ['pendiente', 'autorizado', 'rechazado'] as const
export const MEDIOS_AUTORIZACION = ['presencial', 'telefono', 'whatsapp', 'mail'] as const

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullish()

const persona = z.object({ id: z.uuid(), razonSocial: z.string() })

/**
 * Una marca sobre el dibujo de la recepción.
 *
 * `x` e `y` van **en fracción del ancho y del alto**, entre 0 y 1: así el taller puede
 * reemplazar su dibujo por uno de otro tamaño y la marca sigue cayendo donde el cliente la vio.
 * Guardar píxeles ataría cada marca a la resolución del archivo que había ese día.
 */
export const danioRecepcion = z.object({
  tipo: z.enum(TIPOS_DANIO),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  nota: z.string().nullable(),
})

const danioEntrada = danioRecepcion.extend({
  nota: z
    .string()
    .trim()
    .max(120, 'El detalle de una marca es corto: lo largo va en las observaciones')
    .nullish(),
})

/** Lo que vino con el auto. Lo que no figura no se revisó, que no es lo mismo que «está». */
export const inventarioRecepcion = z.partialRecord(
  z.enum(ELEMENTOS_INVENTARIO),
  z.enum(CONTROLES_INVENTARIO),
)

/**
 * Un punto de la revisión, contestado o no.
 *
 * La orden trae **todos**: los que se contestaron, con el nombre que tenía el punto en ese
 * momento, y los que el taller revisa hoy y nadie tocó, con `estado` en `null`. Sin revisar no
 * es verde: es lo que la hoja tiene que decir cuando nadie lo miró.
 */
export const respuestaRevision = z.object({
  puntoId: z.uuid(),
  seccion: z.enum(SECCIONES_REVISION),
  nombre: z.string(),
  estado: z.enum(ESTADOS_REVISION).nullable(),
  nota: z.string().nullable(),
  /** Quién lo contestó y cuándo. La revisión se llena en dos momentos, y no siempre la misma persona. */
  por: z.string().nullable(),
  en: z.iso.datetime().nullable(),
  /** El renglón de trabajo que salió de este punto, si se pasó a presupuesto y sigue en la orden. */
  itemId: z.uuid().nullable(),
})

/** Lo que se contesta de un punto. `estado` en `null` lo vuelve a dejar sin revisar. */
const respuestaEntrada = z.object({
  puntoId: z.uuid(),
  estado: z.enum(ESTADOS_REVISION).nullable(),
  nota: z
    .string()
    .trim()
    .max(MAXIMO_NOTA_PUNTO, 'La nota de un punto es corta: lo largo va en las observaciones')
    .transform((v) => v || null)
    .nullish(),
})

const PUNTO_INVALIDO = {
  PUNTO_INVALIDO: {
    status: 422,
    message: 'Alguno de esos puntos de la revisión no existe o el taller ya no lo revisa',
  },
} as const

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
  /**
   * Quién la trabaja. **No se asigna**: lo pone el fichaje, con el primero que la escanea.
   *
   * En una concesionaria no hay un paso donde recepción reparta autos entre mecánicos; el
   * mecánico de una orden es, simplemente, el que la agarró. Por eso esto es de sólo lectura:
   * quién trabajó y cuánto lo cuentan las sesiones de trabajo.
   */
  mecanico: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
  entregaEstimada: z.iso.date().nullable(),
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
  /**
   * Sin valor, no pasó por un presupuesto. Pendiente: espera la respuesta del cliente y no se
   * toca. Rechazado: se ve, pero no se cobra ni consume stock.
   */
  autorizacion: z.enum(AUTORIZACIONES).nullable(),
  presupuestoId: z.uuid().nullable(),
  /**
   * Los códigos de barras de las cajas que se le dieron a este auto, escaneados en el depósito.
   * El cliente los compara con las cajas que se lleva.
   */
  codigosBarras: z.array(z.string()),
})

export const presupuestoOrden = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  estado: z.enum(['pendiente', 'respondido']),
  /** Con IVA: lo que se le dijo al cliente. */
  total: z.string(),
  /** De eso, lo que autorizó. Null mientras no respondió. */
  totalAutorizado: z.string().nullable(),
  enviadoA: z.string().nullable(),
  creadoPor: z.string(),
  creadoEn: z.iso.datetime(),
  autorizaNombre: z.string().nullable(),
  autorizaMedio: z.enum(MEDIOS_AUTORIZACION).nullable(),
  nota: z.string().nullable(),
  respondidoEn: z.iso.datetime().nullable(),
})

/**
 * Un rato que alguien trabajó en la orden, como lo dejó el fichaje.
 *
 * `cerradaPor` es el dato que parece de más y no lo es: distingue las que cerró el mecánico
 * —las buenas— de las que cerró el trabajo de fin de turno o el jefe al terminar la orden. El
 * jefe de taller tiene que poder mirar las segundas, porque son las que probablemente estén mal.
 */
export const sesionDeTrabajo = z.object({
  id: z.uuid(),
  nombre: z.string(),
  legajo: z.string(),
  inicio: z.iso.datetime(),
  fin: z.iso.datetime().nullable(),
  /** Minutos, o lo que lleva hasta ahora si todavía está abierta. */
  minutos: z.number().int(),
  cerradaPor: z.enum(['mecanico', 'auto', 'jefe']).nullable(),
})

/** Lo que se le recomendó a un auto y no se hizo. */
export const pendienteVehiculo = z.object({
  id: z.uuid(),
  descripcion: z.string(),
  origen: z.enum(['presupuesto', 'revision']),
  semaforo: z.enum(['ambar', 'rojo']).nullable(),
  /** Cuándo se le dijo: al entregar el auto. */
  informadoEn: z.iso.datetime(),
  orden: z.object({ id: z.uuid(), numero: z.number().int() }),
})

const firmaOrden = z.object({ aclaracion: z.string(), firmadoEn: z.iso.datetime() }).nullable()

export const fotoOrden = z.object({
  id: z.uuid(),
  momento: z.enum(MOMENTOS_FOTO),
  nota: z.string().nullable(),
  sacadaEn: z.iso.datetime(),
  sacadaPor: z.string().nullable(),
})

/** Un rato en que el auto estuvo parado. Sin `hasta`, todavía espera. */
export const esperaOrden = z.object({
  id: z.uuid(),
  motivo: z.string(),
  nota: z.string().nullable(),
  desde: z.iso.datetime(),
  hasta: z.iso.datetime().nullable(),
  abiertaPor: z.string().nullable(),
  cerradaPor: z.string().nullable(),
})

export const ordenDetalle = ordenResumen.extend({
  /** Las fotos del auto al recibirlo y al devolverlo, en el orden en que se sacaron. */
  fotos: z.array(fotoOrden),
  /** Por qué estuvo parado, y cuándo: la explicación del tiempo muerto. La última puede seguir abierta. */
  esperas: z.array(esperaOrden),
  /** La firma del cliente al recibir el auto y al devolverlo, si se firmó en la pantalla. */
  firmas: z.object({ ingreso: firmaOrden, egreso: firmaOrden }),
  traeNombre: z.string().nullable(),
  traeTelefono: z.string().nullable(),
  autorizaNombre: z.string().nullable(),
  autorizaTelefono: z.string().nullable(),
  /** El correo de quien paga, para ofrecerlo al mandar un presupuesto. */
  pagaEmail: z.string().nullable(),
  kilometraje: z.number().int().nullable(),
  combustible: z.enum(NIVELES_COMBUSTIBLE).nullable(),
  observaciones: z.string().nullable(),
  danios: z.array(danioRecepcion),
  inventario: inventarioRecepcion,
  /**
   * Lo que se le recomendó y no se hizo: lo rechazado y lo ámbar o rojo de la revisión que no
   * llegó a la orden. Es lo que el egreso le dice al cliente, y lo que queda pendiente al entregar.
   */
  noSeHizo: z.array(
    z.object({
      origen: z.enum(['presupuesto', 'revision']),
      descripcion: z.string(),
      semaforo: z.enum(['ambar', 'rojo']).nullable(),
    }),
  ),
  /** Cómo salió el auto, una vez entregado. */
  egreso: z
    .object({
      entregadaPor: z.string().nullable(),
      kilometraje: z.number().int().nullable(),
      combustible: z.enum(NIVELES_COMBUSTIBLE).nullable(),
      inventario: inventarioRecepcion,
      danios: z.array(danioRecepcion),
      sinFactura: z.object({ motivo: z.string(), autorizadoPor: z.string() }).nullable(),
    })
    .nullable(),
  /** Los puntos de la revisión, por sección y en el orden del taller. */
  revision: z.array(respuestaRevision),
  /** Qué carrocería se dibujó: decide cuál de los dibujos del sistema usar si no hay propio. */
  hojaTipo: z.enum(TIPOS_HOJA),
  /**
   * La imagen exacta con la que se recibió, o `null` si se usó la del sistema.
   *
   * Va con la orden y no se recalcula: las marcas son puntos de **ese** dibujo. Si el taller
   * sube uno nuevo, esta orden se sigue viendo y se sigue imprimiendo con el que firmó.
   */
  hojaImagenId: z.uuid().nullable(),
  terminadaEn: z.iso.datetime().nullable(),
  entregadaEn: z.iso.datetime().nullable(),
  items: z.array(itemOrden),
  presupuestos: z.array(presupuestoOrden),
  /** Lo que el fichaje registró: quién trabajó, cuándo y cuánto. */
  sesiones: z.array(sesionDeTrabajo),
  /** La suma, incluyendo lo que se está trabajando ahora mismo. */
  manoDeObraMin: z.number().int(),
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
  autorizaNombre: opcional,
  autorizaTelefono: opcional,
  kilometraje: z.number().int().min(0, 'Los kilómetros no pueden ser negativos').nullish(),
  combustible: z.enum(NIVELES_COMBUSTIBLE).nullish(),
  pedido: z.string().trim().min(3, 'Anotá qué pide el cliente'),
  observaciones: opcional,
  entregaEstimada: z.iso.date().nullish(),
  /**
   * Sin mandar, no se tocan: así un cliente viejo que edita la recepción no borra el dibujo
   * que ya estaba. Para dejarlo vacío se manda la lista vacía.
   */
  danios: z.array(danioEntrada).max(80, 'Son muchas marcas: agrupalas con un detalle').optional(),
  inventario: inventarioRecepcion.optional(),
  /**
   * Qué es el vehículo, cuando su modelo todavía no lo dice. Se manda desde la recepción, que
   * es donde alguien lo tiene adelante, y queda guardado en el modelo: el siguiente de ese
   * modelo ya se dibuja solo.
   */
  carroceria: z.enum(CARROCERIAS).nullish(),
})

const itemEntrada = z.object({
  /**
   * El renglón que ya existía, si es uno de ellos: así conserva si se autorizó y en qué
   * presupuesto. Sin id es un renglón nuevo.
   */
  id: z.uuid().nullish(),
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
        /** `para_entregar`: terminadas o facturadas, la cola del egreso. */
        estado: z
          .enum([...ESTADOS_ORDEN, 'en_taller', 'para_entregar', 'todas'])
          .default('en_taller'),
      }),
    )
    .output(z.object({ datos: z.array(ordenResumen), total: z.number().int() })),

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
        /** Lo que se revisó en el mostrador. La inspección dinámica se completa después, en el taller. */
        revision: z.array(respuestaEntrada).default([]),
        /**
         * La visita de la puerta de la que sale, si salió de la cola. Abrir la orden la cierra
         * con la orden: es lo que une cuánto esperó alguien con qué se le hizo.
         */
        visitaId: z.uuid().nullish(),
        /**
         * Lo que quedó pendiente de la vez anterior y se suma a esta orden: va como trabajo sin
         * precio, y el pendiente queda resuelto con ella.
         */
        pendienteIds: z.array(z.uuid()).max(50).default([]),
      }),
    )
    .errors({
      ...PUNTO_INVALIDO,
      VISITA_INVALIDA: {
        status: 409,
        message: 'Esa visita ya terminó o la está atendiendo otra persona',
      },
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

  revisar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'PUT',
      path: '/ordenes/{id}/revision',
      tags: [TAG],
      operationId: 'revisarOrden',
      summary: 'Contestar puntos de la revisión: el semáforo y su nota',
      description:
        'Cambia sólo los puntos que se mandan; el resto queda como estaba. Cada punto que ' +
        'cambia queda firmado con quién y cuándo, porque la revisión se completa en dos ' +
        'momentos: en el mostrador, y después de la prueba de ruta.',
    })
    .input(conId.extend({ respuestas: z.array(respuestaEntrada).min(1) }))
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO, ...PUNTO_INVALIDO })
    .output(ordenDetalle),

  pasarAPresupuesto: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/revision/trabajos',
      tags: [TAG],
      operationId: 'pasarRevisionAPresupuesto',
      summary: 'Sumar a la orden, como trabajos, lo que la revisión dejó en ámbar o en rojo',
      description:
        'Cada punto elegido entra como un trabajo sin precio, para completarlo y pedir ' +
        'autorización con un presupuesto. No se cobra solo: elegir qué se ofrece es de una persona.',
    })
    .input(conId.extend({ puntoIds: z.array(z.uuid()).min(1, 'Elegí qué puntos se presupuestan') }))
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      PUNTO_INVALIDO: {
        status: 422,
        message: 'Alguno de esos puntos no está en ámbar ni en rojo, o ya se pasó a la orden',
      },
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
      PRESUPUESTO_PENDIENTE: {
        status: 409,
        message:
          'Hay renglones en un presupuesto esperando la respuesta del cliente: no se modifican ni se quitan',
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

  ponerEnEspera: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/espera',
      tags: [TAG],
      operationId: 'ponerOrdenEnEspera',
      summary: 'Por qué está parado el auto: repuestos, autorización, diagnóstico, elevador…',
      description:
        'Si ya esperaba otra cosa, esa espera se cierra acá: un auto espera una cosa por vez. ' +
        'Repuestos y autorización del cliente pasan además la orden a su estado.',
    })
    .input(
      conId.extend({
        motivoId: z.uuid(),
        nota: z
          .string()
          .trim()
          .max(MAXIMO_NOTA_ESPERA, `Es largo: hasta ${MAXIMO_NOTA_ESPERA} letras`)
          .nullish(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      MOTIVO_INVALIDO: { status: 422, message: 'Ese motivo de espera no existe o está apagado' },
    })
    .output(ordenDetalle),

  terminarEspera: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/espera/terminar',
      tags: [TAG],
      operationId: 'terminarEsperaDeOrden',
      summary: 'Lo que esperaba ya llegó: el auto vuelve a trabajo',
      description: 'Si la orden estaba esperando repuesto o autorización, vuelve a en proceso.',
    })
    .input(conId)
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
      PRESUPUESTO_PENDIENTE: {
        status: 409,
        message:
          'Hay un presupuesto esperando la respuesta del cliente: registrala antes de terminar',
      },
    })
    .output(ordenDetalle),

  presupuestar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/presupuestos',
      tags: [TAG],
      operationId: 'presupuestarOrden',
      summary: 'Pedirle autorización al cliente: armar un presupuesto con renglones de la orden',
      successStatus: 201,
      description:
        'Los renglones elegidos quedan pendientes y no se modifican hasta la respuesta, y la orden ' +
        'pasa a esperando autorización. Con `enviarA`, el presupuesto en PDF sale por mail.',
    })
    .input(
      conId.extend({
        itemIds: z.array(z.uuid()).min(1, 'Elegí qué trabajos y repuestos se consultan'),
        enviarA: z
          .string()
          .trim()
          .transform((v) => v || null)
          .pipe(z.email('Ese correo no parece bien escrito').nullable())
          .nullish(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      ITEM_INVALIDO: {
        status: 422,
        message: 'Alguno de esos renglones no es de la orden o ya pasó por un presupuesto',
      },
      CORREO_NO_CONFIGURADO: {
        status: 503,
        message: 'El presupuesto quedó armado, pero el servidor no tiene configurado el correo',
      },
      CORREO_NO_ENVIADO: {
        status: 502,
        message:
          'El presupuesto quedó armado, pero el mail no salió: mandalo de nuevo desde la orden',
      },
    })
    .output(ordenDetalle),

  enviarPresupuesto: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/presupuestos/{presupuestoId}/envio',
      tags: [TAG],
      operationId: 'enviarPresupuesto',
      summary: 'Mandar un presupuesto por mail',
    })
    .input(
      conId.extend({
        presupuestoId: z.uuid(),
        para: z.email('Ese correo no parece bien escrito'),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      CORREO_NO_CONFIGURADO: {
        status: 503,
        message: 'El servidor no tiene configurado el correo saliente. Avisale a soporte',
      },
      CORREO_NO_ENVIADO: { status: 502, message: 'El servidor de correo no aceptó el mensaje' },
    })
    .output(ordenDetalle),

  responderPresupuesto: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/presupuestos/{presupuestoId}/respuesta',
      tags: [TAG],
      operationId: 'responderPresupuesto',
      summary: 'Registrar qué autorizó el cliente, quién y por qué medio',
      description:
        'Los renglones de `autorizados` se hacen; el resto del presupuesto queda rechazado: no se ' +
        'cobra y sus repuestos vuelven al stock. Si no queda ningún presupuesto pendiente, la orden ' +
        'vuelve a en proceso.',
    })
    .input(
      conId.extend({
        presupuestoId: z.uuid(),
        autorizados: z.array(z.uuid()),
        autorizaNombre: z.string().trim().min(2, 'Anotá quién autorizó'),
        medio: z.enum(MEDIOS_AUTORIZACION),
        nota: opcional,
      }),
    )
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(ordenDetalle),

  pdfPresupuesto: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}/presupuestos/{presupuestoId}/pdf',
      tags: [TAG],
      operationId: 'pdfPresupuesto',
      summary: 'El presupuesto impreso, con la firma de conformidad',
    })
    .input(conId.extend({ presupuestoId: z.uuid() }))
    .errors(NO_ENCONTRADA)
    .output(z.file()),

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

  pendientes: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/vehiculos/{id}/pendientes',
      tags: [TAG],
      operationId: 'pendientesDelVehiculo',
      summary: 'Lo que se le recomendó al auto y no se hizo, todavía sin resolver',
      description:
        'Se anota al entregarlo: lo rechazado del presupuesto y lo ámbar o rojo de la revisión ' +
        'que no pasó a la orden. Los más nuevos primero.',
    })
    .input(conId)
    .output(z.object({ datos: z.array(pendienteVehiculo) })),

  descartarPendiente: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/vehiculos/pendientes/{id}/descartar',
      tags: [TAG],
      operationId: 'descartarPendienteVehiculo',
      summary: 'Descartar un pendiente: lo hizo en otro lado, vendió el auto',
      description: 'No se borra: queda con el motivo y con quién lo descartó.',
    })
    .input(
      conId.extend({
        motivo: z
          .string()
          .trim()
          .min(3, 'Decí por qué se descarta')
          .max(300, 'Es largo: hasta 300 letras'),
      }),
    )
    .errors({
      NO_ENCONTRADO: { status: 404, message: 'Ese pendiente no existe o ya se resolvió' },
    })
    .output(z.object({ hecho: z.literal(true) })),

  firmar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/firmas/{momento}',
      tags: [TAG],
      operationId: 'firmarOrden',
      summary: 'La firma del cliente en la pantalla, al recibir o al devolver el auto',
      successStatus: 201,
      description:
        'Un PNG con el trazo, y la aclaración. Volver a firmar no borra la anterior: la marca ' +
        'como reemplazada.',
    })
    .input(
      conId.extend({
        momento: z.enum(MOMENTOS_FIRMA),
        aclaracion: z
          .string()
          .trim()
          .min(3, 'Escribí el nombre de quien firma')
          .max(120, 'Es largo: hasta 120 letras'),
        imagen: z.file(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ESTADO_INVALIDO_FIRMA: {
        status: 409,
        message: 'En este estado de la orden no se firma eso',
        data: z.object({ motivo: z.string() }),
      },
      FORMATO_INVALIDO: { status: 422, message: 'La firma tiene que llegar como un PNG' },
      DEMASIADO_GRANDE: {
        status: 413,
        message: `La firma no puede pasar de ${MAXIMO_BYTES_FIRMA / 1024} KB`,
      },
      SIN_ALMACEN: {
        status: 503,
        message: 'El servidor no tiene configurado dónde guardar los archivos. Avisale a soporte',
      },
    })
    .output(z.object({ ingreso: firmaOrden, egreso: firmaOrden })),

  firma: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}/firmas/{momento}',
      tags: [TAG],
      operationId: 'firmaDeOrden',
      summary: 'La imagen de la firma vigente',
    })
    .input(conId.extend({ momento: z.enum(MOMENTOS_FIRMA) }))
    .errors({ ...NO_ENCONTRADA })
    .output(z.file()),

  subirFoto: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/fotos',
      tags: [TAG],
      operationId: 'subirFotoDeOrden',
      summary: 'Una foto del vehículo, al recibirlo o al devolverlo',
      successStatus: 201,
      description:
        'Un JPEG o PNG, ya achicado por quien la saca. Se suben al recibir el auto con la orden ' +
        'abierta, y al devolverlo con la orden terminada.',
    })
    .input(
      conId.extend({
        momento: z.enum(MOMENTOS_FOTO),
        nota: z
          .string()
          .trim()
          .max(MAXIMO_NOTA_FOTO, `Es largo: hasta ${MAXIMO_NOTA_FOTO} letras`)
          .nullish(),
        imagen: z.file(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ESTADO_INVALIDO_FOTO: {
        status: 409,
        message: 'En este estado de la orden no se suben fotos de ese momento',
        data: z.object({ motivo: z.string() }),
      },
      FORMATO_INVALIDO: { status: 422, message: 'La foto tiene que ser un JPEG o un PNG' },
      DEMASIADO_GRANDE: {
        status: 413,
        message: `La foto no puede pasar de ${MAXIMO_BYTES_FOTO / 1024 / 1024} MB`,
      },
      DEMASIADAS_FOTOS: {
        status: 409,
        message: `Son ${MAXIMO_FOTOS} fotos por momento: quitá alguna para sumar otra`,
      },
      SIN_ALMACEN: {
        status: 503,
        message: 'El servidor no tiene configurado dónde guardar los archivos. Avisale a soporte',
      },
    })
    .output(fotoOrden),

  foto: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}/fotos/{fotoId}',
      tags: [TAG],
      operationId: 'fotoDeOrden',
      summary: 'La imagen de una foto del vehículo',
    })
    .input(conId.extend({ fotoId: z.uuid() }))
    .errors({ ...NO_ENCONTRADA })
    .output(z.file()),

  quitarFoto: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'DELETE',
      path: '/ordenes/{id}/fotos/{fotoId}',
      tags: [TAG],
      operationId: 'quitarFotoDeOrden',
      summary: 'Dar de baja una foto del vehículo',
      description:
        'No borra nada: la marca como dada de baja, con quién, y deja de mostrarse. Una orden ' +
        'entregada o anulada ya no se toca.',
    })
    .input(conId.extend({ fotoId: z.uuid() }))
    .errors({
      ...NO_ENCONTRADA,
      ESTADO_INVALIDO_FOTO: {
        status: 409,
        message: 'Las fotos de una orden cerrada ya no se tocan',
        data: z.object({ motivo: z.string() }),
      },
    })
    .output(z.object({ hecho: z.literal(true) })),

  entregar: conPermiso('servicios', 'editar', 'Orden')
    .route({
      method: 'POST',
      path: '/ordenes/{id}/entregar',
      tags: [TAG],
      operationId: 'entregarOrden',
      summary: 'Entregar el vehículo al cliente: el egreso',
      description:
        'Con cómo sale —km, combustible, lo que vino con él tildado y los daños nuevos— contra ' +
        'cómo entró. Se entrega facturada, o sin factura si quien entrega puede autorizarlo y ' +
        'dice por qué. Lo que no se hizo queda como pendiente del vehículo.',
    })
    .input(
      conId.extend({
        kilometraje: z.number().int().min(0).nullish(),
        combustible: z.enum(NIVELES_COMBUSTIBLE).nullish(),
        inventario: inventarioRecepcion.default({}),
        danios: z
          .array(danioEntrada)
          .max(40, 'Son muchas marcas: agrupalas con un detalle')
          .default([]),
        /** Entregarla sin factura: hace falta poder autorizar órdenes, y decir por qué. */
        sinFactura: z
          .object({
            motivo: z
              .string()
              .trim()
              .min(5, 'Decí por qué se entrega sin factura')
              .max(300, 'Es largo: hasta 300 letras'),
          })
          .nullish(),
        /**
         * La visita de quien vino a buscarlo, si se anotó en la puerta o en el tótem. Entregar
         * la cierra con la orden. Sin visita se entrega igual: muchos no pasan por la puerta.
         */
        visitaId: z.uuid().nullish(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      ...ESTADO_INVALIDO,
      VISITA_INVALIDA: {
        status: 409,
        message: 'Esa visita ya terminó o la está atendiendo otra persona',
      },
      SIN_AUTORIZACION: {
        status: 403,
        message:
          'Entregarla sin factura lo autoriza alguien que pueda autorizar órdenes. Facturala en caja, o pedíselo.',
      },
      KILOMETRAJE_MENOR: {
        status: 422,
        message: 'Los kilómetros de salida no pueden ser menos que los de entrada',
      },
    })
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

  pdfEgreso: conPermiso('servicios', 'ver', 'Orden')
    .route({
      method: 'GET',
      path: '/ordenes/{id}/egreso/pdf',
      tags: [TAG],
      operationId: 'pdfEgresoOrden',
      summary: 'El comprobante de la entrega, con lo hecho, lo no hecho y la firma',
    })
    .input(conId)
    .errors({ ...NO_ENCONTRADA, ...ESTADO_INVALIDO })
    .output(z.file()),
}
