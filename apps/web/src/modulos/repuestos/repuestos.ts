import type { api } from '../../sesion/cliente.ts'

export type RepuestoResumen = Awaited<ReturnType<typeof api.repuestos.listar>>['datos'][number]
export type Pedido = Awaited<ReturnType<typeof api.pedidosRepuestos.ficha>>
export type PedidoResumen = Awaited<ReturnType<typeof api.pedidosRepuestos.listar>>['datos'][number]
export type Compra = Awaited<ReturnType<typeof api.compras.ficha>>

/** «000045», como se dice en el mostrador. */
export const seis = (n: number) => String(n).padStart(6, '0')
export const nombrePedido = (n: number) => `Pedido ${seis(n)}`
export const nombreCompra = (n: number) => `Compra ${seis(n)}`

/** «1.234,50» o «1234.50» → «1234.50». Vacío queda vacío. */
export function aDecimal(texto: string): string {
  const limpio = texto.trim().replace(/\s/g, '')
  return limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio
}
export const esNumero = (t: string) => /^[0-9]+(\.[0-9]{1,4})?$/.test(aDecimal(t))
export const sinCeros = (t: string) => (t.includes('.') ? t.replace(/\.?0+$/, '') : t)

/** «2,5» para mostrar una cantidad; los enteros sin decimales. */
export function cantidad(valor: string) {
  const n = Number(valor)
  return Number.isInteger(n) ? String(n) : valor.replace('.', ',')
}

/** El código de fábrica como lo guarda la API: sin espacios ni guiones, en mayúsculas. */
export const normalizarCodigo = (codigo: string) => codigo.toUpperCase().replace(/[\s-]/g, '')

/** El chasis como lo guarda la API. */
export const normalizarChasis = (chasis: string) => chasis.toUpperCase().replace(/[\s-]/g, '')
export const chasisValido = (chasis: string) =>
  /^[A-HJ-NPR-Z0-9]{6,17}$/.test(normalizarChasis(chasis))

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  inicial: 'Inicial',
  ajuste: 'Ajuste',
  compra: 'Compra',
  orden: 'Taller',
  mostrador: 'Mostrador',
  transferencia: 'Transferencia',
}
