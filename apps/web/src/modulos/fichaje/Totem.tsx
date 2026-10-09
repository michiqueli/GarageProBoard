import {
  LETRA_TOTEM,
  MOTIVOS_VISITA,
  MOTIVOS_VISITA_NOMBRE,
  type MotivoVisita,
  numeroVisita,
} from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiEstacion } from './estacion.ts'

/**
 * El tótem de la puerta: el cliente elige a qué viene, pone su documento si quiere y se lleva
 * su número. El porqué de cada cuidado, en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * - **No muestra nombres nunca.** Cualquiera puede tipear el documento de otro. Lo único que
 *   dice es «tenés turno a las 10:30».
 * - **Es dedo**: botones grandes, sin teclado.
 * - **Da el número aunque se caiga la red.** El número sale de una cuenta propia del día, la
 *   visita se guarda en el aparato y se manda cuando vuelve la conexión. El servidor la acepta
 *   una sola vez por id, así que reintentar no anota dos personas.
 */

interface Pendiente {
  id: string
  motivo: MotivoVisita
  documento: string | null
  numero: number
  llegoEn: string
}

type Paso =
  | { paso: 'motivo' }
  | { paso: 'documento'; motivo: MotivoVisita }
  | {
      paso: 'numero'
      numero: string
      motivo: MotivoVisita
      turnoHora: string | null
      sinRed: boolean
    }

const CLAVE_COLA = 'gpb.totem.pendientes'
const CLAVE_CUENTA = 'gpb.totem.cuenta'
/** Cuánto se espera la respuesta antes de mostrar el número igual. */
const MS_ESPERA = 2_500
const MS_REINTENTO = 15_000
/** Cuánto queda el número en pantalla antes de volver a empezar. */
const MS_NUMERO = 12_000

const hoy = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  )

// El almacenamiento del navegador puede no estar —modo privado, datos borrados—: el tótem
// sigue andando igual, sólo que sin red no recuerda.
function leer<T>(clave: string, siNo: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : siNo
  } catch {
    return siNo
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento: se pierde sólo si además se corta la red.
  }
}

/** El número siguiente del día. Si cambió el día, la cuenta vuelve a empezar. */
function siguienteNumero(): number {
  const cuenta = leer<{ fecha: string; ultimo: number }>(CLAVE_CUENTA, { fecha: '', ultimo: 0 })
  const ultimo = cuenta.fecha === hoy() ? cuenta.ultimo : 0
  guardar(CLAVE_CUENTA, { fecha: hoy(), ultimo: ultimo + 1 })
  return ultimo + 1
}

/** Lo que dijo el servidor sobre la cuenta: nunca para atrás. */
function alcanzar(fecha: string, ultimo: number) {
  const cuenta = leer<{ fecha: string; ultimo: number }>(CLAVE_CUENTA, { fecha: '', ultimo: 0 })
  if (cuenta.fecha !== fecha || cuenta.ultimo < ultimo) guardar(CLAVE_CUENTA, { fecha, ultimo })
}

function sinRed(error: unknown) {
  return !(error instanceof ORPCError) || error.status >= 500
}

export function Totem({ estacion }: { estacion: { nombre: string; concesionaria: string } }) {
  const [paso, setPaso] = useState<Paso>({ paso: 'motivo' })
  const [documento, setDocumento] = useState('')
  const [pendientes, setPendientes] = useState(() => leer<Pendiente[]>(CLAVE_COLA, []).length)
  const mandando = useRef(false)

  /** Manda lo que quedó guardado. Lo que el servidor rechaza por algo que no es la red, se tira. */
  const vaciarCola = useCallback(async () => {
    if (mandando.current) return
    mandando.current = true
    try {
      for (const p of leer<Pendiente[]>(CLAVE_COLA, [])) {
        try {
          await apiEstacion.totem.anotar(p)
        } catch (error) {
          if (sinRed(error)) break
        }
        const resto = leer<Pendiente[]>(CLAVE_COLA, []).filter((x) => x.id !== p.id)
        guardar(CLAVE_COLA, resto)
        setPendientes(resto.length)
      }
    } finally {
      mandando.current = false
    }
  }, [])

  useEffect(() => {
    apiEstacion.totem
      .estado()
      .then((e) => alcanzar(e.fecha, e.ultimo))
      .catch(() => {})
    void vaciarCola()
    const id = setInterval(() => void vaciarCola(), MS_REINTENTO)
    const alVolver = () => void vaciarCola()
    window.addEventListener('online', alVolver)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', alVolver)
    }
  }, [vaciarCola])

  // El número queda un rato y la pantalla vuelve sola a empezar: el próximo no toca nada.
  useEffect(() => {
    if (paso.paso === 'motivo') return
    const id = setTimeout(
      () => {
        setPaso({ paso: 'motivo' })
        setDocumento('')
      },
      paso.paso === 'numero' ? MS_NUMERO : 60_000,
    )
    return () => clearTimeout(id)
  }, [paso])

  async function anotar(motivo: MotivoVisita, doc: string | null) {
    const p: Pendiente = {
      id: crypto.randomUUID(),
      motivo,
      documento: doc,
      numero: siguienteNumero(),
      llegoEn: new Date().toISOString(),
    }
    // Primero se guarda: si el aparato se apaga mientras pregunta, la visita no se pierde.
    guardar(CLAVE_COLA, [...leer<Pendiente[]>(CLAVE_COLA, []), p])
    setPendientes((n) => n + 1)

    const respuesta = await Promise.race([
      apiEstacion.totem.anotar(p).then(
        (r) => ({ r }),
        (error: unknown) => ({ error }),
      ),
      new Promise<null>((ok) => setTimeout(() => ok(null), MS_ESPERA)),
    ])

    if (respuesta && 'r' in respuesta) {
      const resto = leer<Pendiente[]>(CLAVE_COLA, []).filter((x) => x.id !== p.id)
      guardar(CLAVE_COLA, resto)
      setPendientes(resto.length)
      setPaso({
        paso: 'numero',
        motivo,
        numero: respuesta.r.numero,
        turnoHora: respuesta.r.turnoHora,
        sinRed: false,
      })
      return
    }
    // Sin respuesta a tiempo, o sin red: el número que se le dio es el que vale.
    setPaso({
      paso: 'numero',
      motivo,
      numero: numeroVisita(LETRA_TOTEM, p.numero),
      turnoHora: null,
      sinRed: !respuesta || ('error' in respuesta && sinRed(respuesta.error)),
    })
  }

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-fondo text-texto">
      <header className="flex items-baseline justify-between px-8 py-6 text-[1.05rem] text-texto-tenue">
        <span>{estacion.concesionaria}</span>
        {pendientes > 0 && <span aria-live="polite">Sin conexión: {pendientes} por mandar</span>}
      </header>

      <section className="grid content-center justify-items-center gap-8 px-8">
        {paso.paso === 'motivo' && (
          <>
            <h1 className="font-display text-4xl font-semibold">¿A qué venís?</h1>
            <div className="grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-3">
              {MOTIVOS_VISITA.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaso({ paso: 'documento', motivo: m })}
                  className="min-h-28 rounded-base border-2 border-borde bg-superficie px-4 text-2xl font-semibold hover:border-marca focus-visible:border-marca"
                >
                  {MOTIVOS_VISITA_NOMBRE[m]}
                </button>
              ))}
            </div>
          </>
        )}

        {paso.paso === 'documento' && (
          <>
            <h1 className="font-display text-4xl font-semibold">Tu documento</h1>
            <p className="max-w-xl text-center text-xl text-texto-suave">
              {paso.motivo === 'servicio'
                ? 'Si tenés turno, con tu documento te lo encontramos.'
                : 'Si nos lo dejás, te atienden más rápido. Si no, seguí sin documento.'}
            </p>
            <output aria-label="Documento" className="min-h-16 font-mono text-5xl tracking-widest">
              {documento || '—'}
            </output>
            <Teclado valor={documento} onChange={setDocumento} />
            <div className="flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={() => void anotar(paso.motivo, null)}
                className="min-h-16 rounded-base border-2 border-borde px-6 text-xl"
              >
                Seguir sin documento
              </button>
              <button
                type="button"
                disabled={documento.length < 7}
                onClick={() => void anotar(paso.motivo, documento)}
                className="min-h-16 rounded-base border-2 border-marca bg-marca-suave px-8 text-xl font-semibold text-marca disabled:opacity-40"
              >
                Listo
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setDocumento('')
                setPaso({ paso: 'motivo' })
              }}
              className="text-lg text-texto-suave underline"
            >
              Volver
            </button>
          </>
        )}

        {paso.paso === 'numero' && (
          <div role="status" className="grid justify-items-center gap-4 text-center">
            <p className="text-2xl text-texto-suave">Tu número</p>
            <p className="font-mono text-[9rem] leading-none font-bold">{paso.numero}</p>
            <p className="text-2xl">{MOTIVOS_VISITA_NOMBRE[paso.motivo]}</p>
            {paso.turnoHora && (
              <p className="text-2xl font-semibold text-ok">Tenés turno a las {paso.turnoHora}</p>
            )}
            <p className="text-xl text-texto-suave">Te llamamos por pantalla.</p>
            {paso.sinRed && <p className="text-lg text-texto-tenue">Quedaste anotado igual.</p>}
            <button
              type="button"
              onClick={() => {
                setDocumento('')
                setPaso({ paso: 'motivo' })
              }}
              className="mt-4 min-h-16 rounded-base border-2 border-borde px-8 text-xl"
            >
              Listo
            </button>
          </div>
        )}
      </section>

      <footer className="px-8 py-6 text-center text-texto-tenue">{estacion.nombre}</footer>
    </main>
  )
}

/** Un teclado numérico para el dedo. El físico también anda, para el que lo tenga. */
function Teclado({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const tocar = (t: string) => {
    if (t === '⌫') onChange(valor.slice(0, -1))
    else if (valor.length < 8) onChange(valor + t)
  }
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) tocar(e.key)
      else if (e.key === 'Backspace') tocar('⌫')
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  })
  return (
    <div className="grid grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((t) =>
        t ? (
          <button
            key={t}
            type="button"
            aria-label={t === '⌫' ? 'Borrar' : t}
            onClick={() => tocar(t)}
            className="size-20 rounded-base border-2 border-borde bg-superficie font-mono text-3xl font-semibold active:border-marca"
          >
            {t}
          </button>
        ) : (
          <span key="vacio" />
        ),
      )}
    </div>
  )
}
