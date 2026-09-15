import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'

// Por id y no importando la ruta: `rutas.tsx` importa esta pantalla, y el camino
// inverso armaría un ciclo. El id igual está tipado — uno que no existe no compila.
const ruta = getRouteApi('/con-sesion/vehiculos')

/**
 * El parque de vehículos de la concesionaria, contra la base de verdad.
 *
 * Es la primera pantalla que consume la API: cada usuario ve solamente los suyos, y el
 * filtro no lo pone esta consulta sino Row Level Security. Si mañana alguien escribe
 * una consulta y se olvida de acotarla, no se filtran datos ajenos — revienta.
 */
export function PantallaVehiculos() {
  const navegar = ruta.useNavigate()
  const inicial = ruta.useSearch({ select: (s) => s.buscar ?? '' })

  // Lo tipeado vive en estado local y la URL lo copia, no al revés. Si el campo leyera
  // directo de la URL, cada tecla esperaría a que el router termine de navegar y el
  // cursor saltaría al final en medio de una patente.
  const [buscar, setBuscarLocal] = useState(inicial)
  const esEscritorio = useMedia(ES_ESCRITORIO)

  function setBuscar(valor: string) {
    setBuscarLocal(valor)
    // `replace`: una búsqueda no es un lugar al que se vuelve con Atrás. Sin esto, tipear
    // una patente dejaría siete entradas en el historial, una por letra.
    void navegar({ search: { buscar: valor || undefined }, replace: true })
  }
  const tenant = usarSesion((e) => e.datos?.tenant.nombre)
  const tenantId = usarSesion((e) => e.datos?.tenant.id)

  const consulta = useQuery({
    // El tenant va en la clave aunque la caché ya se limpie al cambiar de usuario:
    // dos defensas para el mismo problema, porque el costo es una palabra y el error
    // se ve como una fuga de datos.
    queryKey: ['vehiculos', tenantId, buscar],
    queryFn: () => api.vehiculos.listar({ pagina: 1, porPagina: 50, buscar: buscar || undefined }),
  })

  return (
    <Shell
      titulo="Vehículos"
      acciones={
        <Boton accion="global.nuevo" onClick={() => {}}>
          Nuevo vehículo
        </Boton>
      }
    >
      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Parque de {tenant}</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {consulta.data ? `${consulta.data.total} vehículos` : '…'}
          </span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Patente o chasis"
            aria-label="Buscar"
            className="ml-auto h-campo w-56 rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca"
          />
        </header>

        {consulta.isPending && <Esqueleto />}

        {consulta.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            No se pudo traer el listado. Probá refrescar con F5.
          </p>
        )}

        {consulta.data?.datos.length === 0 && (
          <p className="px-3 py-8 text-center text-dato text-texto-suave">
            {buscar
              ? `Ningún vehículo coincide con «${buscar}».`
              : 'Todavía no hay vehículos cargados.'}
          </p>
        )}

        {consulta.data && consulta.data.datos.length > 0 && esEscritorio && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-dato">
              <thead>
                <tr>
                  {['Patente', 'Chasis', 'Año', 'Color'].map((c) => (
                    <th
                      key={c}
                      className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consulta.data.datos.map((v) => (
                  <tr key={v.id} className="hover:bg-superficie-2">
                    <td className="h-fila border-b border-borde-suave px-3 font-mono">
                      {v.dominio ?? <SinPatente />}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta text-texto-suave">
                      {v.chasis}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 font-mono">
                      {v.anio ?? '—'}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3">{v.color ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {consulta.data && consulta.data.datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {consulta.data.datos.map((v) => (
              <li key={v.id} className="grid gap-0.5 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-dato font-semibold">
                    {v.dominio ?? <SinPatente />}
                  </span>
                  <span className="ml-auto text-etiqueta text-texto-suave">
                    {v.anio ?? '—'} · {v.color ?? '—'}
                  </span>
                </div>
                <span className="font-mono text-etiqueta text-texto-tenue">{v.chasis}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/** Un 0km existe con chasis desde que la terminal lo factura, y sin chapa por semanas. */
function SinPatente() {
  return <span className="text-etiqueta text-texto-tenue italic">sin patentar</span>
}

/** Esqueletos con la forma de lo que viene, no un spinner que hace saltar la pantalla. */
function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
