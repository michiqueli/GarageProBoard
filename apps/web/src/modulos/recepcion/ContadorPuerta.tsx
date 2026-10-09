import { contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

/** Cada cuánto mira el menú: más lento que la puerta, porque está en todas las pantallas. */
const REFRESCO_MENU = 20_000

/** Las visitas de hoy que son de quien está usando el sistema. */
export function useMias() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puede = usePuedeUsar(contrato.recepcion.mias)
  return useQuery({
    queryKey: ['visitas', tenantId, 'mias'],
    queryFn: () => api.recepcion.mias(),
    enabled: puede,
    refetchInterval: REFRESCO_MENU,
  })
}

/**
 * Cuántos esperan a quien está usando el sistema, al lado de «Recepción» en el menú. Sin esto
 * la derivación es un grito por el salón: el vendedor está en otra pantalla y no se entera.
 *
 * **Lleno**, porque alguien tiene que hacer algo; sin nadie esperando, no se muestra.
 */
export function ContadorPuerta() {
  const mias = useMias()
  const esperan = (mias.data?.datos ?? []).filter((v) => !v.atendidaEn).length
  if (!esperan) return null
  return (
    <span
      role="status"
      aria-label={esperan === 1 ? 'Te espera una persona' : `Te esperan ${esperan} personas`}
      className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-atencion px-1.5 font-mono text-etiqueta font-semibold text-fondo"
    >
      {esperan}
    </span>
  )
}
