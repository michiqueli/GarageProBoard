import {
  ESTADOS_REVISION,
  ESTADOS_REVISION_INFO,
  type EstadoRevision,
  MAXIMO_NOTA_PUNTO,
  SECCION_EN_TALLER,
  SECCIONES_REVISION,
  SECCIONES_REVISION_NOMBRE,
  type SeccionRevision,
} from '@gpb/core'
import { useId } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoListo } from '../../componentes/iconos.tsx'

/** Un punto como se muestra: el de la recepción todavía no tiene quién ni cuándo. */
export interface PuntoRevisado {
  puntoId: string
  seccion: SeccionRevision
  nombre: string
  estado: EstadoRevision | null
  nota: string | null
  por?: string | null
  en?: string | null
  /** Si ya se pasó a la orden como trabajo. */
  itemId?: string | null
}

export interface Cambio {
  estado: EstadoRevision | null
  nota: string | null
}

/**
 * Las clases de cada color. **Forma además de color**: el ámbar y el rojo van llenos —alguien
 * tiene que hacer algo—, el verde contorneado, y cada uno con su signo. En un taller casi todos
 * son varones, y uno de cada doce no distingue el rojo del verde.
 */
const ELEGIDO: Record<EstadoRevision, string> = {
  verde: 'border-ok bg-ok-suave font-semibold text-ok',
  ambar: 'border-atencion bg-atencion-suave font-semibold text-atencion',
  rojo: 'border-critico bg-critico-suave font-semibold text-critico',
}

/**
 * La revisión de la hoja: cada punto con su semáforo y, si no está bien, un renglón que dice qué.
 *
 * **Sin tocar no es verde**: es «no se revisó», y así queda escrito en la hoja. Tocar de nuevo
 * el color elegido lo deja sin revisar, por si fue un dedo errado — como en el inventario.
 *
 * Cada punto es un grupo de tres radios que se recorre con ← →; `Tab` pasa al siguiente. La
 * inspección dinámica va al final y avisa que se completa en el taller: pide prueba de ruta, y
 * en el mostrador con el cliente adelante no se hace.
 */
export function RevisionRecepcion({
  puntos,
  onChange,
  tactil = false,
  enRecepcion = false,
}: {
  puntos: PuntoRevisado[]
  onChange?: ((puntoId: string, cambio: Cambio) => void) | undefined
  /** En la tablet, objetivos de 44px para el dedo. */
  tactil?: boolean
  /** En la recepción, la sección del taller se marca como «después». */
  enRecepcion?: boolean
}) {
  const editable = Boolean(onChange)
  const secciones = SECCIONES_REVISION.map((s) => ({
    seccion: s,
    puntos: puntos.filter((p) => p.seccion === s),
  })).filter((s) => s.puntos.length)

  if (!puntos.length) {
    return (
      <p className="text-dato text-texto-suave">
        El taller no tiene puntos de revisión prendidos. Se configuran en la hoja de recepción.
      </p>
    )
  }

  if (!editable && !puntos.some((p) => p.estado)) {
    return <p className="text-dato text-texto-suave">Todavía no se revisó ningún punto.</p>
  }

  return (
    <div className="grid gap-4">
      {secciones.map(({ seccion, puntos: deLaSeccion }) => {
        const sinRevisar = deLaSeccion.filter((p) => !p.estado)
        return (
          <section
            key={seccion}
            aria-label={SECCIONES_REVISION_NOMBRE[seccion]}
            className="grid gap-1.5"
          >
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-etiqueta font-medium text-texto-suave">
                {SECCIONES_REVISION_NOMBRE[seccion]}
              </h3>
              {enRecepcion && seccion === SECCION_EN_TALLER && (
                <span className="text-etiqueta text-texto-tenue">
                  Pide prueba de ruta: se completa en el taller
                </span>
              )}
              {editable && sinRevisar.length > 0 && (
                <span className="ml-auto">
                  <Boton
                    tamano="chico"
                    icono={<IconoListo />}
                    onClick={() => {
                      for (const p of sinRevisar) {
                        onChange?.(p.puntoId, { estado: 'verde', nota: p.nota })
                      }
                    }}
                  >
                    {sinRevisar.length === deLaSeccion.length ? 'Todo bien' : 'El resto está bien'}
                  </Boton>
                </span>
              )}
            </header>
            <ul className="grid gap-1">
              {deLaSeccion.map((p) =>
                editable ? (
                  <RenglonEditable key={p.puntoId} punto={p} tactil={tactil} onChange={onChange} />
                ) : (
                  <RenglonLeido key={p.puntoId} punto={p} />
                ),
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function RenglonEditable({
  punto: p,
  tactil,
  onChange,
}: {
  punto: PuntoRevisado
  tactil: boolean
  onChange: ((puntoId: string, cambio: Cambio) => void) | undefined
}) {
  const grupo = useId()
  const alto = tactil ? 'h-tactil min-w-20' : 'h-campo min-w-16'
  const conNota = p.estado === 'ambar' || p.estado === 'rojo' || Boolean(p.nota)

  return (
    <li className="grid gap-1 border-b border-borde-suave pb-1.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-dato">
        <span className="grid">
          <span>
            {p.nombre}
            {p.itemId && <EnLaOrden />}
          </span>
          {p.por && (
            <span className="text-etiqueta text-texto-tenue">{quienYCuando(p.por, p.en)}</span>
          )}
        </span>
        <fieldset className="flex shrink-0 gap-1">
          <legend className="sr-only">{p.nombre}</legend>
          {ESTADOS_REVISION.map((e) => {
            const elegida = p.estado === e
            const info = ESTADOS_REVISION_INFO[e]
            return (
              <label
                key={e}
                title={info.nombre}
                className={`inline-flex ${alto} cursor-pointer items-center justify-center gap-1 rounded-base border px-2 text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
                  elegida ? ELEGIDO[e] : 'border-borde text-texto-suave'
                }`}
              >
                <input
                  type="radio"
                  name={grupo}
                  className="sr-only"
                  checked={elegida}
                  onChange={() => onChange?.(p.puntoId, { estado: e, nota: p.nota })}
                  // Un radio elegido no dispara onChange al tocarlo de nuevo: el clic es el que
                  // lo deja sin revisar, por si fue un dedo errado.
                  onClick={() => elegida && onChange?.(p.puntoId, { estado: null, nota: p.nota })}
                />
                <span aria-hidden="true" className="font-mono">
                  {info.signo}
                </span>
                {info.corto}
              </label>
            )
          })}
        </fieldset>
      </div>
      {conNota && (
        <input
          type="text"
          value={p.nota ?? ''}
          maxLength={MAXIMO_NOTA_PUNTO}
          aria-label={`Qué tiene: ${p.nombre}`}
          placeholder="Qué tiene: «pastillas al 20 %»"
          onChange={(ev) =>
            onChange?.(p.puntoId, { estado: p.estado, nota: ev.target.value || null })
          }
          className={`${tactil ? 'h-tactil' : 'h-campo'} rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none focus-visible:border-marca`}
        />
      )}
    </li>
  )
}

function RenglonLeido({ punto: p }: { punto: PuntoRevisado }) {
  return (
    <li className="grid gap-0.5 text-dato">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          {p.nombre}
          {p.itemId && <EnLaOrden />}
        </span>
        <Semaforo estado={p.estado} />
      </div>
      {(p.nota || p.por) && (
        <span className="text-etiqueta text-texto-tenue">
          {[p.nota && `«${p.nota}»`, p.por && quienYCuando(p.por, p.en)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </li>
  )
}

/** Que ya está en la orden como trabajo: no se ofrece dos veces. */
function EnLaOrden() {
  return <span className="ml-2 text-etiqueta text-texto-tenue">· en la orden</span>
}

/** El color de un punto, con su signo y su palabra: nunca el color solo. */
export function Semaforo({ estado }: { estado: EstadoRevision | null }) {
  if (!estado) return <span className="text-etiqueta text-texto-tenue">Sin revisar</span>
  const info = ESTADOS_REVISION_INFO[estado]
  if (estado === 'verde') {
    return (
      <span className="inline-flex items-center gap-1 text-etiqueta text-ok">
        <span aria-hidden="true" className="font-mono">
          {info.signo}
        </span>
        {info.corto}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-etiqueta font-semibold text-fondo ${
        estado === 'rojo' ? 'bg-critico' : 'bg-atencion'
      }`}
    >
      <span aria-hidden="true" className="font-mono">
        {info.signo}
      </span>
      {info.corto}
    </span>
  )
}

function quienYCuando(por: string, en: string | null | undefined) {
  if (!en) return por
  const fecha = new Date(en).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${por}, ${fecha}`
}
