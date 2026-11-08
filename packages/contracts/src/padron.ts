import { z } from 'zod'
import { conSesion } from './acceso.ts'
import { cuit } from './comunes.ts'

export const contribuyente = z.object({
  cuit: z.string(),
  razonSocial: z.string(),
  tipoPersona: z.enum(['fisica', 'juridica']).nullable(),
  /** «CUIT» o «CUIL». Un CUIL no factura: sirve para identificar a una persona, no a una empresa. */
  tipoClave: z.string().nullable(),
  activo: z.boolean(),
  condicionIva: z.object({
    codigo: z.number().int().nullable(),
    /** «afip»: lo informó AFIP. «inferida»: lo deducimos, y la pantalla pide confirmarlo. */
    fuente: z.enum(['afip', 'inferida']),
    motivo: z.string(),
  }),
  domicilio: z
    .object({
      direccion: z.string().nullable(),
      localidad: z.string().nullable(),
      codigoPostal: z.string().nullable(),
      provinciaCodigo: z.number().int().nullable(),
    })
    .nullable(),
  origen: z.enum(['constancia', 'a13']),
})

export const contratoPadron = {
  consultar: conSesion
    .route({
      method: 'GET',
      path: '/padron/{cuit}',
      tags: ['Padrón de AFIP'],
      operationId: 'consultarPadron',
      summary: 'Datos de un CUIT según AFIP',
      description:
        'Consulta la constancia de inscripción y, si no lo encuentra, el padrón A13. La ' +
        'condición frente al IVA dice si la informó AFIP o si es una deducción a confirmar.',
    })
    .input(z.object({ cuit }))
    .errors({
      CUIT_INEXISTENTE: { status: 404, message: 'AFIP no tiene registrado ese CUIT' },
      PADRON_NO_DISPONIBLE: {
        status: 503,
        message:
          'No se pudo consultar a AFIP. Probá de nuevo en un rato, o cargá los datos a mano.',
      },
    })
    .output(contribuyente),

  porDocumento: conSesion
    .route({
      method: 'GET',
      path: '/padron/dni/{dni}',
      tags: ['Padrón de AFIP'],
      operationId: 'consultarPadronPorDni',
      summary: 'Datos de una persona según AFIP, a partir del DNI',
      description: 'Busca el CUIL del DNI y devuelve lo mismo que la consulta por CUIT.',
    })
    .input(z.object({ dni: z.string().regex(/^[0-9]{7,8}$/, 'El DNI son 7 u 8 números') }))
    .errors({
      DNI_INEXISTENTE: { status: 404, message: 'AFIP no tiene registrado ese DNI' },
      DNI_AMBIGUO: {
        status: 409,
        message: 'Ese DNI tiene más de un CUIL en AFIP: cargá el CUIL',
      },
      PADRON_NO_DISPONIBLE: {
        status: 503,
        message:
          'No se pudo consultar a AFIP. Probá de nuevo en un rato, o cargá los datos a mano.',
      },
    })
    .output(contribuyente),
}
