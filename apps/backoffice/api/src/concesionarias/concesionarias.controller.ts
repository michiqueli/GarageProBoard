import { contratoBackoffice } from '@garagepro/contracts/backoffice'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import type { Operador } from '../auth/auth.service.ts'
import { DeOperador } from '../auth/guard.ts'
import { Operacion } from '../comun/operacion.ts'
import { ErrorConcesionaria, ServicioConcesionarias } from './concesionarias.service.ts'

const c = contratoBackoffice.concesionarias

/**
 * Traduce los errores del servicio a los del contrato. Todo lo que no sea un
 * `ErrorConcesionaria` sigue de largo y sale como 500: es un error nuestro, no del pedido.
 */
function traducir<E extends Partial<Record<ErrorConcesionaria['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorConcesionaria) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) {
      throw error.codigo === 'DEPENDENCIAS_ROTAS'
        ? fabricar({ data: { motivos: error.motivos } })
        : fabricar()
    }
  }
  throw error
}

@Controller()
export class ControladorConcesionarias {
  constructor(@Inject(ServicioConcesionarias) private readonly servicio: ServicioConcesionarias) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(async () => ({ datos: await this.servicio.listar() }))
  }

  @Operacion(c.ver)
  ver() {
    return implement(c.ver).handler(({ input, errors }) =>
      this.servicio.ver(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.crear)
  crear(@DeOperador() operador: Operador, @Req() pedido: FastifyRequest) {
    return implement(c.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, { operador, ip: pedido.ip }).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.cambiarEstado)
  cambiarEstado(@DeOperador() operador: Operador, @Req() pedido: FastifyRequest) {
    return implement(c.cambiarEstado).handler(({ input, errors }) =>
      this.servicio
        .cambiarEstado(input.id, input.activo, input.motivo, { operador, ip: pedido.ip })
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.cambiarModulo)
  cambiarModulo(@DeOperador() operador: Operador, @Req() pedido: FastifyRequest) {
    return implement(c.cambiarModulo).handler(({ input, errors }) =>
      this.servicio
        .cambiarModulo(input.id, input, { operador, ip: pedido.ip })
        .catch((e) => traducir(e, errors)),
    )
  }
}
