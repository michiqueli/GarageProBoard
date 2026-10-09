import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorEsperas, ServicioEsperas } from './esperas.service.ts'

const c = contrato.esperas

@Controller()
export class ControladorEsperas {
  constructor(@Inject(ServicioEsperas) private readonly servicio: ServicioEsperas) {}

  @Operacion(c.medir)
  medir() {
    return implement(c.medir).handler(({ input, errors }) =>
      this.servicio.medir(input.desde, input.hasta).catch((e) => {
        if (e instanceof ErrorEsperas) throw errors.RANGO_INVALIDO()
        throw e
      }),
    )
  }
}
