import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorTotem, ServicioTotem } from './totem.service.ts'

const c = contrato.totem

function traducir(error: unknown, errores: { NO_ES_TOTEM?: () => Error }): never {
  if (error instanceof ErrorTotem && errores.NO_ES_TOTEM) throw errores.NO_ES_TOTEM()
  throw error
}

@Controller()
export class ControladorTotem {
  constructor(@Inject(ServicioTotem) private readonly servicio: ServicioTotem) {}

  @Operacion(c.estado)
  estado() {
    return implement(c.estado).handler(({ errors }) =>
      this.servicio.estado().catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.anotar)
  anotar() {
    return implement(c.anotar).handler(({ input, errors }) =>
      this.servicio.anotar(input).catch((e) => traducir(e, errors)),
    )
  }
}
