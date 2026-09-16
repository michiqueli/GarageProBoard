import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from 'react'

/**
 * Las piezas del back-office. Pocas y chicas: es un panel que usan dos personas, y lo
 * que importa es que no se equivoquen, no que sea lindo.
 *
 * Mismos tokens y mismas reglas que la aplicación de los clientes — densidad, estado en
 * forma y color, foco visible — sin el sistema de atajos configurables, que acá no tiene
 * a quién servirle.
 */

const BOTON = {
  principal: 'border-marca bg-marca-suave font-semibold text-marca hover:bg-marca hover:text-fondo',
  normal: 'border-borde text-texto-suave hover:bg-superficie-2 hover:text-texto',
  peligro: 'border-critico text-critico hover:bg-critico hover:text-fondo',
} as const

export function Boton({
  variante = 'normal',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof BOTON }) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-campo items-center justify-center gap-2 rounded-base border px-3 text-dato disabled:cursor-default disabled:opacity-50 ${BOTON[variante]} ${className}`}
    />
  )
}

export function Campo({
  etiqueta,
  ayuda,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  const id = useId()

  // La ayuda va afuera de la etiqueta y enganchada con `aria-describedby`: adentro se
  // pegaría al nombre del campo, y un lector de pantalla diría «Motivo Queda en el
  // historial» como si fuera una sola cosa.
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <input
        {...props}
        id={id}
        {...(ayuda ? { 'aria-describedby': `${id}-ayuda` } : {})}
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none placeholder:text-texto-tenue focus:border-marca"
      />
      {ayuda && (
        <span id={`${id}-ayuda`} className="text-etiqueta text-texto-tenue">
          {ayuda}
        </span>
      )}
    </div>
  )
}

/**
 * El estado, en forma además de color — la misma regla que las órdenes de trabajo:
 *
 *   llena        alguien tiene que hacer algo (suspendida, vencida)
 *   contorneada  en curso normal (activa, vigente)
 *   sin píldora  no aplica (no contratado)
 */
export function Estado({
  forma,
  tono,
  children,
}: {
  forma: 'llena' | 'contorno' | 'texto'
  tono: 'ok' | 'atencion' | 'critico' | 'info' | 'tenue'
  children: ReactNode
}) {
  const color = {
    ok: forma === 'llena' ? 'bg-ok text-fondo' : 'border-ok text-ok',
    atencion: forma === 'llena' ? 'bg-atencion text-fondo' : 'border-atencion text-atencion',
    critico: forma === 'llena' ? 'bg-critico text-fondo' : 'border-critico text-critico',
    info: forma === 'llena' ? 'bg-info text-fondo' : 'border-info text-info',
    tenue: 'text-texto-tenue',
  }[tono]

  if (forma === 'texto') return <span className={`text-etiqueta ${color}`}>{children}</span>

  return (
    <span
      className={`inline-flex items-center rounded-full border border-transparent px-2 text-etiqueta font-semibold whitespace-nowrap ${color}`}
    >
      {children}
    </span>
  )
}

export function Aviso({ tono, children }: { tono: 'critico' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={tono === 'critico' ? 'alert' : 'status'}
      className={`rounded-base border px-3 py-2 text-dato ${tono === 'critico' ? 'border-critico text-critico' : 'border-ok text-ok'}`}
    >
      {children}
    </p>
  )
}

/** Cargando: la forma del contenido, no un spinner. */
export function Esqueleto({ filas = 4 }: { filas?: number }) {
  return (
    <div className="grid gap-px" role="status" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: filas de relleno, sin identidad
        <div key={i} className="h-fila animate-pulse rounded-base bg-superficie-2" />
      ))}
    </div>
  )
}
