import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearImporte } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { copiarConAviso } from '../../componentes/Copiar.tsx'
import { EstadoPedido } from '../../componentes/EstadoPedido.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useFilasConTeclado } from '../../teclado/index.ts'
import { PestanasRepuestos } from './Pestanas.tsx'
import { nombrePedido, type PedidoResumen, seis } from './repuestos.ts'

type Filtro = 'pendientes' | 'abierto' | 'en_caja' | 'todos'

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'pendientes', texto: 'Pendientes' },
  { valor: 'abierto', texto: 'Abiertos' },
  { valor: 'en_caja', texto: 'En caja' },
  { valor: 'todos', texto: 'Todos' },
]

/** A quién va el pedido, en palabras. */
export function destinoPedido(p: Pick<PedidoResumen, 'orden' | 'cliente'>) {
  if (p.orden) return `OT ${seis(p.orden.numero)}`
  return p.cliente?.razonSocial ?? 'Mostrador · consumidor final'
}

/**
 * Los pedidos de repuestos de la sucursal: los que el taller pidió para una orden y los del
 * mostrador. Por omisión, los que alguien tiene que atender.
 */
export function PantallaPedidos() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()
  const puedeVer = usePuedeUsar(contrato.pedidosRepuestos.listar)
  const puedeAbrir = usePuedeUsar(contrato.pedidosRepuestos.abrir)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [buscar, setBuscar] = useState('')
  const texto = buscar.trim()

  const consulta = useQuery({
    queryKey: ['pedidos-repuestos', tenantId, sucursalId, filtro, texto],
    queryFn: () =>
      api.pedidosRepuestos.listar({
        pagina: 1,
        porPagina: 100,
        estado: filtro,
        ...(texto ? { buscar: texto } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []
  // ↑ ↓ marcan una fila y Enter la abre, también desde el buscador.
  const { activa, propsFila } = useFilasConTeclado(
    datos,
    (x) => void navegar({ to: '/repuestos/pedidos/$id', params: { id: x.id } }),
  )
  const marcado = activa === null ? undefined : datos[activa]
  // Alt+C y Alt+P: el chasis y la patente del vehículo, sin buscar el botón.
  useAtajo(
    'repuestos.copiarChasis',
    () => void copiarConAviso(marcado?.chasis as string, 'Chasis'),
    Boolean(marcado),
  )
  useAtajo(
    'repuestos.copiarPatente',
    () => void copiarConAviso(marcado?.vehiculo?.dominio as string, 'Patente'),
    Boolean(marcado?.vehiculo?.dominio),
  )

  return (
    <Shell
      titulo="Pedidos de repuestos"
      requiere={accesoDeRuta(contrato.pedidosRepuestos.listar)}
      acciones={
        puedeAbrir ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            icono={<IconoAgregar />}
            onClick={() => void navegar({ to: '/repuestos/pedidos/nuevo' })}
          >
            Nuevo pedido
          </Boton>
        ) : undefined
      }
    >
      <PestanasRepuestos />
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2">
          <div role="radiogroup" aria-label="Qué pedidos" className="flex flex-wrap gap-1">
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
                  name="filtro-pedidos"
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
            aria-label="Buscar pedidos"
            data-lista
            placeholder="Número, chasis, patente o cliente"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="h-7 w-full rounded-base border border-borde bg-superficie-2 px-2 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-64"
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
            {texto
              ? `Ningún pedido coincide con «${texto}».`
              : filtro === 'pendientes'
                ? 'No hay pedidos para atender.'
                : 'No hay pedidos.'}
            {puedeAbrir && !texto && ' Abrí uno con Nuevo pedido.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {['Pedido', 'Vehículo', 'Para', 'Pidió', 'Estado', 'Total'].map((c) => (
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
              {datos.map((p, i) => (
                <tr
                  key={p.id}
                  {...propsFila(i)}
                  className={FILA_CLICABLE}
                  onClick={clicEnFila(
                    () => void navegar({ to: '/repuestos/pedidos/$id', params: { id: p.id } }),
                  )}
                >
                  <td className="h-fila border-b border-borde-suave px-3 font-mono">
                    <Link
                      to="/repuestos/pedidos/$id"
                      params={{ id: p.id }}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {nombrePedido(p.numero)}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 py-1">
                    <span className="inline-flex items-center gap-2">
                      {p.vehiculo ? <Patente dominio={p.vehiculo.dominio} /> : null}
                      <span className="font-mono text-etiqueta text-texto-suave">{p.chasis}</span>
                    </span>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">{destinoPedido(p)}</td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {p.solicitante ?? p.creadoPor}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoPedido estado={p.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    {p.total === '0.00' ? '—' : `$ ${formatearImporte(p.total)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((p, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={p.id}
                {...propsFila(i)}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(
                  () => void navegar({ to: '/repuestos/pedidos/$id', params: { id: p.id } }),
                )}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/repuestos/pedidos/$id"
                    params={{ id: p.id }}
                    className="font-mono text-dato text-marca"
                  >
                    {nombrePedido(p.numero)}
                  </Link>
                  <span className="ml-auto">
                    <EstadoPedido estado={p.estado} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {destinoPedido(p)} · <span className="font-mono">{p.chasis}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
