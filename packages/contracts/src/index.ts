import { oc } from '@orpc/contract'
import { z } from 'zod'
import { chasis, dominio, paginado, problema } from './comunes.ts'

export * from './comunes.ts'

export const vehiculoSalida = z.object({
  id: z.uuid(),
  chasis: z.string(),
  dominio: z.string().nullable(),
  anio: z.number().int().nullable(),
  color: z.string().nullable(),
})

/**
 * El contrato vive acá y no dentro de la API a propósito: es lo que hace que
 * agregar `apps/mobile` más adelante sea sumar un consumidor y no una migración.
 *
 * oRPC en vez de ts-rest porque ts-rest estable todavía exige zod 3 y topa en
 * NestJS 11. oRPC se apoya en standard-schema, así que zod 4 es nativo, y su
 * paquete de OpenAPI mantiene la API como REST de verdad para los consumidores
 * que no son nuestro front.
 */
export const contrato = {
  salud: oc
    .route({ method: 'GET', path: '/salud', summary: 'Chequeo de vida del servicio' })
    .output(z.object({ estado: z.literal('ok'), version: z.string() })),

  vehiculos: {
    listar: oc
      .route({ method: 'GET', path: '/vehiculos', summary: 'Vehículos del tenant' })
      .input(
        paginado.extend({
          // El mecánico busca por la patente que ve en el parabrisas; el
          // administrativo, por chasis. Los dos entran por el mismo campo.
          buscar: z.string().optional(),
        }),
      )
      .output(z.object({ datos: z.array(vehiculoSalida), total: z.number().int() })),

    crear: oc
      .route({ method: 'POST', path: '/vehiculos', summary: 'Alta de vehículo' })
      .input(
        z.object({
          chasis,
          dominio: dominio.nullish(),
          anio: z.number().int().min(1900).max(2100).optional(),
          color: z.string().optional(),
        }),
      )
      .errors({
        CHASIS_DUPLICADO: { message: 'Ya hay un vehículo con ese chasis', data: problema },
      })
      .output(vehiculoSalida),
  },
}

export type Contrato = typeof contrato
