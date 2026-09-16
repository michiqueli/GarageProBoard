/**
 * Horas por mecánico y por día.
 *
 * Es la pantalla que resuelve la discusión de "yo estuve toda la mañana con
 * ese auto": el jefe entra acá y la conversación se termina con un número.
 */

import { Patente } from '../components/Patente'
import { EtiquetaCargo, Tarjeta, Titulo } from '../components/ui'
import {
  duracionMin,
  formatearDuracion,
  formatearHora,
  listarMecanicos,
  listarOrdenes,
  nombreCompleto,
  todasLasSesiones,
} from '../data'

export function Horas() {
  const mecanicos = listarMecanicos()
  const ordenes = listarOrdenes()
  const sesiones = todasLasSesiones()

  const hoy = new Date().toDateString()
  const deHoy = sesiones.filter((s) => new Date(s.startedAt).toDateString() === hoy)

  const totalHoy = deHoy.reduce((acc, s) => acc + duracionMin(s.startedAt, s.endedAt), 0)
  const autoCerradas = deHoy.filter((s) => s.closedBy === 'auto').length

  const porMecanico = mecanicos
    .map((m) => {
      const propias = deHoy.filter((s) => s.userId === m.id)
      return {
        mecanico: m,
        sesiones: propias,
        minutos: propias.reduce((acc, s) => acc + duracionMin(s.startedAt, s.endedAt), 0),
      }
    })
    .sort((a, b) => b.minutos - a.minutos)

  return (
    <div className="p-8">
      <Titulo titulo="Horas por mecánico" detalle="Hoy · según los fichajes del kiosco" />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Tarjeta
          rotulo="Fichado hoy"
          valor={formatearDuracion(totalHoy)}
          detalle={`${deHoy.length} sesiones`}
          acento="text-emerald-400"
        />
        <Tarjeta
          rotulo="Mecánicos con actividad"
          valor={`${porMecanico.filter((p) => p.minutos > 0).length} / ${mecanicos.length}`}
        />
        <Tarjeta
          rotulo="Cerradas automáticamente"
          valor={String(autoCerradas)}
          detalle="a revisar por el jefe"
          acento={autoCerradas > 0 ? 'text-amber-400' : 'text-white'}
        />
      </div>

      <div className="mt-8 space-y-4">
        {porMecanico.map(({ mecanico, sesiones: propias, minutos }) => (
          <div key={mecanico.id} className="rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
              <div>
                <div className="font-semibold text-white">{nombreCompleto(mecanico)}</div>
                <div className="text-xs text-neutral-500">Legajo {mecanico.employeeNumber}</div>
              </div>
              <div className="text-xl font-bold tabular-nums text-white">
                {minutos > 0 ? formatearDuracion(minutos) : '—'}
              </div>
            </div>

            {propias.length === 0 ? (
              <div className="px-5 py-4 text-sm text-neutral-600">Sin fichajes hoy.</div>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {propias.map((s) => {
                  const o = ordenes.find((x) => x.id === s.workOrderId)!
                  const abierta = s.endedAt === null
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center gap-4 px-5 py-3 ${
                        abierta ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <Patente valor={o.licensePlate} reemplazo="0 km" tamano="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {abierta && (
                            <span className="flex items-center gap-1.5 rounded border border-emerald-600/50 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              En curso
                            </span>
                          )}
                          <span className="text-sm font-medium text-neutral-200">OT {o.number}</span>
                          <EtiquetaCargo cargo={o.charge} />
                          {s.closedBy === 'auto' && (
                            <span className="rounded border border-amber-600/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                              cierre automático
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-neutral-500">{o.description}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="tabular-nums text-neutral-300">
                          {formatearHora(s.startedAt)} –{' '}
                          {s.endedAt ? formatearHora(s.endedAt) : 'ahora'}
                        </div>
                        <div
                          className={`text-xs tabular-nums ${
                            abierta ? 'text-emerald-400' : 'text-neutral-500'
                          }`}
                        >
                          {formatearDuracion(duracionMin(s.startedAt, s.endedAt))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
