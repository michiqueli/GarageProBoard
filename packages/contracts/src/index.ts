import type { ContractRouterClient } from '@orpc/contract'
import { z } from 'zod'
import { publico } from './acceso.ts'
import { contratoAuditoria } from './auditoria.ts'
import { contratoAuth } from './auth.ts'
import { contratoCertificados } from './certificados.ts'
import { contratoClientes } from './clientes.ts'
import { contratoComprobantes } from './comprobantes.ts'
import { contratoOrdenes } from './ordenes.ts'
import { contratoOrganizacion } from './organizacion.ts'
import { contratoPadron } from './padron.ts'
import { contratoProveedores } from './proveedores.ts'
import { contratoCompras, contratoPedidosRepuestos, contratoRepuestos } from './repuestos.ts'
import { contratoRoles } from './roles.ts'
import { contratoUsuarios } from './usuarios.ts'
import { contratoVehiculos } from './vehiculos.ts'

export * from './acceso.ts'
export * from './auditoria.ts'
export * from './auth.ts'
export * from './certificados.ts'
export * from './clientes.ts'
export * from './comprobantes.ts'
export * from './comunes.ts'
export * from './ordenes.ts'
export * from './organizacion.ts'
export * from './padron.ts'
export * from './proveedores.ts'
export * from './repuestos.ts'
export * from './roles.ts'
export * from './usuarios.ts'
export * from './vehiculos.ts'

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
  auth: contratoAuth,
  auditoria: contratoAuditoria,
  usuarios: contratoUsuarios,
  roles: contratoRoles,
  organizacion: contratoOrganizacion,
  padron: contratoPadron,
  clientes: contratoClientes,
  certificados: contratoCertificados,
  comprobantes: contratoComprobantes,
  ordenes: contratoOrdenes,
  repuestos: contratoRepuestos,
  pedidosRepuestos: contratoPedidosRepuestos,
  compras: contratoCompras,
  proveedores: contratoProveedores,

  salud: publico
    .route({
      method: 'GET',
      path: '/salud',
      tags: ['Sistema'],
      operationId: 'salud',
      summary: 'Chequeo de vida del servicio',
      description: 'Toca la base: un servicio que responde sin poder consultar no está sano.',
    })
    .output(z.object({ estado: z.literal('ok'), version: z.string() })),

  vehiculos: contratoVehiculos,
}

export type Contrato = typeof contrato

/**
 * El tipo del cliente, listo para usar.
 *
 * Se exporta desde acá para que el front no tenga que depender de `@orpc/contract`
 * directamente: el paquete de contratos es la única frontera con esa librería, igual
 * que `@gpb/db` lo es con drizzle.
 */
export type ClienteApi = ContractRouterClient<typeof contrato>
