import { formatearImporte } from '@gpb/core'
import { Link } from '@tanstack/react-router'
import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import type { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { nombreOrden } from '../ordenes/ordenes.ts'

type Listado = Awaited<ReturnType<typeof api.ordenes.listar>>
export type OrdenDelVehiculo = Listado['datos'][number]

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { dateStyle: 'short' })
const importe = (total: string) => (total === '0.00' ? '—' : `$ ${formatearImporte(total)}`)

/**
 * Lo que se le hizo al auto en el taller, de la última orden a la primera, con quién era el
 * titular cada vez. El teclado lo maneja la ficha: Esc tiene que decidir entre soltar la fila
 * marcada y volver, y eso se resuelve donde están los dos.
 */
export function OrdenesDelVehiculo({
  cargando,
  error,
  datos,
  total,
  propsFila,
  abrir,
}: {
  cargando: boolean
  error: unknown
  datos: OrdenDelVehiculo[]
  total: number
  propsFila: (i: number) => { 'data-activa': string | undefined }
  abrir: (id: string) => void
}) {
  const esEscritorio = useMedia(ES_ESCRITORIO)
  // La sucursal se escribe sólo si distingue algo: casi todos los autos van siempre a la misma.
  const variasSucursales = new Set(datos.map((o) => o.sucursal)).size > 1
  const columnas = [
    'Orden',
    'Fecha',
    ...(variasSucursales ? ['Sucursal'] : []),
    'Pedido',
    'Titular',
    'Estado',
    'Total',
  ]

  return (
    <section
      aria-label="Órdenes de trabajo"
      className="overflow-hidden rounded-base border border-borde bg-superficie md:col-span-2"
    >
      <header className="border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Órdenes de trabajo</h2>
      </header>

      {cargando && <div className="m-3 h-16 animate-pulse rounded-base bg-superficie-2" />}
      {Boolean(error) && (
        <p role="alert" className="px-3 py-3 text-dato text-critico">
          {mensajeGeneral(error)}
        </p>
      )}
      {!cargando && !error && datos.length === 0 && (
        <p className="px-3 py-4 text-dato text-texto-suave">
          Este vehículo todavía no pasó por el taller. Cuando lo reciban, la orden aparece acá.
        </p>
      )}

      {datos.length > 0 && esEscritorio && (
        <table className="w-full text-dato">
          <thead>
            <tr className="text-left text-etiqueta text-texto-tenue">
              {columnas.map((c) => (
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
                    to="/ordenes/$id"
                    params={{ id: o.id }}
                    className="text-marca hover:underline focus-visible:underline"
                  >
                    {nombreOrden(o.numero)}
                  </Link>
                </td>
                <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                  {fecha(o.creadoEn)}
                </td>
                {variasSucursales && (
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {o.sucursal}
                  </td>
                )}
                <td className="h-fila max-w-72 truncate border-b border-borde-suave px-3 text-texto-suave">
                  {o.pedido}
                </td>
                <td className="h-fila border-b border-borde-suave px-3">
                  {o.titular?.razonSocial ?? '—'}
                </td>
                <td className="h-fila border-b border-borde-suave px-3">
                  <EstadoOT estado={o.estado} />
                </td>
                <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                  {importe(o.total)}
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
                  to="/ordenes/$id"
                  params={{ id: o.id }}
                  className="font-mono text-dato text-marca"
                >
                  {nombreOrden(o.numero)}
                </Link>
                <span className="font-mono text-etiqueta text-texto-tenue">
                  {fecha(o.creadoEn)}
                </span>
                <span className="ml-auto">
                  <EstadoOT estado={o.estado} />
                </span>
              </div>
              <span className="truncate text-etiqueta text-texto-suave">{o.pedido}</span>
              <div className="flex items-center gap-2 text-etiqueta text-texto-suave">
                <span className="truncate">
                  {[variasSucursales ? o.sucursal : null, o.titular?.razonSocial]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="tabular ml-auto font-mono text-texto">{importe(o.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > datos.length && (
        <p className="border-t border-borde-suave px-3 py-2 text-etiqueta text-texto-tenue">
          Las últimas {datos.length} de {total}.
        </p>
      )}
    </section>
  )
}
