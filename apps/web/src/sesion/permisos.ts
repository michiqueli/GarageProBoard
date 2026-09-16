import {
  type Acceso,
  type Autorizacion,
  accesoDeRuta,
  evaluarAcceso,
  permite,
  type RutaDelContrato,
  type Veredicto,
} from '@gpb/contracts'
import { construirHabilidades, type Modulo, type ReglaPermiso } from '@gpb/core'
import { useMemo } from 'react'
import { usarSesion } from './almacen.ts'

/**
 * Qué contrató la concesionaria y qué puede quien está usando el sistema, del lado de la
 * pantalla.
 *
 * **El front oculta, la API decide.** Esconder un botón no protege nada: cualquiera
 * puede llamar a la ruta con `curl`. Lo que resuelve es otra cosa, igual de importante:
 * que a nadie se le ofrezca algo que después le van a negar. Un menú lleno de secciones
 * que rebotan con «no tenés permiso» enseña a desconfiar de la pantalla.
 *
 * Los módulos y las reglas son **los mismos** que aplica la guardia de la API — vienen
 * de la base en la respuesta de la sesión — y se evalúan con la misma función,
 * `evaluarAcceso()` del contrato. Si acá se reescribiera la regla, tarde o temprano
 * diría otra cosa.
 */

/** Sin sesión no se puede nada. Una sola instancia: evaluar sobre esto es constante. */
const SIN_NADA: Autorizacion = { modulos: [], habilidades: construirHabilidades([]) }

function armar(
  modulos: readonly Modulo[] | undefined,
  reglas: readonly ReglaPermiso[] | undefined,
): Autorizacion {
  return modulos && reglas ? { modulos, habilidades: construirHabilidades(reglas) } : SIN_NADA
}

export function useAutorizacion(): Autorizacion {
  const modulos = usarSesion((e) => e.datos?.modulos)
  const reglas = usarSesion((e) => e.datos?.habilidades)

  // Se rearma sólo cuando cambian — al entrar, al renovar, al cambiar de persona. CASL
  // indexa las reglas al construirse y eso no va en cada render.
  return useMemo(() => armar(modulos, reglas), [modulos, reglas])
}

/**
 * Para lo que todavía no tiene ruta en el contrato: una sección del menú, una pestaña.
 * Se declara igual que en el contrato — módulo, acción y sujeto — para que al escribir
 * la ruta se copie tal cual.
 */
export function usePuede(acceso: Acceso): boolean {
  return permite(useAutorizacion(), acceso)
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
  return permite(useAutorizacion(), accesoDeRuta(ruta))
}

/** Por qué sí o por qué no, para lo que tiene que mostrar un aviso distinto en cada caso. */
export function useVeredicto(acceso: Acceso): Veredicto {
  return evaluarAcceso(useAutorizacion(), acceso)
}

/**
 * La autorización de la sesión **fuera de React**.
 *
 * Las guardias de las rutas corren antes de que haya un componente montado: `beforeLoad`
 * decide a dónde mandar a alguien que acaba de entrar, y ahí todavía no hay dónde colgar
 * un gancho.
 */
export function autorizacionActual(): Autorizacion {
  const datos = usarSesion.getState().datos
  return armar(datos?.modulos, datos?.habilidades)
}
