import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import { Patente } from '../../componentes/Patente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useFilasConTeclado } from '../../teclado/index.ts'
import { Estado, numeroOrden, Quien, Relojes, Resumen, type Tarjeta } from './tablero.tsx'

/** Cada cuánto se pide de nuevo. Un taller no cambia cada segundo; medio minuto alcanza. */
const MS_REFRESCO = 30_000

/**
 * El tablero de piso: qué hay en el taller ahora mismo y quién lo tiene.
 *
 * Es la pantalla que el fichaje hace posible. Antes, «¿cómo viene el día?» se contestaba
 * caminando hasta el fondo del taller y preguntando; ahora sale de las sesiones de trabajo que
 * los mecánicos abren y cierran con su credencial.
 *
 * Se refresca sola. La fila se abre como cualquier otra del sistema —clic o Enter— porque
 * desde acá lo que uno quiere es entrar a la orden.
 */
export function PantallaTablero() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva?.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const navegar = useNavigate()

  const tablero = useQuery({
    queryKey: ['tablero', tenantId, sucursalId],
    queryFn: () => api.fichaje.tablero(),
    refetchInterval: MS_REFRESCO,
  })

  const autos = useMemo(() => tablero.data?.autos ?? [], [tablero.data])
  const abrir = (a: Tarjeta) => void navegar({ to: '/ordenes/$id', params: { id: a.id } })
  const { propsFila } = useFilasConTeclado(autos, abrir)

  return (
    <Shell
      titulo="Taller"
      requiere={accesoDeRuta(contrato.fichaje.tablero)}
      acciones={
        <Boton
          accion="global.refrescar"
          deshabilitado={tablero.isFetching}
          onClick={() => void tablero.refetch()}
        >
          {tablero.isFetching ? 'Actualizando…' : 'Actualizar'}
        </Boton>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-base border border-borde bg-superficie px-3 py-2.5">
        {tablero.data ? (
          <Resumen resumen={tablero.data.resumen} />
        ) : (
          <span className="text-dato text-texto-tenue">…</span>
        )}
        {tablero.data && (
          <span className="text-etiqueta text-texto-tenue">
            {tablero.data.sucursal} · al momento
          </span>
        )}
      </div>

      {tablero.isError && (
        <p
          role="alert"
          className="rounded-base border border-critico px-3 py-6 text-dato text-critico"
        >
          {mensajeGeneral(tablero.error)}
        </p>
      )}

      {tablero.isPending && <Esqueleto />}

      {tablero.data && autos.length === 0 && (
        <p className="rounded-base border border-borde bg-superficie px-3 py-8 text-center text-dato text-texto-suave">
          No hay autos en el taller. Cuando recepción abra una orden, aparece acá.
        </p>
      )}

      {tablero.data && autos.length > 0 && esEscritorio && (
        <section className="overflow-hidden rounded-base border border-borde bg-superficie">
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr>
                {['OT', 'Vehículo', 'Qué pidió', 'Estado', 'Quién lo tiene', 'Tiempos'].map((c) => (
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
              {autos.map((a, i) => (
                <tr
                  key={a.id}
                  className={FILA_CLICABLE}
                  {...propsFila(i)}
                  onClick={clicEnFila(() => abrir(a))}
                >
                  <td className="h-fila border-b border-borde-suave px-3 font-mono tabular-nums">
                    {numeroOrden(a.numero)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <span className="flex items-baseline gap-2">
                      {a.dominio ? <Patente dominio={a.dominio} /> : <span>—</span>}
                      <span className="text-texto-suave">{a.vehiculo}</span>
                    </span>
                  </td>
                  <td className="h-fila max-w-72 truncate border-b border-borde-suave px-3 text-texto-suave">
                    {a.pedido}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Estado estado={a.estado} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Quien auto={a} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    <Relojes auto={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tablero.data && autos.length > 0 && !esEscritorio && (
        <ul className="grid gap-2">
          {autos.map((a, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se abre con ↑ ↓ y Enter (useFilasConTeclado)
            <li
              key={a.id}
              className={`grid gap-1.5 rounded-base border border-borde bg-superficie px-3 py-2.5 ${FILA_CLICABLE}`}
              {...propsFila(i)}
              onClick={clicEnFila(() => abrir(a))}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono tabular-nums text-texto-tenue">
                  {numeroOrden(a.numero)}
                </span>
                {a.dominio && <Patente dominio={a.dominio} />}
                <span className="ml-auto">
                  <Estado estado={a.estado} />
                </span>
              </div>
              <span className="truncate text-etiqueta text-texto-suave">{a.pedido}</span>
              <Quien auto={a} />
              <Relojes auto={a} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-px rounded-base border border-borde bg-superficie p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
