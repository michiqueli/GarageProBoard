import { ORPCError } from '@orpc/client'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiEstacion,
  estacionRecordada,
  olvidarEstacion,
  recordarEstacion,
  tokenDeLaEstacion,
  tomarTokenDeLaUrl,
} from './estacion.ts'
import { beepError, beepIntermedio, beepOk } from './sonido.ts'
import { TableroDelPiso } from './TableroDelPiso.tsx'
import { Totem } from './Totem.tsx'

type Respuesta = Awaited<ReturnType<typeof apiEstacion.fichaje.escanear>>
type Estacion = Awaited<ReturnType<typeof apiEstacion.fichaje.estacion>>
type Abierta = Respuesta['abiertas'][number]

/** Lo que dura la respuesta grande. Se puede escanear encima: en el cambio de turno hay cola. */
const MS_RESPUESTA = 3_000

/** Segundos que espera el segundo escaneo. Si el mecánico se fue, la pantalla se limpia sola. */
const SEG_ESPERA = 25

/**
 * El rebote del lector, y es lo que más importa de todo este archivo.
 *
 * El lector suele disparar el mismo código **dos veces** cuando alguien apoya la credencial
 * contra el vidrio. Sin esto, la orden se abre y se cierra en el mismo movimiento: el mecánico
 * se va convencido de que fichó y queda con cero minutos. Es la peor falla posible, porque no
 * se nota hasta fin de mes.
 *
 * Un rebote deliberado —escanear dos veces a propósito para cancelar— tarda más que esto.
 */
const MS_REBOTE = 1_200

/** Cada cuánto reintenta cuando no hay servidor. Nadie va a estar ahí para refrescar. */
const MS_REINTENTO = 5_000

/** Basura acumulada en el buffer: se limpia sola por inactividad y por largo. */
const MS_BUFFER = 2_500
const MAX_BUFFER = 48

/**
 * Un QR nuestro entero.
 *
 * El lector manda Enter al terminar, y ése es el camino principal. Pero **hay lectores que no
 * lo mandan** —sobre todo los de celular—, y con ésos el mecánico se quedaría mirando una
 * pantalla que no hizo nada. Apenas aparece un código completo se manda igual; si además llega
 * el Enter, el antirrebote lo come.
 *
 * Sin distinguir mayúsculas: el servidor normaliza (`leerQr` en `@gpb/core`), así que exigirlas
 * acá sólo lograría que con esos lectores no dispare nunca.
 */
const QR_COMPLETO = /GT1:[MO]:[0-9A-HJKMNP-TV-Z]{8}:[0-9A-HJKMNP-TV-Z]{10}/i

type Fase =
  | { fase: 'idle' }
  | { fase: 'esperando'; credencial: string; nombre: string; abiertas: Abierta[]; restante: number }
  | { fase: 'respuesta'; r: Respuesta }

/**
 * El puesto de fichaje. Es el producto entero.
 *
 * La entrada llega por teclado porque **el lector USB es un teclado**: no hay driver ni API de
 * escaneo, el lector tipea el código y manda Enter. Por eso esta pantalla no es una maqueta —
 * cuando se enchufa el lector real anda igual, y tipear el código a mano recorre exactamente el
 * mismo camino, que es el fallback numérico de la regla 6.
 *
 * **Cero pasos que no sean escanear**: sin login, sin combos, sin confirmaciones, sin buscar en
 * una grilla. Si acá hay algo para clickear, es un error de diseño. Las diez reglas y el porqué
 * de cada una están en `docs/tecnicos/taller-control-de-tiempos.md`.
 *
 * La guía 1-2 no es decoración: es el indicador de en qué paso está el mecánico. Enseña
 * mientras nadie la usa, y desaparece cuando llega el resultado — ahí la pantalla entera tiene
 * que ser el feedback.
 */
export function PantallaFichaje() {
  const [estacion, setEstacion] = useState<Estacion | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [estado, setEstado] = useState<Fase>({ fase: 'idle' })
  const [reloj, setReloj] = useState(() => new Date())
  const [conFoco, setConFoco] = useState(true)

  const buffer = useRef('')
  const bufferEn = useRef(0)
  const ultimo = useRef({ texto: '', en: 0 })
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => {
    const id = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /**
   * Quién es esta pantalla, reintentando hasta que conteste.
   *
   * **El token se borra sólo con un rechazo definitivo.** Un corte de red o la API reiniciándose
   * para un despliegue no pueden desautorizar el puesto: si lo hicieran, todas las PC del taller
   * se olvidarían su token a la vez y habría que ir a buscar la dirección de nuevo a cada una.
   * Ése fue exactamente el error que tuvo esto la primera vez.
   */
  useEffect(() => {
    tomarTokenDeLaUrl()
    if (!tokenDeLaEstacion()) {
      setProblema('Esta pantalla todavía no está registrada como estación de fichaje.')
      return
    }

    let vivo = true
    let id: ReturnType<typeof setTimeout> | undefined

    const intentar = () => {
      apiEstacion.fichaje
        .estacion()
        .then((e) => {
          if (!vivo) return
          setProblema(null)
          setEstacion(e)
          recordarEstacion(e)
        })
        .catch((error: unknown) => {
          if (!vivo) return
          if (error instanceof ORPCError && error.code === 'ESTACION_NO_AUTORIZADA') {
            olvidarEstacion()
            setProblema('Esta estación ya no está habilitada. Avisale a quien configura el taller.')
            return
          }
          // Cualquier otra cosa es el servidor, no la estación. Se reintenta solo.
          setProblema('Sin conexión con el servidor. Reintentando…')
          // El tótem arranca igual con lo que recordaba: tiene que dar números sin red.
          const recordada = estacionRecordada()
          if (recordada?.tipo === 'totem') setEstacion(recordada)
          id = setTimeout(intentar, MS_REINTENTO)
        })
    }

    intentar()
    return () => {
      vivo = false
      if (id) clearTimeout(id)
    }
  }, [])

  // La respuesta se borra sola: la pantalla vuelve a su reposo sin que nadie toque nada, que es
  // la única forma de que el siguiente la encuentre lista.
  useEffect(() => {
    if (estado.fase !== 'respuesta') return
    const id = setTimeout(() => setEstado({ fase: 'idle' }), MS_RESPUESTA)
    return () => clearTimeout(id)
  }, [estado])

  // Cuenta regresiva del segundo escaneo, a la vista. Si el mecánico se fue después de pasar la
  // credencial, el que viene atrás no puede fichar a su nombre.
  useEffect(() => {
    if (estado.fase !== 'esperando') return
    const id = setInterval(() => {
      setEstado((e) =>
        e.fase !== 'esperando'
          ? e
          : e.restante <= 1
            ? { fase: 'idle' }
            : { ...e, restante: e.restante - 1 },
      )
    }, 1000)
    return () => clearInterval(id)
  }, [estado.fase])

  /**
   * Si la ventana pierde el foco —un aviso del antivirus, alguien minimiza el navegador— los
   * escaneos van a parar a otro lado y la pantalla se ve exactamente igual de normal. El
   * mecánico escanea, no pasa nada, y se va. Hay que gritarlo.
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

  const procesar = useCallback(async (texto: string) => {
    const limpio = texto.trim()
    if (!limpio) return
    const actual = estadoRef.current

    // La misma credencial otra vez: cancela y vuelve al principio. No va al servidor —no hay
    // nada que registrar— y le devuelve la pantalla al que esté esperando atrás.
    if (actual.fase === 'esperando' && limpio === actual.credencial) {
      beepIntermedio()
      setEstado({ fase: 'idle' })
      return
    }

    try {
      const r = await apiEstacion.fichaje.escanear({
        codigo: limpio,
        ...(actual.fase === 'esperando' ? { pendiente: actual.credencial } : {}),
      })

      if (r.esperandoOrden && r.empleado) {
        beepIntermedio()
        setEstado({
          fase: 'esperando',
          credencial: limpio,
          nombre: r.empleado.nombre,
          abiertas: r.abiertas,
          restante: SEG_ESPERA,
        })
        return
      }

      if (r.resultado === 'ok') beepOk()
      else beepError()
      setEstado({ fase: 'respuesta', r })
    } catch {
      beepError()
      setEstado({
        fase: 'respuesta',
        r: {
          resultado: 'error',
          accion: null,
          titulo: 'No se pudo avisar al servidor',
          detalle: 'Probá de nuevo en unos segundos.',
          esperandoOrden: false,
          empleado: null,
          orden: null,
          duracion: null,
          abiertas: [],
          otros: [],
        },
      })
    }
  }, [])

  /** El antirrebote vive acá, así lo cruzan los dos caminos: el Enter y el disparo automático. */
  const mandar = useCallback(
    (valor: string) => {
      const ahora = Date.now()
      buffer.current = ''
      if (temporizador.current) clearTimeout(temporizador.current)
      if (valor === ultimo.current.texto && ahora - ultimo.current.en < MS_REBOTE) return
      ultimo.current = { texto: valor, en: ahora }
      void procesar(valor)
    },
    [procesar],
  )

  /**
   * El lector tipea y manda Enter. Un humano tipeando hace exactamente lo mismo, y por eso el
   * fallback numérico no necesita una línea aparte: es el mismo camino.
   */
  const tipo = useRef<string | null>(null)
  tipo.current = estacion?.tipo ?? null

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      // El tótem tiene su propio teclado: lo que se tipea ahí es un documento, no un escaneo.
      if (tipo.current === 'totem') return
      const ahora = Date.now()

      // Buffer viejo o desbordado: basura de un escaneo fallido, o algo apoyado sobre el
      // teclado. Se descarta antes de sumarle nada.
      if (ahora - bufferEn.current > MS_BUFFER || buffer.current.length > MAX_BUFFER) {
        buffer.current = ''
      }
      bufferEn.current = ahora

      if (e.key === 'Enter') {
        mandar(buffer.current)
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
      if (e.key.length !== 1) return

      buffer.current += e.key
      // Un QR completo se manda sin esperar el Enter, para los lectores que no lo mandan.
      if (QR_COMPLETO.test(buffer.current)) {
        const valor = buffer.current
        if (temporizador.current) clearTimeout(temporizador.current)
        temporizador.current = setTimeout(() => mandar(valor), 60)
      }
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [mandar])

  // Con estación ya resuelta, un corte posterior no vacía la pantalla: se sigue pudiendo
  // escanear y el error de cada escaneo lo dice en grande.
  if (problema && !estacion) return <Aviso texto={problema} />
  if (!estacion) return <Aviso texto="Conectando…" />
  if (estacion.tipo === 'tablero') return <TableroDelPiso estacion={estacion} />
  if (estacion.tipo === 'totem') return <Totem estacion={estacion} />
  if (estado.fase === 'respuesta') return <Resultado r={estado.r} />

  const esperando = estado.fase === 'esperando'
  const soloReloj = estacion.tipo === 'reloj'

  return (
    <main className="relative grid min-h-dvh grid-rows-[auto_1fr_auto] bg-fondo text-texto">
      <header className="flex items-baseline justify-between px-8 py-6 text-[1.05rem] text-texto-tenue">
        <span>{estacion.nombre}</span>
        <span>{estacion.concesionaria}</span>
      </header>

      <section className="grid content-center justify-items-center px-8 text-center">
        {esperando ? (
          <>
            <p className="text-[1.1rem] tracking-[0.3em] text-texto-tenue uppercase">Hola</p>
            <p className="mt-2 text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-semibold">
              {estado.nombre}
            </p>
          </>
        ) : (
          <>
            <p className="text-[clamp(4rem,11vw,8rem)] leading-none font-semibold tabular-nums">
              {HORA.format(reloj)}
            </p>
            <p className="mt-2 text-[1.1rem] text-texto-tenue first-letter:uppercase">
              {FECHA.format(reloj)}
            </p>
          </>
        )}

        {soloReloj ? (
          <PasoUnico hecho={esperando} />
        ) : (
          <Pasos activo={esperando ? 2 : 1} nombre={esperando ? estado.nombre : null} />
        )}

        {esperando && !soloReloj && <QueTiene abiertas={estado.abiertas} />}

        <p className="mt-8 h-6 text-[1rem] text-texto-tenue">
          {esperando ? `Se cancela solo en ${estado.restante} s` : ''}
        </p>
      </section>

      <footer className="grid grid-cols-3 items-center px-8 py-6 text-[0.95rem] text-texto-tenue">
        <span className="flex items-center gap-2">
          <span className="inline-block size-2 animate-pulse rounded-full bg-ok" />
          Listo para escanear
        </span>
        <span className="text-center">
          {soloReloj
            ? 'La misma tarjeta marca entrada y salida'
            : 'Para cerrar un trabajo, repetí los dos escaneos'}
        </span>
        <span />
      </footer>

      {!conFoco && <SinFoco />}
    </main>
  )
}

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

const FECHA = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * La pantalla entera es el feedback: verde o roja, con el tilde o la cruz de lejos.
 *
 * La forma antes que el color: uno de cada doce varones no distingue rojo de verde, y en un
 * taller son casi todos varones. El ✓ y el ✕ se leen aunque el color no diga nada.
 */
function Resultado({ r }: { r: Respuesta }) {
  const bien = r.resultado === 'ok'
  return (
    <main
      className={`grid min-h-dvh content-center justify-items-center px-8 text-center ${
        bien ? 'bg-ok text-fondo' : 'bg-critico text-fondo'
      }`}
    >
      <p className="text-[clamp(5rem,14vw,9rem)] leading-none">{bien ? '✓' : '✕'}</p>
      <p className="mt-4 text-[clamp(2.5rem,7vw,4.5rem)] leading-tight font-semibold">{r.titulo}</p>
      {r.detalle && <p className="mt-3 text-[clamp(1.2rem,3vw,2rem)] opacity-80">{r.detalle}</p>}

      {r.otros.length > 0 && (
        <p className="mt-6 rounded-base bg-fondo/20 px-6 py-3 text-[clamp(1rem,2.2vw,1.5rem)]">
          {r.otros.join(', ')} {r.otros.length === 1 ? 'también está' : 'también están'} en esta
          orden
        </p>
      )}

      {r.accion === 'abrio' && (
        <p className="mt-8 text-[clamp(1rem,2.2vw,1.5rem)] opacity-70">
          Cuando termines, escaneá de nuevo tu credencial y la orden
        </p>
      )}
    </main>
  )
}

/**
 * La guía y el indicador de estado son la misma cosa: el paso hecho se marca, el que falta se
 * prende. Nadie tiene que explicarle nada a nadie.
 *
 * **No parecen botones a propósito**: sin sombra, sin relieve, sin cursor. Si invitan a que los
 * toquen, alguien los va a tocar, no va a pasar nada, y el puesto va a parecer colgado.
 */
function Pasos({ activo, nombre }: { activo: 1 | 2; nombre: string | null }) {
  return (
    <div className="mt-10 flex flex-wrap items-stretch justify-center gap-5">
      <Paso
        numero={1}
        titulo="Escaneá tu credencial"
        detalle="La tarjeta con tu QR"
        estado={activo === 1 ? 'activo' : 'hecho'}
        valor={nombre}
        icono={<IconoCredencial />}
      />
      <span className="flex items-center text-[2.5rem] text-texto-tenue">→</span>
      <Paso
        numero={2}
        titulo="Escaneá la orden"
        detalle="El QR de la hoja del taller"
        estado={activo === 2 ? 'activo' : 'pendiente'}
        valor={null}
        icono={<IconoOrden />}
      />
    </div>
  )
}

/** En el reloj de entrada hay un solo paso, y contarlo con dos cajas sería inventar un trámite. */
function PasoUnico({ hecho }: { hecho: boolean }) {
  return (
    <div className="mt-10">
      <Paso
        numero={1}
        titulo="Pasá tu credencial"
        detalle="Marca la entrada, y la próxima vez la salida"
        estado={hecho ? 'hecho' : 'activo'}
        valor={null}
        icono={<IconoCredencial />}
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
  icono: ReactNode
}) {
  const caja =
    estado === 'activo'
      ? 'border-ok bg-ok/10'
      : estado === 'hecho'
        ? 'border-borde bg-superficie'
        : 'border-borde-suave bg-fondo'
  const tinta =
    estado === 'activo' ? 'text-ok' : estado === 'hecho' ? 'text-texto-suave' : 'text-texto-tenue'
  const chapa =
    estado === 'activo'
      ? 'bg-ok text-fondo'
      : estado === 'hecho'
        ? 'bg-borde text-texto-suave'
        : 'bg-superficie text-texto-tenue'

  return (
    <div className={`relative w-[22rem] max-w-full rounded-base border-2 px-8 py-7 ${caja}`}>
      <span
        className={`absolute top-5 left-5 grid size-10 place-content-center rounded-full text-[1.3rem] font-bold ${chapa}`}
      >
        {estado === 'hecho' ? '✓' : numero}
      </span>
      <span className={`flex justify-center ${tinta}`}>{icono}</span>
      <p
        className={`mt-4 text-[1.6rem] font-semibold ${
          estado === 'pendiente' ? 'text-texto-tenue' : 'text-texto'
        }`}
      >
        {titulo}
      </p>
      <p
        className={`mt-1.5 text-[1.05rem] ${
          estado === 'pendiente' ? 'text-texto-tenue' : 'text-texto-suave'
        }`}
      >
        {valor ?? detalle}
      </p>
    </div>
  )
}

/**
 * Qué tiene abierto, y qué hacer al respecto.
 *
 * El texto distingue a propósito entre **su reloj** y **la orden**: escanear la OT le frena el
 * tiempo, no da la orden por terminada. Quién declara terminada una orden es una decisión del
 * taller, no del que dejó de trabajar en ella.
 */
function QueTiene({ abiertas }: { abiertas: Abierta[] }) {
  if (abiertas.length === 0) {
    return (
      <div className="mt-8 grid justify-items-center gap-3 text-center">
        <p className="text-[1.3rem] text-texto-suave">No tenés ninguna orden abierta</p>
        <p className="text-[clamp(1.4rem,3vw,2rem)] font-medium text-ok">
          Escaneá el QR de una orden para empezar
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8 grid justify-items-center gap-3 text-center">
      <p className="text-[1.2rem] text-texto-suave">
        {abiertas.length === 1 ? 'Tenés esta orden abierta' : 'Tenés estas órdenes abiertas'}
      </p>
      <ul className="grid gap-2">
        {abiertas.map((a) => (
          <li
            key={a.numero}
            className="flex flex-wrap items-baseline justify-center gap-x-3 rounded-base border border-atencion bg-atencion/10 px-6 py-3"
          >
            <span className="text-[1.5rem] font-semibold text-atencion">
              OT {String(a.numero).padStart(6, '0')}
            </span>
            <span className="text-[1.05rem] text-texto-suave">
              {[a.dominio, a.vehiculo].filter(Boolean).join(' · ')}
            </span>
            <span className="text-[1.05rem] text-texto-tenue">abierta hace {a.hace}</span>
          </li>
        ))}
      </ul>
      <p className="text-[clamp(1.4rem,3vw,2rem)] font-medium text-ok">
        Escaneá su QR para frenar tu reloj
      </p>
    </div>
  )
}

/**
 * Sin foco, el lector escribe en otra ventana y el puesto se ve normal.
 *
 * Tapa todo a propósito: es preferible que moleste a que un fichaje se pierda. Es lo único de
 * esta pantalla que se toca, y justamente porque lo que hay que arreglar no es un escaneo.
 *
 * **La salida no puede depender de tocar nada.** La PC del taller no tiene pantalla táctil y
 * puede no tener ni mouse: por eso el cartel nombra Alt+Tab, que es lo que sí va a estar. Y sin
 * foco ningún atajo de la página sirve —las teclas ni llegan—, así que la salida tiene que ser
 * del sistema operativo y no nuestra.
 */
function SinFoco() {
  return (
    <button
      type="button"
      onClick={() => window.focus()}
      className="absolute inset-0 grid content-center justify-items-center bg-atencion px-8 text-center text-fondo"
    >
      <span className="text-[clamp(4rem,10vw,7rem)] leading-none">⚠</span>
      <span className="mt-4 text-[clamp(2rem,6vw,3.5rem)] font-bold">El puesto no está activo</span>
      <span className="mt-3 text-[clamp(1.1rem,2.5vw,1.8rem)] opacity-90">
        Los escaneos no van a llegar. Volvé con <b>Alt + Tab</b>, o hacé clic acá.
      </span>
    </button>
  )
}

function IconoCredencial() {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      <circle cx="8.5" cy="11" r="2.5" />
      <path d="M4.5 17c.7-1.8 2.2-2.7 4-2.7s3.3.9 4 2.7" />
      <path d="M15.5 9.5H20M15.5 13H20" />
    </svg>
  )
}

function IconoOrden() {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5" />
      <rect x="8" y="12" width="3" height="3" />
      <rect x="13" y="12" width="3" height="3" />
      <rect x="8" y="17" width="3" height="2" />
    </svg>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="grid min-h-dvh place-content-center bg-fondo px-8 text-center">
      <p className="max-w-xl text-[clamp(1.2rem,3vw,2rem)] text-texto-suave">{texto}</p>
    </main>
  )
}
