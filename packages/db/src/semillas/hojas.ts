import { HOJAS_POR_OMISION, TIPOS_HOJA, type TipoHoja } from '@gpb/core'
import { isNull } from 'drizzle-orm'
import type { Db } from '../index.ts'
import { hojaImagen, tenant } from '../schema/index.ts'

/** La fila del dibujo por omisión de una carrocería, lista para insertar. */
export function hojaPorOmisionPara(tenantId: string, tipo: TipoHoja) {
  const archivo = HOJAS_POR_OMISION[tipo]
  return {
    tenantId,
    tipo,
    ruta: archivo.ruta,
    formato: archivo.formato,
    ancho: archivo.ancho,
    alto: archivo.alto,
    bytes: archivo.bytes,
    porOmision: true,
  }
}

/** Los cuatro, para una concesionaria nueva. */
export function hojasPorOmisionPara(tenantId: string) {
  return TIPOS_HOJA.map((tipo) => hojaPorOmisionPara(tenantId, tipo))
}

/**
 * Le pone el dibujo que trae el sistema a cada carrocería que no tiene ninguno vigente, en
 * cada concesionaria. Así un taller que recién entra recibe un auto el primer día, y uno que
 * quitó el suyo vuelve al de VW.
 *
 * Corre después de las migraciones, con el dueño del esquema. Lo que ya tiene dibujo —propio o
 * por omisión— no se toca. Devuelve cuántos puso.
 */
export async function sembrarHojasPorOmision(db: Db): Promise<number> {
  const concesionarias = await db.select({ id: tenant.id }).from(tenant)
  const vigentes = await db
    .select({ tenantId: hojaImagen.tenantId, tipo: hojaImagen.tipo })
    .from(hojaImagen)
    .where(isNull(hojaImagen.reemplazadaEn))
  const tiene = new Set(vigentes.map((v) => `${v.tenantId}:${v.tipo}`))

  const faltan = concesionarias.flatMap((t) =>
    TIPOS_HOJA.filter((tipo) => !tiene.has(`${t.id}:${tipo}`)).map((tipo) =>
      hojaPorOmisionPara(t.id, tipo),
    ),
  )
  if (faltan.length === 0) return 0
  await db.insert(hojaImagen).values(faltan).onConflictDoNothing()
  return faltan.length
}
