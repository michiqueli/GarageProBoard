import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado, useFlechasPestanas } from '../../teclado/index.ts'
import { nombreOrden } from './ordenes.ts'

type Orden = Awaited<ReturnType<typeof api.ordenes.listar>>['datos'][number]
type Filtro = 'en_taller' | 'terminada' | 'todas'

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'en_taller', texto: 'En el taller' },
  { valor: 'terminada', texto: 'Para facturar' },
  { valor: 'todas', texto: 'Todas' },
]

/**
 * Las órdenes de la sucursal: qué autos están en el taller, en qué estado y quién los tiene.
 * `Ins` recibe un auto nuevo; la ficha de cada orden es donde se trabaja.
 */
export function PantallaOrdenes() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()
  const puedeVer = usePuedeUsar(contrato.ordenes.listar)
  const puedeAbrir = usePuedeUsar(contrato.ordenes.abrir)
  const [filtro, setFiltro] = useState<Filtro>('en_taller')
  const [buscar, setBuscar] = useState('')
  useFlechasPestanas(
    FILTROS.map((f) => f.valor),
    filtro,
    setFiltro,
  )

  const consulta = useQuery({
    queryKey: ['ordenes', tenantId, sucursalId, filtro, buscar.trim()],
    queryFn: () =>
      api.ordenes.listar({
        pagina: 1,
        porPagina: 100,
        estado: filtro,
        ...(buscar.trim() ? { buscar: buscar.trim() } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []
  // ↑ ↓ marcan una fila y Enter la abre, también desde el buscador.
  const { propsFila } = useFilasConTeclado(
    datos,
    (x) => void navegar({ to: '/ordenes/$id', params: { id: x.id } }),
  )

  // El resumen cuenta el taller entero, sea cual sea la pestaña: si dependiera de lo que se
  // está mirando, «Para facturar» daría cero justo en la pestaña de todas.
  const resumen = useQuery({
    queryKey: ['ordenes', tenantId, sucursalId, 'resumen'],
    queryFn: () => api.ordenes.listar({ pagina: 1, porPagina: 200, estado: 'en_taller' }),
    enabled: puedeVer,
  })
  const cuenta = (estados: Orden['estado'][]) =>
    (resumen.data?.datos ?? []).filter((o) => estados.includes(o.estado)).length

  return (
    <Shell
      titulo="Órdenes de trabajo"
      requiere={accesoDeRuta(contrato.ordenes.listar)}
      acciones={
        puedeAbrir ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            icono={<IconoAgregar />}
            onClick={() => void navegar({ to: '/ordenes/nueva' })}
          >
            Recibir un vehículo
          </Boton>
        ) : undefined
      }
    >
      {resumen.data && (
        <section
          aria-label="Resumen"
          className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2.5"
        >
          <Kpi
            titulo="Recibidas"
            valor={cuenta(['recibida'])}
            alElegir={() => setFiltro('en_taller')}
          />
          <Kpi
            titulo="En proceso"
            valor={cuenta(['en_proceso'])}
            alElegir={() => setFiltro('en_taller')}
          />
          <Kpi
            titulo="Esperando"
            valor={cuenta(['esperando_repuesto', 'esperando_autorizacion'])}
            alerta
            alElegir={() => setFiltro('en_taller')}
          />
          <Kpi
            titulo="Para facturar"
            valor={cuenta(['terminada'])}
            alerta
            alElegir={() => setFiltro('terminada')}
          />
        </section>
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2">
          <div role="radiogroup" aria-label="Qué órdenes" className="flex gap-1">
            {FILTROS.map((f) => (
              <label
                key={f.valor}
                className={`inline-flex h-7 cursor-pointer items-center rounded-base border px-2.5 text-etiqueta ${
                  filtro === f.valor
                    ? 'border-marca bg-marca-suave font-semibold text-marca'
                    : 'border-borde text-texto-suave'
                }`}
              >
                <input
                  type="radio"
                  name="filtro-ordenes"
                  className="sr-only"
                  checked={filtro === f.valor}
                  onChange={() => setFiltro(f.valor)}
                />
                {f.texto}
              </label>
            ))}
          </div>
          <input
            type="search"
            aria-label="Buscar órdenes"
            data-lista
            placeholder="Número, patente o pedido"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="ml-auto h-7 w-56 rounded-base border border-borde bg-superficie-2 px-2 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca"
          />
        </header>

        {consulta.isPending && (
          <div className="m-3 h-24 animate-pulse rounded-base bg-superficie-2" />
        )}
        {consulta.isError && (
          <p role="alert" className="px-3 py-3 text-dato text-critico">
            {mensajeGeneral(consulta.error)}
          </p>
        )}
        {consulta.data && datos.length === 0 && (
          <p className="px-3 py-4 text-dato text-texto-suave">
            {buscar
              ? `Ninguna orden coincide con «${buscar}».`
              : filtro === 'terminada'
                ? 'No hay órdenes esperando caja.'
                : 'No hay autos en el taller.'}
            {puedeAbrir &&
              filtro === 'en_taller' &&
              !buscar &&
              ' Recibí uno con el botón de arriba.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {['Orden', 'Vehículo', 'Paga', 'Pedido', 'Mecánico', 'Estado', 'Total'].map((c) => (
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
                  onClick={clicEnFila(
                    () => void navegar({ to: '/ordenes/$id', params: { id: o.id } }),
                  )}
                >
                  <td className="h-fila border-b border-borde-suave px-3 py-1 font-mono">
                    <Link
                      to="/ordenes/$id"
                      params={{ id: o.id }}
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
                    {o.paga?.razonSocial ?? '—'}
                  </td>
                  <td className="h-fila max-w-72 truncate border-b border-borde-suave px-3 text-texto-suave">
                    {o.pedido}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {o.mecanico?.nombre ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoOT estado={o.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    {o.total === '0.00' ? '—' : `$ ${formatearImporte(o.total)}`}
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
                onClick={clicEnFila(
                  () => void navegar({ to: '/ordenes/$id', params: { id: o.id } }),
                )}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/ordenes/$id"
                    params={{ id: o.id }}
                    className="font-mono text-dato text-marca"
                  >
                    {nombreOrden(o.numero)}
                  </Link>
                  <Patente dominio={o.vehiculo.dominio} />
                  <span className="ml-auto">
                    <EstadoOT estado={o.estado} />
                  </span>
                </div>
                <span className="truncate text-etiqueta text-texto-suave">{o.pedido}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

function Kpi({
  titulo,
  valor,
  alerta = false,
  alElegir,
}: {
  titulo: string
  valor: number
  alerta?: boolean
  /** Tocar el número muestra esas órdenes. */
  alElegir: () => void
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      className="grid gap-0.5 rounded-base border border-borde bg-superficie px-3 py-2.5 text-left hover:bg-superficie-2"
    >
      <span className="text-etiqueta text-texto-suave">{titulo}</span>
      <b
        className={`font-display text-2xl leading-tight font-semibold ${alerta && valor > 0 ? 'text-atencion' : ''}`}
      >
        {valor}
      </b>
    </button>
  )
}
