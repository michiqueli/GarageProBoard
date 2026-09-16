/**
 * La patente dibujada como chapa, no como texto.
 *
 * En un tablero, el ojo engancha una chapa mucho más rápido que un string: el
 * jefe mira desde la puerta del taller y reconoce el auto.
 *
 * Conviven dos formatos y hay que dibujar los dos, porque en un taller entran
 * los dos todo el tiempo:
 *   · Mercosur (desde 2016):  AB 123 CD  — banda azul arriba
 *   · Anterior:               AAA 123    — fondo negro, letras blancas
 *
 * Y el caso que muerde: el 0 km todavía no tiene patente. No puede quedar un
 * rectángulo vacío, así que degrada al modelo del vehículo.
 */

const MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/
const ANTERIOR = /^[A-Z]{3}\d{3}$/

type Tamano = 'sm' | 'md'

export function Patente({
  valor,
  reemplazo,
  tamano = 'md',
}: {
  valor: string | null
  reemplazo?: string
  tamano?: Tamano
}) {
  const limpio = (valor ?? '').toUpperCase().replace(/[\s-]/g, '')
  const chico = tamano === 'sm'

  if (!limpio) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded border border-dashed border-neutral-600 px-2 text-neutral-500 ${
          chico ? 'h-6 text-[11px]' : 'h-8 text-xs'
        }`}
      >
        {reemplazo ?? 'sin patente'}
      </span>
    )
  }

  if (MERCOSUR.test(limpio)) {
    const texto = `${limpio.slice(0, 2)} ${limpio.slice(2, 5)} ${limpio.slice(5)}`
    return (
      <span
        className={`inline-flex shrink-0 flex-col overflow-hidden whitespace-nowrap rounded border border-neutral-400 bg-white leading-none ${
          chico ? 'w-[86px]' : 'w-[104px]'
        }`}
      >
        <span
          className={`bg-[#0b3ea8] text-center font-semibold tracking-[0.14em] text-white ${
            chico ? 'py-[1px] text-[6px]' : 'py-[2px] text-[7px]'
          }`}
        >
          ARGENTINA
        </span>
        <span
          className={`text-center font-bold tracking-wider text-black tabular-nums ${
            chico ? 'py-[2px] text-[13px]' : 'py-[3px] text-base'
          }`}
        >
          {texto}
        </span>
      </span>
    )
  }

  if (ANTERIOR.test(limpio)) {
    const texto = `${limpio.slice(0, 3)} ${limpio.slice(3)}`
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded border border-neutral-500 bg-black font-bold tracking-wider text-white tabular-nums ${
          chico ? 'h-6 w-[86px] text-[13px]' : 'h-8 w-[104px] text-base'
        }`}
      >
        {texto}
      </span>
    )
  }

  // No matchea ningún formato conocido: se muestra crudo antes que esconderlo.
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded border border-neutral-500 bg-neutral-100 font-semibold text-black ${
        chico ? 'h-6 px-2 text-[11px]' : 'h-8 px-2 text-sm'
      }`}
    >
      {limpio}
    </span>
  )
}
