import { describe, expect, it } from 'vitest'
import { inferirCondicionIva, interpretarPadron, type RespuestaPadron } from '../src/padron.ts'

/**
 * Respuestas con la forma real de AFIP, tomadas de consultas de producción el 16/09/2026.
 * La de persona física está anonimizada; la de AFIP es pública.
 */

const AFIP_CONSTANCIA: RespuestaPadron = {
  idPersona: 33693450239,
  tipoPersona: 'JURIDICA',
  estadoClave: 'ACTIVO',
  datosGenerales: {
    razonSocial: 'AGENCIA DE RECAUDACION Y CONTROL ADUANERO',
    tipoClave: 'CUIT',
    domicilioFiscal: {
      codPostal: '1086',
      direccion: 'YRIGOYEN HIPOLITO 370 Piso:4 Dpto:4748',
      idProvincia: 0,
      tipoDomicilio: 'FISCAL',
    },
  },
  datosRegimenGeneral: {
    impuesto: [{ idImpuesto: 216, estadoImpuesto: 'AC' }],
  },
}

const PERSONA_CONSTANCIA: RespuestaPadron = {
  idPersona: 20111111112,
  tipoPersona: 'FISICA',
  estadoClave: 'ACTIVO',
  datosGenerales: {
    apellido: 'PEREZ',
    nombre: 'JUAN CARLOS',
    tipoClave: 'CUIT',
    domicilioFiscal: {
      codPostal: '8316',
      direccion: 'AV SAN MARTIN 100',
      localidad: 'PLOTTIER',
      idProvincia: 20,
      tipoDomicilio: 'FISCAL',
    },
  },
  datosRegimenGeneral: {
    impuesto: [
      { idImpuesto: 30, estadoImpuesto: 'AC' },
      { idImpuesto: 11, estadoImpuesto: 'AC' },
    ],
  },
}

/** Un CUIL: la constancia no lo encuentra, el A13 sí, y sin domicilio. */
const CUIL_A13: RespuestaPadron = {
  idPersona: 20999999981,
  tipoPersona: 'FISICA',
  estadoClave: 'ACTIVO',
  datosGenerales: { apellido: 'GOMEZ JOSE', tipoClave: 'CUIL' },
}

describe('el contribuyente', () => {
  it('una sociedad, con su domicilio fiscal y la provincia en nuestros códigos', () => {
    expect(interpretarPadron('33693450239', AFIP_CONSTANCIA, null)).toEqual({
      cuit: '33693450239',
      razonSocial: 'AGENCIA DE RECAUDACION Y CONTROL ADUANERO',
      tipoPersona: 'juridica',
      tipoClave: 'CUIT',
      activo: true,
      condicionIva: {
        codigo: 4,
        fuente: 'afip',
        motivo: 'Está en el régimen general sin IVA: exento.',
      },
      domicilio: {
        direccion: 'YRIGOYEN HIPOLITO 370 Piso:4 Dpto:4748',
        localidad: null,
        codigoPostal: '1086',
        provinciaCodigo: 0,
      },
      origen: 'constancia',
    })
  })

  it('una persona física se escribe «Apellido, Nombre»', () => {
    const c = interpretarPadron('20111111112', PERSONA_CONSTANCIA, null)
    expect(c?.razonSocial).toBe('PEREZ, JUAN CARLOS')
    expect(c?.domicilio?.localidad).toBe('PLOTTIER')
  })

  it('sin constancia, sale del A13, y dice que es un CUIL', () => {
    const c = interpretarPadron('20999999981', null, CUIL_A13)
    expect(c).toMatchObject({
      origen: 'a13',
      tipoClave: 'CUIL',
      domicilio: null,
      condicionIva: { codigo: null, fuente: 'inferida' },
    })
  })

  it('si ninguno lo encuentra, no existe', () => {
    expect(interpretarPadron('20999999981', null, null)).toBeNull()
  })

  it('con error en la constancia no está activo', () => {
    const c = interpretarPadron(
      '33693450239',
      { ...AFIP_CONSTANCIA, errorConstancia: { error: 'x' } },
      null,
    )
    expect(c?.activo).toBe(false)
  })

  it('el A13 trae el domicilio en una lista: se toma el fiscal', () => {
    const c = interpretarPadron('33693450239', null, {
      ...AFIP_CONSTANCIA,
      datosGenerales: {
        razonSocial: 'X',
        domicilio: [
          { tipoDomicilio: 'LEGAL/REAL', direccion: 'OTRA 1', idProvincia: 1 },
          { tipoDomicilio: 'FISCAL', direccion: 'FISCAL 2', codigoPostal: '1000', idProvincia: 0 },
        ],
      },
    })
    expect(c?.domicilio).toEqual({
      direccion: 'FISCAL 2',
      localidad: null,
      codigoPostal: '1000',
      provinciaCodigo: 0,
    })
  })
})

describe('la condición frente al IVA', () => {
  it('con IVA activo es Responsable Inscripto, informado por AFIP', () => {
    expect(inferirCondicionIva(PERSONA_CONSTANCIA)).toMatchObject({ codigo: 1, fuente: 'afip' })
  })

  it('con el IVA dado de baja ya no lo es', () => {
    const conBaja: RespuestaPadron = {
      ...PERSONA_CONSTANCIA,
      datosRegimenGeneral: { impuesto: [{ idImpuesto: 30, estadoImpuesto: 'BD' }] },
    }
    expect(inferirCondicionIva(conBaja).codigo).toBe(4)
  })

  it('con monotributo es Monotributista', () => {
    expect(
      inferirCondicionIva({
        tipoPersona: 'FISICA',
        datosMonotributo: { categoriaMonotributo: 'A' },
      }),
    ).toMatchObject({ codigo: 6, fuente: 'afip' })
  })

  it('una sociedad sin datos se sugiere Responsable Inscripto, pero marcado como inferido', () => {
    expect(inferirCondicionIva({ tipoPersona: 'JURIDICA' })).toMatchObject({
      codigo: 1,
      fuente: 'inferida',
    })
  })

  it('una persona física sin datos no se adivina', () => {
    expect(inferirCondicionIva({ tipoPersona: 'FISICA' }).codigo).toBeNull()
  })
})

describe('un CUIT que AFIP no conoce', () => {
  it('se reconoce en el SOAP Fault del A13, que el SDK no traduce', async () => {
    const { esInexistente } = await import('../src/padron-arca.ts')
    const fault =
      '<soap:Fault><faultstring>La Clave (CUIT/CUIL) consultada es inexistente</faultstring></soap:Fault>'
    expect(esInexistente({ message: 'Request failed', response: { data: fault } })).toBe(true)
    expect(esInexistente(new Error('No existe persona con ese Id'))).toBe(true)
    expect(esInexistente(new Error('connect ETIMEDOUT'))).toBe(false)
  })
})
