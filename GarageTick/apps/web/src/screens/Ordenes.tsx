/** Listados de órdenes: abiertas y finalizadas. */

import { CHARGES, CHARGE_LABEL, WORK_ORDER_STATUS_LABEL } from '@garagetick/shared'
import type { Charge, WorkOrderStatus } from '@garagetick/shared'
import { useState } from 'react'
import { Patente } from '../components/Patente'
import { EtiquetaCargo, EtiquetaEstado, Titulo } from '../components/ui'
import {
  duracionMin,
  formatearDuracion,
  formatearFecha,
  formatearHora,
  listarMecanicos,
  listarOrdenes,
  nombreCompleto,
  todasLasSesiones,
} from '../data'

const ABIERTAS = ['open', 'in_progress', 'on_hold']

export function Ordenes() {
  const [solapa, setSolapa] = useState<'abiertas' | 'finalizadas'>('abiertas')
  const [cargo, setCargo] = useState<Charge | 'todos'>('todos')
  const [estado, setEstado] = useState<WorkOrderStatus | 'todos'>('todos')
  const [mecanicoId, setMecanicoId] = useState<string>('todos')

  const ordenes = listarOrdenes()
  const sesiones = todasLasSesiones()
  const mecanicos = listarMecanicos()

  const lista = ordenes.filter((o) => {
    if (solapa === 'abiertas' ? !ABIERTAS.includes(o.status) : ABIERTAS.includes(o.status)) {
      return false
    }
    if (cargo !== 'todos' && o.charge !== cargo) return false
    if (estado !== 'todos' && o.status !== estado) return false
    if (mecanicoId !== 'todos') {
      // "Por mecánico" = órdenes que esa persona tocó alguna vez, no solo ahora:
      // el jefe lo usa para reconstruir en qué anduvo, no para ver el presente.
      const toco = sesiones.some((s) => s.workOrderId === o.id && s.userId === mecanicoId)
      if (!toco) return false
    }
    return true
  })

  // Solo se ofrecen los estados que existen del lado que se está mirando.
  const estadosPosibles = [
    ...new Set(
      ordenes
        .filter((o) => (solapa === 'abiertas' ? ABIERTAS.includes(o.status) : !ABIERTAS.includes(o.status)))
        .map((o) => o.status),
    ),
  ]

  const hayFiltros = cargo !== 'todos' || estado !== 'todos' || mecanicoId !== 'todos'

  function limpiar() {
    setCargo('todos')
    setEstado('todos')
    setMecanicoId('todos')
  }

  return (
    <div className="p-8">
      <Titulo titulo="Órdenes de trabajo" detalle="Las abiertas se traen del sistema de gestión" />

      <div className="mt-6 flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        {(['abiertas', 'finalizadas'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSolapa(s)
              setEstado('todos')
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition ${
              solapa === s ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Filtro rotulo="Cargo" valor={cargo} onChange={(v) => setCargo(v as Charge | 'todos')}>
          <option value="todos">Todos</option>
          {CHARGES.map((c) => (
            <option key={c} value={c}>
              {CHARGE_LABEL[c]}
            </option>
          ))}
        </Filtro>

        <Filtro
          rotulo="Estado"
          valor={estado}
          onChange={(v) => setEstado(v as WorkOrderStatus | 'todos')}
        >
          <option value="todos">Todos</option>
          {estadosPosibles.map((e) => (
            <option key={e} value={e}>
              {WORK_ORDER_STATUS_LABEL[e]}
            </option>
          ))}
        </Filtro>

        <Filtro rotulo="Mecánico" valor={mecanicoId} onChange={setMecanicoId}>
          <option value="todos">Todos</option>
          {mecanicos.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreCompleto(m)}
            </option>
          ))}
        </Filtro>

        <span className="ml-auto text-sm text-neutral-500 tabular-nums">
          {lista.length} de {ordenes.filter((o) =>
            solapa === 'abiertas' ? ABIERTAS.includes(o.status) : !ABIERTAS.includes(o.status),
          ).length}
        </span>

        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            Limpiar
          </button>
        )}
      </div>


      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">OT</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Vehículo</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Trabajo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">
                {mecanicoId === 'todos'
                  ? 'Mano de obra'
                  : `Horas de ${mecanicos.find((m) => m.id === mecanicoId)?.lastName ?? ''}`}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {lista.map((o) => {
              // Con un mecánico filtrado, la fila contesta sobre esa persona y no
              // sobre la orden: si filtrás por Gómez querés saber qué hizo Gómez,
              // no que la orden sigue abierta porque la agarró otro.
              const todas = sesiones.filter((s) => s.workOrderId === o.id)
              const propias =
                mecanicoId === 'todos' ? todas : todas.filter((s) => s.userId === mecanicoId)

              const minutos = propias.reduce(
                (acc, s) => acc + duracionMin(s.startedAt, s.endedAt),
                0,
              )
              const enCurso = propias.some((s) => s.endedAt === null)
              const ultimoFin = propias
                .map((s) => s.endedAt)
                .filter((f): f is string => f !== null)
                .sort()
                .at(-1)
              const quienes = [
                ...new Set(
                  propias.map((s) => mecanicos.find((m) => m.id === s.userId)?.lastName ?? '—'),
                ),
              ]
              return (
                <tr key={o.id} className="bg-neutral-950 hover:bg-neutral-900">
                  <td className="px-4 py-3 font-medium text-white tabular-nums">{o.number}</td>
                  <td className="px-4 py-3">
                    <EtiquetaCargo cargo={o.charge} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Patente valor={o.licensePlate} reemplazo="0 km" tamano="sm" />
                      <span className="text-neutral-400">{o.model}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{o.customerName}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-neutral-400">{o.description}</td>
                  <td className="px-4 py-3">
                    {mecanicoId === 'todos' ? (
                      <>
                        <EtiquetaEstado estado={o.status} />
                        <div className="text-xs text-neutral-600">
                          ingresó {formatearFecha(o.openedAt)}
                        </div>
                      </>
                    ) : (
                      <>
                        {enCurso ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            En curso
                          </span>
                        ) : (
                          <span className="text-sm text-neutral-400">
                            Cerró {formatearHora(ultimoFin!)}
                          </span>
                        )}
                        <div className="text-xs text-neutral-600">
                          orden: {WORK_ORDER_STATUS_LABEL[o.status].toLowerCase()}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {enCurso && (
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                          title={
                            mecanicoId === 'todos'
                              ? 'Hay alguien fichado ahora'
                              : 'Está fichado en esta orden ahora'
                          }
                        />
                      )}
                      <span className="font-medium text-white tabular-nums">
                        {minutos > 0 ? formatearDuracion(minutos) : '—'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600">
                      {quienes.length > 0 ? quienes.join(', ') : 'sin fichajes'}
                    </div>
                  </td>
                </tr>
              )
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                  Ninguna orden coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Un solo control, repetido. Los filtros van en una fila arriba de la tabla. */
function Filtro({
  rotulo,
  valor,
  onChange,
  children,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const activo = valor !== 'todos'
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-md border bg-neutral-900 px-2.5 py-1.5 text-sm outline-none transition focus:border-emerald-600 ${
          activo ? 'border-emerald-700 text-emerald-300' : 'border-neutral-700 text-neutral-300'
        }`}
      >
        {children}
      </select>
    </label>
  )
}
