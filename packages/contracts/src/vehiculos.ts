import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { chasis, dominio, paginado, problema } from './comunes.ts'

const TAG = 'Vehículos'

export const COMBUSTIBLES = ['nafta', 'diesel', 'gnc', 'electrico', 'hibrido'] as const

const titularResumen = z.object({ id: z.uuid(), razonSocial: z.string() })

export const vehiculoSalida = z.object({
  id: z.uuid(),
  chasis: z.string(),
  dominio: z.string().nullable(),
  anio: z.number().int().nullable(),
  color: z.string().nullable(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  /** El titular vigente. Un 0km en stock no tiene. */
  titular: titularResumen.nullable(),
})

export const vehiculoFicha = vehiculoSalida.extend({
  motor: z.string().nullable(),
  combustible: z.enum(COMBUSTIBLES).nullable(),
  kilometraje: z.number().int().nullable(),
  observaciones: z.string().nullable(),
  creadoEn: z.string(),
  /** Todos los que tuvo, del vigente al primero. */
  titulares: z.array(
    z.object({
      id: z.uuid(),
      cliente: titularResumen.extend({
        tipoDocumento: z.number().int(),
        numeroDocumento: z.string(),
      }),
      desde: z.iso.date(),
      hasta: z.iso.date().nullable(),
    }),
  ),
  /** Lo que se le hizo a la ficha, contado en palabras y del más nuevo al más viejo. */
  historia: z.array(
    z.object({
      fecha: z.string(),
      autor: z.string().nullable(),
      detalle: z.string(),
    }),
  ),
})

/** Un texto opcional: vacío es «no tiene», no una cadena vacía guardada. */
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullish()

const kilometraje = z.number().int().min(0, 'Los kilómetros no pueden ser negativos').nullish()
const anio = z.number().int().min(1900).max(2100).nullish()

/** Lo que se carga igual en el alta que al modificar. */
const datosVehiculo = z.object({
  dominio: dominio.nullish(),
  anio,
  color: opcional,
  motor: opcional,
  /**
   * Por nombre y no por id: si la marca o el modelo no existen, se crean. Una planilla de
   * marcas que hay que cargar antes del primer auto es una traba, no un catálogo.
   */
  marca: opcional,
  modelo: opcional,
  combustible: z.enum(COMBUSTIBLES).nullish(),
  kilometraje,
  observaciones: opcional,
})

/** El vehículo guarda el modelo, y el modelo sabe su marca: una marca sola se perdería. */
const conMarca = (d: { marca?: string | null | undefined; modelo?: string | null | undefined }) =>
  Boolean(d.marca) === Boolean(d.modelo)
const SIN_MARCA = {
  message: 'Marca y modelo van juntos: completá los dos, o ninguno',
  path: ['modelo'],
}

const fechaTitularidad = z.iso.date('La fecha va como AAAA-MM-DD')

const NO_ENCONTRADO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese vehículo no existe en la concesionaria' },
} as const

const DOMINIO_DUPLICADO = {
  DOMINIO_DUPLICADO: {
    status: 409,
    message: 'Ya hay un vehículo con esa patente',
    data: z.object({ id: z.uuid(), chasis: z.string() }),
  },
} as const

const CLIENTE_INEXISTENTE = {
  CLIENTE_INEXISTENTE: {
    status: 422,
    message: 'Ese cliente no existe o está desactivado',
  },
} as const

export const contratoVehiculos = {
  listar: conPermiso('nucleo', 'ver', 'Vehiculo')
    .route({
      method: 'GET',
      path: '/vehiculos',
      tags: [TAG],
      operationId: 'listarVehiculos',
      summary: 'Listado de vehículos',
      description: 'El buscador acepta patente, número de chasis o nombre del titular.',
    })
    .input(
      paginado.extend({
        // El mecánico busca por la patente que ve en el parabrisas; el
        // administrativo, por chasis. Los dos entran por el mismo campo.
        buscar: z.string().optional(),
      }),
    )
    .output(z.object({ datos: z.array(vehiculoSalida), total: z.number().int() })),

  marcas: conPermiso('nucleo', 'ver', 'Vehiculo')
    .route({
      method: 'GET',
      path: '/vehiculos/marcas',
      tags: [TAG],
      operationId: 'marcasYModelos',
      summary: 'Las marcas y modelos ya cargados',
      description: 'Para sugerir al escribir: el alta acepta también los que no están.',
    })
    .output(
      z.object({ datos: z.array(z.object({ marca: z.string(), modelos: z.array(z.string()) })) }),
    ),

  delCliente: conPermiso('nucleo', 'ver', 'Vehiculo')
    .route({
      method: 'GET',
      path: '/clientes/{clienteId}/vehiculos',
      tags: [TAG],
      operationId: 'vehiculosDelCliente',
      summary: 'Los vehículos de un cliente: los que tiene y los que tuvo',
    })
    .input(z.object({ clienteId: z.uuid() }))
    .output(
      z.object({
        datos: z.array(
          vehiculoSalida.extend({ desde: z.iso.date(), hasta: z.iso.date().nullable() }),
        ),
      }),
    ),

  ficha: conPermiso('nucleo', 'ver', 'Vehiculo')
    .route({
      method: 'GET',
      path: '/vehiculos/{id}',
      tags: [TAG],
      operationId: 'fichaVehiculo',
      summary: 'La ficha de un vehículo, con sus titulares y su historia',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ENCONTRADO)
    .output(vehiculoFicha),

  crear: conPermiso('nucleo', 'crear', 'Vehiculo')
    .route({
      method: 'POST',
      path: '/vehiculos',
      tags: [TAG],
      operationId: 'crearVehiculo',
      summary: 'Alta de vehículo',
      successStatus: 201,
      description:
        'El dominio puede omitirse: un 0km existe con su chasis desde que la terminal ' +
        'lo factura y puede pasar semanas sin chapa. El titular también: un auto en stock ' +
        'no es de nadie todavía.',
    })
    .input(
      datosVehiculo
        .extend({
          chasis,
          titular: z.object({ clienteId: z.uuid(), desde: fechaTitularidad }).nullish(),
        })
        .refine(conMarca, SIN_MARCA),
    )
    .errors({
      CHASIS_DUPLICADO: {
        status: 409,
        message: 'Ya hay un vehículo con ese chasis',
        data: problema,
      },
      ...DOMINIO_DUPLICADO,
      ...CLIENTE_INEXISTENTE,
      FECHA_FUTURA: { status: 422, message: 'La fecha del titular no puede ser posterior a hoy' },
    })
    .output(vehiculoSalida),

  editar: conPermiso('nucleo', 'editar', 'Vehiculo')
    .route({
      method: 'PUT',
      path: '/vehiculos/{id}',
      tags: [TAG],
      operationId: 'editarVehiculo',
      summary: 'Modificar los datos de un vehículo',
      description:
        'El chasis no se cambia: es la identidad del vehículo. El titular tampoco: se ' +
        'transfiere, para que quede quién lo tuvo antes.',
    })
    .input(datosVehiculo.extend({ id: z.uuid() }).refine(conMarca, SIN_MARCA))
    .errors({ ...NO_ENCONTRADO, ...DOMINIO_DUPLICADO })
    .output(vehiculoFicha),

  transferir: conPermiso('nucleo', 'editar', 'Vehiculo')
    .route({
      method: 'POST',
      path: '/vehiculos/{id}/titularidad',
      tags: [TAG],
      operationId: 'transferirVehiculo',
      summary: 'Cambiar el titular',
      description:
        'Cierra la titularidad vigente el día indicado y abre la nueva desde ese mismo día. ' +
        'La anterior no se borra: es la respuesta a quién tenía el auto cuando se le hizo ' +
        'cada trabajo.',
    })
    .input(z.object({ id: z.uuid(), clienteId: z.uuid(), desde: fechaTitularidad }))
    .errors({
      ...NO_ENCONTRADO,
      ...CLIENTE_INEXISTENTE,
      MISMO_TITULAR: { status: 409, message: 'Ese cliente ya es el titular' },
      FECHA_ANTERIOR: {
        status: 422,
        message: 'La fecha no puede ser anterior a la del titular actual',
        data: z.object({ desde: z.iso.date() }),
      },
      FECHA_FUTURA: { status: 422, message: 'La fecha no puede ser posterior a hoy' },
    })
    .output(vehiculoFicha),
}
