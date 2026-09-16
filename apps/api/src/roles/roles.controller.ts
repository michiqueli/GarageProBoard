import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorRoles, ServicioRoles } from './roles.service.ts'

const c = contrato.roles

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorRoles['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorRoles) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorRoles {
  constructor(@Inject(ServicioRoles) private readonly servicio: ServicioRoles) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(() => this.servicio.listar())
  }

  @Operacion(c.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(c.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
