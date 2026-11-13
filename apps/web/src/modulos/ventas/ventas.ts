import type { api } from '../../sesion/cliente.ts'

export type Venta = Awaited<ReturnType<typeof api.ventas.ficha>>
export type VentaResumen = Awaited<ReturnType<typeof api.ventas.listar>>['datos'][number]

export const ESTADO_VENTA = {
  borrador: 'Borrador',
  confirmada: 'Confirmada',
  anulada: 'Anulada',
} as const

export const TIPO_CONCEPTO = {
  gasto_cliente: 'Gasto que paga el cliente',
  descuento: 'Descuento',
  costo_venta: 'Costo de la venta',
} as const

export const MEDIO_PAGO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  tarjeta: 'Tarjeta',
  financiacion: 'Financiación',
  usado: 'Usado en parte de pago',
  sena: 'Seña',
  otro: 'Otro',
} as const

export const nombreVenta = (numero: number) => `Venta ${String(numero).padStart(6, '0')}`

export const opcionesDe = <T extends string>(textos: Record<T, string>) =>
  (Object.entries(textos) as Array<[T, string]>).map(([valor, texto]) => ({ valor, texto }))
