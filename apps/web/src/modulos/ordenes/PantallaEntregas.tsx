import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { Boton } from '../../componentes/Boton.tsx'
import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado } from '../../teclado/index.ts'
import { errorAlAtender, type Visita } from '../recepcion/visitas.ts'
import { nombreOrden } from './ordenes.ts'
import { quienRetira, useRetiros } from './retiros.tsx'

const ruta = getRouteApi('/con-sesion/entregas')

/** Cada cuánto se vuelve a mirar: una orden que se factura en caja aparece acá sola. */
const REFRESCO = 30_000

/**
 * La cola de lo que está para entregar: las órdenes terminadas y las facturadas de la sucursal.
 * Una terminada todavía no se cobró: se entrega cuando la facturen, o sin factura si alguien lo
 * autoriza. Ver `docs/tecnicos/egreso.md`.
 *
 * Con teclado: ↑ ↓ eligen una y Enter la abre.
 */
export function PantallaEntregas() {
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.ordenes.listar)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const { visita: visitaId } = ruta.useSearch()
  const r = useRetiros(visitaId)
  const cache = useQueryClient()
  /** La visita viaja con el auto que se elija: entregarlo la cierra. */
  const conVisita = r.visita ? { visita: r.visita.id } : {}

  const tomar = useMutation({
    mutationFn: async (v: Visita) => (r.esMia(v) ? v : api.recepcion.atender({ id: v.id })),
    onSuccess: (v) => {
      void cache.invalidateQueries({ queryKey: ['visitas', tenantId] })
      void navegar({ to: '/entregas', search: { visita: v.id } })
    },
    onError: () => cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    meta: { error: errorAlAtender },
  })
  /** Devolverla a la puerta: vuelve a esperar, y la lista se queda sin visita. */
  const soltar = useMutation({
    mutationFn: (id: string) => api.recepcion.soltar({ id }),
    onSettled: () => cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    onSuccess: () => void navegar({ to: '/entregas', search: {} }),
    meta: { exito: 'Volvió a la cola', error: mensajeGeneral },
  })

  const consulta = useQuery({
    queryKey: ['ordenes', tenantId, 'para_entregar'],
    queryFn: () => api.ordenes.listar({ pagina: 1, porPagina: 100, estado: 'para_entregar' }),
    enabled: puedeVer,
    refetchInterval: REFRESCO,
  })
  const datos = consulta.data?.datos ?? []
  const abrir = (id: string) =>
    void navegar({ to: '/entregas/$id', params: { id }, search: conVisita })
  const { propsFila } = useFilasConTeclado(datos, (o) => abrir(o.id))

  return (
    <Shell titulo="Para entregar" requiere={accesoDeRuta(contrato.ordenes.listar)}>
      {r.visita ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-base border border-marca bg-marca-suave px-3 py-2">
          <span className="text-dato">
            Viene a retirar <span className="font-mono font-semibold">{quienRetira(r.visita)}</span>
            . Elegí su auto.
          </span>
          <span className="ml-auto">
            <Boton
              tamano="chico"
              deshabilitado={soltar.isPending}
              onClick={() => r.visita && soltar.mutate(r.visita.id)}
            >
              Devolver a la cola
            </Boton>
          </span>
        </div>
      ) : (
        r.retiros.length > 0 && (
          <section
            aria-label="Vienen a retirar"
            className="overflow-hidden rounded-base border border-borde bg-superficie"
          >
            <header className="border-b border-borde px-3 py-2">
              <h2 className="font-display text-dato font-semibold">Vienen a retirar</h2>
            </header>
            <ul className="divide-y divide-borde-suave">
              {r.retiros.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                  <span className="font-mono font-semibold">{v.numero}</span>
                  <span className="text-dato">{v.nombre ?? 'Sin nombre'}</span>
                  {v.nota && <span className="text-etiqueta text-texto-suave">{v.nota}</span>}
                  <span className="ml-auto">
                    <Boton
                      tamano="chico"
                      deshabilitado={tomar.isPending}
                      onClick={() => tomar.mutate(v)}
                    >
                      {r.esMia(v) ? 'Seguir' : 'Atender'}
                    </Boton>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">
            Terminadas, listas para el cliente
          </h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {consulta.data ? `${datos.length} para entregar` : '…'}
          </span>
        </header>

        {consulta.isPending && (
          <div className="grid gap-px p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
            ))}
          </div>
        )}
        {consulta.isError && (
          <p role="alert" className="px-3 py-4 text-dato text-critico">
            {mensajeGeneral(consulta.error)}
          </p>
        )}
        {consulta.data && !datos.length && (
          <p className="px-3 py-6 text-dato text-texto-suave">
            No hay autos para entregar. Las órdenes aparecen acá cuando el taller las termina.
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {['Orden', 'Vehículo', 'Titular', 'Pedido', 'Estado', 'Total'].map((c) => (
                  <th
                    key={c}
                    className={`border-b border-borde px-3 py-1.5 font-medium ${c === 'Total' ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((o, i) => (
                <tr
                  key={o.id}
                  {...propsFila(i)}
                  className={FILA_CLICABLE}
                  onClick={clicEnFila(() => abrir(o.id))}
                >
                  <td className="h-fila border-b border-borde-suave px-3 py-1 font-mono">
                    <Link
                      to="/entregas/$id"
                      params={{ id: o.id }}
                      search={conVisita}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {nombreOrden(o.numero)}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 py-1">
                    <span className="inline-flex items-center gap-2">
                      <Patente dominio={o.vehiculo.dominio} />
                      <span className="text-texto-suave">
                        {[o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' ')}
                      </span>
                    </span>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    {o.titular?.razonSocial ?? '—'}
                  </td>
                  <td className="h-fila max-w-72 truncate border-b border-borde-suave px-3 text-texto-suave">
                    {o.pedido}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoOT estado={o.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    $ {formatearImporte(o.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((o, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={o.id}
                {...propsFila(i)}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(() => abrir(o.id))}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/entregas/$id"
                    params={{ id: o.id }}
                    search={conVisita}
                    className="font-mono text-dato text-marca"
                  >
                    {nombreOrden(o.numero)}
                  </Link>
                  <Patente dominio={o.vehiculo.dominio} />
                  <span className="ml-auto">
                    <EstadoOT estado={o.estado} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {o.titular?.razonSocial ?? 'Sin titular'} · $ {formatearImporte(o.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
