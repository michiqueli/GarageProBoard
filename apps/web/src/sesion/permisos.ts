import { accesoDeRuta, permite, type RutaDelContrato } from '@garagepro/contracts'
import {
  type AccionPermiso,
  construirHabilidades,
  type Habilidades,
  type Sujeto,
} from '@garagepro/core'
import { useMemo } from 'react'
import { usarSesion } from './almacen.ts'

/**
 * Los permisos de quien está usando el sistema, del lado de la pantalla.
 *
 * **El front oculta, la API decide.** Esconder un botón no protege nada: cualquiera
 * puede llamar a la ruta con `curl`. Lo que resuelve es otra cosa, igual de importante:
 * que a nadie se le ofrezca algo que después le van a negar. Un menú lleno de secciones
 * que rebotan con «no tenés permiso» enseña a desconfiar de la pantalla.
 *
 * Las reglas son **las mismas** que aplica la guardia de la API — vienen de la base en
 * la respuesta de la sesión — y se evalúan con la misma función, `permite()` del
 * contrato. Si acá se reescribiera la regla, tarde o temprano diría otra cosa.
 */

/** Sin sesión no se puede nada. Una sola instancia: `can()` sobre esto es constante. */
const SIN_PERMISOS = construirHabilidades([])

export function useHabilidades(): Habilidades {
  const reglas = usarSesion((e) => e.datos?.habilidades)

  // Se rearma sólo cuando cambian las reglas — al entrar, al renovar, al cambiar de
  // persona. CASL indexa las reglas al construirse y eso no va en cada render.
  return useMemo(() => (reglas ? construirHabilidades(reglas) : SIN_PERMISOS), [reglas])
}

/** Para lo que todavía no tiene ruta en el contrato: una sección del menú, una pestaña. */
export function usePuede(accion: AccionPermiso, sujeto: Sujeto): boolean {
  return useHabilidades().can(accion, sujeto)
}

/**
 * Si este usuario puede usar **esta ruta del contrato**.
 *
 * Es la forma preferida: el permiso no se repite en la pantalla, se lee de donde ya
 * estaba escrito. `usePuedeUsar(contrato.vehiculos.crear)` y el botón de alta aparece
 * exactamente cuando la API lo va a aceptar.
 *
 * Una ruta que no declara acceso revienta al leerla, acá y en la API por igual: es un
 * error de programación, no un permiso que falta.
 */
export function usePuedeUsar(ruta: RutaDelContrato): boolean {
  return permite(useHabilidades(), accesoDeRuta(ruta))
}

/**
 * Los permisos de la sesión **fuera de React**.
 *
 * Las guardias de las rutas corren antes de que haya un componente montado: `beforeLoad`
 * decide a dónde mandar a alguien que acaba de entrar, y ahí todavía no hay dónde colgar
 * un gancho.
 */
export function habilidadesActuales(): Habilidades {
  const reglas = usarSesion.getState().datos?.habilidades
  return reglas ? construirHabilidades(reglas) : SIN_PERMISOS
}
