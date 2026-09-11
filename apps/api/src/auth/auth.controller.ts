import { contrato } from '@garagetick/contracts'
import { Controller, Inject, Req, Res } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ErrorAuth, ServicioAuth, type Sesion } from './auth.service.ts'
import { borrarRefresco, leerRefresco, ponerRefresco } from './cookie.ts'
import { DeSesion, Publica } from './guard.ts'

/**
 * El token de refresco sale por uno de dos caminos y nunca por los dos.
 *
 * Si el cliente pidió `entrega: 'cookie'` — lo que pasa por omisión, y es lo que
 * corresponde en un navegador — se manda en una cookie `httpOnly` y se **borra de la
 * respuesta**. Devolverlo también en el cuerpo anularía la protección entera: un script
 * malicioso que llame a `/auth/refrescar` leería el token nuevo del JSON y se lo
 * llevaría igual.
 */
function entregar<T extends { refresh?: string | undefined }>(
  respuesta: FastifyReply,
  sesion: T,
  modo: 'cookie' | 'cuerpo',
): T {
  if (modo === 'cuerpo') return sesion

  if (sesion.refresh) ponerRefresco(respuesta, sesion.refresh)
  return { ...sesion, refresh: undefined }
}

@Controller()
export class ControladorAuth {
  constructor(@Inject(ServicioAuth) private readonly auth: ServicioAuth) {}

  @Publica()
  @Implement(contrato.auth.iniciar)
  iniciar(@Req() pedido: FastifyRequest, @Res({ passthrough: true }) respuesta: FastifyReply) {
    return implement(contrato.auth.iniciar).handler(async ({ input, errors }) => {
      try {
        const sesion = await this.auth.iniciar({
          email: input.email,
          password: input.password,
          sucursalId: input.sucursalId,
          agente: pedido.headers['user-agent'],
          ip: pedido.ip,
        })
        return entregar(respuesta, sesion, input.entrega)
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
  refrescar(@Req() pedido: FastifyRequest, @Res({ passthrough: true }) respuesta: FastifyReply) {
    return implement(contrato.auth.refrescar).handler(async ({ input, errors }) => {
      const token = leerRefresco(pedido, input.refresh)
      if (!token) throw errors.REFRESCO_INVALIDO()

      try {
        const sesion = await this.auth.refrescar(token)
        // Se responde por el mismo camino por el que llegó: si vino en el cuerpo, el
        // cliente no maneja cookies y espera el nuevo también en el cuerpo.
        return entregar(respuesta, sesion, input.refresh ? 'cuerpo' : 'cookie')
      } catch (error) {
        // La sesión murió: sacarle la cookie al navegador evita que siga reintentando
        // con algo que ya no sirve.
        borrarRefresco(respuesta)
        if (error instanceof ErrorAuth) throw errors.REFRESCO_INVALIDO()
        throw error
      }
    })
  }

  @Publica()
  @Implement(contrato.auth.cerrar)
  cerrar(@Req() pedido: FastifyRequest, @Res({ passthrough: true }) respuesta: FastifyReply) {
    return implement(contrato.auth.cerrar).handler(async ({ input }) => {
      const token = leerRefresco(pedido, input.refresh)
      borrarRefresco(respuesta)

      return { cerrada: token ? await this.auth.cerrar(token) : false }
    })
  }

  @Publica()
  @Implement(contrato.auth.cambiarSucursal)
  cambiarSucursal(
    @Req() pedido: FastifyRequest,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ) {
    return implement(contrato.auth.cambiarSucursal).handler(async ({ input, errors }) => {
      const token = leerRefresco(pedido, input.refresh)
      if (!token) throw errors.REFRESCO_INVALIDO()

      try {
        const sesion = await this.auth.refrescar(token, input.sucursalId)
        return entregar(respuesta, sesion, input.refresh ? 'cuerpo' : 'cookie')
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
