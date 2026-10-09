import { type ClienteApi, contrato } from '@gpb/contracts'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

/**
 * El cliente de la pantalla de fichaje.
 *
 * Es otro que el del resto del sistema y por eso vive acá: el de allá manda el token de la
 * sesión de una persona, y en el taller **no hay persona**. Manda el token de la estación, que
 * identifica al aparato (`docs/tecnicos/taller-control-de-tiempos.md`, regla 10).
 *
 * Tampoco renueva nada ni reintenta: el token de una estación no vence. Si deja de servir es
 * porque la dieron de baja, y ahí lo que corresponde es decirlo en la pantalla, no insistir.
 */

const CLAVE = 'gpb.estacion.token'

/**
 * El token se guarda en esta PC y se limpia de la dirección.
 *
 * Llega una sola vez en el fragmento (`/fichaje#t=…`), que no viaja al servidor ni queda en
 * los registros del proxy. Apenas se guarda, se borra de la barra: si no, queda en el
 * historial de un navegador que está todo el día abierto en un taller.
 */
export function tomarTokenDeLaUrl(): void {
  const fragmento = window.location.hash
  const marca = fragmento.match(/[#&]t=([^&]+)/)
  if (!marca?.[1]) return
  try {
    localStorage.setItem(CLAVE, decodeURIComponent(marca[1]))
  } catch {
    // Sin almacenamiento —una ventana privada— el token vale para esta sesión y nada más.
  }
  window.history.replaceState(null, '', window.location.pathname)
}

export function tokenDeLaEstacion(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

export function olvidarEstacion(): void {
  try {
    localStorage.removeItem(CLAVE)
    localStorage.removeItem(CLAVE_DATOS)
  } catch {
    // Nada que hacer: si no se puede leer, tampoco se puede borrar.
  }
}

const CLAVE_DATOS = 'gpb.estacion.datos'

type DatosEstacion = Awaited<ReturnType<ClienteApi['fichaje']['estacion']>>

/**
 * Quién es esta estación, recordado de la última vez que contestó el servidor. Es para el
 * tótem, que tiene que dar números aunque arranque sin red; las demás sin red no sirven igual.
 */
export function recordarEstacion(datos: DatosEstacion): void {
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos))
  } catch {
    // Sin almacenamiento, el tótem necesita red para arrancar.
  }
}

export function estacionRecordada(): DatosEstacion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_DATOS)
    return crudo ? (JSON.parse(crudo) as DatosEstacion) : null
  } catch {
    return null
  }
}

const enlace = new OpenAPILink(contrato, {
  url: `${window.location.origin}/api`,
  headers: () => {
    const token = tokenDeLaEstacion()
    return token ? { authorization: `Estacion ${token}` } : {}
  },
})

export const apiEstacion: ClienteApi = createORPCClient(enlace)
