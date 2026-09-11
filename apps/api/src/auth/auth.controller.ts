import { contrato } from '@garagetick/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { ErrorAuth, ServicioAuth, type Sesion } from './auth.service.ts'
import { DeSesion, Publica } from './guard.ts'

@Controller()
export class ControladorAuth {
  constructor(@Inject(ServicioAuth) private readonly auth: ServicioAuth) {}

  @Publica()
  @Implement(contrato.auth.iniciar)
  iniciar(@Req() pedido: FastifyRequest) {
    return implement(contrato.auth.iniciar).handler(async ({ input, errors }) => {
      try {
        return await this.auth.iniciar({
          ...input,
          agente: pedido.headers['user-agent'],
          ip: pedido.ip,
        })
      } catch (error) {
        if (error instanceof ErrorAuth) {
          if (error.codigo === 'SIN_ACCESO') throw errors.SIN_ACCESO()
          throw errors.CREDENCIALES_INVALIDAS()
        }
        throw error
      }
    })
  }

  @Publica()
  @Implement(contrato.auth.refrescar)
  refrescar() {
    return implement(contrato.auth.refrescar).handler(async ({ input, errors }) => {
      try {
        return await this.auth.refrescar(input.refresh)
      } catch (error) {
        if (error instanceof ErrorAuth) throw errors.REFRESCO_INVALIDO()
        throw error
      }
    })
  }

  @Publica()
  @Implement(contrato.auth.cerrar)
  cerrar() {
    return implement(contrato.auth.cerrar).handler(async ({ input }) => ({
      cerrada: await this.auth.cerrar(input.refresh),
    }))
  }

  @Publica()
  @Implement(contrato.auth.cambiarSucursal)
  cambiarSucursal() {
    return implement(contrato.auth.cambiarSucursal).handler(async ({ input, errors }) => {
      try {
        return await this.auth.refrescar(input.refresh, input.sucursalId)
      } catch (error) {
        if (error instanceof ErrorAuth) {
          if (error.codigo === 'SIN_ACCESO') throw errors.SIN_ACCESO()
          throw errors.REFRESCO_INVALIDO()
        }
        throw error
      }
    })
  }

  @Implement(contrato.auth.yo)
  yo(@DeSesion() sesion: Sesion) {
    return implement(contrato.auth.yo).handler(async () => this.auth.describir(sesion))
  }
}
