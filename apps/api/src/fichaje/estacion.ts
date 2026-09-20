import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { conTenant, type Db, sql } from '@gpb/db'
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'
import { DB } from '../comun/simbolos.ts'

/**
 * La estación de fichaje que está pidiendo.
 *
 * Es el equivalente de `Sesion` para la pantalla del taller, y es **otra cosa a propósito**:
 * ahí no hay persona, así que no hay `usuarioId` ni habilidades. Lo que se autentica es el
 * aparato —regla 10 de `docs/tecnicos/taller-control-de-tiempos.md`— y quién ficha se sabe
 * recién cuando alguien pasa su credencial por el lector.
 */
export interface Estacion {
  id: string
  tenantId: string
  sucursalId: string
  tipo: 'taller' | 'reloj'
  nombre: string
  ip?: string | undefined
}

export interface PedidoConEstacion extends FastifyRequest {
  estacion?: Estacion
}

const almacen = new AsyncLocalStorage<Estacion>()

export function contextoDeLaEstacion(): Estacion {
  const estacion = almacen.getStore()
  if (!estacion) {
    throw new Error(
      'No hay estación en este contexto. Las rutas de fichaje se declaran con conEstacion().',
    )
  }
  return estacion
}

/** Para los tests, que no pasan por la guardia. */
export function enEstacion<T>(estacion: Estacion, fn: () => T): T {
  return almacen.run(estacion, fn)
}

/** El mismo interceptor que el de la sesión, para el otro contexto. */
@Injectable()
export class InterceptorEstacion implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const { estacion } = contexto.switchToHttp().getRequest<PedidoConEstacion>()
    if (!estacion) return siguiente.handle()
    return new Observable((suscriptor) =>
      almacen.run(estacion, () => siguiente.handle().subscribe(suscriptor)),
    )
  }
}

/**
 * El token de una estación: 32 bytes al azar en base64url.
 *
 * Va en la dirección que se abre en la PC del taller, así que tiene que entrar en una URL sin
 * escaparse. Se muestra **una sola vez**: de la base sale su hash.
 */
export function generarToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Iguales en tiempo constante: comparar hashes con `===` filtra por dónde empezaron a diferir. */
export function mismoHash(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Lo que devuelve `autenticar_estacion`, en el vocabulario de Postgres. */
interface FilaEstacion extends Record<string, unknown> {
  estacion_id: string
  tenant_id: string
  sucursal_id: string
  tipo: string
  nombre: string
}

/**
 * Resuelve el token contra la base, **sin tenant**.
 *
 * Es el mismo problema que el inicio de sesión: la estación se identifica antes de que sepamos
 * de qué concesionaria es, así que no hay nada contra lo cual filtrar. La salida es la misma
 * que allá: una función `security definer` que devuelve lo mínimo y nada más
 * (`autenticar_estacion`, en `packages/db/src/rls/sql.ts`).
 */
@Injectable()
export class AutenticadorDeEstaciones {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolver(token: string): Promise<Estacion | null> {
    const { rows } = await this.db.execute<FilaEstacion>(
      sql`select * from autenticar_estacion(${hashDeToken(token)})`,
    )
    const fila = rows[0]
    if (!fila) return null
    return {
      id: fila.estacion_id,
      tenantId: fila.tenant_id,
      sucursalId: fila.sucursal_id,
      tipo: fila.tipo === 'reloj' ? 'reloj' : 'taller',
      nombre: fila.nombre,
    }
  }
}

/**
 * El acceso a los datos de la concesionaria **de la estación**, sin usuario.
 *
 * Es el gemelo de `DatosDelTenant` y, como aquél, no recibe el tenant: lo toma del contexto.
 * `conTenant` acepta pedidos sin usuario —una migración o una semilla tampoco lo tienen— y el
 * trigger de auditoría escribe la fila igual, sin autor. Para el fichaje eso está bien: quién
 * fichó no se guarda en `usuario_id` sino en la propia sesión de trabajo, con su empleado.
 */
@Injectable()
export class DatosDeLaEstacion {
  constructor(@Inject(DB) private readonly db: Db) {}

  transaccion<T>(fn: (tx: Db, estacion: Estacion) => Promise<T>): Promise<T> {
    const estacion = contextoDeLaEstacion()
    return conTenant(this.db, estacion.tenantId, (tx) => fn(tx, estacion), { ip: estacion.ip })
  }
}
