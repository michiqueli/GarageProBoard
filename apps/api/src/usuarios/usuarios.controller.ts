import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorUsuarios, ServicioUsuarios } from './usuarios.service.ts'

const c = contrato.usuarios

/**
 * Traduce los errores del servicio a los del contrato. Lo que no es un `ErrorUsuarios`
 * sigue de largo y sale como 500: es un error nuestro, no del pedido.
 */
function traducir<E extends Partial<Record<ErrorUsuarios['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorUsuarios) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorUsuarios {
  constructor(@Inject(ServicioUsuarios) private readonly usuarios: ServicioUsuarios) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(async () => ({ datos: await this.usuarios.listar() }))
  }

  @Operacion(c.opciones)
  opciones() {
    return implement(c.opciones).handler(() => this.usuarios.opciones())
  }

  @Operacion(c.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(c.crear).handler(({ input, errors }) =>
      this.usuarios.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input, errors }) =>
      this.usuarios.editar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.nuevaPassword)
  nuevaPassword(@Req() pedido: FastifyRequest) {
    return implement(c.nuevaPassword).handler(({ input, errors }) =>
      this.usuarios.nuevaPassword(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
