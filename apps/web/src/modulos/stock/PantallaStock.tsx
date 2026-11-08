import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar, IconoEditar } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado } from '../../teclado/index.ts'
import {
  CONDICION,
  EstadoUnidad,
  importeUnidad,
  nombreUnidad,
  TENENCIA,
  type Unidad,
} from './stock.tsx'

const duenia = (u: Unidad) => u.consignante?.nombre ?? u.empresa?.nombre ?? '—'

/** Las unidades de todas las sucursales: al que vende le sirve saber qué hay en la otra. */
export function PantallaStock() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()
  const puedeVer = usePuedeUsar(contrato.cartera.listar)
  const puedeIngresar = usePuedeUsar(contrato.cartera.ingresar)
  const puedeConfigurar = usePuedeUsar(contrato.cartera.guardarConfig)
  const [buscar, setBuscar] = useState('')
  const [todas, setTodas] = useState(false)
  const [condicion, setCondicion] = useState<Unidad['condicion'] | null>(null)

  const consulta = useQuery({
    queryKey: ['stock', tenantId, todas, condicion, buscar.trim()],
    queryFn: () =>
      api.cartera.listar({
        pagina: 1,
        porPagina: 200,
        estado: todas ? 'todas' : 'en_stock',
        ...(condicion ? { condicion } : {}),
        ...(buscar.trim() ? { buscar: buscar.trim() } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []
  const abrir = (id: string) => void navegar({ to: '/stock/$id', params: { id } })
  const { propsFila } = useFilasConTeclado(datos, (u) => abrir(u.id))

  return (
    <Shell
      titulo="Stock de unidades"
      requiere={accesoDeRuta(contrato.cartera.listar)}
      acciones={
        <>
          {puedeConfigurar && (
            <Link to="/stock/configuracion" className={clasesBoton()}>
              <IconoEditar />
              Configuración
            </Link>
          )}
          {puedeIngresar && (
            <Boton
              accion="global.nuevo"
              variante="principal"
              icono={<IconoAgregar />}
              onClick={() => void navegar({ to: '/stock/ingresar' })}
            >
              Ingresar unidad
            </Boton>
          )}
        </>
      }
    >
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-end gap-3 border-b border-borde px-3 py-2">
          <Selector
            etiqueta="Condición"
            valor={condicion}
            vacio="Todas"
            onChange={setCondicion}
            opciones={[
              { valor: '0km' as const, texto: CONDICION['0km'] },
              { valor: 'usado' as const, texto: CONDICION.usado },
            ]}
          />
          <label className="inline-flex h-campo items-center gap-2 text-etiqueta text-texto-suave">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            Incluir vendidas y retiradas
          </label>
          <input
            type="search"
            aria-label="Buscar unidades"
            data-lista
            placeholder="Patente, chasis, marca o modelo"
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
            {buscar ? `Ninguna unidad coincide con «${buscar}».` : 'No hay unidades en stock.'}
            {puedeIngresar && !buscar && ' Ingresá la primera con el botón de arriba.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {[
                  'Unidad',
                  'Patente',
                  'Tipo',
                  'De quién',
                  'Sucursal',
                  'Días',
                  'Estado',
                  'Precio',
                ].map((c) => (
                  <th
                    key={c}
                    className={`border-b border-borde px-3 py-1.5 font-medium ${c === 'Precio' ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((u, i) => (
                <tr
                  key={u.id}
                  {...propsFila(i)}
                  className={FILA_CLICABLE}
                  onClick={clicEnFila(() => abrir(u.id))}
                >
                  <td className="h-fila border-b border-borde-suave px-3 py-1">
                    <Link
                      to="/stock/$id"
                      params={{ id: u.id }}
                      className="text-marca hover:underline focus-visible:underline"
                    >
                      {nombreUnidad(u)}
                    </Link>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Patente dominio={u.vehiculo.dominio} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {CONDICION[u.condicion]} · {TENENCIA[u.tenencia]}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">{duenia(u)}</td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {u.sucursal.nombre}
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 font-mono">
                    {u.diasEnStock}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <EstadoUnidad estado={u.estado} />
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 text-right font-mono">
                    {importeUnidad(u.precio, u.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((u, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={u.id}
                {...propsFila(i)}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                onClick={clicEnFila(() => abrir(u.id))}
              >
                <div className="flex items-center gap-2">
                  <Link to="/stock/$id" params={{ id: u.id }} className="text-dato text-marca">
                    {nombreUnidad(u)}
                  </Link>
                  <span className="ml-auto">
                    <EstadoUnidad estado={u.estado} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {CONDICION[u.condicion]} · {TENENCIA[u.tenencia]} · {u.sucursal.nombre}
                </span>
                <div className="flex items-center gap-2">
                  <Patente dominio={u.vehiculo.dominio} />
                  <span className="tabular ml-auto font-mono text-dato">
                    {importeUnidad(u.precio, u.moneda)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
