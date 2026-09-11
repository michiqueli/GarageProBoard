import { createRequire } from 'node:module'
import fastifyStatic from '@fastify/static'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { generarOpenApi } from './openapi.ts'

const require = createRequire(import.meta.url)

const RUTA_SPEC = '/api/openapi.json'
const RUTA_UI = '/api/docs'

/**
 * Publica el spec y la interfaz de Swagger.
 *
 * Se registra directo sobre Fastify y no como controlador de Nest porque los
 * archivos de Swagger UI son estáticos: pasarlos por el pipeline de Nest sería
 * darles vueltas sin ganar nada.
 */
export async function montarDocumentacion(app: NestFastifyApplication): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance()

  // Se genera una sola vez al arrancar: el contrato no cambia en caliente.
  const spec = await generarOpenApi()

  fastify.get(RUTA_SPEC, async (_peticion, respuesta) => {
    return respuesta.type('application/json').send(spec)
  })

  const archivosSwagger = (
    require('swagger-ui-dist') as { getAbsoluteFSPath: () => string }
  ).getAbsoluteFSPath()

  await fastify.register(fastifyStatic, {
    root: archivosSwagger,
    prefix: `${RUTA_UI}/recursos/`,
    // decorateReply en false: si no, choca con cualquier otro registro de
    // @fastify/static que agreguemos más adelante.
    decorateReply: false,
    index: false,
  })

  // El index que trae swagger-ui-dist apunta al petstore de ejemplo, así que va
  // el nuestro apuntando a nuestro spec.
  fastify.get(RUTA_UI, async (_peticion, respuesta) => {
    return respuesta.type('text/html').send(paginaSwagger())
  })
}

function paginaSwagger(): string {
  return `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API de GarageTick</title>
    <link rel="stylesheet" href="${RUTA_UI}/recursos/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger"></div>
    <script src="${RUTA_UI}/recursos/swagger-ui-bundle.js" crossorigin></script>
    <script src="${RUTA_UI}/recursos/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '${RUTA_SPEC}',
        dom_id: '#swagger',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
      })
    </script>
  </body>
</html>`
}
