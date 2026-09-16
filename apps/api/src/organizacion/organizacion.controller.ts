import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorOrganizacion, ServicioOrganizacion } from './organizacion.service.ts'

const c = contrato.organizacion

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorOrganizacion['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorOrganizacion) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorOrganizacion {
  constructor(@Inject(ServicioOrganizacion) private readonly servicio: ServicioOrganizacion) {}

  @Operacion(c.catalogos)
  catalogos() {
    return implement(c.catalogos).handler(() => this.servicio.catalogos())
  }

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(async () => ({ datos: await this.servicio.listar() }))
  }

  @Operacion(c.crearEmpresa)
  crearEmpresa(@Req() pedido: FastifyRequest) {
    return implement(c.crearEmpresa).handler(({ input, errors }) =>
      this.servicio.crearEmpresa(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editarEmpresa)
  editarEmpresa(@Req() pedido: FastifyRequest) {
    return implement(c.editarEmpresa).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editarEmpresa(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.crearSucursal)
  crearSucursal(@Req() pedido: FastifyRequest) {
    return implement(c.crearSucursal).handler(({ input: { empresaId, ...datos }, errors }) =>
      this.servicio.crearSucursal(empresaId, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editarSucursal)
  editarSucursal(@Req() pedido: FastifyRequest) {
    return implement(c.editarSucursal).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editarSucursal(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.crearPuntoVenta)
  crearPuntoVenta(@Req() pedido: FastifyRequest) {
    return implement(c.crearPuntoVenta).handler(({ input: { sucursalId, ...datos }, errors }) =>
      this.servicio.crearPuntoVenta(sucursalId, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editarPuntoVenta)
  editarPuntoVenta(@Req() pedido: FastifyRequest) {
    return implement(c.editarPuntoVenta).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editarPuntoVenta(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
