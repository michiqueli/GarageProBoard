import fastifyCookie from '@fastify/cookie'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'

/** Lo que se le enchufa a la aplicación, compartido entre `main.ts` y los tests. */
export async function configurarApp(app: NestFastifyApplication): Promise<void> {
  // La sesión del operador viaja en una cookie httpOnly. Ver auth/cookie.ts.
  await app.register(fastifyCookie)
  app.setGlobalPrefix('api')
}
