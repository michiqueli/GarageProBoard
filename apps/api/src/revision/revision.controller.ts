import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorRevision, ServicioRevision } from './revision.service.ts'

const c = contrato.revision

function traducir(error: unknown, errores: { NO_ENCONTRADO?: () => Error }): never {
  if (error instanceof ErrorRevision && errores.NO_ENCONTRADO) throw errores.NO_ENCONTRADO()
  throw error
}

@Controller()
export class ControladorRevision {
  constructor(@Inject(ServicioRevision) private readonly servicio: ServicioRevision) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(() => this.servicio.listar())
  }

  @Operacion(c.crear)
  crear() {
    return implement(c.crear).handler(({ input }) =>
      this.servicio.crear(input.seccion, input.nombre),
    )
  }

  @Operacion(c.editar)
  editar() {
    return implement(c.editar).handler(({ input, errors }) =>
      this.servicio.editar(input.id, input.nombre, input.activo).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.mover)
  mover() {
    return implement(c.mover).handler(({ input, errors }) =>
      this.servicio.mover(input.id, input.hacia).catch((e) => traducir(e, errors)),
    )
  }
}
