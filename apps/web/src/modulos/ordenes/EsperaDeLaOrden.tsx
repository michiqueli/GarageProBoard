import { MAXIMO_NOTA_ESPERA } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { enHoras } from '../fichaje/tablero.tsx'

type Orden = Awaited<ReturnType<typeof api.ordenes.ficha>>
type Espera = Orden['esperas'][number]

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })
const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

const minutosDe = (e: Espera, ahora = Date.now()) =>
  Math.max(
    0,
    Math.round(
      ((e.hasta ? new Date(e.hasta).getTime() : ahora) - new Date(e.desde).getTime()) / 60_000,
    ),
  )

/**
 * Por qué está parado el auto, al lado de su estado. Ver
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 *
 * Con una espera abierta se ve qué espera y desde cuándo, y se la da por terminada. Sin ninguna,
 * se lo pone en espera eligiendo el motivo. Repuestos y autorización del cliente mueven además el
 * estado de la orden: eso lo decide el servidor.
 */
export function EsperaDeLaOrden({
  orden: o,
  editable,
  hacer,
  haciendo,
}: {
  orden: Orden
  editable: boolean
  hacer: (accion: () => Promise<Orden>) => void
  haciendo: boolean
}) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const abierta = o.esperas.find((e) => !e.hasta)
  const [eligiendo, setEligiendo] = useState(false)
  const [motivoId, setMotivoId] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  const motivos = useQuery({
    queryKey: ['motivos-espera', tenantId],
    queryFn: () => api.motivosEspera.listar(),
    enabled: editable,
  })
  const activos = (motivos.data?.datos ?? []).filter((m) => m.activo)

  function poner() {
    if (!motivoId) return
    hacer(() => api.ordenes.ponerEnEspera({ id: o.id, motivoId, nota: nota.trim() || null }))
    setEligiendo(false)
    setMotivoId(null)
    setNota('')
  }

  if (abierta) {
    return (
      <section
        aria-label="Espera"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-atencion bg-atencion-suave px-3 py-2"
      >
        <span className="text-dato">
          <b>Espera: {abierta.motivo}</b>{' '}
          <span className="text-texto-suave">
            desde las {HORA.format(new Date(abierta.desde))} ({enHoras(minutosDe(abierta))})
          </span>
        </span>
        {abierta.nota && <span className="text-dato text-texto-suave">{abierta.nota}</span>}
        {editable && (
          <span className="ml-auto">
            <Boton
              tamano="chico"
              deshabilitado={haciendo}
              onClick={() => hacer(() => api.ordenes.terminarEspera({ id: o.id }))}
            >
              Terminó la espera
            </Boton>
          </span>
        )}
      </section>
    )
  }

  if (!editable) return null

  if (!eligiendo) {
    return (
      <div>
        <Boton tamano="chico" onClick={() => setEligiendo(true)}>
          Poner en espera
        </Boton>
      </div>
    )
  }

  return (
    <section
      aria-label="Poner en espera"
      className="grid gap-3 rounded-base border border-borde bg-superficie px-3 py-2.5 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
    >
      <Selector
        etiqueta="Por qué espera"
        valor={motivoId}
        vacio="Elegí el motivo"
        opciones={activos.map((m) => ({ valor: m.id, texto: m.nombre }))}
        onChange={setMotivoId}
      />
      <Campo
        etiqueta="Nota"
        value={nota}
        onChange={(e) => setNota(e.target.value.slice(0, MAXIMO_NOTA_ESPERA))}
        ayuda="Optativa: «la bomba llega el jueves»"
      />
      <span className="flex gap-2">
        <Boton
          tamano="chico"
          variante="principal"
          deshabilitado={!motivoId || haciendo}
          onClick={poner}
        >
          Poner en espera
        </Boton>
        <Boton tamano="chico" onClick={() => setEligiendo(false)}>
          Cancelar
        </Boton>
      </span>
    </section>
  )
}

/**
 * Las esperas de la orden, una por una, y cuánto se esperó por cada motivo. Es la explicación del
 * tiempo muerto: lo que estuvo en el taller sin que nadie lo trabajara, y por qué.
 */
export function HistoriaDeEsperas({ orden: o }: { orden: Orden }) {
  if (!o.esperas.length) return null
  const porMotivo = new Map<string, number>()
  for (const e of o.esperas) porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + minutosDe(e))

  return (
    <section
      aria-label="Esperas"
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Esperas</h2>
        <span className="text-etiqueta text-texto-tenue">
          {[...porMotivo].map(([motivo, min]) => `${motivo} ${enHoras(min)}`).join(' · ')}
        </span>
      </header>
      <ul className="divide-y divide-borde-suave">
        {o.esperas.map((e) => (
          <li
            key={e.id}
            className="grid gap-0.5 px-3 py-1.5 text-dato sm:grid-cols-[12rem_1fr_auto]"
          >
            <span className="font-medium">{e.motivo}</span>
            <span className="text-texto-suave">
              {FECHA.format(new Date(e.desde))} →{' '}
              {e.hasta ? FECHA.format(new Date(e.hasta)) : 'sigue'}
              {e.nota ? ` · ${e.nota}` : ''}
            </span>
            <span className="tabular-nums">{enHoras(minutosDe(e))}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
