import { AsyncLocalStorage } from 'node:async_hooks'
import type { Habilidades } from '@gpb/core'
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'

export interface Sesion {
  usuarioId: string
  tenantId: string
  sucursalId: string
  sesionId: string
  /**
   * Desde dónde llegó el pedido. La anota el trigger de auditoría sin que ninguna
   * operación tenga que acordarse de pasarla.
   */
  ip?: string | undefined
}

/** Quién está pidiendo, y qué puede hacer. Lo arma la guardia de acceso. */
export interface ContextoPedido {
  sesion: Sesion
  habilidades: Habilidades
}

export interface PedidoConSesion extends FastifyRequest {
  sesion?: Sesion
  habilidades?: Habilidades
}

const almacen = new AsyncLocalStorage<ContextoPedido>()

/**
 * El contexto del pedido en curso.
 *
 * Revienta afuera de un pedido con sesión, con un mensaje que dice qué pasó: una ruta
 * pública que intenta leer datos de una concesionaria, o un trabajo en segundo plano
 * que se olvidó de abrir su propio contexto. Devolver `undefined` acá sería dejar que
 * alguien más abajo adivine.
 */
export function contextoDelPedido(): ContextoPedido {
  const contexto = almacen.getStore()
  if (!contexto) {
    throw new Error(
      'No hay sesión en este contexto. Las rutas públicas y los trabajos en segundo plano ' +
        'no pueden leer datos de una concesionaria sin abrir un contexto propio.',
    )
  }
  return contexto
}

/** Para los trabajos que no nacen de un pedido HTTP: colas, tareas programadas, tests. */
export function enContexto<T>(contexto: ContextoPedido, fn: () => T): T {
  return almacen.run(contexto, fn)
}

/**
 * Deja la sesión y los permisos disponibles para todo lo que corra dentro del pedido.
 *
 * Es un interceptor global y no algo que cada controlador arme: así ninguna operación
 * tiene que recibir el tenant por parámetro, y ninguna puede recibir uno equivocado.
 *
 * El contexto se abre **alrededor de la suscripción** y no alrededor de la llamada. El
 * procedimiento de oRPC no corre cuando Nest llama al método del controlador — ése sólo
 * lo devuelve — sino después, cuando su interceptor lo ejecuta dentro del observable.
 * Si el contexto se cerrara al volver del método, el handler correría sin él.
 */
@Injectable()
export class InterceptorContexto implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const pedido = contexto.switchToHttp().getRequest<PedidoConSesion>()
    const { sesion, habilidades } = pedido

    if (!sesion || !habilidades) return siguiente.handle()

    return new Observable((suscriptor) =>
      almacen.run({ sesion, habilidades }, () => siguiente.handle().subscribe(suscriptor)),
    )
  }
}
