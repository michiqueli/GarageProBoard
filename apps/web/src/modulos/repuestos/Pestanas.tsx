import { contrato } from '@gpb/contracts'
import { Link, type LinkProps, useNavigate, useRouterState } from '@tanstack/react-router'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFlechasPestanas } from '../../teclado/index.ts'

/**
 * Las cuatro partes de Repuestos, arriba de cada pantalla: el catálogo con el stock, los
 * pedidos del mostrador y del taller, las compras y los proveedores. Viven juntas porque es
 * el día del repuestero: le piden, busca, no está, se lo pide al proveedor.
 */
export function PestanasRepuestos() {
  const puedeProveedores = usePuedeUsar(contrato.proveedores.listar)
  const pestanas: Array<{ to: NonNullable<LinkProps['to']>; texto: string; exacta?: boolean }> = [
    { to: '/repuestos', texto: 'Catálogo y stock', exacta: true },
    { to: '/repuestos/pedidos', texto: 'Pedidos' },
    { to: '/repuestos/compras', texto: 'Compras' },
    ...(puedeProveedores ? [{ to: '/repuestos/proveedores' as const, texto: 'Proveedores' }] : []),
  ]
  // ← → pasan de una pestaña a la otra. La actual es la que empieza la dirección: la ficha de
  // un pedido sigue siendo la pestaña Pedidos.
  const navegar = useNavigate()
  const ruta = useRouterState({ select: (e) => e.location.pathname })
  const actual =
    [...pestanas].reverse().find((p) => (p.exacta ? ruta === p.to : ruta.startsWith(p.to)))?.to ??
    '/repuestos'
  useFlechasPestanas(
    pestanas.map((p) => p.to),
    actual,
    (to) => void navegar({ to }),
  )

  return (
    <nav aria-label="Repuestos" className="flex flex-wrap gap-1 border-b border-borde">
      {pestanas.map((p) => (
        <Link
          key={p.to}
          to={p.to}
          activeOptions={{ exact: Boolean(p.exacta) }}
          className="-mb-px border-b-2 border-transparent px-3 py-1.5 text-dato text-texto-suave hover:text-texto"
          activeProps={{
            className: 'border-marca! font-semibold text-texto!',
            'aria-current': 'page',
          }}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  )
}
