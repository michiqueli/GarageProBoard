import { useCallback, useEffect, useRef, useState } from 'react'
import { apiEstacion, olvidarEstacion, tokenDeLaEstacion, tomarTokenDeLaUrl } from './estacion.ts'

type Respuesta = Awaited<ReturnType<typeof apiEstacion.fichaje.escanear>>
type Estacion = Awaited<ReturnType<typeof apiEstacion.fichaje.estacion>>

/** Lo que dura la respuesta grande antes de volver a «pasá tu credencial». */
const MS_RESPUESTA = 4_000

/**
 * Lo que dura el primer escaneo esperando el segundo.
 *
 * Si alguien pasa su credencial y se va, la pantalla no puede quedarse con su nombre puesto:
 * el siguiente escanearía una orden a nombre del anterior.
 */
const MS_PENDIENTE = 20_000

/**
 * Un QR nuestro entero. El lector escribe los 25 caracteres de un tirón, así que apenas
 * aparece uno completo se manda sin esperar el Enter — hay lectores que no lo mandan.
 *
 * Lo tipeado a mano no entra por acá y se manda con Enter, que es lo correcto: alguien
 * escribiendo un legajo dígito por dígito no quiere que se dispare a mitad de camino.
 */
const QR_COMPLETO = /GT1:[MO]:[0-9A-HJKMNP-TV-Z]{8}:[0-9A-HJKMNP-TV-Z]{10}/

/**
 * La pantalla de fichaje del taller.
 *
 * **Es la excepción a todo el resto del sistema.** Acá no hay densidad, ni teclas de función,
 * ni menú: hay un mecánico con guantes a dos metros de la pantalla que tiene que apoyar dos
 * cosas contra un lector y seguir trabajando. Todo lo que no sea un escaneo es un error de
 * diseño (`docs/tecnicos/taller-control-de-tiempos.md`).
 *
 * No pide sesión. Se autentica la PC, con el token que le dieron al registrarla.
 */
export function PantallaFichaje() {
  const [estacion, setEstacion] = useState<Estacion | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [reloj, setReloj] = useState(() => new Date())

  const campo = useRef<HTMLInputElement>(null)
  const buffer = useRef('')
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El reloj de la pantalla. No sirve para fichar —las horas las pone el servidor— pero una
  // pantalla de taller sin hora se ve apagada, y además delata que se colgó.
  useEffect(() => {
    const id = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    tomarTokenDeLaUrl()
    if (!tokenDeLaEstacion()) {
      setProblema('Esta pantalla todavía no está registrada como estación de fichaje.')
      return
    }
    apiEstacion.fichaje
      .estacion()
      .then(setEstacion)
      .catch(() => {
        olvidarEstacion()
        setProblema('Esta estación ya no está habilitada. Avisale a quien configura el taller.')
      })
  }, [])

  /** El foco vuelve siempre al campo: el lector escribe donde esté el cursor. */
  const enfocar = useCallback(() => campo.current?.focus(), [])
  useEffect(() => {
    enfocar()
    const id = setInterval(enfocar, 1500)
    return () => clearInterval(id)
  }, [enfocar])

  const mandar = useCallback(
    async (codigo: string) => {
      const limpio = codigo.trim()
      buffer.current = ''
      if (campo.current) campo.current.value = ''
      if (!limpio) return

      try {
        const r = await apiEstacion.fichaje.escanear({
          codigo: limpio,
          ...(pendiente ? { pendiente } : {}),
        })
        setRespuesta(r)
        sonar(r.resultado === 'ok')
        setPendiente(r.esperandoOrden ? limpio : null)
      } catch {
        setRespuesta({
          resultado: 'error',
          accion: null,
          titulo: 'No se pudo avisar al servidor',
          detalle: 'Probá de nuevo en unos segundos.',
          esperandoOrden: false,
          empleado: null,
          orden: null,
          duracion: null,
        })
        sonar(false)
      }
    },
    [pendiente],
  )

  // La respuesta grande se borra sola. La pantalla vuelve a su estado de reposo sin que nadie
  // toque nada, que es la única forma de que el siguiente la encuentre lista.
  useEffect(() => {
    if (!respuesta) return
    const id = setTimeout(() => setRespuesta(null), MS_RESPUESTA)
    return () => clearTimeout(id)
  }, [respuesta])

  useEffect(() => {
    if (!pendiente) return
    const id = setTimeout(() => {
      setPendiente(null)
      setRespuesta(null)
    }, MS_PENDIENTE)
    return () => clearTimeout(id)
  }, [pendiente])

  function alEscribir(valor: string) {
    buffer.current = valor
    if (temporizador.current) clearTimeout(temporizador.current)
    if (QR_COMPLETO.test(valor)) {
      temporizador.current = setTimeout(() => void mandar(valor), 60)
    }
  }

  if (problema) return <Aviso texto={problema} />
  if (!estacion) return <Aviso texto="Conectando…" />

  const esperando = Boolean(pendiente)

  return (
    <main
      onClick={enfocar}
      onKeyDown={enfocar}
      className={`grid min-h-dvh grid-rows-[auto_1fr_auto] ${fondo(respuesta)}`}
    >
      <header className="flex items-baseline justify-between px-6 py-4 text-ui opacity-70">
        <span>{estacion.nombre}</span>
        <span className="font-mono tabular-nums text-dato">
          {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(reloj)}
        </span>
      </header>

      <section className="grid place-content-center gap-4 px-6 text-center">
        {respuesta ? (
          <>
            <p className="text-[clamp(2rem,7vw,4.5rem)] leading-tight font-semibold">
              {respuesta.titulo}
            </p>
            {respuesta.detalle && (
              <p className="text-[clamp(1.1rem,3vw,2rem)] opacity-80">{respuesta.detalle}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-[clamp(1.6rem,5vw,3.5rem)] leading-tight font-semibold">
              {esperando ? 'Ahora la orden' : 'Pasá tu credencial'}
            </p>
            <p className="text-[clamp(1rem,2.5vw,1.5rem)] opacity-60">
              {estacion.tipo === 'reloj'
                ? 'Entrada y salida'
                : esperando
                  ? 'O tipeá el número de la orden y Enter'
                  : 'O tipeá tu legajo y Enter'}
            </p>
          </>
        )}

        {/* El campo existe para que el lector tenga dónde escribir. No se ve: la pantalla ya
            dice qué hacer, y un recuadro de formulario invitaría a buscar un teclado. */}
        <input
          ref={campo}
          type="text"
          autoComplete="off"
          aria-label="Escaneá o tipeá"
          className="mx-auto h-tactil w-full max-w-md rounded-base border border-current/20 bg-transparent px-3 text-center text-[1.4rem] opacity-40 focus:opacity-70 focus:outline-none"
          onChange={(e) => alEscribir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (temporizador.current) clearTimeout(temporizador.current)
            void mandar(buffer.current)
          }}
        />
      </section>

      <footer className="px-6 py-4 text-center text-ui opacity-50">
        {esperando ? 'Tenés 20 segundos para escanear la orden' : 'GarageProBoard'}
      </footer>
    </main>
  )
}

/**
 * Verde entero o rojo entero, y el texto arriba.
 *
 * El color es secundario a propósito: uno de cada doce varones no distingue rojo de verde, y
 * en un taller son casi todos varones. Lo que dice qué pasó es el texto grande, y el sonido.
 */
function fondo(r: Respuesta | null): string {
  if (!r) return 'bg-fondo text-texto'
  if (r.resultado === 'ok') return 'bg-ok text-fondo'
  return 'bg-critico text-fondo'
}

/**
 * Un beep si salió bien, dos si no. Sin archivos: el taller es ruidoso y lo que importa es
 * que suene distinto, no que suene lindo.
 *
 * Los navegadores no dejan sonar hasta que alguien tocó la página; el primer escaneo del día
 * la despierta, y si falla no pasa nada — el color y el texto siguen estando.
 */
function sonar(bien: boolean): void {
  try {
    const Audio =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Audio) return
    const ctx = new Audio()
    const pitar = (cuando: number, hz: number) => {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = hz
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + cuando)
      vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + cuando + 0.01)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + cuando + 0.12)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + cuando)
      osc.stop(ctx.currentTime + cuando + 0.14)
    }
    if (bien) pitar(0, 880)
    else {
      pitar(0, 220)
      pitar(0.18, 220)
    }
    setTimeout(() => void ctx.close(), 800)
  } catch {
    // Sin audio la pantalla sigue diciendo lo mismo, en grande.
  }
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="grid min-h-dvh place-content-center bg-fondo px-6 text-center">
      <p className="max-w-lg text-[clamp(1.2rem,3vw,2rem)] text-texto-suave">{texto}</p>
    </main>
  )
}
