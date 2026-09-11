import { PantallaOrdenes } from './modulos/ordenes/PantallaOrdenes.tsx'
import { ProveedorTeclado } from './teclado/index.ts'

export function App() {
  // El módulo y las diferencias de atajos van a salir de la sesión y de
  // `usuario_config` cuando exista autenticación. Hasta entonces, el mapa por omisión.
  return (
    <ProveedorTeclado modulo="ordenes">
      <PantallaOrdenes />
    </ProveedorTeclado>
  )
}
