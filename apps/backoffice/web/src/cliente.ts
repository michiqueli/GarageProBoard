import { contratoBackoffice } from '@gpb/contracts/backoffice'
import { createORPCClient, ORPCError } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

/**
 * El cliente del back-office, tipado desde su contrato.
 *
 * No maneja tokens: la sesión del operador viaja en una cookie `httpOnly` que el
 * navegador manda sola en cada pedido al mismo origen.
 */
const enlace = new OpenAPILink(contratoBackoffice, {
  url: `${window.location.origin}/api`,
})

/** La caché de quién está operando. Vive acá y no en las rutas para no armar un ciclo. */
export const CLAVE_OPERADOR = ['backoffice', 'operador'] as const

export const api: ContractRouterClient<typeof contratoBackoffice> = createORPCClient(enlace)

/**
 * Lo que se le muestra a quien opera cuando algo falla.
 *
 * Un error del contrato trae un mensaje escrito para una persona, y el de dependencias
 * trae además los motivos, que son lo que hay que arreglar. Cualquier otro error es de
 * red o del servidor, y el mensaje técnico no ayuda.
 */
export function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) {
    const motivos = (error.data as { motivos?: string[] } | undefined)?.motivos
    return motivos?.length ? `${error.message}: ${motivos.join('; ')}.` : error.message
  }
  return 'No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.'
}

/** Si el error es que la sesión se terminó: la pantalla manda a entrar de nuevo. */
export function esSinSesion(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 401
}
