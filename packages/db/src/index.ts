import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import { VAR_IP, VAR_TENANT, VAR_USUARIO } from './rls/tablas.ts'
import * as schema from './schema/index.ts'

// Reexportado a propósito: la API construye consultas sin depender de drizzle ni
// de pg por su cuenta. Si mañana cambia el driver, cambia acá y en ningún otro lado.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
export type { Pool } from 'pg'
export * from './modulos.ts'
export * from './rls/index.ts'
export * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>

export function crearPool(url: string, extra: PoolConfig = {}): Pool {
  return new Pool({ connectionString: url, ...extra })
}

export function crearDb(pool: Pool): Db {
  return drizzle(pool, { schema, casing: 'snake_case' })
}

/**
 * Ejecuta el callback dentro de una transacción con el tenant fijado en la sesión.
 *
 * Todo acceso a datos de un cliente pasa por acá. Fuera de esta función las
 * políticas de RLS no tienen contra qué comparar y cualquier consulta revienta,
 * que es exactamente lo que queremos: el aislamiento no depende de que nadie se
 * olvide un WHERE.
 *
 * Dos detalles que importan:
 *
 *  - Se usa `set_config(..., true)` y no `SET LOCAL` porque el valor va como
 *    parámetro. `SET LOCAL` no admite parámetros y obligaría a interpolar el uuid
 *    en el texto de la sentencia.
 *  - El `true` final lo hace local a la transacción, así la conexión vuelve limpia
 *    al pool y no se lleva el tenant puesto a la consulta del siguiente request.
 */
export interface QuienPide {
  /** Para que el trigger de auditoría sepa de quién fue el cambio. */
  usuarioId?: string | undefined
  ip?: string | undefined
}

export async function conTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>,
  quien: QuienPide = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${VAR_TENANT}, ${tenantId}, true)`)
    // Opcionales: una migración o una semilla cambian datos sin que haya nadie sentado.
    // El trigger escribe la fila igual, sin autor — perder el cambio porque no sabemos
    // quién fue sería exactamente al revés.
    await tx.execute(sql`select set_config(${VAR_USUARIO}, ${quien.usuarioId ?? ''}, true)`)
    await tx.execute(sql`select set_config(${VAR_IP}, ${quien.ip ?? ''}, true)`)
    return fn(tx as unknown as Db)
  })
}
export * from './semillas/catalogos.ts'
export * from './semillas/sembrar.ts'
