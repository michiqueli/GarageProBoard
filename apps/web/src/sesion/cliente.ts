import { type ClienteApi, contrato } from '@garagepro/contracts'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { tokens, usarSesion } from './almacen.ts'

/**
 * El cliente de la API, tipado desde el mismo contrato que implementa el servidor.
 *
 * Si una ruta cambia de forma, esto deja de compilar. Es la razón entera de que el
 * contrato viva en un paquete aparte y no adentro de la API.
 */

const RUTAS_SIN_SESION = ['/auth/iniciar', '/auth/refrescar', '/auth/cerrar', '/salud']

/**
 * Renueva el acceso vencido y reintenta, una sola vez.
 *
 * Se guarda la promesa en curso para que diez pedidos que vencen a la vez disparen un
 * solo refresco. Sin eso, diez refrescos concurrentes rotan el token diez veces y
 * nueve de ellos parecen un reuso: el servidor anularía la familia y echaría al usuario
 * por hacer las cosas bien.
 */
let refrescoEnCurso: Promise<boolean> | null = null

export async function renovar(): Promise<boolean> {
  refrescoEnCurso ??= (async () => {
    try {
      // Sin cuerpo: el token de refresco viaja en la cookie httpOnly, que el navegador
      // adjunta solo. Este código no puede leerla ni necesita hacerlo.
      const respuesta = await fetch('/api/auth/refrescar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })

      if (!respuesta.ok) {
        usarSesion.getState().limpiar()
        return false
      }

      usarSesion.getState().establecer(await respuesta.json())
      return true
    } catch {
      return false
    } finally {
      refrescoEnCurso = null
    }
  })()

  return refrescoEnCurso
}

const enlace = new OpenAPILink(contrato, {
  url: `${window.location.origin}/api`,

  headers: () => {
    const access = tokens.access()
    return access ? { authorization: `Bearer ${access}` } : {}
  },

  fetch: async (pedido, init) => {
    // La copia se saca antes del primer envío: el cuerpo de un Request se consume una
    // sola vez, y sin copia el reintento saldría sin datos.
    const copia = pedido.clone()
    const respuesta = await globalThis.fetch(pedido, init)

    if (respuesta.status !== 401) return respuesta
    if (RUTAS_SIN_SESION.some((r) => pedido.url.includes(r))) return respuesta
    if (!(await renovar())) return respuesta

    const access = tokens.access()
    const cabeceras = new Headers(copia.headers)
    if (access) cabeceras.set('authorization', `Bearer ${access}`)

    return globalThis.fetch(new Request(copia, { headers: cabeceras }), init)
  },
})

export const api: ClienteApi = createORPCClient(enlace)
