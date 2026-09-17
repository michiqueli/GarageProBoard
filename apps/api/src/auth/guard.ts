import { evaluarAcceso } from '@gpb/contracts'
import {
  type AccionPermiso,
  construirHabilidades,
  describirPermiso,
  type Modulo,
  type Sujeto,
} from '@gpb/core'
import { conTenant, type Db, modulosVigentes } from '@gpb/db'
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { PedidoConSesion, Sesion } from '../comun/contexto.ts'
import { accesoDe } from '../comun/operacion.ts'
import { DB } from '../comun/simbolos.ts'
import { reglasDelUsuario } from './permisos.ts'
import type { ClaimsAcceso } from './tokens.ts'

/**
 * Un rechazo con la forma de error de oRPC, la misma que el contrato declara.
 *
 * Nest respondería `{ statusCode, message, error }`, y el cliente del front no lo
 * reconocería como error del contrato: vería un «error de red» donde hay un «no tenés
 * permiso», y el usuario no sabría qué hacer.
 */
function rechazo(
  status: 401 | 403,
  code: 'NO_AUTENTICADO' | 'MODULO_APAGADO' | 'SIN_PERMISO',
  message: string,
  data?: unknown,
): HttpException {
  return new HttpException(
    { defined: true, code, status, message, ...(data === undefined ? {} : { data }) },
    status,
  )
}

/**
 * La única guardia del sistema: quién es, si sigue habilitado, si la concesionaria tiene
 * el módulo, y si la persona puede hacer esto.
 *
 * Es una sola y no tres encadenadas porque el orden importa — sin sesión no hay
 * permisos que evaluar — y el orden entre guardias globales depende de cómo se
 * registren. Una sola no tiene orden que romper.
 *
 * Lee lo que el contrato declara para la ruta (`@Operacion` lo deja a mano). Cerrada
 * por omisión: una ruta sin declaración no pasa.
 */
@Injectable()
export class GuardiaAcceso implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const acceso = accesoDe(contexto.getHandler())

    // `VerificadorAcceso` impide arrancar con una ruta así; esto es por si algo se le
    // escapa. Un 500 y no un 403: no es que el usuario no pueda, es que falta código.
    if (acceso === undefined) {
      throw new InternalServerErrorException('Esta ruta no declara quién puede usarla.')
    }
    if (acceso === 'publico') return true

    const pedido = contexto.switchToHttp().getRequest<PedidoConSesion>()
    // La IP se pega a la sesión acá y no en cada operación: de ahí la toma el trigger de
    // auditoría, y una operación nueva la anota sin tener que acordarse de nada.
    const sesion = { ...(await this.autenticar(pedido.headers.authorization)), ip: pedido.ip }

    // Las reglas se leen de la base **en cada pedido**, no del token. Guardarlas en el
    // token ahorraría esta consulta, pero un usuario dado de baja o al que le sacaron un
    // rol seguiría pudiendo todo hasta que venza — quince minutos para vaciar una caja.
    // La consulta va por clave primaria y cuesta menos que eso.
    //
    // Los módulos, por lo mismo: un módulo suspendido o un período de prueba que venció
    // se apagan en el próximo pedido, no cuando la persona vuelve a entrar.
    const leido = await conTenant(this.db, sesion.tenantId, async (tx) => {
      const reglas = await reglasDelUsuario(tx, sesion)
      return reglas && { reglas, modulos: await modulosVigentes(tx) }
    })
    if (!leido) {
      throw rechazo(
        401,
        'NO_AUTENTICADO',
        'Tu usuario está deshabilitado. Pedile a quien administra los usuarios que lo habilite.',
      )
    }

    const habilidades = construirHabilidades(leido.reglas)
    pedido.sesion = sesion
    pedido.habilidades = habilidades

    if (acceso === 'sesion') return true

    // Primero el módulo: a quien no lo tiene no se le habla de permisos.
    switch (evaluarAcceso({ modulos: leido.modulos, habilidades }, acceso)) {
      case 'modulo-apagado':
        throw this.moduloApagado(acceso.modulo)
      case 'sin-permiso':
        throw this.sinPermiso(acceso.accion, acceso.sujeto)
      case 'permitido':
        return true
    }
  }

  private async autenticar(encabezado: string | undefined): Promise<Sesion> {
    if (!encabezado?.startsWith('Bearer ')) {
      throw rechazo(401, 'NO_AUTENTICADO', 'Falta iniciar sesión')
    }

    try {
      const claims = await this.jwt.verifyAsync<ClaimsAcceso>(encabezado.slice(7))
      return {
        usuarioId: claims.sub,
        tenantId: claims.ten,
        sucursalId: claims.suc,
        sesionId: claims.ses,
      }
    } catch {
      throw rechazo(401, 'NO_AUTENTICADO', 'La sesión expiró')
    }
  }

  /**
   * No dice qué módulo ni ofrece contratarlo: lo que la concesionaria no tiene no se le
   * muestra, ni en el menú ni en un error. El `modulo` va en los datos para quien integra.
   */
  private moduloApagado(modulo: Modulo): HttpException {
    return rechazo(
      403,
      'MODULO_APAGADO',
      'Esta función no está habilitada para la concesionaria.',
      { modulo },
    )
  }

  /** Dice qué falta y a quién pedírselo: «Formato inválido» no le sirve a nadie. */
  private sinPermiso(accion: AccionPermiso, sujeto: Sujeto): HttpException {
    return rechazo(
      403,
      'SIN_PERMISO',
      `Tu usuario no tiene permiso para ${describirPermiso(accion, sujeto)}. ` +
        'Pedíselo a quien administra los usuarios.',
      { accion, sujeto },
    )
  }
}

/**
 * Inyecta la sesión en un manejador. Para las rutas que sólo necesitan saber quién es;
 * las que leen datos usan `DatosDelTenant`, que la toma sola.
 */
export const DeSesion = createParamDecorator((_: unknown, contexto: ExecutionContext): Sesion => {
  const pedido = contexto.switchToHttp().getRequest<PedidoConSesion>()
  if (!pedido.sesion) throw rechazo(401, 'NO_AUTENTICADO', 'Falta iniciar sesión')
  return pedido.sesion
})
