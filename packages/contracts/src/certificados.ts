import { z } from 'zod'
import { conPermiso } from './acceso.ts'

const TAG = 'Certificados de AFIP'

export const ENTORNOS_AFIP = ['produccion', 'homologacion'] as const

export const MOTIVOS_RECHAZO_CERTIFICADO = [
  'ILEGIBLE',
  'NO_ES_DE_AFIP',
  'NO_CORRESPONDE_AL_PEDIDO',
  'OTRO_CUIT',
  'VENCIDO',
  'TODAVIA_NO_VIGENTE',
] as const

const certificado = z.object({
  id: z.uuid(),
  alias: z.string(),
  entorno: z.enum(ENTORNOS_AFIP).nullable(),
  vigenteDesde: z.iso.datetime().nullable(),
  vigenteHasta: z.iso.datetime().nullable(),
  creadoEn: z.iso.datetime(),
})

export const estadoCertificado = z.object({
  empresa: z.object({
    id: z.uuid(),
    razonSocial: z.string(),
    cuit: z.string(),
    condicionIva: z.number().int(),
  }),
  /** Con el que se factura hoy. Puede estar vencido: la pantalla lo dice. */
  activo: certificado.nullable(),
  /** El pedido en curso: recién generado, o con el certificado cargado y sin probar. */
  pendiente: certificado.extend({ pedido: z.string(), conCertificado: z.boolean() }).nullable(),
})

export const puntoVentaEnAfip = z.object({
  numero: z.number().int(),
  tipoEmision: z.string(),
  bloqueado: z.boolean(),
  dadoDeBaja: z.boolean(),
  /** Si está cargado en Empresas y sucursales. */
  cargado: z.boolean(),
})

const empresaId = z.object({ empresaId: z.uuid() })

const ERRORES = {
  NO_ENCONTRADA: { status: 404, message: 'No existe esa razón social en la concesionaria' },
  SIN_CLAVE_MAESTRA: {
    status: 503,
    message: 'El servidor no tiene configurado dónde guardar certificados. Avisale a soporte',
  },
} as const

const permiso = () => conPermiso('contable', 'configurar', 'Comprobante')

export const contratoCertificados = {
  estado: permiso()
    .route({
      method: 'GET',
      path: '/empresas/{empresaId}/certificado-afip',
      tags: [TAG],
      operationId: 'estadoCertificadoAfip',
      summary: 'El certificado activo y el pedido en curso de una razón social',
    })
    .input(empresaId)
    .errors({ NO_ENCONTRADA: ERRORES.NO_ENCONTRADA })
    .output(estadoCertificado),

  pedir: permiso()
    .route({
      method: 'POST',
      path: '/empresas/{empresaId}/certificado-afip/pedido',
      tags: [TAG],
      operationId: 'pedirCertificadoAfip',
      summary: 'Generar la clave y el pedido de certificado para cargar en ARCA',
      successStatus: 201,
      description:
        'La clave privada se guarda cifrada y no se descarga nunca. Si había un pedido sin ' +
        'terminar, queda descartado. El certificado activo sigue andando hasta que el nuevo ' +
        'pase la prueba.',
    })
    .input(
      empresaId.extend({
        alias: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{3,30}$/, 'De 3 a 30 letras, números o guiones, sin espacios'),
      }),
    )
    .errors(ERRORES)
    .output(estadoCertificado),

  importar: permiso()
    .route({
      method: 'PUT',
      path: '/empresas/{empresaId}/certificado-afip/importado',
      tags: [TAG],
      operationId: 'importarCertificadoAfip',
      summary: 'Cargar un certificado que ya se usa en otro sistema, con su clave',
      description:
        'Para quien ya factura con otro programa y tiene el certificado y su clave privada. ' +
        'Se verifica igual que uno nuevo, la clave se guarda cifrada, y queda pendiente hasta ' +
        'que pase la prueba. Reemplaza el pedido en curso, si había uno.',
    })
    .input(
      empresaId.extend({
        certificado: z.string().min(1).max(20_000),
        clavePrivada: z.string().min(1).max(20_000),
      }),
    )
    .errors({
      ...ERRORES,
      CLAVE_ILEGIBLE: {
        status: 422,
        message: 'La clave privada no se puede leer: tiene que ser el archivo .key sin contraseña',
      },
      CERTIFICADO_RECHAZADO: {
        status: 422,
        message: 'El certificado no sirve para esta empresa',
        data: z.object({ motivo: z.enum(MOTIVOS_RECHAZO_CERTIFICADO) }),
      },
    })
    .output(estadoCertificado),

  cargar: permiso()
    .route({
      method: 'PUT',
      path: '/empresas/{empresaId}/certificado-afip/pedido/certificado',
      tags: [TAG],
      operationId: 'cargarCertificadoAfip',
      summary: 'Cargar el certificado que devolvió ARCA',
      description:
        'Se verifica que lo haya firmado AFIP, que corresponda al pedido, que sea del CUIT de ' +
        'la empresa y que esté vigente. Todavía no se usa: falta la prueba.',
    })
    .input(empresaId.extend({ certificado: z.string().min(1).max(20_000) }))
    .errors({
      ...ERRORES,
      SIN_PEDIDO: { status: 409, message: 'Primero hay que generar el pedido de certificado' },
      CERTIFICADO_RECHAZADO: {
        status: 422,
        message: 'El certificado no sirve para esta empresa',
        data: z.object({ motivo: z.enum(MOTIVOS_RECHAZO_CERTIFICADO) }),
      },
    })
    .output(estadoCertificado),

  probar: permiso()
    .route({
      method: 'POST',
      path: '/empresas/{empresaId}/certificado-afip/prueba',
      tags: [TAG],
      operationId: 'probarCertificadoAfip',
      summary: 'Probar el certificado contra AFIP, sin emitir nada',
      description:
        'Inicia sesión en AFIP para facturación y pide los puntos de venta habilitados. Si ' +
        'sale bien y había un pedido con certificado, ese pasa a ser el activo. Sin pedido, ' +
        'prueba el activo.',
    })
    .input(empresaId)
    .errors({
      ...ERRORES,
      NADA_PARA_PROBAR: {
        status: 409,
        message: 'No hay un certificado cargado para probar',
      },
      AFIP_NO_ACEPTA: {
        status: 502,
        message: 'AFIP no dejó facturar con este certificado',
        data: z.object({ detalle: z.string() }),
      },
    })
    .output(
      z.object({
        estado: estadoCertificado,
        puntosDeVenta: z.array(puntoVentaEnAfip),
        /** Cargados en el sistema que AFIP no tiene habilitados para web services. */
        faltanEnAfip: z.array(z.number().int()),
      }),
    ),
}
