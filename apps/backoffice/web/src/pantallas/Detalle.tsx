import { ETIQUETA_MODULO, type Modulo } from '@garagepro/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api, mensajeDe } from '../cliente.ts'
import { Aviso, Boton, Campo, Esqueleto, Estado } from '../componentes.tsx'
import { EstadoConcesionaria } from './Listado.tsx'

type Detalle = Awaited<ReturnType<typeof api.concesionarias.ver>>
type Contrato = Detalle['contratos'][number]['contrato']

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })
const FECHA_HORA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Una fecha del selector, como fin de ese día en Argentina. «Vence el 15» se lee como
 * «el 15 todavía lo tiene», no como «a la medianoche del 14».
 */
function finDelDia(fecha: string): string {
  return new Date(`${fecha}T23:59:59-03:00`).toISOString()
}

/** El estado de un módulo, en las mismas palabras que se usarían por teléfono. */
function EstadoModulo({ contrato }: { contrato: Contrato }) {
  if (!contrato) {
    return (
      <Estado forma="texto" tono="tenue">
        No contratado
      </Estado>
    )
  }
  if (contrato.vigente) {
    return (
      <Estado forma="contorno" tono="ok">
        Prendido
      </Estado>
    )
  }
  if (!contrato.activo) {
    return (
      <Estado forma="llena" tono="atencion">
        Suspendido
      </Estado>
    )
  }
  if (contrato.vigenteHasta && new Date(contrato.vigenteHasta) <= new Date()) {
    return (
      <Estado forma="llena" tono="atencion">
        Vencido
      </Estado>
    )
  }
  return (
    <Estado forma="contorno" tono="info">
      Empieza después
    </Estado>
  )
}

export function PantallaDetalle() {
  const { id } = useParams({ from: '/con-operador/concesionarias/$id' })
  const clave = ['backoffice', 'concesionarias', id]
  const detalle = useQuery({ queryKey: clave, queryFn: () => api.concesionarias.ver({ id }) })
  const [editando, setEditando] = useState<Modulo | 'estado' | null>(null)

  if (detalle.isPending) return <Esqueleto filas={8} />
  if (detalle.isError) {
    return (
      <>
        <Aviso tono="critico">{mensajeDe(detalle.error)}</Aviso>
        <Link to="/" className="text-dato text-marca">
          Volver al listado
        </Link>
      </>
    )
  }

  const c = detalle.data

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-dato text-texto-suave hover:text-texto">
          Concesionarias
        </Link>
        <span className="text-texto-tenue">/</span>
        <h1 className="font-display text-lg font-semibold">{c.nombre}</h1>
        <EstadoConcesionaria activo={c.activo} />
        <span className="font-mono text-etiqueta text-texto-tenue">{c.slug}</span>
        {editando !== 'estado' && (
          <Boton
            className="ml-auto"
            variante={c.activo ? 'peligro' : 'principal'}
            onClick={() => setEditando('estado')}
          >
            {c.activo ? 'Suspender la concesionaria' : 'Rehabilitar la concesionaria'}
          </Boton>
        )}
      </div>

      {editando === 'estado' && (
        <FormularioEstado
          id={id}
          activo={c.activo}
          alTerminar={() => setEditando(null)}
          clave={clave}
        />
      )}

      <section className="grid gap-2">
        <h2 className="text-etiqueta font-semibold text-texto-suave uppercase">Módulos</h2>
        <ul className="grid gap-px rounded-base border border-borde bg-borde-suave">
          {c.contratos.map(({ modulo, contrato }) => (
            <li key={modulo} className="grid gap-2 bg-superficie px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="min-w-36 text-dato font-medium">{ETIQUETA_MODULO[modulo]}</b>
                <EstadoModulo contrato={contrato} />
                {contrato && (
                  <span className="text-etiqueta text-texto-tenue">
                    Desde {FECHA.format(new Date(contrato.vigenteDesde))}
                    {contrato.vigenteHasta
                      ? ` · vence ${FECHA.format(new Date(contrato.vigenteHasta))}`
                      : ' · sin vencimiento'}
                  </span>
                )}
                {editando !== modulo && (
                  <Boton className="ml-auto" onClick={() => setEditando(modulo)}>
                    Cambiar
                  </Boton>
                )}
              </div>
              {editando === modulo && (
                <FormularioModulo
                  id={id}
                  modulo={modulo}
                  contrato={contrato}
                  clave={clave}
                  alTerminar={() => setEditando(null)}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-etiqueta font-semibold text-texto-suave uppercase">Historial</h2>
        {c.historial.length === 0 ? (
          <p className="text-dato text-texto-tenue">Todavía no hay cambios registrados.</p>
        ) : (
          <ol className="grid gap-1">
            {c.historial.map((m) => (
              <li key={`${m.fecha}-${m.accion}`} className="flex flex-wrap gap-x-3 text-dato">
                <span className="font-mono text-etiqueta text-texto-tenue tabular">
                  {FECHA_HORA.format(new Date(m.fecha))}
                </span>
                <span className="text-texto-suave">{m.operador}</span>
                <span>{m.accion.replaceAll('_', ' ')}</span>
                {m.motivo && <span className="text-texto-suave">— {m.motivo}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

function FormularioModulo({
  id,
  modulo,
  contrato,
  clave,
  alTerminar,
}: {
  id: string
  modulo: Modulo
  contrato: Contrato
  clave: string[]
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const [activo, setActivo] = useState(contrato ? !contrato.activo : true)
  const [vence, setVence] = useState(contrato?.vigenteHasta?.slice(0, 10) ?? '')
  const [motivo, setMotivo] = useState('')

  const guardar = useMutation({
    mutationFn: () =>
      api.concesionarias.cambiarModulo({
        id,
        modulo,
        activo,
        vigenteHasta: vence ? finDelDia(vence) : null,
        motivo,
      }),
    onSuccess: (actualizado) => {
      cache.setQueryData(clave, actualizado)
      void cache.invalidateQueries({ queryKey: ['backoffice', 'concesionarias'], exact: true })
      alTerminar()
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => e.key === 'Escape' && alTerminar()}
      className="grid gap-3 rounded-base border border-borde bg-superficie-2 p-3"
    >
      <div className="flex flex-wrap gap-4 text-dato">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`activo-${modulo}`}
            checked={activo}
            onChange={() => setActivo(true)}
            className="accent-marca"
          />
          Prendido
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`activo-${modulo}`}
            checked={!activo}
            onChange={() => setActivo(false)}
            className="accent-marca"
          />
          Apagado
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Campo
          etiqueta="Vence"
          type="date"
          ayuda="Vacío: no vence"
          value={vence}
          onChange={(e) => setVence(e.target.value)}
        />
        <Campo
          etiqueta="Motivo"
          ayuda="Queda en el historial"
          required
          minLength={3}
          autoFocus
          placeholder="Prueba de 30 días, falta de pago, lo contrató…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
      {guardar.isError && <Aviso tono="critico">{mensajeDe(guardar.error)}</Aviso>}
      <div className="flex gap-2">
        <Boton
          type="submit"
          variante={activo ? 'principal' : 'peligro'}
          disabled={guardar.isPending}
        >
          {activo ? `Prender ${ETIQUETA_MODULO[modulo]}` : `Apagar ${ETIQUETA_MODULO[modulo]}`}
        </Boton>
        <Boton onClick={alTerminar}>Cancelar</Boton>
      </div>
    </form>
  )
}

function FormularioEstado({
  id,
  activo,
  clave,
  alTerminar,
}: {
  id: string
  activo: boolean
  clave: string[]
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const [motivo, setMotivo] = useState('')

  const guardar = useMutation({
    mutationFn: () => api.concesionarias.cambiarEstado({ id, activo: !activo, motivo }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: clave })
      await cache.invalidateQueries({ queryKey: ['backoffice', 'concesionarias'], exact: true })
      alTerminar()
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => e.key === 'Escape' && alTerminar()}
      className={`grid gap-3 rounded-base border p-3 ${activo ? 'border-critico' : 'border-borde'} bg-superficie`}
    >
      {activo && (
        <p className="text-dato">
          Nadie de la concesionaria va a poder entrar, y los que están adentro quedan afuera en el
          próximo clic. <b>Los datos no se tocan</b>: rehabilitarla la deja como estaba.
        </p>
      )}
      <Campo
        etiqueta="Motivo"
        ayuda="Queda en el historial"
        required
        minLength={3}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {guardar.isError && <Aviso tono="critico">{mensajeDe(guardar.error)}</Aviso>}
      <div className="flex gap-2">
        <Boton
          type="submit"
          variante={activo ? 'peligro' : 'principal'}
          disabled={guardar.isPending}
        >
          {activo ? 'Suspender' : 'Rehabilitar'}
        </Boton>
        <Boton onClick={alTerminar}>Cancelar</Boton>
      </div>
    </form>
  )
}
