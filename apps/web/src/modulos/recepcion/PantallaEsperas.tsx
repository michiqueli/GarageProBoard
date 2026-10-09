import { accesoDeRuta, contrato } from '@gpb/contracts'
import {
  ESPERA_AMBAR_MINUTOS,
  ESPERA_ROJO_MINUTOS,
  MOTIVOS_VISITA_NOMBRE,
  nivelEspera,
} from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFlechasPestanas, useVolver } from '../../teclado/index.ts'
import { diaDe, sumarDias } from './turnos.ts'

type Medida = Awaited<ReturnType<typeof api.esperas.medir>>['total']

const RANGOS = [
  { id: 'hoy', texto: 'Hoy', dias: 0 },
  { id: 'semana', texto: 'Últimos 7 días', dias: 6 },
  { id: 'mes', texto: 'Últimos 30 días', dias: 29 },
] as const
type Rango = (typeof RANGOS)[number]['id']

/**
 * Cuánto se espera en la puerta: por motivo y por hora de llegada. Es lo que un gerente mira
 * para saber si le falta gente en el mostrador a las diez de la mañana, y cuántos se fueron
 * sin que nadie los atienda.
 *
 * Tablas y no gráficos: son pocas filas, y el número exacto es lo que se discute.
 */
export function PantallaEsperas() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.esperas.medir)
  const navegar = useNavigate()
  const [rango, setRango] = useState<Rango>('hoy')
  const hoy = diaDe(new Date())
  const desde = sumarDias(hoy, -(RANGOS.find((r) => r.id === rango)?.dias ?? 0))

  useFlechasPestanas(
    RANGOS.map((r) => r.id),
    rango,
    setRango,
  )
  useVolver(() => void navegar({ to: '/puerta' }))

  const esperas = useQuery({
    queryKey: ['esperas', tenantId, desde, hoy],
    queryFn: () => api.esperas.medir({ desde, hasta: hoy }),
    enabled: puedeVer,
  })

  return (
    <Shell titulo="Esperas en la puerta" requiere={accesoDeRuta(contrato.esperas.medir)}>
      <div role="tablist" aria-label="Período" className="flex flex-wrap gap-1.5">
        {RANGOS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === rango}
            onClick={() => setRango(r.id)}
            className={`h-campo rounded-base border px-3 text-dato ${
              r.id === rango
                ? 'border-marca bg-marca-suave font-semibold text-marca'
                : 'border-borde text-texto-suave hover:border-texto-tenue'
            }`}
          >
            {r.texto}
          </button>
        ))}
      </div>

      {esperas.isPending && (
        <div className="grid gap-px rounded-base border border-borde bg-superficie p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
          ))}
        </div>
      )}
      {esperas.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(esperas.error)}
        </p>
      )}

      {esperas.data && esperas.data.total.visitas === 0 && (
        <p className="rounded-base border border-borde bg-superficie px-3 py-6 text-dato text-texto-suave">
          No se anotó nadie en este período. Las visitas se cuentan desde que la recepción o el
          tótem las anota.
        </p>
      )}

      {esperas.data && esperas.data.total.visitas > 0 && (
        <>
          <Resumen m={esperas.data.total} />
          <Tabla
            titulo="Por motivo"
            columna="Motivo"
            filas={esperas.data.porMotivo.map((m) => ({
              clave: m.motivo,
              nombre: MOTIVOS_VISITA_NOMBRE[m.motivo],
              m,
            }))}
          />
          <Tabla
            titulo="Por hora de llegada"
            columna="Hora"
            filas={esperas.data.porHora.map((h) => ({
              clave: String(h.hora),
              nombre: `${String(h.hora).padStart(2, '0')} a ${String(h.hora + 1).padStart(2, '0')} h`,
              m: h,
            }))}
          />
          <p className="text-etiqueta text-texto-tenue">
            La espera es desde que llegó hasta que alguien lo agarró, en minutos. En ámbar a partir
            de {ESPERA_AMBAR_MINUTOS} y en rojo a partir de {ESPERA_ROJO_MINUTOS}.
          </p>
        </>
      )}
    </Shell>
  )
}

function Resumen({ m }: { m: Medida }) {
  const datos = [
    { etiqueta: 'Vinieron', valor: String(m.visitas) },
    { etiqueta: 'Atendidos', valor: String(m.atendidas) },
    { etiqueta: 'Se fueron sin atención', valor: String(m.seFueron) },
    { etiqueta: 'Espera media', valor: m.esperaMedia === null ? '—' : `${m.esperaMedia} min` },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {datos.map((d) => (
        <div key={d.etiqueta} className="rounded-base border border-borde bg-superficie px-3 py-2">
          <dt className="text-etiqueta text-texto-suave">{d.etiqueta}</dt>
          <dd className="font-mono text-ui font-semibold tabular-nums">{d.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** **Forma además de color** para la espera: contorneada en ámbar, llena en rojo. */
function Minutos({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-texto-tenue">—</span>
  const clases = {
    bien: '',
    ambar: 'rounded-full border border-atencion px-2 font-semibold text-atencion',
    rojo: 'rounded-full border border-critico bg-critico-suave px-2 font-semibold text-critico',
  }[nivelEspera(valor)]
  return <span className={`inline-flex font-mono tabular-nums ${clases}`}>{valor}</span>
}

function Tabla({
  titulo,
  columna,
  filas,
}: {
  titulo: string
  columna: string
  filas: Array<{ clave: string; nombre: string; m: Medida }>
}) {
  const esEscritorio = useMedia(ES_ESCRITORIO)
  if (!esEscritorio) {
    return (
      <section aria-label={titulo} className="rounded-base border border-borde bg-superficie">
        <h2 className="border-b border-borde px-3 py-2 font-display text-dato font-semibold">
          {titulo}
        </h2>
        <ul className="divide-y divide-borde-suave">
          {filas.map(({ clave, nombre, m }) => (
            <li key={clave} className="grid gap-1 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{nombre}</span>
                <span className="ml-auto text-etiqueta text-texto-suave">
                  espera media <Minutos valor={m.esperaMedia} />
                </span>
              </div>
              <span className="text-etiqueta text-texto-suave">
                {m.visitas} vinieron · {m.atendidas} atendidos ·{' '}
                <span className={m.seFueron ? 'font-semibold text-critico' : ''}>
                  {m.seFueron} se fueron
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <section
      aria-label={titulo}
      className="overflow-x-auto rounded-base border border-borde bg-superficie"
    >
      <h2 className="border-b border-borde px-3 py-2 font-display text-dato font-semibold">
        {titulo}
      </h2>
      <table className="w-full border-collapse text-dato">
        <thead>
          <tr>
            {[columna, 'Vinieron', 'Atendidos', 'Se fueron', 'Espera media', 'Espera máxima'].map(
              (c, i) => (
                <th
                  key={c}
                  className={`border-b border-borde bg-superficie-2 px-3 py-1.5 text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase ${
                    i ? 'text-right' : 'text-left'
                  }`}
                >
                  {c}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ clave, nombre, m }) => (
            <tr key={clave}>
              <td className="h-fila border-b border-borde-suave px-3">{nombre}</td>
              <td className="h-fila border-b border-borde-suave px-3 text-right font-mono tabular-nums">
                {m.visitas}
              </td>
              <td className="h-fila border-b border-borde-suave px-3 text-right font-mono tabular-nums">
                {m.atendidas}
              </td>
              <td
                className={`h-fila border-b border-borde-suave px-3 text-right font-mono tabular-nums ${
                  m.seFueron ? 'font-semibold text-critico' : ''
                }`}
              >
                {m.seFueron}
              </td>
              <td className="h-fila border-b border-borde-suave px-3 text-right">
                <Minutos valor={m.esperaMedia} />
              </td>
              <td className="h-fila border-b border-borde-suave px-3 text-right">
                <Minutos valor={m.esperaMaxima} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
