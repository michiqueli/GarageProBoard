import { ETIQUETA_MODULO } from '@gpb/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, mensajeDe } from '../cliente.ts'
import { Aviso, Esqueleto, Estado } from '../componentes.tsx'

export const CLAVE_LISTADO = ['backoffice', 'concesionarias'] as const

/**
 * Todas las concesionarias, con lo que tienen prendido hoy.
 *
 * Las dos formas se arman con CSS y no eligiendo qué renderizar, a diferencia de los
 * listados de la aplicación: acá son decenas de filas, no miles, y duplicar el DOM no
 * le cuesta nada a nadie.
 */
export function PantallaListado() {
  const listado = useQuery({ queryKey: CLAVE_LISTADO, queryFn: () => api.concesionarias.listar() })

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-lg font-semibold">Concesionarias</h1>
        <Link
          to="/nueva"
          className="ml-auto flex h-campo items-center rounded-base border border-marca bg-marca-suave px-3 text-dato font-semibold text-marca hover:bg-marca hover:text-fondo"
        >
          Nueva concesionaria
        </Link>
      </div>

      {listado.isPending && <Esqueleto />}
      {listado.isError && <Aviso tono="critico">{mensajeDe(listado.error)}</Aviso>}

      {listado.data && listado.data.datos.length === 0 && (
        <section className="grid justify-items-center gap-2 rounded-base border border-borde bg-superficie px-4 py-10 text-center">
          <h2 className="font-display text-dato font-semibold">Todavía no hay concesionarias</h2>
          <p className="max-w-sm text-dato text-texto-suave">
            Dala de alta con sus módulos, su razón social y su gerente. Al terminar te muestra la
            contraseña inicial para pasársela.
          </p>
        </section>
      )}

      {listado.data && listado.data.datos.length > 0 && (
        <>
          <table className="hidden w-full border-collapse text-dato md:table">
            <thead>
              <tr className="h-fila border-b border-borde text-left text-etiqueta text-texto-tenue">
                <th className="px-2 font-medium">Concesionaria</th>
                <th className="px-2 font-medium">Estado</th>
                <th className="px-2 font-medium">Módulos prendidos</th>
              </tr>
            </thead>
            <tbody>
              {listado.data.datos.map((c) => (
                <tr key={c.id} className="h-fila border-b border-borde-suave">
                  <td className="px-2">
                    <Link
                      to="/concesionarias/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:text-marca"
                    >
                      {c.nombre}
                    </Link>
                    <span className="ml-2 font-mono text-etiqueta text-texto-tenue">{c.slug}</span>
                  </td>
                  <td className="px-2">
                    <EstadoConcesionaria activo={c.activo} />
                  </td>
                  <td className="px-2 text-texto-suave">
                    {c.modulos.map((m) => ETIQUETA_MODULO[m]).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="grid gap-2 md:hidden">
            {listado.data.datos.map((c) => (
              <li key={c.id}>
                <Link
                  to="/concesionarias/$id"
                  params={{ id: c.id }}
                  className="grid gap-1 rounded-base border border-borde bg-superficie p-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <b className="font-medium">{c.nombre}</b>
                    <EstadoConcesionaria activo={c.activo} />
                  </span>
                  <span className="text-etiqueta text-texto-suave">
                    {c.modulos.map((m) => ETIQUETA_MODULO[m]).join(' · ') || 'Sin módulos'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export function EstadoConcesionaria({ activo }: { activo: boolean }) {
  return activo ? (
    <Estado forma="contorno" tono="ok">
      Activa
    </Estado>
  ) : (
    <Estado forma="llena" tono="critico">
      Suspendida
    </Estado>
  )
}
