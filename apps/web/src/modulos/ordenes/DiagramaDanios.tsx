import {
  CARROCERIAS,
  CARROCERIAS_NOMBRE,
  type Carroceria,
  DANIOS,
  TIPOS_DANIO,
  TIPOS_HOJA_NOMBRE,
  type TipoDanio,
  type TipoHoja,
} from '@gpb/core'
import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoBorrar } from '../../componentes/iconos.tsx'
import { api } from '../../sesion/cliente.ts'

export interface Danio {
  tipo: TipoDanio
  /** En fracción del ancho y del alto del dibujo, entre 0 y 1. */
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

const FLECHAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

/** Cuánto se mueve la cruz con cada flecha, y cuánto con Shift para afinar. */
const PASO = 0.02
const PASO_FINO = 0.005

const entre0y1 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Cuatro decimales, que sobre una imagen de mil píxeles son décimas de píxel.
 *
 * Se corta acá y no sólo en el servidor porque mover la cruz dos veces deja un 0,46 escrito
 * como 0,45999999999999996: sumar fracciones en punto flotante arrastra basura, y esa basura
 * viaja por la red y aparece en cualquier registro que muestre la marca.
 */
const cortar = (n: number) => Math.round(n * 10_000) / 10_000

export function describirDanio(d: Danio): string {
  return DANIOS[d.tipo].nombre
}

/**
 * El dibujo del vehículo con las marcas de lo que trae: dónde tiene un rayón, un golpe, algo
 * roto o algo que falta.
 *
 * **El dibujo lo carga cada concesionaria** (ver `docs/tecnicos/hoja-de-recepcion.md`), así que
 * el sistema no sabe qué pieza es cada punto: la marca es la letra donde está la cosa, más el
 * detalle que se escriba. Es, exactamente, lo que hace la hoja de papel.
 *
 * **Con dedo**: se elige qué marcar y se toca el dibujo, en el punto exacto.
 * **Con teclado**, que es como se usa en el mostrador de escritorio: el dibujo es un solo lugar
 * de `Tab`; adentro, las flechas mueven una cruz —con `Shift` se afina—, la letra (R, G, X, F)
 * marca donde está la cruz, y `Supr` quita la última marca.
 *
 * Sin `onChange` es de sólo lectura: la ficha de la orden lo muestra así.
 */
export function DiagramaDanios({
  danios,
  imagenId,
  hojaTipo,
  onChange,
  tactil = false,
}: {
  danios: Danio[]
  /** La imagen con la que se marca. `null` es que el taller todavía no cargó ninguna. */
  imagenId: string | null
  hojaTipo: TipoHoja
  onChange?: ((danios: Danio[]) => void) | undefined
  tactil?: boolean
}) {
  const editable = Boolean(onChange)
  const [tipo, setTipo] = useState<TipoDanio>('rayon')
  const [cruz, setCruz] = useState({ x: 0.5, y: 0.5 })
  const [conFoco, setConFoco] = useState(false)
  const lienzo = useRef<HTMLDivElement>(null)
  const idAyuda = useId()
  const dibujo = useDibujo(imagenId)

  function agregar(d: Omit<Danio, 'nota'>) {
    onChange?.([...danios, { ...d, x: cortar(d.x), y: cortar(d.y), nota: null }])
  }

  async function quitar(indice: number) {
    const d = danios[indice]
    if (!d || !onChange) return
    const si = await confirmar({
      titulo: `¿Quitar la marca de ${describirDanio(d).toLowerCase()}?`,
      texto: d.nota ? `Tiene un detalle: «${d.nota}».` : undefined,
      confirmar: 'Quitar la marca',
      peligro: true,
    })
    if (si) onChange(danios.filter((_, i) => i !== indice))
  }

  function tocar(evento: MouseEvent<HTMLDivElement>) {
    if (!editable) return
    const caja = lienzo.current?.getBoundingClientRect()
    // Sin geometría —un navegador sin diseño, como el de los tests— se marca en la cruz.
    if (!caja?.width || !caja.height) {
      agregar({ tipo, ...cruz })
      return
    }
    const x = entre0y1((evento.clientX - caja.left) / caja.width)
    const y = entre0y1((evento.clientY - caja.top) / caja.height)
    setCruz({ x, y })
    agregar({ tipo, x, y })
  }

  function tecla(evento: KeyboardEvent<HTMLDivElement>) {
    if (!editable) return
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return
    const flecha = FLECHAS[evento.key]
    if (flecha) {
      evento.preventDefault()
      // Que no le llegue al mapa global: Supr también es la baja de la pantalla.
      evento.stopPropagation()
      const paso = evento.shiftKey ? PASO_FINO : PASO
      setCruz((c) => ({
        x: entre0y1(c.x + flecha[0] * paso),
        y: entre0y1(c.y + flecha[1] * paso),
      }))
      return
    }
    const porLetra = LETRA_A_TIPO.get(evento.key.toUpperCase())
    if (porLetra || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault()
      evento.stopPropagation()
      const t = porLetra ?? tipo
      if (porLetra) setTipo(porLetra)
      agregar({ tipo: t, ...cruz })
      return
    }
    if (evento.key === 'Delete') {
      evento.preventDefault()
      evento.stopPropagation()
      if (danios.length) void quitar(danios.length - 1)
    }
  }

  function cambiarNota(indice: number, nota: string) {
    onChange?.(danios.map((d, i) => (i === indice ? { ...d, nota: nota || null } : d)))
  }

  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="grid content-start justify-items-center gap-2">
        {editable && <ElegirTipo tipo={tipo} onChange={setTipo} />}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: el rol es application o img según editable */}
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: el rol es application o img según editable */}
        <div
          ref={lienzo}
          role={editable ? 'application' : 'img'}
          aria-label={
            editable
              ? `Dibujo de ${TIPOS_HOJA_NOMBRE[hojaTipo]}: flechas para mover la cruz, R G X F para marcar, Supr para quitar`
              : `Dibujo con ${danios.length === 1 ? 'una marca' : `${danios.length} marcas`}`
          }
          aria-describedby={editable ? idAyuda : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={tocar}
          onKeyDown={tecla}
          onFocus={() => setConFoco(true)}
          onBlur={() => setConFoco(false)}
          className={`relative ${tactil ? 'w-full max-w-lg' : 'w-72'} touch-manipulation select-none overflow-hidden rounded-base bg-superficie-2 outline-none ${
            editable ? 'cursor-crosshair focus-visible:ring-2 focus-visible:ring-marca' : ''
          }`}
        >
          {dibujo.url ? (
            <img
              src={dibujo.url}
              alt={`Dibujo de ${TIPOS_HOJA_NOMBRE[hojaTipo]}`}
              className="block w-full"
              draggable={false}
            />
          ) : (
            <SinDibujo estado={dibujo.estado} hojaTipo={hojaTipo} />
          )}

          {danios.map((d, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: las marcas no tienen id propio y su orden es el de carga
              key={i}
              aria-hidden="true"
              className={`pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-current text-etiqueta font-bold ${COLOR[d.tipo]}`}
              style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            >
              <span className="text-fondo">{DANIOS[d.tipo].letra}</span>
            </span>
          ))}

          {/* La cruz sólo mientras se usa el teclado: con el dedo estorba. */}
          {editable && conFoco && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-marca"
              style={{ left: `${cruz.x * 100}%`, top: `${cruz.y * 100}%` }}
            />
          )}
        </div>
        {editable && (
          <p id={idAyuda} aria-live="polite" className="min-h-4 text-etiqueta text-texto-suave">
            {conFoco
              ? 'Flechas para mover la cruz, la letra para marcar'
              : 'Tocá el dibujo donde está la marca'}
          </p>
        )}
      </div>

      <ListaDanios
        danios={danios}
        editable={editable}
        tactil={tactil}
        onNota={cambiarNota}
        onQuitar={(i) => void quitar(i)}
      />
    </div>
  )
}

/**
 * El dibujo, traído por el cliente y no por la dirección directa en el `src`: la ruta pide
 * permiso y un `<img>` no manda el token de la sesión.
 */
function useDibujo(id: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [estado, setEstado] = useState<'sin-imagen' | 'cargando' | 'fallo'>('sin-imagen')

  useEffect(() => {
    if (!id) {
      setUrl(null)
      setEstado('sin-imagen')
      return
    }
    let vivo = true
    let creada: string | undefined
    setEstado('cargando')
    void api.hojas
      .imagen({ id })
      .then((archivo) => {
        if (!vivo) return
        creada = URL.createObjectURL(archivo as Blob)
        setUrl(creada)
      })
      .catch(() => vivo && setEstado('fallo'))
    return () => {
      vivo = false
      setUrl(null)
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [id])

  return { url, estado }
}

/** Sin dibujo no se puede marcar, y el que lo ve tiene que saber quién lo arregla. */
function SinDibujo({
  estado,
  hojaTipo,
}: {
  estado: 'sin-imagen' | 'cargando' | 'fallo'
  hojaTipo: TipoHoja
}) {
  return (
    <div className="grid h-48 place-items-center px-3 text-center text-etiqueta text-texto-tenue">
      {estado === 'cargando' && '…'}
      {estado === 'fallo' && 'No se pudo cargar el dibujo'}
      {estado === 'sin-imagen' && (
        <span>
          Todavía no hay dibujo de {TIPOS_HOJA_NOMBRE[hojaTipo].toLowerCase()}.{' '}
          <Link to="/hoja-recepcion" className="underline">
            Subilo en Hoja de recepción
          </Link>
        </span>
      )}
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
  editable,
  tactil,
  onNota,
  onQuitar,
}: {
  danios: Danio[]
  editable: boolean
  tactil: boolean
  onNota: (indice: number, nota: string) => void
  onQuitar: (indice: number) => void
}) {
  if (!danios.length) {
    return (
      <p className="self-start text-dato text-texto-suave">
        {editable
          ? 'Sin marcas. Tocá el dibujo donde el vehículo tenga un rayón, un golpe, algo roto o algo que falte; si está impecable, dejalo así: la hoja dice que se recibió sin marcas.'
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
          <span className="min-w-28 flex-1">{describirDanio(d)}</span>
          {editable ? (
            <>
              <input
                aria-label={`Detalle de la marca ${i + 1}, ${describirDanio(d).toLowerCase()}`}
                placeholder="Dónde está, si hace falta"
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
