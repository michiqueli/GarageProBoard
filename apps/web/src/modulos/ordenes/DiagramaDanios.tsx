import {
  CARROCERIAS,
  CARROCERIAS_NOMBRE,
  type Carroceria,
  centro,
  DANIOS,
  dibujo,
  ROTULOS,
  type Silueta,
  TIPOS_DANIO,
  type TipoDanio,
  trazo,
  VISTA,
  type Zona,
  zona,
  zonaEn,
  zonas,
} from '@gpb/core'
import { type KeyboardEvent, type MouseEvent, useId, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoBorrar } from '../../componentes/iconos.tsx'

export interface Danio {
  zona: string
  tipo: TipoDanio
  x: number
  y: number
  nota: string | null
}

/** Forma además de color, como el estado de la orden: la letra dice qué es aunque no se vea el color. */
const COLOR: Record<TipoDanio, string> = {
  rayon: 'text-atencion',
  golpe: 'text-critico',
  roto: 'text-critico',
  falta: 'text-info',
}

const LETRA_A_TIPO = new Map(TIPOS_DANIO.map((t) => [DANIOS[t].letra, t]))

// Dónde cae la segunda, tercera… marca que se pone con teclado en la misma zona: sin esto
// quedarían apiladas en el centro y se verían como una sola.
const CORRIMIENTOS = [
  [0, 0],
  [0, -13],
  [0, 13],
  [-9, -6],
  [9, 6],
  [-9, 6],
  [9, -6],
] as const

const MARGEN = 5

function puntoLibre(z: Zona, cuantas: number) {
  const c = centro(z)
  const [dx, dy] = CORRIMIENTOS[cuantas % CORRIMIENTOS.length] ?? [0, 0]
  return {
    x: Math.min(z.x + z.ancho - MARGEN, Math.max(z.x + MARGEN, c.x + dx)),
    y: Math.min(z.y + z.alto - MARGEN, Math.max(z.y + MARGEN, c.y + dy)),
  }
}

/**
 * La zona que sigue en una dirección, **por dónde está en el dibujo** y no por el orden de la
 * lista: flecha a la derecha desde la puerta izquierda tiene que ir al techo, no a la zona que
 * se declaró después.
 */
function vecina(silueta: Silueta, desde: Zona, dx: number, dy: number): Zona {
  const c = centro(desde)
  let mejor: Zona = desde
  let puntaje = Number.POSITIVE_INFINITY
  for (const z of zonas(silueta)) {
    if (z.id === desde.id) continue
    const o = centro(z)
    const avance = (o.x - c.x) * dx + (o.y - c.y) * dy
    if (avance <= 1) continue
    const costado = Math.abs((o.x - c.x) * dy) + Math.abs((o.y - c.y) * dx)
    const p = avance + costado * 2.5
    if (p < puntaje) {
      puntaje = p
      mejor = z
    }
  }
  return mejor
}

const FLECHAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

export function describirDanio(silueta: Silueta, d: Danio): string {
  return `${DANIOS[d.tipo].nombre} · ${zona(silueta, d.zona)?.nombre ?? d.zona}`
}

/**
 * El auto dibujado de la recepción: se toca donde está el rayón, el golpe, lo roto o lo que
 * falta, y queda la marca con su letra. Es la hoja de papel del mostrador, con la ventaja de
 * que la marca dice en qué pieza cayó.
 *
 * **Con dedo**: se elige qué marcar y se toca el auto, en el punto exacto.
 * **Con teclado**, que es como se usa en el mostrador de escritorio: el dibujo es un solo
 * lugar de `Tab`; adentro, las flechas recorren las piezas por dónde están, la letra (R, G,
 * X, F) marca la pieza en la que se está parado, y `Supr` quita la última marca de esa pieza.
 *
 * Sin `onChange` es de sólo lectura: la ficha de la orden lo muestra así.
 *
 * El dibujo es el que le toca al vehículo —auto, pickup o furgón— y se dibuja uno solo. Las
 * hojas de papel traen las siluetas todas juntas porque el papel no sabe qué auto va a entrar;
 * acá se sabe, así que hacer tachar la que no va sería copiar una limitación del papel.
 */
export function DiagramaDanios({
  danios,
  silueta,
  onChange,
  tactil = false,
}: {
  danios: Danio[]
  silueta: Silueta
  onChange?: ((danios: Danio[]) => void) | undefined
  tactil?: boolean
}) {
  const editable = Boolean(onChange)
  const [tipo, setTipo] = useState<TipoDanio>('rayon')
  const [activa, setActiva] = useState<string>('capot')
  const [conFoco, setConFoco] = useState(false)
  const lienzo = useRef<SVGSVGElement>(null)
  const idAyuda = useId()

  // El capot existe en los tres dibujos, así que cambiar de silueta nunca deja el teclado
  // parado en una pieza que no está.
  const zonaActiva = zona(silueta, activa) ?? zona(silueta, 'capot')
  const enActiva = danios.filter((d) => d.zona === zonaActiva?.id)

  function agregar(d: Omit<Danio, 'nota'>) {
    onChange?.([...danios, { ...d, nota: null }])
  }

  async function quitar(indice: number) {
    const d = danios[indice]
    if (!d || !onChange) return
    const si = await confirmar({
      titulo: `¿Quitar la marca de ${describirDanio(silueta, d).toLowerCase()}?`,
      texto: d.nota ? `Tiene un detalle: «${d.nota}».` : undefined,
      confirmar: 'Quitar la marca',
      peligro: true,
    })
    if (si) onChange(danios.filter((_, i) => i !== indice))
  }

  function tocar(evento: MouseEvent<SVGSVGElement>) {
    if (!editable) return
    const svg = lienzo.current
    const matriz = typeof svg?.getScreenCTM === 'function' ? svg.getScreenCTM() : null
    // El punto exacto del dedo, pasado a coordenadas del dibujo.
    const punto = matriz
      ? new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse())
      : null
    const enPunto = punto ? zonaEn(silueta, punto.x, punto.y) : undefined
    if (punto && enPunto) {
      setActiva(enPunto.id)
      agregar({ zona: enPunto.id, tipo, x: punto.x, y: punto.y })
      return
    }
    // Sin geometría —un navegador sin diseño, como el de los tests—: el centro de la pieza
    // tocada. Tocar afuera del auto no marca nada.
    const id = (evento.target as Element).getAttribute('data-zona')
    const tocada = id ? zona(silueta, id) : undefined
    if (!tocada) return
    setActiva(tocada.id)
    agregar({ zona: tocada.id, tipo, ...centro(tocada) })
  }

  function tecla(evento: KeyboardEvent<SVGSVGElement>) {
    if (!editable || !zonaActiva) return
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return
    const flecha = FLECHAS[evento.key]
    if (flecha) {
      evento.preventDefault()
      // Que no le llegue al mapa global: Supr también es la baja de la pantalla.
      evento.stopPropagation()
      setActiva(vecina(silueta, zonaActiva, flecha[0], flecha[1]).id)
      return
    }
    const porLetra = LETRA_A_TIPO.get(evento.key.toUpperCase())
    if (porLetra || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault()
      evento.stopPropagation()
      const t = porLetra ?? tipo
      if (porLetra) setTipo(porLetra)
      agregar({ zona: zonaActiva.id, tipo: t, ...puntoLibre(zonaActiva, enActiva.length) })
      return
    }
    if (evento.key === 'Delete') {
      evento.preventDefault()
      evento.stopPropagation()
      const ultima = danios.findLastIndex((d) => d.zona === zonaActiva.id)
      if (ultima >= 0) void quitar(ultima)
    }
  }

  function cambiarNota(indice: number, nota: string) {
    onChange?.(danios.map((d, i) => (i === indice ? { ...d, nota: nota || null } : d)))
  }

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="grid content-start justify-items-center gap-2">
        {editable && <ElegirTipo tipo={tipo} onChange={setTipo} />}
        <svg
          ref={lienzo}
          viewBox={`0 0 ${VISTA.ancho} ${VISTA.alto}`}
          role={editable ? 'application' : 'img'}
          aria-label={
            editable
              ? 'Auto dibujado: flechas para recorrer las piezas, R G X F para marcar, Supr para quitar'
              : `Auto dibujado con ${danios.length === 1 ? 'una marca' : `${danios.length} marcas`}`
          }
          aria-describedby={editable ? idAyuda : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={tocar}
          onKeyDown={tecla}
          onFocus={() => setConFoco(true)}
          onBlur={() => setConFoco(false)}
          className={`${tactil ? 'w-full max-w-sm' : 'w-52'} touch-manipulation select-none rounded-base outline-none focus-visible:ring-2 focus-visible:ring-marca`}
        >
          {/* El vehículo: contorno, habitáculo, ruedas y espejos. No recibe el toque. */}
          {dibujo(silueta).map((d) => (
            <path
              key={d}
              d={d}
              className="pointer-events-none fill-superficie-2 stroke-borde"
              strokeWidth={1.5}
            />
          ))}
          {/* Las piezas, invisibles hasta que se las toca o se llega con las flechas. */}
          {zonas(silueta).map((z) => {
            const resaltada = editable && conFoco && z.id === activa
            return (
              <path
                key={z.id}
                d={trazo(z)}
                data-zona={z.id}
                className={`${resaltada ? 'fill-marca-suave stroke-marca' : 'fill-transparent stroke-transparent'} ${editable ? 'cursor-crosshair hover:fill-marca-suave' : ''}`}
                strokeWidth={resaltada ? 2 : 0}
              >
                <title>{z.nombre}</title>
              </path>
            )
          })}
          <text
            x={ROTULOS.adelante.x}
            y={ROTULOS.adelante.y}
            textAnchor="middle"
            fontSize={9}
            letterSpacing={1}
            className="fill-texto-tenue"
          >
            ADELANTE
          </text>
          <text
            x={ROTULOS.atras.x}
            y={ROTULOS.atras.y}
            textAnchor="middle"
            fontSize={9}
            letterSpacing={1}
            className="fill-texto-tenue"
          >
            ATRÁS
          </text>
          {danios.map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: las marcas no tienen id propio y su orden es el de carga
            <g key={i} className={`pointer-events-none ${COLOR[d.tipo]}`}>
              <circle cx={d.x} cy={d.y} r={7} fill="currentColor" />
              <text
                x={d.x}
                y={d.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={700}
                className="fill-fondo"
              >
                {DANIOS[d.tipo].letra}
              </text>
            </g>
          ))}
        </svg>
        {editable && (
          <p id={idAyuda} aria-live="polite" className="min-h-4 text-etiqueta text-texto-suave">
            {conFoco && zonaActiva
              ? `${zonaActiva.nombre}${enActiva.length ? ` · ${enActiva.map((d) => DANIOS[d.tipo].nombre.toLowerCase()).join(', ')}` : ''}`
              : 'Tocá el auto donde está la marca'}
          </p>
        )}
      </div>

      <ListaDanios
        danios={danios}
        silueta={silueta}
        editable={editable}
        tactil={tactil}
        onNota={cambiarNota}
        onQuitar={(i) => void quitar(i)}
      />
    </div>
  )
}

/**
 * Qué es el vehículo, para dibujar el que es. Aparece sólo cuando su modelo no lo dice: en
 * cuanto alguien lo contesta queda guardado en el modelo, así que de ese modelo se pregunta una
 * vez sola y nunca más.
 *
 * Radios de verdad, como el combustible: las flechas los recorren sin programar nada.
 */
export function ElegirCarroceria({
  valor,
  onChange,
}: {
  valor: Carroceria | null
  onChange: (c: Carroceria) => void
}) {
  const nombre = useId()
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-etiqueta text-texto-suave">
        ¿Qué es? Lo preguntamos una vez: queda guardado en el modelo
      </legend>
      <div className="flex flex-wrap gap-1">
        {CARROCERIAS.map((c) => {
          const elegida = c === valor
          return (
            <label
              key={c}
              className={`inline-flex h-campo cursor-pointer items-center rounded-base border px-2.5 text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
                elegida
                  ? 'border-marca bg-marca-suave font-semibold text-texto'
                  : 'border-borde text-texto-suave'
              }`}
            >
              <input
                type="radio"
                name={nombre}
                className="sr-only"
                checked={elegida}
                onChange={() => onChange(c)}
              />
              {CARROCERIAS_NOMBRE[c]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Qué se marca al tocar. Radios de verdad, como el combustible: las flechas los recorren sin
 * que haya que programarlo, y un lector de pantalla los anuncia como lo que son.
 */
function ElegirTipo({ tipo, onChange }: { tipo: TipoDanio; onChange: (t: TipoDanio) => void }) {
  const nombre = useId()
  return (
    <fieldset className="flex flex-wrap justify-center gap-1">
      <legend className="sr-only">Qué marcar</legend>
      {TIPOS_DANIO.map((t) => {
        const elegido = t === tipo
        return (
          <label
            key={t}
            className={`inline-flex h-campo cursor-pointer items-center gap-1.5 rounded-base border px-2.5 text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
              elegido
                ? 'border-marca bg-marca-suave font-semibold text-texto'
                : 'border-borde text-texto-suave'
            }`}
          >
            <input
              type="radio"
              name={nombre}
              className="sr-only"
              checked={elegido}
              onChange={() => onChange(t)}
            />
            <span
              aria-hidden="true"
              className={`inline-flex size-5 items-center justify-center rounded-full bg-current text-etiqueta font-bold ${COLOR[t]}`}
            >
              <span className="text-fondo">{DANIOS[t].letra}</span>
            </span>
            {DANIOS[t].nombre}
          </label>
        )
      })}
    </fieldset>
  )
}

function ListaDanios({
  danios,
  silueta,
  editable,
  tactil,
  onNota,
  onQuitar,
}: {
  danios: Danio[]
  silueta: Silueta
  editable: boolean
  tactil: boolean
  onNota: (indice: number, nota: string) => void
  onQuitar: (indice: number) => void
}) {
  if (!danios.length) {
    return (
      <p className="self-start text-dato text-texto-suave">
        {editable
          ? 'Sin marcas. Tocá el auto donde tenga un rayón, un golpe, algo roto o algo que falte; si está impecable, dejalo así: la hoja dice que se recibió sin marcas.'
          : 'Sin marcas: se recibió sin rayones, golpes ni faltantes a la vista.'}
      </p>
    )
  }
  return (
    <ul aria-label="Marcas" className="grid content-start gap-1.5">
      {danios.map((d, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: las marcas no tienen id propio y su orden es el de carga
        <li key={i} className="flex flex-wrap items-center gap-2 text-dato">
          <span
            aria-hidden="true"
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-current text-etiqueta font-bold ${COLOR[d.tipo]}`}
          >
            <span className="text-fondo">{DANIOS[d.tipo].letra}</span>
          </span>
          <span className="min-w-40 flex-1">{describirDanio(silueta, d)}</span>
          {editable ? (
            <>
              <input
                aria-label={`Detalle de ${describirDanio(silueta, d).toLowerCase()}`}
                placeholder="Detalle, si hace falta"
                value={d.nota ?? ''}
                maxLength={120}
                onChange={(e) => onNota(i, e.target.value)}
                className="h-campo min-w-40 flex-1 rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none focus-visible:border-marca"
              />
              <Boton
                tamano={tactil ? 'normal' : 'chico'}
                icono={<IconoBorrar />}
                onClick={() => onQuitar(i)}
              >
                Quitar
              </Boton>
            </>
          ) : (
            d.nota && <span className="text-texto-suave">— {d.nota}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
