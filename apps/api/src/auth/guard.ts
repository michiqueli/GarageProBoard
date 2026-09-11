import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { FastifyRequest } from 'fastify'
import type { Sesion } from './auth.service.ts'
import type { ClaimsAcceso } from './tokens.ts'

/** Marca una ruta como accesible sin sesión: el login, el refresco, el chequeo de vida. */
export const PUBLICA = 'ruta_publica'
export const Publica = () => SetMetadata(PUBLICA, true)

interface ConSesion extends FastifyRequest {
  sesion?: Sesion
}

/**
 * Verifica el token de acceso y deja la sesión en el pedido.
 *
 * Es un guardia global: se protege por omisión y se abre a mano con `@Publica()`. Al
 * revés — abierto por omisión y cerrado a mano — el día que alguien agrega un endpoint
 * y se olvida del decorador, queda expuesto sin que nada avise.
 */
@Injectable()
export class GuardiaAuth implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ])
    if (esPublica) return true

    const pedido = contexto.switchToHttp().getRequest<ConSesion>()
    const encabezado = pedido.headers.authorization

    if (!encabezado?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta iniciar sesión')
    }

    try {
      const claims = await this.jwt.verifyAsync<ClaimsAcceso>(encabezado.slice(7))
      pedido.sesion = {
        usuarioId: claims.sub,
        tenantId: claims.ten,
        sucursalId: claims.suc,
        sesionId: claims.ses,
      }
      return true
    } catch {
      throw new UnauthorizedException('La sesión expiró')
    }
  }
}

/**
 * Inyecta la sesión en un manejador.
 *
 * De acá sale el `tenantId` que se le pasa a `conTenant()`. Si alguien lo olvida, la
 * consulta revienta contra las políticas de RLS en vez de devolver datos ajenos: la
 * disciplina ayuda, pero la garantía la da la base.
 */
export const DeSesion = createParamDecorator((_: unknown, contexto: ExecutionContext): Sesion => {
  const pedido = contexto.switchToHttp().getRequest<ConSesion>()
  if (!pedido.sesion) throw new UnauthorizedException('Falta iniciar sesión')
  return pedido.sesion
})
