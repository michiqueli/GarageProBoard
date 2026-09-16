import { PadronNoDisponible } from '@gpb/afip'
import { contrato } from '@gpb/contracts'
import { Controller, Inject, Logger } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ServicioConsultaPadron } from './padron.service.ts'

@Controller()
export class ControladorPadron {
  private readonly log = new Logger('Padron')

  constructor(@Inject(ServicioConsultaPadron) private readonly padron: ServicioConsultaPadron) {}

  @Operacion(contrato.padron.consultar)
  consultar() {
    return implement(contrato.padron.consultar).handler(async ({ input, errors }) => {
      try {
        const encontrado = await this.padron.consultar(input.cuit)
        if (!encontrado) throw errors.CUIT_INEXISTENTE()
        return encontrado
      } catch (error) {
        if (error instanceof PadronNoDisponible) {
          // Se registra la causa: a quien carga le alcanza con «probá en un rato», pero a
          // quien mantiene el sistema no.
          this.log.warn(
            `Padrón no disponible: ${String((error.cause as Error)?.message ?? error.cause)}`,
          )
          throw errors.PADRON_NO_DISPONIBLE()
        }
        throw error
      }
    })
  }
}
