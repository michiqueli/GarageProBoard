import { z } from 'zod'
import { conPermiso, conSesion } from './acceso.ts'
import { cuit } from './comunes.ts'

const TAG = 'Empresas y sucursales'

export const USOS_PUNTO_VENTA = ['facturacion', 'remito', 'otro'] as const
export const MODOS_PUNTO_VENTA = ['CAE', 'CAEA'] as const

export const puntoVentaSalida = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  uso: z.enum(USOS_PUNTO_VENTA),
  modo: z.enum(MODOS_PUNTO_VENTA),
  predeterminado: z.boolean(),
  activo: z.boolean(),
})

export const sucursalDeEmpresa = z.object({
  id: z.uuid(),
  nombre: z.string(),
  domicilio: z.string().nullable(),
  provinciaCodigo: z.number().int().nullable(),
  localidad: z.string().nullable(),
  telefono: z.string().nullable(),
  activa: z.boolean(),
  /** Cuántos usuarios entran a esta sucursal. */
  usuarios: z.number().int(),
  puntosVenta: z.array(puntoVentaSalida),
})

export const empresaConSucursales = z.object({
  id: z.uuid(),
  razonSocial: z.string(),
  nombreFantasia: z.string().nullable(),
  cuit: z.string(),
  condicionIva: z.number().int(),
  inicioActividades: z.string().nullable(),
  domicilioFiscal: z.string().nullable(),
  provinciaCodigo: z.number().int().nullable(),
  convenioMultilateral: z.boolean(),
  numeroIibb: z.string().nullable(),
  sucursales: z.array(sucursalDeEmpresa),
})

/** Un texto opcional: vacío es «no tiene», no una cadena vacía guardada. */
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()

const datosEmpresa = z.object({
  razonSocial: z.string().trim().min(2, 'Falta la razón social'),
  nombreFantasia: opcional,
  condicionIva: z.number().int(),
  inicioActividades: z.iso.date().nullable(),
  domicilioFiscal: opcional,
  provinciaCodigo: z.number().int().nullable(),
  convenioMultilateral: z.boolean(),
  numeroIibb: opcional,
})

const datosSucursal = z.object({
  nombre: z.string().trim().min(2, 'Falta el nombre'),
  domicilio: opcional,
  provinciaCodigo: z.number().int().nullable(),
  localidad: opcional,
  telefono: opcional,
})

const datosPuntoVenta = z.object({
  uso: z.enum(USOS_PUNTO_VENTA),
  modo: z.enum(MODOS_PUNTO_VENTA),
  predeterminado: z.boolean(),
})

const NO_ENCONTRADA = {
  NO_ENCONTRADA: { status: 404, message: 'No existe en la concesionaria' },
} as const

const REFERENCIA_INVALIDA = {
  REFERENCIA_INVALIDA: {
    status: 422,
    message: 'La condición frente al IVA o la provincia no están en el catálogo',
  },
} as const

export const contratoOrganizacion = {
  catalogos: conSesion
    .route({
      method: 'GET',
      path: '/catalogos/organizacion',
      tags: [TAG],
      operationId: 'catalogosOrganizacion',
      summary: 'Condiciones frente al IVA y provincias',
    })
    .output(
      z.object({
        condicionesIva: z.array(z.object({ codigo: z.number().int(), descripcion: z.string() })),
        provincias: z.array(z.object({ codigo: z.number().int(), nombre: z.string() })),
      }),
    ),

  listar: conPermiso('nucleo', 'ver', 'Empresa')
    .route({
      method: 'GET',
      path: '/empresas',
      tags: [TAG],
      operationId: 'listarEmpresas',
      summary: 'Razones sociales, con sus sucursales y puntos de venta',
    })
    .output(z.object({ datos: z.array(empresaConSucursales) })),

  crearEmpresa: conPermiso('nucleo', 'crear', 'Empresa')
    .route({
      method: 'POST',
      path: '/empresas',
      tags: [TAG],
      operationId: 'crearEmpresa',
      summary: 'Alta de una razón social',
      successStatus: 201,
    })
    .input(datosEmpresa.extend({ cuit }))
    .errors({
      ...REFERENCIA_INVALIDA,
      CUIT_DUPLICADO: { status: 409, message: 'Esa razón social ya está cargada con ese CUIT' },
    })
    .output(empresaConSucursales),

  editarEmpresa: conPermiso('nucleo', 'editar', 'Empresa')
    .route({
      method: 'PUT',
      path: '/empresas/{id}',
      tags: [TAG],
      operationId: 'editarEmpresa',
      summary: 'Modificar los datos de una razón social',
      description: 'El CUIT no se cambia: otro CUIT es otra empresa, y se da de alta aparte.',
    })
    .input(datosEmpresa.extend({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADA, ...REFERENCIA_INVALIDA })
    .output(empresaConSucursales),

  crearSucursal: conPermiso('nucleo', 'crear', 'Empresa')
    .route({
      method: 'POST',
      path: '/empresas/{empresaId}/sucursales',
      tags: [TAG],
      operationId: 'crearSucursal',
      summary: 'Alta de una sucursal',
      successStatus: 201,
      description: 'Quien la da de alta queda con acceso a ella, para poder entrar a cargarla.',
    })
    .input(datosSucursal.extend({ empresaId: z.uuid() }))
    .errors({ ...NO_ENCONTRADA, ...REFERENCIA_INVALIDA })
    .output(empresaConSucursales),

  editarSucursal: conPermiso('nucleo', 'editar', 'Empresa')
    .route({
      method: 'PUT',
      path: '/sucursales/{id}',
      tags: [TAG],
      operationId: 'editarSucursal',
      summary: 'Modificar una sucursal, o desactivarla',
      description:
        'No se borra: se desactiva. No se puede desactivar si hay usuarios que sólo entran a ' +
        'ésa, porque se quedarían sin poder entrar al sistema.',
    })
    .input(datosSucursal.extend({ id: z.uuid(), activa: z.boolean() }))
    .errors({
      ...NO_ENCONTRADA,
      ...REFERENCIA_INVALIDA,
      SUCURSAL_CON_USUARIOS: {
        status: 409,
        message: 'Hay usuarios que sólo entran a esta sucursal: dales acceso a otra antes',
        data: z.object({ usuarios: z.array(z.string()) }),
      },
    })
    .output(empresaConSucursales),

  crearPuntoVenta: conPermiso('nucleo', 'crear', 'Empresa')
    .route({
      method: 'POST',
      path: '/sucursales/{sucursalId}/puntos-venta',
      tags: [TAG],
      operationId: 'crearPuntoVenta',
      summary: 'Alta de un punto de venta',
      successStatus: 201,
      description:
        'El número es el que AFIP le asignó, y es único por CUIT: dos razones sociales del ' +
        'mismo grupo pueden tener las dos su punto de venta 1.',
    })
    .input(
      datosPuntoVenta.extend({
        sucursalId: z.uuid(),
        numero: z.number().int().min(1, 'Va de 1 a 99999').max(99999, 'Va de 1 a 99999'),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      PUNTO_VENTA_DUPLICADO: {
        status: 409,
        message: 'Esa razón social ya tiene un punto de venta con ese número',
      },
    })
    .output(empresaConSucursales),

  editarPuntoVenta: conPermiso('nucleo', 'editar', 'Empresa')
    .route({
      method: 'PUT',
      path: '/puntos-venta/{id}',
      tags: [TAG],
      operationId: 'editarPuntoVenta',
      summary: 'Modificar un punto de venta, o desactivarlo',
      description:
        'El número no se cambia: es el de AFIP. Marcarlo como predeterminado desmarca al ' +
        'que lo era para la misma sucursal y el mismo uso.',
    })
    .input(datosPuntoVenta.extend({ id: z.uuid(), activo: z.boolean() }))
    .errors(NO_ENCONTRADA)
    .output(empresaConSucursales),
}
