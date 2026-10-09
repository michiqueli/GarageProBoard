import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorRecepcion } from './recepcion.service.ts'
import { ErrorTurnos, ServicioTurnos } from './turnos.service.ts'

const c = contrato.turnos

function traducir(error: unknown, errores: Partial<Record<string, unknown>>): never {
  if (error instanceof ErrorTurnos || error instanceof ErrorRecepcion) {
    const fabricar = errores[error.codigo] as (() => Error) | undefined
    if (fabricar) throw fabricar()
  }
  throw error
}

@Controller()
export class ControladorTurnos {
  constructor(@Inject(ServicioTurnos) private readonly servicio: ServicioTurnos) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input, errors }) =>
      this.servicio.listar(input.desde, input.hasta).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.crear)
  crear() {
    return implement(c.crear).handler(({ input, errors }) =>
      this.servicio.crear(input).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar() {
    return implement(c.editar).handler(({ input, errors }) =>
      this.servicio.editar(input.id, input).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.cancelar)
  cancelar() {
    return implement(c.cancelar).handler(({ input, errors }) =>
      this.servicio.cancelar(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.noVino)
  noVino() {
    return implement(c.noVino).handler(({ input, errors }) =>
      this.servicio.noVino(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.llego)
  llego() {
    return implement(c.llego).handler(({ input, errors }) =>
      this.servicio.llego(input.id).catch((e) => traducir(e, errors)),
    )
  }
}
