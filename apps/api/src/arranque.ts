import fastifyCookie from '@fastify/cookie'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'

/**
 * Todo lo que hay que enchufarle a la aplicación además de sus módulos.
 *
 * Vive acá y no en `main.ts` para que los tests monten **exactamente la misma
 * aplicación** que corre en producción. Una configuración duplicada entre el arranque
 * real y el de prueba termina siempre en un test que pasa contra algo que no existe:
 * el plugin de cookies es el ejemplo perfecto, porque sin él la autenticación por
 * cookie se rompe en silencio.
 */
export async function configurarApp(app: NestFastifyApplication): Promise<void> {
  // El token de refresco viaja en una cookie httpOnly. Ver auth/cookie.ts.
  await app.register(fastifyCookie)

  // Las rutas del contrato se declaran sin prefijo; el /api se agrega una sola vez.
  app.setGlobalPrefix('api')
}
