import { CHARGE_LABEL, WORK_ORDER_STATUS_LABEL } from '@garagetick/shared'
import type { Charge, WorkOrderStatus } from '@garagetick/shared'

export function Titulo({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-white">{titulo}</h1>
      {detalle && <p className="mt-1 text-sm text-neutral-500">{detalle}</p>}
    </header>
  )
}

/**
 * El cargo es el corte que le importa a la concesionaria: la garantía la paga
 * la terminal, tarde y mal. Por eso tiene color propio y no es una columna más.
 */
const COLOR_CARGO: Record<Charge, string> = {
  customer: 'border-sky-600/40 bg-sky-500/10 text-sky-300',
  warranty: 'border-amber-600/40 bg-amber-500/10 text-amber-300',
  internal: 'border-neutral-600/40 bg-neutral-500/10 text-neutral-300',
  other: 'border-neutral-700 bg-neutral-800 text-neutral-400',
}

export function EtiquetaCargo({ cargo }: { cargo: Charge }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${COLOR_CARGO[cargo]}`}
    >
      {CHARGE_LABEL[cargo]}
    </span>
  )
}

const COLOR_ESTADO: Record<WorkOrderStatus, string> = {
  open: 'text-neutral-400',
  in_progress: 'text-emerald-400',
  on_hold: 'text-amber-400',
  finished: 'text-sky-400',
  invoiced: 'text-neutral-500',
  cancelled: 'text-red-400',
}

export function EtiquetaEstado({ estado }: { estado: WorkOrderStatus }) {
  return (
    <span className={`text-sm font-medium ${COLOR_ESTADO[estado]}`}>
      {WORK_ORDER_STATUS_LABEL[estado]}
    </span>
  )
}

export function Tarjeta({
  rotulo,
  valor,
  detalle,
  acento,
}: {
  rotulo: string
  valor: string
  detalle?: string
  acento?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{rotulo}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${acento ?? 'text-white'}`}>
        {valor}
      </div>
      {detalle && <div className="mt-1 text-sm text-neutral-500">{detalle}</div>}
    </div>
  )
}
