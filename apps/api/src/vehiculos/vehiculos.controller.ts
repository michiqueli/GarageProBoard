import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorVehiculos, ServicioVehiculos } from './vehiculos.service.ts'

const c = contrato.vehiculos

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorVehiculos['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorVehiculos) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

/**
 * Los permisos no están acá: los declara el contrato — el módulo y el permiso, con
 * `conPermiso('nucleo', 'ver', 'Vehiculo')` — y los aplica la guardia antes de que el
 * manejador corra. Y el tenant tampoco: lo pone `DatosDelTenant` desde la sesión.
 */
@Controller()
export class ControladorVehiculos {
  constructor(@Inject(ServicioVehiculos) private readonly servicio: ServicioVehiculos) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.marcas)
  marcas() {
    return implement(c.marcas).handler(() => this.servicio.marcas())
  }

  @Operacion(c.delCliente)
  delCliente() {
    return implement(c.delCliente).handler(({ input }) => this.servicio.delCliente(input.clienteId))
  }

  @Operacion(c.ficha)
  ficha() {
    return implement(c.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
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

  @Operacion(c.transferir)
  transferir(@Req() pedido: FastifyRequest) {
    return implement(c.transferir).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.transferir(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
