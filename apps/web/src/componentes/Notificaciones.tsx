import { useEffect, useRef } from 'react'
import { DURACION_MS, type Notificacion, type TipoNotificacion, usarAvisos } from './avisos.ts'

/**
 * Forma, color y palabra para cada tipo: nunca sólo color. Uno de cada doce varones no
 * distingue el rojo del verde.
 */
const TIPOS: Record<
  TipoNotificacion,
  { borde: string; icono: string; texto: string; nombre: string }
> = {
  ok: { borde: 'border-l-ok', icono: 'bg-ok text-fondo', texto: '✓', nombre: 'Listo' },
  error: { borde: 'border-l-critico', icono: 'bg-critico text-fondo', texto: '!', nombre: 'Error' },
  info: { borde: 'border-l-info', icono: 'bg-info text-fondo', texto: 'i', nombre: 'Aviso' },
}

/**
 * Las notificaciones: abajo a la derecha, arriba de la barra de estado. En el teléfono,
 * a todo el ancho.
 *
 * Dos regiones vivas y no una: los errores se anuncian enseguida (`assertive`), el resto
 * espera a que el lector de pantalla termine lo que está diciendo (`polite`). Las regiones
 * existen siempre, vacías: un lector de pantalla sólo anuncia lo que aparece adentro de una
 * región que ya estaba. Van con `aria-live` y no con `role="alert"` para no confundirse con
 * el error de una pantalla que no cargó, que sí es un `alert`.
 */
export function Notificaciones() {
  const notificaciones = usarAvisos((e) => e.notificaciones)
  const errores = notificaciones.filter((n) => n.tipo === 'error')
  const resto = notificaciones.filter((n) => n.tipo !== 'error')

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-11 z-50 flex flex-col items-stretch gap-2 md:left-auto md:w-96">
      <ol aria-label="Notificaciones" aria-live="polite" className="flex flex-col gap-2">
        {resto.map((n) => (
          <Tarjeta key={n.id} notificacion={n} />
        ))}
      </ol>
      <ol aria-label="Errores" aria-live="assertive" className="flex flex-col gap-2">
        {errores.map((n) => (
          <Tarjeta key={n.id} notificacion={n} />
        ))}
      </ol>
    </div>
  )
}

function Tarjeta({ notificacion: n }: { notificacion: Notificacion }) {
  const cerrar = usarAvisos((e) => e.cerrar)
  const tipo = TIPOS[n.tipo]
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Las que no son error se van solas, salvo mientras el mouse o el foco están encima:
  // nadie quiere que se le escape lo que está leyendo.
  const programar = () => {
    if (n.tipo === 'error') return
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => cerrar(n.id), DURACION_MS)
  }
  const pausar = () => clearTimeout(temporizador.current)

  // biome-ignore lint/correctness/useExhaustiveDependencies: se programa una vez, al aparecer
  useEffect(() => {
    programar()
    return pausar
  }, [])

  return (
    <li
      aria-label={`${tipo.nombre}: ${n.texto}`}
      onMouseEnter={pausar}
      onMouseLeave={programar}
      onFocus={pausar}
      onBlur={programar}
      className={`pointer-events-auto flex animate-aparecer items-start gap-2.5 rounded-base border border-l-[3px] border-borde bg-superficie px-3 py-2.5 shadow-flotante ${tipo.borde}`}
    >
      <span
        aria-hidden="true"
        className={`mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tipo.icono}`}
      >
        {tipo.texto}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-dato text-texto">{n.texto}</p>
        {n.detalle && <p className="text-etiqueta break-words text-texto-suave">{n.detalle}</p>}
        {n.accion && (
          <button
            type="button"
            onClick={() => {
              n.accion?.alHacer()
              cerrar(n.id)
            }}
            className="mt-0.5 w-fit text-etiqueta font-semibold text-marca hover:underline"
          >
            {n.accion.texto}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => cerrar(n.id)}
        className="-mr-1 -mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-base text-texto-tenue hover:bg-superficie-2 hover:text-texto"
      >
        ×
      </button>
    </li>
  )
}
