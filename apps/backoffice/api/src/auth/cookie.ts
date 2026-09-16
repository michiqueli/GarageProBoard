import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * La cookie de la sesión del operador. `httpOnly` y `sameSite: strict`, por lo mismo que
 * la de los usuarios (ver `apps/api/src/auth/cookie.ts`): el JavaScript de la página no
 * la lee, y otro sitio no puede hacer que el navegador la mande.
 *
 * Otro nombre que la de los clientes: si algún día los dos corren bajo el mismo dominio
 * en un entorno de pruebas, no se pisan.
 */
export const COOKIE_SESION = 'bo_sesion'

export const HORAS_SESION = 12

function opciones() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: HORAS_SESION * 60 * 60,
  }
}

export function ponerSesion(respuesta: FastifyReply, token: string): void {
  respuesta.setCookie(COOKIE_SESION, token, opciones())
}

export function borrarSesion(respuesta: FastifyReply): void {
  respuesta.clearCookie(COOKIE_SESION, { path: opciones().path })
}

export function leerSesion(pedido: FastifyRequest): string | null {
  return pedido.cookies?.[COOKIE_SESION] ?? null
}
