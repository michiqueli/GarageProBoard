import { contrato } from '@gpb/contracts'
import { nivelEspera } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoImprimir } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { imprimirOrden, nombreOrden } from '../ordenes/ordenes.ts'
import { useRetiros } from '../ordenes/retiros.tsx'
import { diaDe } from './turnos.ts'
import { errorAlAtender, minutos, REFRESCO, useAhora, type Visita } from './visitas.ts'

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })

/**
 * Lo primero que ve la tablet: a quién esperan en el taller. El porqué de una cola y no
 * «mandárselo a la tablet 2», en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * Tocar uno lo agarra y arranca la recepción con quien trae el auto ya puesto. Si otra tablet
 * lo agarró un segundo antes, la API no se lo saca y el aviso dice quién lo tiene: dos
 * tablets no reciben el mismo auto.
 *
 * Arriba van los que ya tiene esta persona —se salió de la recepción, se le apagó la
 * pantalla— para que los retome; abajo, atenuados, los que tiene otro.
 */
export function ColaTablet({
  alElegir,
  sinTurno,
}: {
  alElegir: (v: Visita) => void
  sinTurno: () => void
}) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const yo = usarSesion((e) => e.datos?.usuario.id)
  const ahora = useAhora()
  const cache = useQueryClient()

  const visitas = useQuery({
    queryKey: ['visitas', tenantId],
    queryFn: () => api.recepcion.hoy(),
    refetchInterval: REFRESCO,
  })

  const atender = useMutation({
    mutationFn: (v: Visita) => api.recepcion.atender({ id: v.id }),
    onSuccess: (v) => {
      void cache.invalidateQueries({ queryKey: ['visitas', tenantId] })
      alElegir(v)
    },
    onError: () => cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    meta: { error: errorAlAtender },
  })

  const deServicio = (visitas.data?.datos ?? []).filter(
    (v) => v.motivo === 'servicio' && !v.cerradaEn,
  )
  // Los que vienen a buscar el auto: tocarlo lo agarra y lleva a elegir cuál se lleva.
  const { retiros, esMia } = useRetiros()
  const navegar = useNavigate()
  const retirar = useMutation({
    mutationFn: async (v: Visita) => (esMia(v) ? v : api.recepcion.atender({ id: v.id })),
    onSuccess: (v) => {
      void cache.invalidateQueries({ queryKey: ['visitas', tenantId] })
      void navegar({ to: '/entregas', search: { visita: v.id } })
    },
    onError: () => cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    meta: { error: errorAlAtender },
  })
  const mias = deServicio.filter((v) => v.atendidaPor?.id === yo)
  const esperando = deServicio.filter((v) => !v.atendidaEn)
  const deOtros = deServicio.filter((v) => v.atendidaPor && v.atendidaPor.id !== yo)

  return (
    <section aria-label="A quién esperan" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-ui font-semibold">¿A quién recibís?</h1>
        <span className="ml-auto">
          <Boton onClick={sinTurno}>Recibir sin turno</Boton>
        </span>
      </div>

      {visitas.isPending && (
        <div className="grid gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-base bg-superficie-2" />
          ))}
        </div>
      )}
      {visitas.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(visitas.error)}
        </p>
      )}

      {visitas.data && !esperando.length && !mias.length && (
        <div className="grid justify-items-start gap-2 rounded-base border border-borde bg-superficie px-4 py-6">
          <p className="text-dato text-texto-suave">
            No hay nadie esperando para el taller. Cuando la recepción anote a alguien, aparece acá
            solo.
          </p>
          <Boton variante="principal" onClick={sinTurno}>
            Recibir un auto sin turno
          </Boton>
        </div>
      )}

      {mias.length > 0 && (
        <Lista titulo="Los tenés vos">
          {mias.map((v) => (
            <Tarjeta key={v.id} v={v} ahora={ahora} onClick={() => alElegir(v)} accion="Seguir" />
          ))}
        </Lista>
      )}

      {esperando.length > 0 && (
        <Lista titulo="Esperando">
          {esperando.map((v) => (
            <Tarjeta
              key={v.id}
              v={v}
              ahora={ahora}
              onClick={() => !atender.isPending && atender.mutate(v)}
              accion="Recibir"
            />
          ))}
        </Lista>
      )}

      {retiros.length > 0 && (
        <Lista titulo="Vienen a retirar">
          {retiros.map((v) => (
            <Tarjeta
              key={v.id}
              v={v}
              ahora={ahora}
              onClick={() => !retirar.isPending && retirar.mutate(v)}
              accion={esMia(v) ? 'Seguir' : 'Entregar'}
            />
          ))}
        </Lista>
      )}

      <RecibidosHoy />

      {deOtros.length > 0 && (
        <Lista titulo="Los está recibiendo otro">
          {deOtros.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-baseline gap-x-3 rounded-base border border-borde-suave px-4 py-2.5 text-texto-tenue"
            >
              <span className="font-mono font-semibold">{v.numero}</span>
              <span>{v.nombre ?? 'Sin nombre'}</span>
              <span className="ml-auto text-etiqueta">Lo tiene {v.atendidaPor?.nombre}</span>
            </li>
          ))}
        </Lista>
      )}
    </section>
  )
}

function Lista({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="grid gap-2">
      <h2 className="text-etiqueta font-medium text-texto-suave">{titulo}</h2>
      <ul className="grid gap-2">{children}</ul>
    </section>
  )
}

/** Una tarjeta grande, que se toca entera: en una tablet el dedo no apunta a un botón chico. */
function Tarjeta({
  v,
  ahora,
  onClick,
  accion,
}: {
  v: Visita
  ahora: number
  onClick: () => void
  accion: string
}) {
  const m = minutos(v.llegoEn, ahora)
  const nivel = nivelEspera(m)
  const espera = {
    bien: 'text-texto-suave',
    ambar: 'rounded-full border border-atencion px-2 font-semibold text-atencion',
    rojo: 'rounded-full border border-critico bg-critico-suave px-2 font-semibold text-critico',
  }[nivel]
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-base border border-borde bg-superficie px-4 py-3 text-left hover:border-marca focus-visible:border-marca"
      >
        <span className="row-span-2 font-mono text-2xl font-bold">{v.numero}</span>
        <span className="truncate font-medium">{v.nombre ?? 'Sin nombre'}</span>
        <span className="row-span-2 inline-flex h-campo items-center rounded-base border border-marca bg-marca-suave px-4 font-semibold text-marca">
          {accion}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 text-etiqueta text-texto-suave">
          {v.turno && (
            <span className="font-medium text-texto">
              Turno {HORA.format(new Date(v.turno.fechaHora))}
              {v.turno.dominio ? ` · ${v.turno.dominio}` : ''}
            </span>
          )}
          {v.telefono && <span>{v.telefono}</span>}
          {v.derivadaA && <span>Para {v.derivadaA.nombre}</span>}
          {v.nota && <span className="truncate">{v.nota}</span>}
          <span className={`inline-flex font-mono ${espera}`}>
            {v.atendidaEn ? `desde hace ${minutos(v.atendidaEn, ahora)} min` : `${m} min`}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Las órdenes que se abrieron hoy, para volver a imprimirlas o corregirlas. Sin esto, en la
 * tablet —que no tiene menú— una orden recién abierta se perdía al volver a la cola: si el
 * semáforo tenía un error, no había cómo llegar a la orden para arreglarlo y reimprimirla.
 */
function RecibidosHoy() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.ordenes.listar)
  const ordenes = useQuery({
    queryKey: ['ordenes', tenantId, 'recibidas-hoy'],
    queryFn: () => api.ordenes.listar({ pagina: 1, porPagina: 30, estado: 'todas' }),
    enabled: puedeVer,
    refetchInterval: 30_000,
  })
  const hoy = diaDe(new Date())
  const deHoy = (ordenes.data?.datos ?? []).filter(
    (o) => diaDe(o.creadoEn) === hoy && o.estado !== 'anulada',
  )
  if (!deHoy.length) return null

  return (
    <Lista titulo="Recibidos hoy">
      {deHoy.map((o) => (
        <li
          key={o.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-base border border-borde bg-superficie px-4 py-2.5"
        >
          <span className="font-mono font-semibold">{nombreOrden(o.numero)}</span>
          <Patente dominio={o.vehiculo.dominio} />
          <span className="min-w-0 flex-1 truncate text-texto-suave">{o.pedido}</span>
          <span className="flex gap-2">
            <Boton icono={<IconoImprimir />} onClick={() => void imprimirOrden(o.id)}>
              Imprimir
            </Boton>
            <Link
              to="/ordenes/$id"
              params={{ id: o.id }}
              className="inline-flex h-campo items-center rounded-base border border-borde px-3 text-dato text-texto-suave"
            >
              Ver y corregir
            </Link>
          </span>
        </li>
      ))}
    </Lista>
  )
}
