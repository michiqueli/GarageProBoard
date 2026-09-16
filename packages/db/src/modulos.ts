import { MODULOS, type Modulo } from '@gpb/core'
import { and, eq, gt, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from './index.ts'
import { tenantModulo } from './schema/index.ts'

/**
 * Cuándo un módulo contratado está prendido **hoy**: la llave en `activo`, el período ya
 * empezado y no vencido.
 *
 * Es la única definición de «vigente» del sistema. La usan la API, para decidir, y el
 * back-office, para mostrar; dos versiones terminan diciendo cosas distintas justo el
 * día que vence un contrato.
 */
export function condicionVigente(): SQL {
  const ahora = sql`now()`
  return and(
    eq(tenantModulo.activo, true),
    lte(tenantModulo.vigenteDesde, ahora),
    or(isNull(tenantModulo.vigenteHasta), gt(tenantModulo.vigenteHasta, ahora)),
  ) as SQL
}

/**
 * Los módulos prendidos hoy para la concesionaria de la transacción.
 *
 * Corre dentro de `conTenant()`: RLS limita las filas a esa concesionaria.
 */
export async function modulosVigentes(tx: Db): Promise<Modulo[]> {
  const filas = await tx
    .select({ modulo: tenantModulo.modulo })
    .from(tenantModulo)
    .where(condicionVigente())

  return enOrden(filas.map((f) => f.modulo))
}

/**
 * En el orden del catálogo y no en el de la base: quien lee la lista no tiene por qué
 * depender de en qué orden se contrataron.
 */
export function enOrden(modulos: Iterable<string>): Modulo[] {
  const presentes = new Set(modulos)
  return MODULOS.filter((m) => presentes.has(m))
}
