import {
  type ControlInventario,
  ELEMENTOS_INVENTARIO,
  type ElementoInventario,
  INVENTARIO,
} from '@gpb/core'
import { useId } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoListo } from '../../componentes/iconos.tsx'

export type Inventario = Partial<Record<ElementoInventario, ControlInventario>>

const OPCIONES: Array<{ valor: ControlInventario; texto: string }> = [
  { valor: 'esta', texto: 'Está' },
  { valor: 'falta', texto: 'Falta' },
]

/**
 * Lo que vino con el auto, uno por uno delante del cliente.
 *
 * **Tres valores y no dos**: sin tocar no es «está», es «no se revisó». Si la casilla vacía
 * dijera que está, un inventario que nadie hizo diría que el auto vino completo — y eso es lo
 * que firma el cliente.
 *
 * Lo normal es que casi todo esté: se marca lo que falta y el resto con un solo botón. Tocar
 * de nuevo la opción elegida la deja sin revisar, por si fue un dedo errado.
 *
 * Cada renglón es un grupo de dos radios, que se recorre con ← →; con
 * `Tab` se pasa al renglón siguiente.
 */
export function InventarioRecepcion({
  inventario,
  onChange,
}: {
  inventario: Inventario
  onChange?: ((inventario: Inventario) => void) | undefined
}) {
  const editable = Boolean(onChange)
  const sinRevisar = ELEMENTOS_INVENTARIO.filter((e) => !inventario[e])

  function poner(e: ElementoInventario, valor: ControlInventario | undefined) {
    const nuevo = { ...inventario }
    if (valor) nuevo[e] = valor
    else delete nuevo[e]
    onChange?.(nuevo)
  }

  if (!editable) {
    const revisados = ELEMENTOS_INVENTARIO.filter((e) => inventario[e])
    if (!revisados.length) {
      return <p className="text-dato text-texto-suave">No se revisó qué vino con el auto.</p>
    }
    return (
      <ul aria-label="Vino con el auto" className="grid gap-x-4 gap-y-1 text-dato sm:grid-cols-2">
        {ELEMENTOS_INVENTARIO.map((e) => (
          <li key={e} className="flex justify-between gap-2">
            <span>{INVENTARIO[e]}</span>
            {inventario[e] === 'falta' ? (
              <span className="font-semibold text-critico">Falta</span>
            ) : inventario[e] === 'esta' ? (
              <span className="text-texto-suave">Está</span>
            ) : (
              <span className="text-texto-tenue">Sin revisar</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="grid gap-2">
      <ul aria-label="Vino con el auto" className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {ELEMENTOS_INVENTARIO.map((e) => (
          <li key={e} className="flex items-center justify-between gap-2 text-dato">
            <span>{INVENTARIO[e]}</span>
            <Renglon nombre={INVENTARIO[e]} valor={inventario[e]} onChange={(v) => poner(e, v)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Boton
          icono={<IconoListo />}
          deshabilitado={!sinRevisar.length}
          onClick={() =>
            onChange?.({
              ...inventario,
              ...Object.fromEntries(sinRevisar.map((e) => [e, 'esta' as const])),
            })
          }
        >
          {sinRevisar.length === ELEMENTOS_INVENTARIO.length ? 'Está todo' : 'El resto está'}
        </Boton>
        <span className="text-etiqueta text-texto-tenue">
          {sinRevisar.length ? `${sinRevisar.length} sin revisar` : 'Revisado entero'}
        </span>
      </div>
    </div>
  )
}

function Renglon({
  nombre,
  valor,
  onChange,
}: {
  nombre: string
  valor: ControlInventario | undefined
  onChange: (v: ControlInventario | undefined) => void
}) {
  const grupo = useId()

  return (
    <fieldset className="flex shrink-0 gap-1">
      <legend className="sr-only">{nombre}</legend>
      {OPCIONES.map((o) => {
        const elegida = valor === o.valor
        return (
          <label
            key={o.valor}
            className={`inline-flex h-campo min-w-16 cursor-pointer items-center justify-center rounded-base border px-2.5 text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
              !elegida
                ? 'border-borde text-texto-suave'
                : o.valor === 'falta'
                  ? 'border-critico bg-critico-suave font-semibold text-critico'
                  : 'border-ok bg-ok-suave font-semibold text-ok'
            }`}
          >
            <input
              type="radio"
              name={grupo}
              className="sr-only"
              checked={elegida}
              onChange={() => onChange(o.valor)}
              // Un radio elegido no dispara onChange al tocarlo de nuevo: el clic es el que lo
              // deja sin revisar, por si fue un dedo errado.
              onClick={() => elegida && onChange(undefined)}
            />
            {o.texto}
          </label>
        )
      })}
    </fieldset>
  )
}
