import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorFirmas, ServicioFirmas } from './firmas.service.ts'

const c = contrato.ordenes

/** El servicio dice ESTADO_INVALIDO; el contrato de órdenes ya tiene uno, con otros datos. */
const EN_EL_CONTRATO: Record<ErrorFirmas['codigo'], string> = {
  NO_ENCONTRADA: 'NO_ENCONTRADA',
  FORMATO_INVALIDO: 'FORMATO_INVALIDO',
  DEMASIADO_GRANDE: 'DEMASIADO_GRANDE',
  ESTADO_INVALIDO: 'ESTADO_INVALIDO_FIRMA',
  SIN_ALMACEN: 'SIN_ALMACEN',
}

function traducir(error: unknown, errores: object): never {
  if (error instanceof ErrorFirmas) {
    const fabricar = (errores as Record<string, unknown>)[EN_EL_CONTRATO[error.codigo]] as
      | ((opciones?: { data?: unknown }) => Error)
      | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorFirmas {
  constructor(@Inject(ServicioFirmas) private readonly servicio: ServicioFirmas) {}

  @Operacion(c.firmar)
  firmar() {
    return implement(c.firmar).handler(async ({ input, errors }) => {
      try {
        const bytes = new Uint8Array(await input.imagen.arrayBuffer())
        return await this.servicio.firmar(input.id, input.momento, input.aclaracion, bytes)
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }

  @Operacion(c.firma)
  firma() {
    return implement(c.firma).handler(async ({ input, errors }) => {
      try {
        const { contenido } = await this.servicio.imagen(input.id, input.momento)
        return new File([Buffer.from(contenido)], `firma-${input.momento}.png`, {
          type: 'image/png',
        })
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }
}
