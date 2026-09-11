import { contrato } from '@garagetick/contracts'
import { type OpenAPI, OpenAPIGenerator } from '@orpc/openapi'
import { ConversorZod } from './conversor-zod.ts'

/**
 * El documento OpenAPI sale del mismo contrato que implementa la API y que consume el
 * front. No hay una segunda fuente de verdad que se desactualice: si una ruta cambia de
 * forma, el spec cambia solo y el front deja de compilar.
 *
 * Esto importa más de lo que parece para este producto. La API separada se eligió para
 * que mañana entren la app mobile y las integraciones de terceros — un taller que
 * quiere volcar sus turnos, una terminal que consulta garantías. Esa gente no tiene
 * nuestros tipos de TypeScript: tiene este documento.
 */

/**
 * Los grupos que Swagger muestra plegados.
 *
 * El orden es el de esta lista, no alfabético: primero lo que alguien necesita para
 * empezar (autenticarse), después el trabajo, y el chequeo de vida al final porque no
 * le interesa a nadie salvo al balanceador.
 */
const GRUPOS: OpenAPI.TagObject[] = [
  {
    name: 'Sesión',
    description:
      'Autenticación y contexto. Todo pedido a los demás grupos necesita el token de ' +
      'acceso que devuelve `POST /auth/iniciar`.',
  },
  {
    name: 'Vehículos',
    description:
      'El vehículo es la entidad central del sistema: su identidad es el número de ' +
      'chasis, que no cambia nunca, y la titularidad es una relación con vigencia.',
  },
  {
    name: 'Sistema',
    description: 'Chequeos operativos.',
  },
]

export async function generarOpenApi(): Promise<OpenAPI.Document> {
  const generador = new OpenAPIGenerator({
    schemaConverters: [new ConversorZod()],
  })

  return generador.generate(contrato, {
    info: {
      title: 'GarageTick',
      version: '0.0.0',
      description: [
        '## Gestión integral para concesionarias',
        '',
        '### Aislamiento',
        '',
        'Todos los recursos están acotados al tenant del token. No hay forma de pedir',
        'datos de otra concesionaria, ni siquiera conociendo los identificadores: el',
        'aislamiento lo aplica Postgres con Row Level Security, no el código.',
        '',
        '### Importes',
        '',
        'Viajan como **cadenas decimales**, nunca como números, para que no los redondee',
        'el JSON en el camino. `"1140200.00"`, no `1140200`.',
        '',
        '### Errores',
        '',
        'Los errores previstos traen un `code` estable — `CREDENCIALES_INVALIDAS`,',
        '`SIN_ACCESO` — pensado para que el cliente decida por él y no leyendo el mensaje,',
        'que puede cambiar de redacción.',
      ].join('\n'),
    },

    servers: [{ url: '/api', description: 'Este servidor' }],
    tags: GRUPOS,

    components: {
      securitySchemes: {
        // Habilita el botón «Authorize» de Swagger: se pega el token de
        // `POST /auth/iniciar` y las rutas protegidas se pueden probar desde el navegador.
        sesion: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'El campo `access` que devuelve el inicio de sesión.',
        },
      },
    },

    // Por omisión todo pide sesión; las rutas públicas la relajan en su propia
    // definición. Es el mismo criterio que el guardia de la API: se protege por
    // omisión y se abre a mano, no al revés.
    security: [{ sesion: [] }],
  })
}
