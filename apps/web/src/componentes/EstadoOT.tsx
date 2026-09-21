export type Estado =
  | 'recibida'
  | 'presupuestada'
  | 'esperando_autorizacion'
  | 'esperando_repuesto'
  | 'en_proceso'
  | 'terminada'
  | 'facturada'
  | 'entregada'
  | 'anulada'

type Forma = 'llena' | 'contorno' | 'texto'

interface Presentacion {
  etiqueta: string
  forma: Forma
  clase: string
  reloj?: boolean
}

/**
 * El estado de la orden es el dato que más se lee en todo el sistema, así que se
 * codifica en **forma además de color**: uno de cada doce varones no distingue rojo de
 * verde, y en un taller son casi todos varones.
 *
 * La regla, que se lee a tres metros del monitor:
 *
 *   píldora llena       alguien tiene que hacer algo
 *   píldora contorneada está en curso normal
 *   sin píldora         cerrado, no reclama nada
 */
const PRESENTACION: Record<Estado, Presentacion> = {
  recibida: { etiqueta: 'Recibida', forma: 'contorno', clase: 'text-texto-suave' },
  presupuestada: { etiqueta: 'Presupuestada', forma: 'contorno', clase: 'text-info' },
  esperando_autorizacion: {
    etiqueta: 'Esperando autorización',
    forma: 'llena',
    clase: 'bg-atencion text-fondo',
  },
  esperando_repuesto: {
    etiqueta: 'Esperando repuesto',
    forma: 'contorno',
    clase: 'text-atencion',
    reloj: true,
  },
  // Verde y **contorneado**, no lleno: un auto que alguien está trabajando no reclama nada,
  // está en curso normal, que es justo lo que dice la regla de arriba. Lleno y en ámbar —como
  // estaba— lo dejaba casi idéntico a «Esperando autorización», que sí reclama: los dos tokens
  // son ámbar (#f0a621 y #d9962b) y a tres metros son el mismo badge.
  en_proceso: { etiqueta: 'En proceso', forma: 'contorno', clase: 'text-ok' },
  // Terminada espera a caja: alguien tiene que facturarla.
  terminada: { etiqueta: 'Para facturar', forma: 'llena', clase: 'bg-ok text-fondo' },
  // Facturada espera que el cliente la retire: en curso normal. En azul y no en verde para no
  // quedar igual que «En proceso», y porque es un estado administrativo y no del taller.
  facturada: { etiqueta: 'Facturada', forma: 'contorno', clase: 'text-info' },
  entregada: { etiqueta: 'Entregada', forma: 'texto', clase: 'text-texto-tenue' },
  anulada: { etiqueta: 'Anulada', forma: 'texto', clase: 'text-critico line-through' },
}

export function EstadoOT({ estado }: { estado: Estado }) {
  const p = PRESENTACION[estado]

  if (p.forma === 'texto') {
    return <span className={`text-etiqueta ${p.clase}`}>{p.etiqueta}</span>
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold',
        p.forma === 'contorno' ? 'border border-current' : '',
        p.clase,
      ].join(' ')}
    >
      {p.reloj && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      )}
      {p.etiqueta}
    </span>
  )
}
