/**
 * Reporte mensual de ROI.
 *
 * Entra en Fase 1 por excepción: es la herramienta de venta. El número que
 * importa no es "el taller fichó 654 horas" —eso no le dice nada a nadie— sino
 * **cuántas de esas horas fueron a garantía**, que las paga la terminal, tarde
 * y mal. Ese es el corte que hace que el reporte valga algo.
 */

import { CHARGE_LABEL } from '@garagetick/shared'
import type { Charge } from '@garagetick/shared'
import { Patente } from '../components/Patente'
import { Tarjeta, Titulo } from '../components/ui'
import { reporteMensual as r } from '../fixtures'

/**
 * Paleta categórica validada contra la superficie oscura (#18181b):
 * separación CVD ΔE 9.4 y visión normal 26.5 en el peor par adyacente.
 * El color acompaña a la etiqueta, nunca identifica solo.
 */
const COLOR_CARGO: Record<Charge, string> = {
  customer: '#3987e5',
  warranty: '#d95926',
  internal: '#199e70',
  other: '#71717a',
}

export function Reportes() {
  const total = r.porCargo.reduce((a, c) => a + c.horas, 0)
  const totalAnterior = r.porCargo.reduce((a, c) => a + c.horasMesAnterior, 0)
  const delta = total - totalAnterior
  const garantia = r.porCargo.find((c) => c.charge === 'warranty')!
  const muertoMax = Math.max(...r.tiempoMuerto.map((m) => m.horas))

  return (
    <div className="p-8">
      <Titulo
        titulo={`Reporte mensual · ${r.mes}`}
        detalle={`Comparado contra ${r.mesAnterior} · se genera solo el día 1 y se puede exportar a PDF`}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Tarjeta
          rotulo="Horas fichadas"
          valor={`${total} h`}
          detalle={`${delta >= 0 ? '+' : ''}${delta} h contra el mes anterior`}
          acento="text-white"
        />
        <Tarjeta
          rotulo="Horas en garantía"
          valor={`${Math.round((garantia.horas / total) * 100)} %`}
          detalle={`${garantia.horas} h que paga la terminal`}
          acento="text-amber-400"
        />
        <Tarjeta
          rotulo="Órdenes cerradas"
          valor={String(r.ordenesCerradas)}
          detalle={`${r.ordenesCerradas - r.ordenesCerradasMesAnterior >= 0 ? '+' : ''}${
            r.ordenesCerradas - r.ordenesCerradasMesAnterior
          } contra el mes anterior`}
        />
      </div>

      <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Horas por cargo
        </h2>
        <p className="mt-1 text-sm text-neutral-500">Quién paga cada hora del taller.</p>

        <div className="mt-6 space-y-5">
          {r.porCargo.map((c) => {
            const pct = (c.horas / total) * 100
            const dif = c.horas - c.horasMesAnterior
            return (
              <div key={c.charge}>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-neutral-200">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: COLOR_CARGO[c.charge] }}
                    />
                    {CHARGE_LABEL[c.charge]}
                  </span>
                  <span className="tabular-nums text-neutral-400">
                    <span className="font-semibold text-white">{c.horas} h</span>
                    <span className="ml-2 text-neutral-500">{Math.round(pct)} %</span>
                    <span className={`ml-3 ${dif >= 0 ? 'text-neutral-500' : 'text-neutral-500'}`}>
                      {dif >= 0 ? '+' : ''}
                      {dif} h
                    </span>
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded bg-neutral-800">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, background: COLOR_CARGO[c.charge] }}
                    title={`${CHARGE_LABEL[c.charge]}: ${c.horas} h (${Math.round(pct)} %)`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Tiempo muerto por motivo
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            La diferencia entre lo que tardó el auto y lo que se trabajó en él.
          </p>

          <div className="mt-6 space-y-3">
            {r.tiempoMuerto.map((m) => (
              <div key={m.motivo} className="flex items-center gap-3">
                <span className="w-52 shrink-0 text-sm text-neutral-400">{m.motivo}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-neutral-800">
                  <div
                    className="h-full rounded bg-neutral-500"
                    style={{ width: `${(m.horas / muertoMax) * 100}%` }}
                    title={`${m.motivo}: ${m.horas} h`}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-neutral-300">
                  {m.horas} h
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Las órdenes que más tardaron
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Días en el taller contra horas realmente trabajadas.
          </p>

          <table className="mt-5 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="pb-2 font-medium">OT</th>
                <th className="pb-2 font-medium">Vehículo</th>
                <th className="pb-2 text-right font-medium">Días</th>
                <th className="pb-2 text-right font-medium">Horas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {r.masLargas.map((o) => (
                <tr key={o.numero}>
                  <td className="py-2.5 font-medium tabular-nums text-white">{o.numero}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Patente valor={o.patente} reemplazo="0 km" tamano="sm" />
                      <span className="text-neutral-400">{o.vehiculo}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-amber-400">{o.dias}</td>
                  <td className="py-2.5 text-right tabular-nums text-neutral-300">{o.horas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
