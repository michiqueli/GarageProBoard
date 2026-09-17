import { cuitValido } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { CONDICIONES_IIBB, TIPOS_DOCUMENTO } from './clientes.ts'
import { paginado } from './comunes.ts'

const TAG = 'Proveedores'

export const proveedorSalida = z.object({
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
  /** «Cuenta corriente 30 días», «contado contra entrega». */
  condicionPago: z.string().nullable(),
  activo: z.boolean(),
  /** También es cliente: la identidad fiscal es la misma, y se edita en un solo lugar. */
  esCliente: z.boolean(),
})

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()

const datosProveedor = z.object({
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
  condicionPago: opcional,
})

const altaProveedor = datosProveedor
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
  NO_ENCONTRADO: { status: 404, message: 'Ese proveedor no existe en la concesionaria' },
} as const

const REFERENCIA_INVALIDA = {
  REFERENCIA_INVALIDA: {
    status: 422,
    message: 'La condición frente al IVA o la provincia no están en el catálogo',
  },
} as const

export const contratoProveedores = {
  listar: conPermiso('repuestos', 'ver', 'Proveedor')
    .route({
      method: 'GET',
      path: '/proveedores',
      tags: [TAG],
      operationId: 'listarProveedores',
      summary: 'Listado de proveedores',
      description: 'El buscador acepta razón social o CUIT, con o sin guiones.',
    })
    .input(
      paginado.extend({
        buscar: z.string().optional(),
        estado: z.enum(['activos', 'todos']).default('activos'),
      }),
    )
    .output(z.object({ datos: z.array(proveedorSalida), total: z.number().int() })),

  crear: conPermiso('repuestos', 'crear', 'Proveedor')
    .route({
      method: 'POST',
      path: '/proveedores',
      tags: [TAG],
      operationId: 'crearProveedor',
      summary: 'Alta de un proveedor',
      successStatus: 201,
      description:
        'Si el documento ya está cargado como cliente, no se duplica: se le agrega el rol de ' +
        'proveedor a la misma identidad fiscal.',
    })
    .input(altaProveedor)
    .errors({
      ...REFERENCIA_INVALIDA,
      PROVEEDOR_DUPLICADO: {
        status: 409,
        message: 'Ese documento ya está cargado como proveedor',
        data: z.object({ id: z.uuid(), razonSocial: z.string() }),
      },
    })
    .output(proveedorSalida),

  ficha: conPermiso('repuestos', 'ver', 'Proveedor')
    .route({
      method: 'GET',
      path: '/proveedores/{id}',
      tags: [TAG],
      operationId: 'fichaProveedor',
      summary: 'La ficha de un proveedor',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ENCONTRADO)
    .output(proveedorSalida),

  editar: conPermiso('repuestos', 'editar', 'Proveedor')
    .route({
      method: 'PUT',
      path: '/proveedores/{id}',
      tags: [TAG],
      operationId: 'editarProveedor',
      summary: 'Modificar un proveedor, o desactivarlo',
      description: 'El documento no se cambia. No se borra: se desactiva.',
    })
    .input(datosProveedor.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors({ ...NO_ENCONTRADO, ...REFERENCIA_INVALIDA })
    .output(proveedorSalida),
}
