import { NavLink, Outlet } from 'react-router-dom'
import { Firma, MarcaCliente } from './components/Marca'

const enlaces = [
  { to: '/taller', label: 'Tablero', detalle: 'Quién trabaja en qué' },
  { to: '/ordenes', label: 'Órdenes', detalle: 'Abiertas y finalizadas' },
  { to: '/horas', label: 'Horas', detalle: 'Por mecánico y por día' },
  { to: '/reportes', label: 'Reporte mensual', detalle: 'Horas por cargo' },
]

export function Shell() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-6 py-4">
        <MarcaCliente tamano="lg" />
        <a
          href="#/kiosco"
          className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-emerald-600 hover:text-emerald-300"
        >
          Abrir el puesto de fichaje →
        </a>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
          <nav className="flex-1 p-3">
            {enlaces.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                className={({ isActive }) =>
                  `mb-1 block rounded-md px-3 py-2 transition ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`
                }
              >
                <div className="text-sm font-medium">{e.label}</div>
                <div className="text-[11px] text-neutral-500">{e.detalle}</div>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-neutral-800 p-4">
            <Firma />
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
