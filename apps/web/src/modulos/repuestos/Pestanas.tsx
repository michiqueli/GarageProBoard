import { contrato } from '@gpb/contracts'
import { Link, type LinkProps } from '@tanstack/react-router'
import { usePuedeUsar } from '../../sesion/permisos.ts'

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
