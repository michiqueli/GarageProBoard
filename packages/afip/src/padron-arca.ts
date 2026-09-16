import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Arca } from '@arcasdk/core'
import { type Contribuyente, interpretarPadron, type RespuestaPadron } from './padron.ts'
import type { ServicioPadron } from './puerto.ts'

export interface ConfiguracionPadron {
  /** El CUIT del certificado: el nuestro, no el de cada concesionaria. */
  cuit: string
  certificadoPem: string
  clavePrivadaPem: string
  produccion: boolean
  /** Dónde guarda el SDK el ticket de acceso de AFIP, que dura doce horas. */
  carpetaTickets?: string | undefined
}

/**
 * Si el error de AFIP quiere decir «ese CUIT no existe».
 *
 * El SDK lo reconoce en la constancia pero no en el A13, que contesta con un SOAP Fault:
 * «La Clave (CUIT/CUIL) consultada es inexistente». Se busca en el mensaje y en el cuerpo
 * de la respuesta, que es donde lo deja cada versión.
 */
export function esInexistente(error: unknown): boolean {
  const e = error as {
    message?: unknown
    response?: { data?: unknown; body?: unknown }
    body?: unknown
  }
  const textos = [e?.message, e?.response?.data, e?.response?.body, e?.body].map((t) =>
    typeof t === 'string' ? t : '',
  )
  return textos.some((t) => /inexistente|No existe persona/i.test(t))
}

/** AFIP no contestó, o contestó con un error que no es «no existe». */
export class PadronNoDisponible extends Error {
  constructor(causa: unknown) {
    super('El padrón de AFIP no está disponible', { cause: causa })
  }
}

/**
 * El padrón sobre `@arcasdk/core`. Es el único archivo del paquete que conoce el SDK.
 *
 * Una sola instancia de `Arca` por proceso: el SDK guarda el ticket de acceso y lo reusa
 * mientras dure. Pedir uno por consulta hace que AFIP rechace por exceso de pedidos.
 */
export function crearPadronArca(config: ConfiguracionPadron): ServicioPadron {
  const arca = new Arca({
    cuit: Number(config.cuit),
    cert: config.certificadoPem,
    key: config.clavePrivadaPem,
    production: config.produccion,
    ticketPath: config.carpetaTickets ?? join(tmpdir(), 'gpb-afip-tickets'),
  })

  return {
    async consultar(cuit: string): Promise<Contribuyente | null> {
      const id = Number(cuit)

      // La constancia es la que trae la condición frente al IVA. Si falla —AFIP la tiene
      // caída seguido— se sigue con el A13 en vez de dejar a quien carga sin nada.
      let constancia: RespuestaPadron | null = null
      try {
        constancia = (await arca.registerInscriptionProofService.getTaxpayerDetails(
          id,
        )) as RespuestaPadron | null
      } catch {
        constancia = null
      }
      if (constancia) return interpretarPadron(cuit, constancia, null)

      // Sin constancia puede ser un CUIL, o alguien sin inscripción: el A13 lo encuentra.
      try {
        const a13 = (await arca.registerScopeThirteenService.getTaxpayerDetails(
          id,
        )) as RespuestaPadron | null
        return interpretarPadron(cuit, null, a13)
      } catch (error) {
        if (esInexistente(error)) return null
        throw new PadronNoDisponible(error)
      }
    },
  }
}
