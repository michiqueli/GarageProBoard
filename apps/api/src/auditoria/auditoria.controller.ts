import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorAuditoria, ServicioAuditoria } from './auditoria.service.ts'

const c = contrato.auditoria

@Controller()
export class ControladorAuditoria {
  constructor(@Inject(ServicioAuditoria) private readonly auditoria: ServicioAuditoria) {}

  @Operacion(c.ingresos)
  ingresos() {
    return implement(c.ingresos).handler(({ input }) => this.auditoria.ingresos(input))
  }

  @Operacion(c.cambios)
  cambios() {
    return implement(c.cambios).handler(({ input }) => this.auditoria.cambios(input))
  }

  @Operacion(c.dispositivos)
  dispositivos() {
    return implement(c.dispositivos).handler(() => this.auditoria.dispositivos())
  }

  @Operacion(c.cambiosCrudos)
  cambiosCrudos() {
    return implement(c.cambiosCrudos).handler(({ input }) => this.auditoria.cambiosCrudos(input))
  }

  @Operacion(c.nombrarDispositivo)
  nombrarDispositivo(@Req() pedido: FastifyRequest) {
    return implement(c.nombrarDispositivo).handler(({ input, errors }) =>
      this.auditoria.nombrar(input.id, input.nombre, pedido.ip).catch((error: unknown) => {
        if (error instanceof ErrorAuditoria) throw errors.NO_ENCONTRADO()
        throw error
      }),
    )
  }
}
