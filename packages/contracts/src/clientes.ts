import { cuitValido } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { paginado } from './comunes.ts'

const TAG = 'Clientes'

/**
 * Códigos de AFIP. El 99, «sin identificar», no está a propósito: es el consumidor final
 * anónimo de un comprobante, no alguien que se carga como cliente.
 */
export const TIPOS_DOCUMENTO = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI' } as const
export const CONDICIONES_IIBB = ['local', 'convenio', 'exento', 'no_inscripto'] as const

export const clienteSalida = z.object({
  id: z.uuid(),
  tipoDocumento: z.number().int(),
  numeroDocumento: z.string(),
  tipoPersona: z.enum(['fisica', 'juridica']),
  razonSocial: z.string(),
  condicionIva: z.number().int(),
  domicilio: z.string().nullable(),
  provinciaCodigo: z.number().int().nullable(),
  localidad: z.string().nullable(),
  codigoPostal: z.string().nullable(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  numeroIibb: z.string().nullable(),
  condicionIibb: z.enum(CONDICIONES_IIBB),
  observaciones: z.string().nullable(),
  activo: z.boolean(),
  /** También es proveedor: la identidad fiscal es la misma, y se edita en un solo lugar. */
  esProveedor: z.boolean(),
})

/** Un texto opcional: vacío es «no tiene», no una cadena vacía guardada. */
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()

const datosCliente = z.object({
  razonSocial: z.string().trim().min(2, 'Falta el nombre o la razón social'),
  condicionIva: z.number().int(),
  domicilio: opcional,
  provinciaCodigo: z.number().int().nullable(),
  localidad: opcional,
  codigoPostal: opcional,
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email('Ese correo no parece bien escrito').nullable())
    .nullable(),
  telefono: opcional,
  numeroIibb: opcional,
  condicionIibb: z.enum(CONDICIONES_IIBB),
  observaciones: opcional,
})

/**
 * El documento, validado según su tipo. CUIT y CUIL comparten el dígito verificador; el
 * DNI no tiene, y lo único que se puede revisar es el largo.
 */
const altaCliente = datosCliente
  .extend({
    tipoDocumento: z.union([z.literal(80), z.literal(86), z.literal(96)]),
    numeroDocumento: z.string().regex(/^[0-9]+$/, 'Sólo números, sin puntos ni guiones'),
  })
  .superRefine((d, ctx) => {
    if (d.tipoDocumento === 96) {
      if (!/^[0-9]{7,8}$/.test(d.numeroDocumento)) {
        ctx.addIssue({
          code: 'custom',
          path: ['numeroDocumento'],
          message: 'El DNI son 7 u 8 dígitos',
        })
      }
    } else if (!cuitValido(d.numeroDocumento)) {
      ctx.addIssue({
        code: 'custom',
        path: ['numeroDocumento'],
        message: `Ese ${TIPOS_DOCUMENTO[d.tipoDocumento]} no existe: revisá los números, el último no coincide`,
      })
    }
  })

const NO_ENCONTRADO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese cliente no existe en la concesionaria' },
} as const

const REFERENCIA_INVALIDA = {
  REFERENCIA_INVALIDA: {
    status: 422,
    message: 'La condición frente al IVA o la provincia no están en el catálogo',
  },
} as const

export const contratoClientes = {
  listar: conPermiso('nucleo', 'ver', 'Cliente')
    .route({
      method: 'GET',
      path: '/clientes',
      tags: [TAG],
      operationId: 'listarClientes',
      summary: 'Listado de clientes',
      description: 'El buscador acepta nombre, razón social, CUIT, CUIL o DNI, con o sin guiones.',
    })
    .input(
      paginado.extend({
        buscar: z.string().optional(),
        /** Por omisión sólo los activos: el desactivado no se le ofrece a quien factura. */
        estado: z.enum(['activos', 'todos']).default('activos'),
      }),
    )
    .output(z.object({ datos: z.array(clienteSalida), total: z.number().int() })),

  crear: conPermiso('nucleo', 'crear', 'Cliente')
    .route({
      method: 'POST',
      path: '/clientes',
      tags: [TAG],
      operationId: 'crearCliente',
      summary: 'Alta de un cliente',
      successStatus: 201,
      description:
        'Si el documento ya está cargado como proveedor, no se duplica: se le agrega el rol ' +
        'de cliente a la misma identidad fiscal, con los datos que se mandan.',
    })
    .input(altaCliente)
    .errors({
      ...REFERENCIA_INVALIDA,
      CLIENTE_DUPLICADO: {
        status: 409,
        message: 'Ese documento ya está cargado como cliente',
        data: z.object({ id: z.uuid(), razonSocial: z.string() }),
      },
    })
    .output(clienteSalida),

  ficha: conPermiso('nucleo', 'ver', 'Cliente')
    .route({
      method: 'GET',
      path: '/clientes/{id}',
      tags: [TAG],
      operationId: 'fichaCliente',
      summary: 'La ficha de un cliente, con su historia',
      description:
        'Los vehículos van aparte, en /clientes/{id}/vehiculos: piden permiso para ver ' +
        'vehículos, y quien atiende el mostrador de repuestos ve clientes pero no autos.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ENCONTRADO)
    .output(
      clienteSalida.extend({
        historia: z.array(
          z.object({ fecha: z.string(), autor: z.string().nullable(), detalle: z.string() }),
        ),
      }),
    ),

  editar: conPermiso('nucleo', 'editar', 'Cliente')
    .route({
      method: 'PUT',
      path: '/clientes/{id}',
      tags: [TAG],
      operationId: 'editarCliente',
      summary: 'Modificar un cliente, o desactivarlo',
      description:
        'El documento no se cambia: otro documento es otra persona. No se borra: se ' +
        'desactiva, y su historia queda.',
    })
    .input(datosCliente.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors({ ...NO_ENCONTRADO, ...REFERENCIA_INVALIDA })
    .output(clienteSalida),
}
