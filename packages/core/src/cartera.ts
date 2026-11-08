/**
 * El stock de unidades. Lo que varía entre concesionarias es configuración, no una regla: ver
 * `docs/tecnicos/ventas-de-unidades.md`.
 */

export const CONDICIONES_UNIDAD = ['0km', 'usado'] as const
export const TENENCIAS_UNIDAD = ['propia', 'consignacion'] as const
export const ORIGENES_UNIDAD = [
  'fabrica',
  'compra',
  'parte_de_pago',
  'consignacion',
  'otro',
] as const
export const ESTADOS_UNIDAD = ['disponible', 'reservada', 'vendida', 'retirada'] as const
export const ESTADOS_RESERVA = ['activa', 'vencida', 'liberada', 'desplazada'] as const
export const MONEDAS_UNIDAD = ['ARS', 'USD'] as const

export const MODOS_RESERVA = ['bloquea', 'avisa'] as const
export const TRASLADOS_ENTRE_EMPRESAS = ['solo_ubicacion', 'con_comprobante'] as const

export type CondicionUnidad = (typeof CONDICIONES_UNIDAD)[number]
export type TenenciaUnidad = (typeof TENENCIAS_UNIDAD)[number]
export type OrigenUnidad = (typeof ORIGENES_UNIDAD)[number]
export type EstadoUnidad = (typeof ESTADOS_UNIDAD)[number]
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number]
export type MonedaUnidad = (typeof MONEDAS_UNIDAD)[number]
export type ModoReserva = (typeof MODOS_RESERVA)[number]
export type TrasladoEntreEmpresas = (typeof TRASLADOS_ENTRE_EMPRESAS)[number]

export interface ConfigCartera {
  trasladoEntreEmpresas: TrasladoEntreEmpresas
  reservaModo: ModoReserva
  /** Null: la reserva no vence sola. */
  reservaDias: number | null
  reservaExigeSena: boolean
  tenenciaUsado: TenenciaUnidad
  moneda: MonedaUnidad
}

/** Lo que usa una concesionaria que no tocó nada. Supuestos: se revisan con el piloto. */
export const CONFIG_CARTERA_POR_OMISION: Readonly<ConfigCartera> = {
  trasladoEntreEmpresas: 'solo_ubicacion',
  reservaModo: 'bloquea',
  reservaDias: 7,
  reservaExigeSena: false,
  tenenciaUsado: 'propia',
  moneda: 'ARS',
}

export const MAXIMO_DIAS_RESERVA = 365
export const MINIMO_MOTIVO_CARTERA = 5
export const MAXIMO_MOTIVO_CARTERA = 200
