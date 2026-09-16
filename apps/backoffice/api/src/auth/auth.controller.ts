import { contratoBackoffice } from '@garagepro/contracts/backoffice'
import { Controller, Inject, Req, Res } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { type Operador, ServicioAuth } from './auth.service.ts'
import { borrarSesion, leerSesion, ponerSesion } from './cookie.ts'
import { DeOperador } from './guard.ts'

const c = contratoBackoffice.auth

@Controller()
export class ControladorAuth {
  constructor(@Inject(ServicioAuth) private readonly auth: ServicioAuth) {}

  @Operacion(c.iniciar)
  iniciar(@Req() pedido: FastifyRequest, @Res({ passthrough: true }) respuesta: FastifyReply) {
    return implement(c.iniciar).handler(async ({ input, errors }) => {
      const resultado = await this.auth.iniciar({
        email: input.email,
        password: input.password,
        ip: pedido.ip,
        agente: pedido.headers['user-agent'],
      })
      if (!resultado) throw errors.CREDENCIALES_INVALIDAS()

      ponerSesion(respuesta, resultado.token)
      return resultado.operador
    })
  }

  @Operacion(c.cerrar)
  cerrar(@Req() pedido: FastifyRequest, @Res({ passthrough: true }) respuesta: FastifyReply) {
    return implement(c.cerrar).handler(async () => {
      const token = leerSesion(pedido)
      borrarSesion(respuesta)
      return { cerrada: token ? await this.auth.cerrar(token) : false }
    })
  }

  @Operacion(c.yo)
  yo(@DeOperador() operador: Operador) {
    return implement(c.yo).handler(async () => operador)
  }
}
