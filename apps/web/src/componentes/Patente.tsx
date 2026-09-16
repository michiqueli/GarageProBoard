/**
 * La patente dibujada como chapa, no como texto. Tomado de GarageTick.
 *
 * El ojo engancha una chapa mucho más rápido que un texto: en un listado largo, el que
 * busca un auto lo reconoce por la forma antes de leerla. Y en un taller entran los dos
 * formatos todo el tiempo:
 *
 * - **Mercosur** (desde 2016): `AB 123 CD`, blanca con la banda azul arriba.
 * - **Anterior** (1995-2016): `ABC 123`, negra con letras blancas.
 *
 * El 0 km todavía no tiene patente, y un hueco vacío parece un dato que falta. Se dibuja
 * una chapa Mercosur que dice `KM 000 KM`, con la banda que dice **SIN PATENTAR**: se
 * reconoce de lejos y no se confunde con una real.
 *
 * El texto de la chapa queda como texto: se puede copiar, y un lector de pantalla lo
 * lee. La banda es decoración.
 */

const MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/
const ANTERIOR = /^[A-Z]{3}\d{3}$/

export type TamanoPatente = 'chico' | 'grande'

const ANCHO: Record<TamanoPatente, string> = {
  chico: 'w-[5.4rem]',
  grande: 'w-[7.5rem]',
}
const LETRAS: Record<TamanoPatente, string> = {
  chico: 'py-px text-[0.8125rem]',
  grande: 'py-0.5 text-lg',
}
const BANDA: Record<TamanoPatente, string> = {
  chico: 'py-px text-[0.3125rem]',
  grande: 'py-0.5 text-[0.4375rem]',
}

export function Patente({
  dominio,
  tamano = 'chico',
}: {
  dominio: string | null
  tamano?: TamanoPatente
}) {
  const limpio = (dominio ?? '').toUpperCase().replace(/[\s-]/g, '')

  if (!limpio) return <Mercosur banda="SIN PATENTAR" texto="KM 000 KM" tamano={tamano} tenue />

  if (MERCOSUR.test(limpio)) {
    return (
      <Mercosur
        banda="REPÚBLICA ARGENTINA"
        texto={`${limpio.slice(0, 2)} ${limpio.slice(2, 5)} ${limpio.slice(5)}`}
        tamano={tamano}
      />
    )
  }

  if (ANTERIOR.test(limpio)) {
    return (
      <span
        className={`inline-flex shrink-0 flex-col overflow-hidden rounded-[3px] border border-patente-vieja-tinta/40 bg-patente-vieja text-center leading-none whitespace-nowrap text-patente-vieja-tinta ${ANCHO[tamano]}`}
      >
        <span aria-hidden="true" className={`font-semibold tracking-[0.2em] ${BANDA[tamano]}`}>
          ARGENTINA
        </span>
        <span className={`font-mono font-bold tracking-wider ${LETRAS[tamano]}`}>
          {`${limpio.slice(0, 3)} ${limpio.slice(3)}`}
        </span>
      </span>
    )
  }

  // No es de ningún formato conocido (una patente provincial vieja, un error de carga):
  // se muestra tal cual antes que esconderla.
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] border border-patente-tinta/40 bg-patente px-1.5 font-mono font-semibold whitespace-nowrap text-patente-tinta ${LETRAS[tamano]}`}
    >
      {limpio}
    </span>
  )
}

function Mercosur({
  banda,
  texto,
  tamano,
  tenue = false,
}: {
  banda: string
  texto: string
  tamano: TamanoPatente
  tenue?: boolean
}) {
  return (
    <span
      className={`inline-flex shrink-0 flex-col overflow-hidden rounded-[3px] border border-patente-tinta/40 bg-patente text-center leading-none whitespace-nowrap ${ANCHO[tamano]}`}
    >
      <span
        aria-hidden={tenue ? undefined : true}
        className={`bg-patente-banda font-semibold tracking-[0.12em] text-patente ${BANDA[tamano]}`}
      >
        {banda}
      </span>
      <span
        // En el 0 km, «KM 000 KM» es dibujo: lo que se lee es la banda.
        aria-hidden={tenue ? true : undefined}
        className={`font-mono font-bold tracking-wider ${LETRAS[tamano]} ${
          tenue ? 'text-patente-tinta/45' : 'text-patente-tinta'
        }`}
      >
        {texto}
      </span>
    </span>
  )
}
