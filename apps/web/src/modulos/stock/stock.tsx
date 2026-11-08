import { formatearImporte } from '@gpb/core'
import type { api } from '../../sesion/cliente.ts'

export type Unidad = Awaited<ReturnType<typeof api.cartera.listar>>['datos'][number]

export const CONDICION = { '0km': '0 km', usado: 'Usado' } as const
export const TENENCIA = { propia: 'Propia', consignacion: 'Consignación' } as const
export const ORIGEN = {
  fabrica: 'Fábrica',
  compra: 'Compra',
  parte_de_pago: 'Parte de pago',
  consignacion: 'Consignación',
  otro: 'Otro',
} as const

export const importeUnidad = (precio: string | null, moneda: 'ARS' | 'USD') =>
  precio === null ? '—' : `${moneda === 'USD' ? 'US$' : '$'} ${formatearImporte(precio)}`

export const nombreUnidad = (u: Pick<Unidad, 'vehiculo'>) =>
  [u.vehiculo.marca, u.vehiculo.modelo, u.vehiculo.anio].filter(Boolean).join(' ') ||
  'Sin marca cargada'

export const fechaCorta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { dateStyle: 'short' })

/** Forma además de color: llena pide algo, contorneada está en curso, sin píldora ya cerró. */
export function EstadoUnidad({ estado }: { estado: Unidad['estado'] }) {
  if (estado === 'reservada') {
    return (
      <span className="rounded-full bg-atencion-suave px-2 text-etiqueta font-semibold text-atencion">
        Reservada
      </span>
    )
  }
  if (estado === 'disponible') {
    return (
      <span className="rounded-full border border-ok px-2 text-etiqueta text-ok">Disponible</span>
    )
  }
  return (
    <span className="text-etiqueta text-texto-tenue">
      {estado === 'vendida' ? 'Vendida' : 'Retirada'}
    </span>
  )
}
