/**
 * El tablero del jefe: quién está trabajando en qué, ahora mismo.
 *
 * Es la contracara del kiosco. Todo lo que se le prohíbe a la pantalla del
 * taller —listas, filtros, detalle— vive acá.
 */

import { useEffect, useState } from 'react'
import { Patente } from '../components/Patente'
import { HOLD_REASONS, HOLD_REASON_LABEL } from '@garagetick/shared'
import type { HoldReason } from '@garagetick/shared'
import { EtiquetaCargo, Titulo } from '../components/ui'
import {
  duracionMin,
  formatearDuracion,
  formatearHora,
  listarMecanicos,
  listarOrdenes,
  nombreCompleto,
  cerrarOrden,
  esperaDe,
  marcarEspera,
  quitarEspera,
  ultimoEn,
  sesionesAbiertas,
  todasLasSesiones,
  suscribir,
} from '../data'
import type { WorkOrder } from '../data'

export function Tablero() {
  const [, refrescar] = useState(0)

  // En producción esto es el SSE; acá alcanza con reaccionar a los cambios
  // locales y con un tick para que los contadores corran solos.
  useEffect(() => {
    const desuscribir = suscribir(() => refrescar((n) => n + 1))
    const t = setInterval(() => refrescar((n) => n + 1), 30_000)
    return () => {
      desuscribir()
      clearInterval(t)
    }
  }, [])

  const mecanicos = listarMecanicos()
  const ordenes = listarOrdenes()
  const abiertas = sesionesAbiertas()

  const trabajando = abiertas.map((s) => ({
    sesion: s,
    mecanico: mecanicos.find((m) => m.id === s.userId)!,
    orden: ordenes.find((o) => o.id === s.workOrderId)!,
  }))

  const ociosos = mecanicos.filter((m) => !abiertas.some((s) => s.userId === m.id))

  // Lo que el tablero no contestaba: qué autos están en el taller sin nadie
  // encima. Para el jefe suele ser más urgente que saber quién está ocupado.
  const ABIERTAS = ["open", "in_progress", "on_hold"]
  const paradas = ordenes
    .filter((o) => ABIERTAS.includes(o.status))
    .filter((o) => !abiertas.some((s) => s.workOrderId === o.id))
    .map((o) => {
      const propias = todasLasSesiones().filter((s) => s.workOrderId === o.id)
      const ultimoFin = propias
        .map((s) => s.endedAt)
        .filter((f): f is string => f !== null)
        .sort()
        .at(-1)
      return { orden: o, desde: ultimoFin ?? o.openedAt, tocada: ultimoFin !== undefined }
    })
    .sort((a, b) => a.desde.localeCompare(b.desde))

  return (
    <div className="p-8">
      <Titulo
        titulo="Tablero del taller"
        detalle={`${trabajando.length} de ${mecanicos.length} mecánicos fichados · actualizado en vivo`}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {trabajando.map(({ sesion, mecanico, orden }) => {
          const min = duracionMin(sesion.startedAt, null)
          const largo = min > 240
          return (
            <div
              key={sesion.id}
              className={`rounded-xl border bg-neutral-900 p-5 ${
                largo ? 'border-amber-600/50' : 'border-neutral-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {nombreCompleto(mecanico)}
                  </div>
                  <div className="text-xs text-neutral-500">Legajo {mecanico.employeeNumber}</div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      largo ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatearDuracion(min)}
                  </div>
                  <div className="text-xs text-neutral-500">desde {formatearHora(sesion.startedAt)}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-neutral-800 pt-4">
                <Patente valor={orden.licensePlate} reemplazo={orden.model} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-200">OT {orden.number}</span>
                    <EtiquetaCargo cargo={orden.charge} />
                  </div>
                  <div className="truncate text-sm text-neutral-500">
                    {orden.make} {orden.model}
                  </div>
                </div>
              </div>

              <p className="mt-3 truncate text-sm text-neutral-400">{orden.description}</p>
            </div>
          )
        })}
      </div>

      {trabajando.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-500">
          Nadie fichado en este momento.
        </div>
      )}
      {paradas.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            En el taller sin nadie trabajando
          </h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {paradas.map(({ orden: o, desde, tocada }) => (
              <TarjetaParada key={o.id} orden={o} desde={desde} tocada={tocada} />
            ))}
          </div>
        </div>
      )}


      {ociosos.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Sin fichar ahora
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {ociosos.map((m) => (
              <span
                key={m.id}
                className="rounded-full border border-neutral-800 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-400"
              >
                {nombreCompleto(m)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Cerrar una orden es un cambio de estado real, y las tarjetas están apretadas:
 * un clic al pasar cierra un auto que sigue en el elevador. Por eso confirma
 * en el mismo lugar, sin diálogo — dos clics deliberados, cero pantallas.
 */
function BotonCerrar({ orden }: { orden: WorkOrder }) {
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    if (!confirmando) return
    const t = setTimeout(() => setConfirmando(false), 4000)
    return () => clearTimeout(t)
  }, [confirmando])

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
      >
        Cerrar
      </button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => cerrarOrden(orden.id)}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
      >
        Confirmar
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="rounded-md px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-300"
      >
        No
      </button>
    </div>
  )
}

/**
 * Una orden parada, con las tres cosas que el jefe necesita para actuar:
 * hace cuánto que no se toca, quién la dejó así, y por qué.
 *
 * El motivo se carga acá porque es el único lugar donde alguien lo sabe y
 * tiene el contexto delante. En el kiosco no va: sería un combo entre los dos
 * escaneos. Y sin este dato, el reporte de tiempo muerto no existe.
 */
function TarjetaParada({
  orden: o,
  desde,
  tocada,
}: {
  orden: WorkOrder
  desde: string
  tocada: boolean
}) {
  const espera = esperaDe(o.id)
  const ultimo = ultimoEn(o.id)

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="flex items-center gap-4">
        <Patente valor={o.licensePlate} reemplazo={o.model} tamano="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-200">OT {o.number}</span>
            <EtiquetaCargo cargo={o.charge} />
          </div>
          <div className="truncate text-xs text-neutral-500">{o.model}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium tabular-nums text-amber-400">
            {formatearDuracion(duracionMin(desde, null))}
          </div>
          <div className="text-[11px] text-neutral-600">
            {tocada ? 'sin actividad' : 'sin empezar'}
          </div>
        </div>
        <BotonCerrar orden={o} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-800 pt-3">
        <span className="text-xs text-neutral-500">
          {ultimo
            ? `La dejó ${nombreCompleto(ultimo.mecanico)} a las ${formatearHora(ultimo.cuando)}`
            : 'Todavía no la tomó nadie'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {espera ? (
            <>
              <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                {HOLD_REASON_LABEL[espera.reason]}
              </span>
              <button
                onClick={() => quitarEspera(o.id)}
                className="text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
              >
                quitar
              </button>
            </>
          ) : (
            <select
              value=""
              onChange={(e) => e.target.value && marcarEspera(o.id, e.target.value as HoldReason, 'jefe')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400 outline-none hover:border-neutral-600 focus:border-emerald-600"
            >
              <option value="">¿Por qué está parada?</option>
              {HOLD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {HOLD_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
