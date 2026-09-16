import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * La cookie donde viaja el token de refresco en un navegador.
 *
 * `httpOnly` es todo el punto: el navegador la guarda y la manda sola, pero el
 * JavaScript de la página **no puede leerla**. Si un script malicioso llegara a
 * ejecutarse — una dependencia comprometida, un campo que muestra HTML sin escapar —
 * podría hacer pedidos mientras la pestaña está abierta, que eso no lo evita nada,
 * pero no puede llevarse la llave para usarla después.
 *
 * La diferencia práctica entre esto y `localStorage` es robar una sesión por diez
 * minutos o robarla por treinta días.
 */
export const COOKIE_REFRESCO = 'gpb_refresco'

const DIAS = 30

function opciones() {
  return {
    httpOnly: true,
    // 'strict': el navegador no la manda en navegaciones que vengan de otro sitio, que
    // es la defensa contra CSRF sin necesidad de un token aparte.
    sameSite: 'strict' as const,
    // En desarrollo la aplicación corre por http en localhost y una cookie `secure` no
    // se guardaría. En producción es obligatoria: sin esto viaja en claro.
    secure: process.env.NODE_ENV === 'production',
    // Acotada a las rutas de sesión: no tiene por qué viajar en cada consulta de
    // vehículos. Menos superficie, menos bytes en cada pedido.
    path: '/api/auth',
    maxAge: DIAS * 24 * 60 * 60,
  }
}

export function ponerRefresco(respuesta: FastifyReply, token: string): void {
  respuesta.setCookie(COOKIE_REFRESCO, token, opciones())
}

export function borrarRefresco(respuesta: FastifyReply): void {
  respuesta.clearCookie(COOKIE_REFRESCO, { path: opciones().path })
}

/**
 * De dónde sale el token: del cuerpo o de la cookie.
 *
 * El cuerpo tiene prioridad porque sólo lo manda quien pidió `entrega: 'cuerpo'` — un
 * cliente que no maneja cookies y sabe lo que está haciendo.
 */
export function leerRefresco(pedido: FastifyRequest, delCuerpo?: string): string | null {
  return delCuerpo ?? pedido.cookies?.[COOKIE_REFRESCO] ?? null
}
