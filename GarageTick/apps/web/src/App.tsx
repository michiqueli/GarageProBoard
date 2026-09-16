import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './Shell'
import { Horas } from './screens/Horas'
import { Kiosco } from './screens/Kiosco'
import { Ordenes } from './screens/Ordenes'
import { Reportes } from './screens/Reportes'
import { Tablero } from './screens/Tablero'

/**
 * HashRouter y no BrowserRouter: esto se sirve desde el servidor del taller sin
 * nadie que configure rewrites. Con hash, recargar /ordenes no da un 404.
 *
 * El kiosco queda fuera del Shell a propósito: es pantalla completa, sin menú
 * ni nada que se pueda tocar. Si en el kiosco hay algo para clickear, es un bug
 * de diseño.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/kiosco" element={<Kiosco />} />
        <Route element={<Shell />}>
          <Route path="/taller" element={<Tablero />} />
          <Route path="/ordenes" element={<Ordenes />} />
          <Route path="/horas" element={<Horas />} />
          <Route path="/reportes" element={<Reportes />} />
        </Route>
        <Route path="*" element={<Navigate to="/taller" replace />} />
      </Routes>
    </HashRouter>
  )
}
