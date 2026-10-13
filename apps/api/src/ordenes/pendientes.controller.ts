import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorPendientes, ServicioPendientes } from './pendientes.service.ts'

const c = contrato.ordenes

@Controller()
export class ControladorPendientes {
  constructor(@Inject(ServicioPendientes) private readonly servicio: ServicioPendientes) {}

  @Operacion(c.pendientes)
  pendientes() {
    return implement(c.pendientes).handler(({ input }) => this.servicio.listar(input.id))
  }

  @Operacion(c.descartarPendiente)
  descartarPendiente() {
    return implement(c.descartarPendiente).handler(({ input, errors }) =>
      this.servicio.descartar(input.id, input.motivo).catch((e: unknown) => {
        if (e instanceof ErrorPendientes) throw errors.NO_ENCONTRADO()
        throw e
      }),
    )
  }
}
