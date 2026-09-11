import type { Db } from '../index.ts'
import { condicionIva, provincia, reglaComprobante, tipoComprobante } from '../schema/index.ts'
import { CONDICIONES_IVA, PROVINCIAS, REGLAS_COMPROBANTE, TIPOS_COMPROBANTE } from './catalogos.ts'

/**
 * Los catálogos compartidos. Idempotente: se puede correr las veces que haga falta.
 *
 * Está acá y no sólo en el script para que los tests siembren exactamente lo mismo que
 * la base de desarrollo. Dos caminos de siembra distintos terminan siempre en un test
 * que pasa contra datos que en la realidad no existen.
 */
export async function sembrarCatalogos(db: Db): Promise<void> {
  await db.insert(provincia).values(PROVINCIAS).onConflictDoNothing()
  await db.insert(condicionIva).values(CONDICIONES_IVA).onConflictDoNothing()
  await db.insert(tipoComprobante).values(TIPOS_COMPROBANTE).onConflictDoNothing()
  await db.insert(reglaComprobante).values(REGLAS_COMPROBANTE).onConflictDoNothing()
}
