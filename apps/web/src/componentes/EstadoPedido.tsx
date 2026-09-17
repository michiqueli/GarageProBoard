type EstadoPedido = 'abierto' | 'en_caja' | 'facturado' | 'entregado' | 'anulado'
type EstadoCompra = 'pedida' | 'recibida' | 'anulada'

/**
 * Estado de un pedido de repuestos o de una compra, con la misma regla que `EstadoOT`: llena
 * si alguien tiene que hacer algo, contorneada si está en curso, sin píldora si está cerrado.
 */
const PRESENTACION: Record<
  EstadoPedido | EstadoCompra,
  { etiqueta: string; forma: 'llena' | 'contorno' | 'texto'; clase: string }
> = {
  abierto: { etiqueta: 'Abierto', forma: 'llena', clase: 'bg-marca text-fondo' },
  en_caja: { etiqueta: 'En caja', forma: 'llena', clase: 'bg-ok text-fondo' },
  facturado: { etiqueta: 'Facturado', forma: 'texto', clase: 'text-texto-tenue' },
  entregado: { etiqueta: 'Entregado al taller', forma: 'texto', clase: 'text-texto-tenue' },
  anulado: { etiqueta: 'Anulado', forma: 'texto', clase: 'text-critico line-through' },
  pedida: { etiqueta: 'Esperando que llegue', forma: 'contorno', clase: 'text-atencion' },
  recibida: { etiqueta: 'Recibida', forma: 'texto', clase: 'text-texto-tenue' },
  anulada: { etiqueta: 'Anulada', forma: 'texto', clase: 'text-critico line-through' },
}

export function EstadoPedido({ estado }: { estado: EstadoPedido | EstadoCompra }) {
  const p = PRESENTACION[estado]
  if (p.forma === 'texto') return <span className={`text-etiqueta ${p.clase}`}>{p.etiqueta}</span>
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-px text-[11px] font-semibold ${p.forma === 'contorno' ? 'border border-current' : ''} ${p.clase}`}
    >
      {p.etiqueta}
    </span>
  )
}
