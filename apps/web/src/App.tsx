import { useEffect, useState } from 'react'
import { useCacheDeSesion } from './ganchos/useCacheDeSesion.ts'
import { useTema } from './ganchos/useTema.ts'
import { PantallaLogin } from './modulos/auth/PantallaLogin.tsx'
import { PantallaSucursal } from './modulos/auth/PantallaSucursal.tsx'
import { PantallaOrdenes } from './modulos/ordenes/PantallaOrdenes.tsx'
import { PantallaVehiculos } from './modulos/vehiculos/PantallaVehiculos.tsx'
import { usarSesion } from './sesion/almacen.ts'
import { ProveedorTeclado } from './teclado/index.ts'

export function App() {
  const { datos, cargando, eligiendoSucursal } = usarSesion()
  const [seccion, setSeccion] = useState('vehiculos')

  // Al arrancar se intenta recuperar la sesión con la cookie que el navegador tenga.
  // Sin esto, recargar la página devolvería al login aunque la sesión siga viva.
  //
  // Se intenta siempre, incluso sin sesión previa: como la cookie es httpOnly, desde
  // acá no hay forma de saber si existe. El costo de averiguarlo es un 401.
  useEffect(() => {
    let vigente = true

    fetch('/api/auth/refrescar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
      .then(async (r) => {
        if (!vigente) return
        // Se lee el almacén acá adentro en vez de recibirlo por dependencia: así el
        // efecto de verdad corre una sola vez y no depende de referencias que cambian.
        const { establecer, limpiar } = usarSesion.getState()
        if (r.ok) establecer(await r.json())
        else limpiar()
      })
      .catch(() => vigente && usarSesion.getState().limpiar())

    return () => {
      vigente = false
    }
  }, [])

  useTema(datos?.config.tema)

  // Al cambiar de usuario se tira la caché: en la PC compartida del mostrador, el
  // cambio de turno no puede dejar a la vista los datos del turno anterior.
  useCacheDeSesion(datos?.usuario.id)

  if (cargando) return <Esperando />
  if (!datos) return <PantallaLogin />
  if (eligiendoSucursal) return <PantallaSucursal />

  // Navegación por estado, no por URL: TanStack Router entra cuando haya más de dos
  // pantallas que enrutar. Dejarlo a medio cablear ahora sería peor que no tenerlo.
  return (
    <ProveedorTeclado
      modulo={seccion === 'ordenes' ? 'ordenes' : 'vehiculos'}
      diferencias={datos.atajos}
    >
      {seccion === 'ordenes' ? (
        <PantallaOrdenes onNavegar={setSeccion} />
      ) : (
        <PantallaVehiculos onNavegar={setSeccion} />
      )}
    </ProveedorTeclado>
  )
}

/**
 * El estado de arranque.
 *
 * Deliberadamente sobrio: dura lo que tarda un pedido y aparece en cada recarga. Una
 * animación llamativa acá se vuelve molesta a la décima vez que la ves en el día.
 */
function Esperando() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="text-dato text-texto-tenue">Cargando…</p>
    </div>
  )
}
