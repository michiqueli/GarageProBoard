import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { IconoAgregar, IconoSubir } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado } from '../../teclado/index.ts'
import { enHorasYMinutos } from '../ordenes/ordenes.ts'

type Service = Awaited<ReturnType<typeof api.services.listar>>['datos'][number]

const aplica = (s: Service) => [s.marca ?? 'Genérico', s.modelo].filter(Boolean).join(' ')
const contenido = (s: Service) =>
  [
    s.trabajos === 1 ? '1 trabajo' : `${s.trabajos} trabajos`,
    s.repuestos === 1 ? '1 repuesto' : `${s.repuestos} repuestos`,
  ].join(' · ')
const tiempo = (s: Service) => (s.minutos ? enHorasYMinutos(s.minutos) : '—')

/**
 * Los services que ofrece el taller: «10.000 km de la Kangoo», con sus trabajos, sus repuestos y
 * cuánto debería llevar. Se cargan a mano o se importan de una planilla. Ver
 * `docs/tecnicos/catalogo-de-services.md`.
 */
export function PantallaServices() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()
  const puedeVer = usePuedeUsar(contrato.services.listar)
  const puedeConfigurar = usePuedeUsar(contrato.services.crear)
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<'activos' | 'todos'>('activos')

  const consulta = useQuery({
    queryKey: ['services', tenantId, estado, buscar.trim()],
    queryFn: () =>
      api.services.listar({
        pagina: 1,
        porPagina: 200,
        estado,
        ...(buscar.trim() ? { buscar: buscar.trim() } : {}),
      }),
    enabled: puedeVer,
  })
  const datos = consulta.data?.datos ?? []
  const abrir = (id: string) => void navegar({ to: '/taller/services/$id', params: { id } })
  const { propsFila } = useFilasConTeclado(puedeConfigurar ? datos : [], (s) => abrir(s.id))
  const alClic = (id: string) => (puedeConfigurar ? clicEnFila(() => abrir(id)) : undefined)

  return (
    <Shell
      titulo="Catálogo de services"
      requiere={accesoDeRuta(contrato.services.listar)}
      acciones={
        puedeConfigurar ? (
          <>
            <Link to="/taller/services/importar" className={clasesBoton()}>
              <IconoSubir />
              Importar planilla
            </Link>
            <Boton
              accion="global.nuevo"
              variante="principal"
              icono={<IconoAgregar />}
              onClick={() => void navegar({ to: '/taller/services/nuevo' })}
            >
              Nuevo service
            </Boton>
          </>
        ) : undefined
      }
    >
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2">
          <label className="inline-flex items-center gap-2 text-etiqueta text-texto-suave">
            <input
              type="checkbox"
              checked={estado === 'todos'}
              onChange={(e) => setEstado(e.target.checked ? 'todos' : 'activos')}
            />
            Mostrar los apagados
          </label>
          <input
            type="search"
            aria-label="Buscar services"
            data-lista
            placeholder="Nombre, marca o modelo"
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
              ? `Ningún service coincide con «${buscar}».`
              : 'Todavía no hay services cargados.'}
            {puedeConfigurar && !buscar && ' Cargá uno a mano o importá una planilla.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {['Service', 'Para', 'Km', 'Contenido', 'Tiempo', ''].map((c) => (
                  <th key={c} className="border-b border-borde px-3 py-1.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((s, i) => (
                <tr
                  key={s.id}
                  {...propsFila(i)}
                  className={puedeConfigurar ? FILA_CLICABLE : undefined}
                  onClick={alClic(s.id)}
                >
                  <td className="h-fila border-b border-borde-suave px-3 py-1">
                    {puedeConfigurar ? (
                      <Link
                        to="/taller/services/$id"
                        params={{ id: s.id }}
                        className="text-marca hover:underline focus-visible:underline"
                      >
                        {s.nombre}
                      </Link>
                    ) : (
                      s.nombre
                    )}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {aplica(s)}
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                    {s.kilometros?.toLocaleString('es-AR') ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {contenido(s)}
                  </td>
                  <td className="tabular h-fila border-b border-borde-suave px-3 font-mono">
                    {tiempo(s)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-etiqueta text-texto-tenue">
                    {s.activo ? '' : 'Apagado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((s, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se entra por el enlace de la fila
              <li
                key={s.id}
                {...propsFila(i)}
                className={`grid gap-1 px-3 py-2.5 ${puedeConfigurar ? FILA_CLICABLE : ''}`}
                onClick={alClic(s.id)}
              >
                <div className="flex items-center gap-2">
                  {puedeConfigurar ? (
                    <Link
                      to="/taller/services/$id"
                      params={{ id: s.id }}
                      className="text-dato text-marca"
                    >
                      {s.nombre}
                    </Link>
                  ) : (
                    <span className="text-dato">{s.nombre}</span>
                  )}
                  <span className="tabular ml-auto font-mono text-etiqueta">{tiempo(s)}</span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  {aplica(s)} · {contenido(s)}
                  {s.activo ? '' : ' · Apagado'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
