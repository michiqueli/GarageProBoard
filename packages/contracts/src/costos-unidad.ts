import {
  MAXIMO_MOTIVO_CARTERA,
  MAXIMO_NOMBRE_CATEGORIA_GASTO,
  MINIMO_MOTIVO_CARTERA,
  MONEDAS_UNIDAD,
  TIPOS_CONCEPTO_UNIDAD,
} from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { importe } from './comunes.ts'

const TAG = 'Stock de unidades'
const moneda = z.enum(MONEDAS_UNIDAD)
const NO_ENCONTRADA = { NO_ENCONTRADA: { status: 404, message: 'Esa unidad no existe' } } as const

export const categoriaGasto = z.object({
  id: z.uuid(),
  nombre: z.string(),
  activo: z.boolean(),
})

export const conceptoUnidad = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_CONCEPTO_UNIDAD),
  categoria: z.string().nullable(),
  descripcion: z.string(),
  proveedor: z.string().nullable(),
  comprobante: z.string().nullable(),
  fecha: z.iso.date(),
  importe: z.string(),
  moneda,
  cotizacion: z.string().nullable(),
  /** Una anulada se sigue viendo, y no suma. */
  anulacionMotivo: z.string().nullable(),
})

export const costosDeUnidad = z.object({
  moneda,
  precio: z.string().nullable(),
  conceptos: z.array(conceptoUnidad),
  totales: z.object({
    compra: z.string(),
    gastos: z.string(),
    bonificaciones: z.string(),
    costo: z.string(),
    margen: z.string().nullable(),
    margenPorcentaje: z.string().nullable(),
    sinConvertir: z.number().int(),
  }),
})

const positivo = importe.refine((v) => Number(v) > 0, 'Tiene que ser mayor a cero')
const nombre = z
  .string()
  .trim()
  .min(1, 'Escribí el nombre')
  .max(MAXIMO_NOMBRE_CATEGORIA_GASTO, `Es largo: hasta ${MAXIMO_NOMBRE_CATEGORIA_GASTO} letras`)
const salidaCategorias = z.object({ datos: z.array(categoriaGasto) })

/**
 * Lo que costó una unidad. Es un sujeto aparte de la unidad a propósito: quien la vende no tiene
 * por qué saber cuánto se pagó. Ver `docs/tecnicos/ventas-de-unidades.md`.
 */
export const contratoCostosUnidad = {
  ver: conPermiso('cartera', 'ver', 'CostoUnidad')
    .route({
      method: 'GET',
      path: '/stock/{id}/costos',
      tags: [TAG],
      operationId: 'costosDeUnidad',
      summary: 'Lo que costó una unidad y lo que deja',
    })
    .input(z.object({ id: z.uuid() }))
    .errors(NO_ENCONTRADA)
    .output(costosDeUnidad),

  agregar: conPermiso('cartera', 'crear', 'CostoUnidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/costos',
      tags: [TAG],
      operationId: 'agregarCostoDeUnidad',
      summary: 'Sumar la compra, un gasto o una bonificación',
      successStatus: 201,
      description:
        'Cotización en pesos por dólar: hace falta si está en otra moneda que la unidad.',
    })
    .input(
      z.object({
        id: z.uuid(),
        tipo: z.enum(TIPOS_CONCEPTO_UNIDAD),
        categoriaId: z.uuid().nullish(),
        descripcion: z.string().trim().min(1, 'Falta la descripción').max(200),
        proveedorId: z.uuid().nullish(),
        comprobante: z
          .string()
          .trim()
          .max(60)
          .nullish()
          .transform((v) => v || null),
        fecha: z.iso.date().nullish(),
        importe: positivo,
        moneda,
        cotizacion: positivo.nullish(),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      DATO_INVALIDO: { status: 422, message: 'La categoría o el proveedor no existen' },
    })
    .output(costosDeUnidad),

  anular: conPermiso('cartera', 'anular', 'CostoUnidad')
    .route({
      method: 'POST',
      path: '/stock/{id}/costos/{conceptoId}/anular',
      tags: [TAG],
      operationId: 'anularCostoDeUnidad',
      summary: 'Anular un concepto, con motivo',
      description: 'No se borra: deja de sumar y queda a la vista.',
    })
    .input(
      z.object({
        id: z.uuid(),
        conceptoId: z.uuid(),
        motivo: z
          .string()
          .trim()
          .min(MINIMO_MOTIVO_CARTERA, 'Decí por qué: queda escrito')
          .max(MAXIMO_MOTIVO_CARTERA),
      }),
    )
    .errors({
      ...NO_ENCONTRADA,
      YA_ANULADO: { status: 409, message: 'Ese concepto ya está anulado' },
    })
    .output(costosDeUnidad),

  categorias: conPermiso('cartera', 'ver', 'CostoUnidad')
    .route({
      method: 'GET',
      path: '/stock-categorias',
      tags: [TAG],
      operationId: 'categoriasDeGastoDeUnidad',
      summary: 'Las categorías de gasto, también las apagadas',
      description: 'La primera vez recibe las que trae el sistema.',
    })
    .output(salidaCategorias),

  crearCategoria: conPermiso('cartera', 'configurar', 'Unidad')
    .route({
      method: 'POST',
      path: '/stock-categorias',
      tags: [TAG],
      operationId: 'crearCategoriaDeGastoDeUnidad',
      summary: 'Agregar una categoría propia',
      successStatus: 201,
    })
    .input(z.object({ nombre }))
    .errors({ REPETIDA: { status: 409, message: 'Ya hay una categoría con ese nombre' } })
    .output(salidaCategorias),

  editarCategoria: conPermiso('cartera', 'configurar', 'Unidad')
    .route({
      method: 'PUT',
      path: '/stock-categorias/{id}',
      tags: [TAG],
      operationId: 'editarCategoriaDeGastoDeUnidad',
      summary: 'Cambiarle el nombre a una categoría, apagarla o prenderla',
    })
    .input(z.object({ id: z.uuid(), nombre, activo: z.boolean() }))
    .errors({
      NO_ENCONTRADA: { status: 404, message: 'Esa categoría no existe' },
      REPETIDA: { status: 409, message: 'Ya hay una categoría con ese nombre' },
    })
    .output(salidaCategorias),
}
