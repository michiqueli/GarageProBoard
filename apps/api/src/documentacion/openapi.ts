import { contrato } from '@garagetick/contracts'
import { type OpenAPI, OpenAPIGenerator } from '@orpc/openapi'
import { ConversorZod } from './conversor-zod.ts'

/**
 * El documento OpenAPI sale del mismo contrato que implementa la API y que consume
 * el front. No hay una segunda fuente de verdad que se desactualice: si una ruta
 * cambia de forma, el spec cambia solo y el front deja de compilar.
 *
 * Esto importa más de lo que parece para este producto. La API separada se eligió
 * para que mañana entren la app mobile y las integraciones de terceros — un taller
 * que quiere volcar sus turnos, una terminal que consulta garantías. Esa gente no
 * tiene nuestros tipos de TypeScript: tiene este documento.
 */
export async function generarOpenApi(): Promise<OpenAPI.Document> {
  const generador = new OpenAPIGenerator({
    schemaConverters: [new ConversorZod()],
  })

  return generador.generate(contrato, {
    info: {
      title: 'GarageTick',
      version: '0.0.0',
      description: [
        'API de gestión para concesionarias.',
        '',
        'Todos los recursos están acotados al tenant del token: no hay forma de pedir',
        'datos de otra concesionaria, ni siquiera conociendo los identificadores.',
        '',
        'Los importes viajan como cadenas decimales, nunca como números, para que no',
        'los redondee el JSON en el camino.',
      ].join('\n'),
    },
    servers: [{ url: '/api', description: 'Este servidor' }],
  })
}
