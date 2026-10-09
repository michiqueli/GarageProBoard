import { MOTIVOS_VISITA_NOMBRE } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { apiEstacion } from './estacion.ts'

/** Cada cuánto pregunta. Un número llamado tiene que aparecer antes de que el cliente se pare. */
const REFRESCO = 4_000

/**
 * El televisor de la sala de espera: el número que se está llamando, grande, y a quién tiene
 * que ir a buscar. **Sin nombres de clientes**: está colgado donde lo ve cualquiera.
 *
 * Llamar es agarrar la visita en la puerta o en la tablet: no hay un botón aparte.
 */
export function Llamador({ estacion }: { estacion: { nombre: string; concesionaria: string } }) {
  const pantalla = useQuery({
    queryKey: ['llamador'],
    queryFn: () => apiEstacion.llamador.pantalla(),
    refetchInterval: REFRESCO,
  })

  const [actual, ...anteriores] = pantalla.data?.llamados ?? []

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-fondo text-texto">
      <header className="flex items-baseline justify-between px-10 py-6 text-2xl text-texto-tenue">
        <span>{estacion.concesionaria}</span>
        <span>{pantalla.data?.sucursal ?? estacion.nombre}</span>
      </header>

      <section className="grid content-center gap-12 px-10 md:grid-cols-[2fr_1fr]">
        <div
          aria-live="assertive"
          className="grid content-center justify-items-center gap-4 text-center"
        >
          {actual ? (
            <>
              <p className="text-3xl text-texto-suave">Número</p>
              <p className="font-mono text-[12rem] leading-none font-bold text-marca">
                {actual.numero}
              </p>
              <p className="text-5xl font-semibold">Te atiende {actual.atiende}</p>
              <p className="text-3xl text-texto-suave">{MOTIVOS_VISITA_NOMBRE[actual.motivo]}</p>
            </>
          ) : (
            <p className="text-4xl text-texto-suave">
              {pantalla.isError ? 'Sin conexión. Reintentando…' : 'Enseguida te llamamos.'}
            </p>
          )}
        </div>

        {anteriores.length > 0 && (
          <div className="grid content-center gap-3">
            <p className="text-2xl text-texto-tenue">Llamados antes</p>
            <ul className="grid gap-3">
              {anteriores.map((l) => (
                <li
                  key={`${l.numero}-${l.en}`}
                  className="flex items-baseline justify-between gap-6 rounded-base border border-borde px-6 py-4 text-3xl"
                >
                  <span className="font-mono font-bold">{l.numero}</span>
                  <span className="text-texto-suave">{l.atiende}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="px-10 py-6 text-center text-2xl text-texto-tenue">
        {pantalla.data
          ? pantalla.data.esperando === 1
            ? 'Hay una persona esperando'
            : `Hay ${pantalla.data.esperando} personas esperando`
          : ''}
      </footer>
    </main>
  )
}
