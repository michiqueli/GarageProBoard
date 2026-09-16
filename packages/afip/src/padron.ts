/**
 * El padrón de AFIP, interpretado.
 *
 * AFIP contesta con dos servicios que dicen cosas distintas, y ninguno contesta lo que se
 * quiere saber —«¿qué factura le hago?»— sin interpretarlo:
 *
 * - **Constancia de inscripción** (`ws_sr_constancia_inscripcion`): trae impuestos y
 *   monotributo, que es de donde sale la condición frente al IVA. No encuentra a quien no
 *   tiene CUIT —un CUIL—.
 * - **Padrón A13** (`ws_sr_padron_a13`): encuentra a casi cualquiera, CUIL incluidos, pero
 *   no informa la condición frente al IVA.
 *
 * Por eso se pregunta primero a la constancia y, si no encuentra, al A13. La lógica de la
 * condición frente al IVA viene de la aplicación de ecoparrilla, probada en producción.
 *
 * Todo lo de este archivo es puro: recibe lo que devolvió AFIP y no habla con nadie. Así
 * se prueba con respuestas guardadas y no contra AFIP.
 */

/** Lo que devuelve cada servicio de AFIP, con lo que usamos. El resto se ignora. */
export interface RespuestaPadron {
  idPersona?: number
  tipoPersona?: string
  estadoClave?: string
  datosGenerales?: {
    razonSocial?: string
    apellido?: string
    nombre?: string
    tipoClave?: string
    estadoClave?: string
    formaJuridica?: string
    /** Constancia de inscripción. */
    domicilioFiscal?: DomicilioAfip
    /** Padrón A13: una lista, con el fiscal entre ellos. */
    domicilio?: DomicilioAfip[]
  }
  datosMonotributo?: {
    categoriaMonotributo?: unknown
    impuesto?: unknown[]
    actividadMonotributista?: unknown
  }
  datosRegimenGeneral?: {
    impuesto?: Array<{ idImpuesto?: number; estadoImpuesto?: string }> | { idImpuesto?: number }
  }
  errorConstancia?: { error?: string | string[] }
}

interface DomicilioAfip {
  tipoDomicilio?: string
  direccion?: string
  localidad?: string
  codPostal?: string
  codigoPostal?: string
  idProvincia?: number
}

export interface CondicionIvaInferida {
  /** Código de AFIP: 1 Responsable Inscripto, 4 Exento, 6 Monotributo. `null` si no se sabe. */
  codigo: number | null
  /** «afip»: lo informó AFIP. «inferida»: lo deducimos, y hay que confirmarlo. */
  fuente: 'afip' | 'inferida'
  /** Por qué, para mostrárselo a quien carga el dato. */
  motivo: string
}

export interface Contribuyente {
  cuit: string
  /** Para una persona física, «Apellido, Nombre», como se escribe en el sistema. */
  razonSocial: string
  tipoPersona: 'fisica' | 'juridica' | null
  /** «CUIT» o «CUIL»: un CUIL no puede ser una razón social que factura. */
  tipoClave: string | null
  /** Clave activa y sin errores en la constancia. */
  activo: boolean
  condicionIva: CondicionIvaInferida
  domicilio: {
    direccion: string | null
    localidad: string | null
    codigoPostal: string | null
    /** Los mismos códigos que la tabla `provincia`: AFIP usa su propia numeración y la nuestra es ésa. */
    provinciaCodigo: number | null
  } | null
  /** De qué servicio salieron los datos. */
  origen: 'constancia' | 'a13'
}

const IVA = 30

/** La condición frente al IVA, según lo que informa AFIP o, si no informa, lo más probable. */
export function inferirCondicionIva(datos: RespuestaPadron): CondicionIvaInferida {
  const mono = datos.datosMonotributo
  const tieneMonotributo =
    mono &&
    ((Array.isArray(mono.impuesto) && mono.impuesto.length > 0) ||
      Boolean(mono.categoriaMonotributo) ||
      (Array.isArray(mono.actividadMonotributista)
        ? mono.actividadMonotributista.length > 0
        : Boolean(mono.actividadMonotributista)))
  if (tieneMonotributo) {
    return { codigo: 6, fuente: 'afip', motivo: 'AFIP lo informa como Monotributista.' }
  }

  const general = datos.datosRegimenGeneral
  if (general) {
    const impuestos = Array.isArray(general.impuesto)
      ? general.impuesto
      : general.impuesto
        ? [general.impuesto]
        : []
    // Sólo cuenta el IVA activo: con la baja del impuesto, ya no es Responsable Inscripto.
    const tieneIva = impuestos.some(
      (i) =>
        Number(i.idImpuesto) === IVA &&
        String((i as { estadoImpuesto?: string }).estadoImpuesto ?? 'AC') === 'AC',
    )
    return tieneIva
      ? { codigo: 1, fuente: 'afip', motivo: 'AFIP lo informa como Responsable Inscripto.' }
      : { codigo: 4, fuente: 'afip', motivo: 'Está en el régimen general sin IVA: exento.' }
  }

  if (datos.tipoPersona === 'JURIDICA') {
    return {
      codigo: 1,
      fuente: 'inferida',
      motivo:
        'AFIP no informa su condición frente al IVA. Es una sociedad, y casi siempre son ' +
        'Responsable Inscripto: confirmalo.',
    }
  }
  return {
    codigo: null,
    fuente: 'inferida',
    motivo:
      'AFIP no informa su condición frente al IVA. Elegila según lo que sepas del contribuyente.',
  }
}

function texto(valor: string | undefined): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

/**
 * Arma el contribuyente con lo que contestó cada servicio. `null` si ninguno lo encontró.
 * La constancia manda: es la que trae la condición frente al IVA.
 */
export function interpretarPadron(
  cuit: string,
  constancia: RespuestaPadron | null,
  a13: RespuestaPadron | null,
): Contribuyente | null {
  const datos = constancia ?? a13
  if (!datos) return null

  const generales = datos.datosGenerales ?? {}
  const razonSocial =
    texto(generales.razonSocial) ??
    ([texto(generales.apellido), texto(generales.nombre)].filter(Boolean).join(', ') ||
      'Sin nombre en AFIP')

  const fiscal =
    generales.domicilioFiscal ??
    generales.domicilio?.find((d) => d.tipoDomicilio === 'FISCAL') ??
    generales.domicilio?.[0]

  const tipo = datos.tipoPersona ?? null
  const estado = datos.estadoClave ?? generales.estadoClave

  return {
    cuit,
    razonSocial,
    tipoPersona: tipo === 'FISICA' ? 'fisica' : tipo === 'JURIDICA' ? 'juridica' : null,
    tipoClave: generales.tipoClave ?? null,
    activo: estado === 'ACTIVO' && !datos.errorConstancia,
    condicionIva: inferirCondicionIva(datos),
    domicilio: fiscal
      ? {
          direccion: texto(fiscal.direccion),
          localidad: texto(fiscal.localidad),
          codigoPostal: texto(fiscal.codPostal ?? fiscal.codigoPostal),
          provinciaCodigo: typeof fiscal.idProvincia === 'number' ? fiscal.idProvincia : null,
        }
      : null,
    origen: constancia ? 'constancia' : 'a13',
  }
}
