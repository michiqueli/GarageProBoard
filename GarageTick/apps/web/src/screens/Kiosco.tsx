/**
 * El puesto de fichaje. Es el producto entero.
 *
 * La entrada llega por teclado porque **el lector USB es un teclado**: no hay
 * driver ni API de escaneo, el lector tipea el código y manda Enter. Por eso
 * esta pantalla no es una maqueta — cuando se enchufa el lector real, anda
 * igual, y tipear el código a mano recorre exactamente el mismo camino.
 *
 * Cero pasos que no sean escanear: sin login, sin combos, sin confirmaciones,
 * sin buscar en una grilla. Si en esta pantalla hay algo para clickear, es un
 * bug de diseño.
 *
 * La guía 1-2 no es decoración: es el indicador de en qué paso está el
 * mecánico. Enseña mientras nadie la usa y desaparece cuando llega el
 * resultado, porque ahí la pantalla entera tiene que ser el feedback.
 */

import { parseQr } from '@garagetick/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Firma, MarcaCliente } from '../components/Marca'
import { Patente } from '../components/Patente'
import {
  buscarMecanicoPorCodigo,
  buscarMecanicoPorLegajo,
  buscarOrdenPorCodigo,
  buscarOrdenPorNumero,
  duracionMin,
  fichar,
  formatearDuracion,
  listarOrdenes,
  otrosEnLaOrden,
  sesionesAbiertasDe,
} from '../data'
import type { Mechanic } from '../data'
import { beepError, beepIntermedio, beepOk } from '../sonido'

const TIMEOUT_SEG = 25
const FEEDBACK_MS = 3000

/**
 * El lector suele disparar el mismo código dos veces cuando el mecánico apoya
 * la credencial. Sin esto, la OT se abre y se cierra en el mismo movimiento y
 * el tipo queda con cero minutos creyendo que fichó — la peor falla posible.
 * Un rebote deliberado (escanear dos veces para cancelar) tarda más que esto.
 */
const REBOTE_MS = 1200

/** Basura acumulada en el buffer: se limpia sola por inactividad y por largo. */
const BUFFER_INACTIVIDAD_MS = 2500
const BUFFER_MAX = 48

type Estado =
  | { fase: 'idle' }
  | { fase: 'esperando_ot'; mecanico: Mechanic; restante: number }
  | { fase: 'feedback'; ok: boolean; titulo: string; detalle: string; nota?: string }

export function Kiosco() {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' })
  const [reloj, setReloj] = useState(() => new Date())
  const [conFoco, setConFoco] = useState(true)

  const buffer = useRef('')
  const bufferTs = useRef(0)
  const ultimo = useRef({ texto: '', ts: 0 })
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (estado.fase !== 'feedback') return
    const t = setTimeout(() => setEstado({ fase: 'idle' }), FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [estado])

  // Cuenta regresiva: si el mecánico se fue, la pantalla se limpia sola.
  useEffect(() => {
    if (estado.fase !== 'esperando_ot') return
    const t = setInterval(() => {
      setEstado((e) => {
        if (e.fase !== 'esperando_ot') return e
        return e.restante <= 1 ? { fase: 'idle' } : { ...e, restante: e.restante - 1 }
      })
    }, 1000)
    return () => clearInterval(t)
  }, [estado.fase])

  /**
   * Si la ventana pierde el foco —un popup del antivirus, alguien minimiza
   * Chrome— los escaneos van a la nada y la pantalla se ve igual de normal. El
   * mecánico escanea, no pasa nada y se va. Hay que gritarlo.
   */
  useEffect(() => {
    const revisar = () => setConFoco(document.hasFocus() && !document.hidden)
    revisar()
    window.addEventListener('focus', revisar)
    window.addEventListener('blur', revisar)
    document.addEventListener('visibilitychange', revisar)
    return () => {
      window.removeEventListener('focus', revisar)
      window.removeEventListener('blur', revisar)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [])

  const mostrarError = useCallback((titulo: string, detalle: string) => {
    beepError()
    setEstado({ fase: 'feedback', ok: false, titulo, detalle })
  }, [])

  /**
   * Orden-agnóstico e idempotente: el mecánico hace siempre lo mismo y el
   * sistema decide si abre o cierra. No hay modos que recordar.
   */
  const procesar = useCallback(
    (crudo: string) => {
      const texto = crudo.trim()
      if (!texto) return

      const qr = parseQr(texto)
      const mecanico =
        qr?.type === 'M'
          ? buscarMecanicoPorCodigo(qr.code)
          : qr
            ? undefined
            : buscarMecanicoPorLegajo(texto)

      const orden =
        qr?.type === 'O'
          ? buscarOrdenPorCodigo(qr.code)
          : qr
            ? undefined
            : buscarOrdenPorNumero(texto)

      const actual = estadoRef.current

      if (mecanico) {
        // La misma credencial dos veces = cancelar y volver a IDLE.
        if (actual.fase === 'esperando_ot' && actual.mecanico.id === mecanico.id) {
          beepIntermedio()
          setEstado({ fase: 'idle' })
          return
        }
        // Sirve también durante el feedback: en el cambio de turno hay cinco
        // esperando y no van a hacer la cola tres segundos cada uno.
        beepIntermedio()
        setEstado({ fase: 'esperando_ot', mecanico, restante: TIMEOUT_SEG })
        return
      }

      if (orden) {
        if (actual.fase !== 'esperando_ot') {
          mostrarError('Primero escaneá tu credencial', `OT ${orden.number} · ${orden.model}`)
          return
        }
        if (orden.status === 'finished' || orden.status === 'invoiced') {
          mostrarError('Esa orden ya está terminada', `OT ${orden.number} · el jefe puede reabrirla`)
          return
        }

        const otros = otrosEnLaOrden(orden.id, actual.mecanico.id)
        const r = fichar(actual.mecanico.id, orden.id)
        beepOk()
        setEstado({
          fase: 'feedback',
          ok: true,
          titulo: r.accion === 'abierta' ? 'Empezaste' : 'Terminaste',
          detalle:
            r.accion === 'abierta'
              ? `OT ${orden.number} · ${orden.model}`
              : `OT ${orden.number} · ${formatearDuracion(
                  duracionMin(r.session.startedAt, r.session.endedAt),
                )} trabajadas`,
          nota:
            otros.length > 0
              ? `${otros.map((m) => m.firstName + ' ' + m.lastName).join(', ')} ${otros.length === 1 ? 'también está' : 'también están'} en esta orden`
              : undefined,
        })
        return
      }

      mostrarError('No reconozco ese código', 'Probá de nuevo o avisale al jefe de taller')
    },
    [mostrarError],
  )

  // El lector tipea y manda Enter. Un humano tipeando hace exactamente lo mismo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ahora = Date.now()

      // Buffer viejo o desbordado: basura de un escaneo fallido o de alguien
      // apoyando algo sobre el teclado. Se descarta antes de sumar nada.
      if (ahora - bufferTs.current > BUFFER_INACTIVIDAD_MS || buffer.current.length > BUFFER_MAX) {
        buffer.current = ''
      }
      bufferTs.current = ahora

      if (e.key === 'Enter') {
        const valor = buffer.current
        buffer.current = ''

        // Rebote del lector: el mismo código repetido al instante se ignora.
        if (valor === ultimo.current.texto && ahora - ultimo.current.ts < REBOTE_MS) return
        ultimo.current = { texto: valor, ts: ahora }

        procesar(valor)
        return
      }
      if (e.key === 'Escape') {
        buffer.current = ''
        setEstado({ fase: 'idle' })
        return
      }
      if (e.key === 'Backspace') {
        buffer.current = buffer.current.slice(0, -1)
        return
      }
      if (e.key.length === 1) buffer.current += e.key
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [procesar])

  if (estado.fase === 'feedback') {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center text-center ${
          estado.ok ? 'bg-emerald-600' : 'bg-red-700'
        }`}
      >
        <div className="text-[9rem] leading-none">{estado.ok ? '✓' : '✕'}</div>
        <div className="mt-6 text-7xl font-bold tracking-tight text-white">{estado.titulo}</div>
        <div className="mt-4 text-3xl text-white/80">{estado.detalle}</div>
        {estado.nota && (
          <div className="mt-6 rounded-xl bg-black/20 px-6 py-3 text-2xl text-white/90">
            {estado.nota}
          </div>
        )}
        {estado.ok && estado.titulo === 'Empezaste' && (
          <div className="mt-10 text-2xl text-white/70">
            Cuando termines, escaneá de nuevo tu credencial y la orden
          </div>
        )}
      </div>
    )
  }

  const esperando = estado.fase === 'esperando_ot'

  return (
    <div className="relative flex h-full flex-col bg-neutral-950">
      <div className="flex items-center justify-between px-10 py-7">
        <MarcaCliente tamano="lg" />
        <Firma />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-10">
        {esperando ? (
          <>
            <div className="text-xl uppercase tracking-[0.3em] text-neutral-500">Hola</div>
            <div className="mt-2 text-7xl font-bold tracking-tight text-white">
              {estado.mecanico.firstName} {estado.mecanico.lastName}
            </div>
          </>
        ) : (
          <>
            <div className="text-[7.5rem] font-bold leading-none tracking-tight text-white tabular-nums">
              {reloj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </div>
            <div className="mt-2 text-xl text-neutral-500 first-letter:uppercase">
              {reloj.toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>
          </>
        )}

        <Pasos activo={esperando ? 2 : 1} mecanico={esperando ? estado.mecanico : null} />

        {esperando && <EstadoDelMecanico mecanico={estado.mecanico} />}

        <div className="mt-10 h-6 text-lg text-neutral-600">
          {esperando && `Se cancela solo en ${estado.restante} s`}
        </div>
      </div>

      <div className="grid grid-cols-3 items-center px-10 py-6">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Listo para escanear
        </div>
        <div className="text-center text-sm text-neutral-600">
          Para cerrar un trabajo, repetí los dos escaneos
        </div>
        <div />
      </div>

      {!conFoco && <AvisoSinFoco />}
      <AyudaDemo />
    </div>
  )
}

/**
 * La guía y el indicador de estado son la misma cosa: el paso hecho se marca,
 * el que falta se prende. Nadie tiene que explicarle nada a nadie.
 *
 * Deliberadamente NO parecen botones: sin hover, sin sombra de relieve. Si
 * invitan a que las toquen, alguien las va a tocar, no va a pasar nada, y el
 * puesto va a parecer colgado.
 */
function Pasos({ activo, mecanico }: { activo: 1 | 2; mecanico: Mechanic | null }) {
  return (
    <div className="mt-12 flex items-stretch gap-6">
      <Paso
        numero={1}
        titulo="Escaneá tu credencial"
        detalle="La tarjeta con tu QR"
        estado={activo === 1 ? 'activo' : 'hecho'}
        valor={mecanico ? `${mecanico.firstName} ${mecanico.lastName}` : null}
        icono={<IconoCredencial />}
      />
      <div className="flex items-center text-5xl text-neutral-700">→</div>
      <Paso
        numero={2}
        titulo="Escaneá la orden"
        detalle="La etiqueta pegada en la OT"
        estado={activo === 2 ? 'activo' : 'pendiente'}
        valor={null}
        icono={<IconoOrden />}
      />
    </div>
  )
}

function Paso({
  numero,
  titulo,
  detalle,
  estado,
  valor,
  icono,
}: {
  numero: number
  titulo: string
  detalle: string
  estado: 'pendiente' | 'activo' | 'hecho'
  valor: string | null
  icono: React.ReactNode
}) {
  const caja =
    estado === 'activo'
      ? 'border-emerald-500 bg-emerald-500/10'
      : estado === 'hecho'
        ? 'border-neutral-700 bg-neutral-900'
        : 'border-neutral-800 bg-neutral-950'

  const tinta =
    estado === 'activo'
      ? 'text-emerald-400'
      : estado === 'hecho'
        ? 'text-neutral-400'
        : 'text-neutral-700'

  return (
    <div className={`relative w-[26rem] rounded-3xl border-2 px-10 py-9 text-center ${caja}`}>
      <span
        className={`absolute left-6 top-6 flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold ${
          estado === 'activo'
            ? 'bg-emerald-500 text-neutral-950'
            : estado === 'hecho'
              ? 'bg-neutral-700 text-neutral-300'
              : 'bg-neutral-900 text-neutral-700'
        }`}
      >
        {estado === 'hecho' ? '✓' : numero}
      </span>

      <div className={`flex justify-center ${tinta}`}>{icono}</div>

      <div
        className={`mt-5 text-3xl font-semibold ${
          estado === 'pendiente' ? 'text-neutral-600' : 'text-white'
        }`}
      >
        {titulo}
      </div>
      <div
        className={`mt-2 text-lg ${
          estado === 'pendiente' ? 'text-neutral-700' : 'text-neutral-400'
        }`}
      >
        {valor ?? detalle}
      </div>
    </div>
  )
}

/** Credencial: una tarjeta con la foto y el nombre. */
function IconoCredencial() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      <circle cx="8.5" cy="11" r="2.5" />
      <path d="M4.5 17c.7-1.8 2.2-2.7 4-2.7s3.3.9 4 2.7" />
      <path d="M15.5 9.5H20M15.5 13H20" />
    </svg>
  )
}

/** Orden: la etiqueta con el QR. */
function IconoOrden() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" />
    </svg>
  )
}


/**
 * Qué tiene abierto el mecánico, y qué hacer al respecto.
 *
 * El texto distingue a propósito entre **su sesión** y **la orden**: escanear
 * la OT frena su reloj, no da la orden por terminada. Quién declara terminada
 * una orden es una decisión del taller, no del mecánico que dejó de trabajar
 * en ella (ver decisión 5 en CLAUDE.md).
 */
function EstadoDelMecanico({ mecanico }: { mecanico: Mechanic }) {
  const abiertas = sesionesAbiertasDe(mecanico.id)
  const ordenes = listarOrdenes()

  if (abiertas.length === 0) {
    return (
      <div className="mt-10 text-center">
        <div className="text-2xl text-neutral-500">No tenés ninguna orden abierta</div>
        <div className="mt-5 text-4xl font-medium text-emerald-400">
          Escaneá el QR de una orden para empezar
        </div>
      </div>
    )
  }

  return (
    <div className="mt-10 text-center">
      <div className="text-2xl text-neutral-400">
        {abiertas.length === 1 ? 'Tenés esta orden abierta' : 'Tenés estas órdenes abiertas'}
      </div>

      <div className="mt-4 space-y-3">
        {abiertas.map((s) => {
          const o = ordenes.find((x) => x.id === s.workOrderId)!
          return (
            <div
              key={s.id}
              className="flex items-center gap-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-7 py-4"
            >
              <Patente valor={o.licensePlate} reemplazo={o.model} />
              <div className="text-left">
                <div className="text-2xl font-semibold text-amber-200">OT {o.number}</div>
                <div className="text-base text-amber-200/70">
                  {o.model} · abierta hace {formatearDuracion(duracionMin(s.startedAt, null))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 text-4xl font-medium text-emerald-400">
        Escaneá su QR para pausar o terminar tu trabajo
      </div>
    </div>
  )
}

/**
 * Sin foco el lector escribe en otra ventana y el puesto se ve normal. Tapa
 * todo a propósito: es preferible que moleste a que un fichaje se pierda.
 */
function AvisoSinFoco() {
  return (
    <button
      onClick={() => window.focus()}
      className="absolute inset-0 flex flex-col items-center justify-center bg-amber-600/95 text-center"
    >
      <div className="text-8xl">⚠</div>
      <div className="mt-6 text-6xl font-bold text-white">El puesto no está activo</div>
      <div className="mt-4 text-3xl text-white/80">Tocá la pantalla antes de escanear</div>
    </button>
  )
}

/**
 * Solo para la demo: en el taller real no existe, porque el mecánico tiene la
 * credencial en la mano y la OT tiene su etiqueta pegada.
 */
function AyudaDemo() {
  const [abierta, setAbierta] = useState(false)
  if (!abierta) {
    return (
      <button
        onClick={() => setAbierta(true)}
        className="absolute bottom-4 right-4 rounded border border-neutral-800 px-3 py-1 text-xs text-neutral-700 hover:text-neutral-500"
      >
        códigos de la demo
      </button>
    )
  }
  return (
    <div className="absolute bottom-4 right-4 w-80 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-left text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-neutral-500">Demo</span>
        <button onClick={() => setAbierta(false)} className="text-neutral-600 hover:text-neutral-400">
          cerrar
        </button>
      </div>
      <p className="mb-3 leading-snug text-neutral-500">
        Tipeá un legajo, Enter, después un número de OT, Enter. El lector real hace exactamente eso.
      </p>
      <div className="text-neutral-400">
        <div className="mb-1 font-medium text-neutral-300">Legajos</div>
        <div className="tabular-nums">104 · 112 · 118 · 121 · 127 · 133</div>
        <div className="mb-1 mt-3 font-medium text-neutral-300">Órdenes abiertas</div>
        <div className="tabular-nums">45821 · 45822 · 45823 · 45824 · 45825 · 45826</div>
      </div>
    </div>
  )
}
