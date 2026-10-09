import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorLlamador, ServicioLlamador } from './llamador.service.ts'

const c = contrato.llamador

@Controller()
export class ControladorLlamador {
  constructor(@Inject(ServicioLlamador) private readonly servicio: ServicioLlamador) {}

  @Operacion(c.pantalla)
  pantalla() {
    return implement(c.pantalla).handler(({ errors }) =>
      this.servicio.pantalla().catch((e) => {
        if (e instanceof ErrorLlamador) throw errors.NO_ES_LLAMADOR()
        throw e
      }),
    )
  }
}
