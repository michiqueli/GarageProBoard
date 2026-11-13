import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar, IconoEditar } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado } from '../../teclado/index.ts'
import { fechaCorta, importeUnidad } from '../stock/stock.tsx'
import { ESTADO_VENTA, nombreVenta, type VentaResumen } from './ventas.ts'

/** Forma además de color: el borrador pide algo, la confirmada está en curso, la anulada cerró. */
export function EstadoVenta({ estado }: { estado: VentaResumen['estado'] }) {
  if (estado === 'borrador') {
    return (
      <span className="rounded-full bg-atencion-suave px-2 text-etiqueta font-semibold text-atencion">
        Borrador
      </span>
    )
  }
  if (estado === 'confirmada') {
    return (
      <span className="rounded-full border border-ok px-2 text-etiqueta text-ok">Confirmada</span>
    )
  }
  return <span className="text-etiqueta text-texto-tenue">{ESTADO_VENTA.anulada}</span>
}

/** Las ventas de unidades. Se empiezan desde la unidad, en el stock, o desde acá. */
export function PantallaVentas() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()
  const puedeVer = usePuedeUsar(contrato.ventas.listar)
  const puedeCrear = usePuedeUsar(contrato.ventas.crear)
  const puedeConfigurar = usePuedeUsar(contrato.ventas.guardarConfig)
  const [todas, setTodas] = useState(false)
  const [buscar, setBuscar] = useState('')

  const consulta = useQuery({
    queryKey: ['ventas', tenantId, todas, buscar.trim()],
    queryFn: () =>
      api.ventas.listar({
        pagina: 1,
        porPagina: 200,
        estado: todas ? 'todas' : 'vivas',
        ...(buscar.trim() ? { buscar: buscar.trim() } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []
  const abrir = (id: string) => void navegar({ to: '/ventas/$id', params: { id } })
  const { propsFila } = useFilasConTeclado(datos, (v) => abrir(v.id))

  return (
    <Shell
      titulo="Ventas"
      requiere={accesoDeRuta(contrato.ventas.listar)}
      acciones={
        <>
          {puedeConfigurar && (
            <Link to="/ventas/configuracion" className={clasesBoton()}>
              <IconoEditar />
              Configuración
            </Link>
          )}
          {puedeCrear && (
            <Boton
              accion="global.nuevo"
              variante="principal"
              icono={<IconoAgregar />}
              onClick={() => void navegar({ to: '/ventas/nueva', search: {} })}
            >
              Nueva venta
            </Boton>
          )}
        </>
      }
    >
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-3 border-b border-borde px-3 py-2">
          <label className="inline-flex items-center gap-2 text-etiqueta text-texto-suave">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            Incluir las anuladas
          </label>
          <input
            type="search"
            aria-label="Buscar ventas"
            data-lista
            placeholder="Número, patente, chasis o cliente"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="ml-auto h-7 w-64 rounded-base border border-borde bg-superficie-2 px-2 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca"
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
            {buscar ? `Ninguna venta coincide con «${buscar}».` : 'Todavía no hay ventas.'}
            {puedeCrear &&
              !buscar &&
              ' Empezá una desde una unidad del stock, o con el botón de arriba.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {[
                  'Venta',
                  'Fecha',
                  'Unidad',
                  'Cliente',
                  'Vendedor',
                  'Estado',
                  'Total',
                  'Saldo',
                ].map((c) => (
                  <th
                    key={c}
                    className={`border-b border-borde px-3 py-1.5 font-medium ${c === 'Total' || c === 'Saldo' ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((v, i) => (
                <tr
                  key={v.id}
                  {...propsFila(i)}
                  className={FILA_CLICABLE}
                  onClick={clicEnFila(() => abrir(v.id))}
                >
                  <td className="h-fila border-b border-borde-suave px-3 py-1 font-mono">
                    <Link
                      to="/ventas/$id"
                      params={{ id: v.id }}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {nombreVenta(v.numero)}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                    {fechaCorta(v.fecha)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    {v.unidad.nombre}
                    <span className="ml-2 font-mono text-etiqueta text-texto-suave">
                      {v.unidad.dominio ?? v.unidad.chasis}
                    </span>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">{v.cliente.nombre}</td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {v.vendedor ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoVenta estado={v.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    {importeUnidad(v.total, v.moneda)}
                  </td>
                  <td
                    className={`tabular h-fila border-b border-borde-suave px-3 text-right font-mono ${Number(v.saldo) > 0 ? 'text-atencion' : ''}`}
                  >
                    {importeUnidad(v.saldo, v.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((v, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={v.id}
                {...propsFila(i)}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(() => abrir(v.id))}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/ventas/$id"
                    params={{ id: v.id }}
                    className="font-mono text-dato text-marca"
                  >
                    {nombreVenta(v.numero)}
                  </Link>
                  <span className="ml-auto">
                    <EstadoVenta estado={v.estado} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {v.unidad.nombre} · {v.cliente.nombre}
                </span>
                <span className="tabular font-mono text-dato">
                  {importeUnidad(v.total, v.moneda)}
                  {Number(v.saldo) > 0 && (
                    <span className="ml-2 text-etiqueta text-atencion">
                      saldo {importeUnidad(v.saldo, v.moneda)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
