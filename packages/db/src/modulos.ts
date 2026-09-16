import { MODULOS, type Modulo } from '@garagepro/core'
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import type { Db } from './index.ts'
import { tenantModulo } from './schema/index.ts'

/**
 * Los módulos prendidos **hoy** para la concesionaria de la transacción.
 *
 * Prendido es las tres cosas juntas: la llave en `activo`, el período ya empezado y no
 * vencido. Vive acá, al lado de la tabla, porque la leen la API y el back-office, y dos
 * versiones de «vigente» terminan diciendo cosas distintas el día que vence un contrato.
 *
 * Corre dentro de `conTenant()`: RLS limita las filas a esa concesionaria.
 */
export async function modulosVigentes(tx: Db): Promise<Modulo[]> {
  const ahora = sql`now()`
  const filas = await tx
    .select({ modulo: tenantModulo.modulo })
    .from(tenantModulo)
    .where(
      and(
        eq(tenantModulo.activo, true),
        lte(tenantModulo.vigenteDesde, ahora),
        or(isNull(tenantModulo.vigenteHasta), gt(tenantModulo.vigenteHasta, ahora)),
      ),
    )

  // El orden del catálogo y no el de la base: el que lee la lista no tiene por qué
  // depender de en qué orden se contrataron.
  const prendidos = new Set(filas.map((f) => f.modulo))
  return MODULOS.filter((m) => prendidos.has(m))
}
