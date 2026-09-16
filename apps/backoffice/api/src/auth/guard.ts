import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { accesoDe } from '../comun/operacion.ts'
import { type Operador, ServicioAuth } from './auth.service.ts'
import { leerSesion } from './cookie.ts'

export interface PedidoConOperador extends FastifyRequest {
  operador?: Operador
}

/** Con la forma de error de oRPC, para que el front lo reconozca como error del contrato. */
function noAutenticado(): HttpException {
  return new HttpException(
    { defined: true, code: 'NO_AUTENTICADO', status: 401, message: 'Falta iniciar sesión' },
    401,
  )
}

/** La única guardia del back-office: hay un operador con sesión viva, o no se pasa. */
@Injectable()
export class GuardiaOperador implements CanActivate {
  constructor(@Inject(ServicioAuth) private readonly auth: ServicioAuth) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const acceso = accesoDe(contexto.getHandler())
    if (acceso === undefined) {
      throw new InternalServerErrorException('Esta ruta no declara quién puede usarla.')
    }
    if (acceso === 'publico') return true

    const pedido = contexto.switchToHttp().getRequest<PedidoConOperador>()
    const token = leerSesion(pedido)
    const operador = token ? await this.auth.operadorDe(token) : null
    if (!operador) throw noAutenticado()

    pedido.operador = operador
    return true
  }
}

/** El operador del pedido, en las rutas `operador`: la guardia ya lo dejó puesto. */
export const DeOperador = createParamDecorator(
  (_: unknown, contexto: ExecutionContext): Operador => {
    const pedido = contexto.switchToHttp().getRequest<PedidoConOperador>()
    if (!pedido.operador) throw noAutenticado()
    return pedido.operador
  },
)
