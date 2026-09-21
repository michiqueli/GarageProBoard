import { useQuery } from '@tanstack/react-query'
import { Patente } from '../../componentes/Patente.tsx'
import { apiEstacion } from './estacion.ts'
import { Estado, HORA, numeroOrden, Quien, Relojes, Resumen } from './tablero.tsx'

/** Cada cuánto se pide de nuevo. Nadie lo toca, así que se refresca solo o no se refresca. */
const MS_REFRESCO = 20_000

/**
 * El tablero en el televisor del piso.
 *
 * Es la misma información que la pantalla del jefe de taller, con otro tamaño de letra y sin
 * nada que tocar: cuelga de la pared, la mira todo el mundo de paso y **no tiene sesión** —se
 * autentica con el token de su estación, igual que el kiosco—.
 *
 * Por eso tampoco muestra lo que no se lee de lejos: ni el pedido del cliente entero, ni
 * botones, ni filtros. Lo que se ve a cinco metros es la patente, quién lo tiene y hace cuánto.
 */
export function TableroDelPiso({
  estacion,
}: {
  estacion: { nombre: string; sucursal: string | null }
}) {
  const tablero = useQuery({
    queryKey: ['tablero-piso'],
    queryFn: () => apiEstacion.fichaje.tableroEstacion(),
    refetchInterval: MS_REFRESCO,
  })

  const autos = tablero.data?.autos ?? []

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-fondo text-texto">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-borde px-8 py-5">
        {tablero.data ? (
          <Resumen resumen={tablero.data.resumen} grande />
        ) : (
          <span className="text-[1.2rem] opacity-50">Conectando…</span>
        )}
        <div className="grid justify-items-end">
          <span className="font-mono text-[1.6rem] tabular-nums">
            {tablero.data ? HORA.format(new Date(tablero.data.alMomento)) : '—'}
          </span>
          <span className="text-[0.95rem] opacity-50">
            {tablero.data?.sucursal ?? estacion.sucursal ?? estacion.nombre}
          </span>
        </div>
      </header>

      {tablero.isError && (
        <p className="grid place-content-center px-8 text-center text-[1.4rem] text-critico">
          No se pudo leer el tablero. Se reintenta solo.
        </p>
      )}

      {tablero.data && autos.length === 0 && (
        <p className="grid place-content-center px-8 text-center text-[1.8rem] opacity-50">
          No hay autos en el taller.
        </p>
      )}

      {autos.length > 0 && (
        <ul className="grid content-start gap-3 p-6 sm:grid-cols-2 xl:grid-cols-3">
          {autos.map((a) => (
            <li
              key={a.id}
              className={`grid gap-2 rounded-base border bg-superficie px-4 py-3 ${
                a.trabajando.length > 0 ? 'border-ok' : 'border-borde'
              }`}
            >
              <div className="flex items-center gap-3">
                <Patente dominio={a.dominio} tamano="grande" />
                <span className="font-mono text-[1.1rem] tabular-nums opacity-50">
                  {numeroOrden(a.numero)}
                </span>
                <span className="ml-auto">
                  <Estado estado={a.estado} grande />
                </span>
              </div>
              <span className="text-[1.15rem] opacity-70">{a.vehiculo}</span>
              <Quien auto={a} grande />
              <Relojes auto={a} grande />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
