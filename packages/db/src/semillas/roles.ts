import {
  cambiosEnPalabras,
  diferenciaDePermisos,
  mismasReglas,
  novedadDeRol,
  type ReglaPermiso,
  ROLES_PREDEFINIDOS,
  type RolPredefinido,
  separarReglas,
} from '@gpb/core'
import { asc, eq } from 'drizzle-orm'
import type { Db } from '../index.ts'
import { aviso, rol, tenant, usuarioRol } from '../schema/index.ts'

/**
 * Los roles predefinidos, listos para insertar en una concesionaria nueva. Cada uno sabe
 * de qué predefinido salió y qué versión conoce: sin eso, lo que el sistema le cambie
 * después no le llega nunca.
 */
export function rolesPredefinidosPara(tenantId: string) {
  return ROLES_PREDEFINIDOS.map((r) => filaDe(tenantId, r))
}

function filaDe(tenantId: string, r: RolPredefinido) {
  return {
    tenantId,
    nombre: r.nombre,
    descripcion: r.descripcion,
    habilidades: r.habilidades,
    predefinido: r.clave,
    versionSistema: r.habilidades,
  }
}

export interface ResultadoSincronizacion {
  /** «Concesionaria: rol», uno por línea del resumen. */
  creados: string[]
  actualizados: string[]
  /** Los editó la concesionaria: la versión nueva la ofrece la pantalla de Roles. */
  pendientes: string[]
  /** Faltaba el predefinido, pero ya hay un rol propio con ese nombre. */
  omitidos: string[]
}

/**
 * Lleva los roles predefinidos de cada concesionaria a la versión del sistema.
 *
 * - **El que falta se crea**, salvo que la concesionaria ya tenga un rol propio con ese
 *   nombre: ése es suyo, y no se pisa.
 * - **El que nadie tocó se actualiza solo**, y a cada uno que lo tiene le llega un aviso
 *   con qué ganó y qué perdió.
 * - **El que la concesionaria editó no se toca.** Quién lo modificó sabía algo que el
 *   sistema no sabe; la pantalla de Roles le muestra la versión nueva y decide.
 *
 * Corre después de las migraciones, con el dueño del esquema. Se puede correr las veces
 * que haga falta: lo que ya está al día no cambia.
 */
export async function sincronizarRolesPredefinidos(db: Db): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = {
    creados: [],
    actualizados: [],
    pendientes: [],
    omitidos: [],
  }
  const concesionarias = await db
    .select({ id: tenant.id, nombre: tenant.nombre })
    .from(tenant)
    .orderBy(asc(tenant.nombre))

  for (const t of concesionarias) {
    await db.transaction(async (tx) => {
      const roles = await tx.select().from(rol).where(eq(rol.tenantId, t.id))

      for (const predefinido of ROLES_PREDEFINIDOS) {
        const linea = `${t.nombre}: ${predefinido.nombre}`
        const actual = roles.find((r) => r.predefinido === predefinido.clave)

        if (!actual) {
          if (roles.some((r) => r.nombre === predefinido.nombre)) {
            resultado.omitidos.push(linea)
            continue
          }
          await tx.insert(rol).values(filaDe(t.id, predefinido))
          resultado.creados.push(linea)
          continue
        }

        const reglas = actual.habilidades as ReglaPermiso[]
        const conocida = (actual.versionSistema ?? reglas) as ReglaPermiso[]
        if (!novedadDeRol(conocida, predefinido.habilidades)) continue
        if (!mismasReglas(reglas, conocida)) {
          resultado.pendientes.push(linea)
          continue
        }

        await tx
          .update(rol)
          .set({ habilidades: predefinido.habilidades, versionSistema: predefinido.habilidades })
          .where(eq(rol.id, actual.id))
        await avisar(tx, t.id, actual.id, actual.nombre, reglas, predefinido.habilidades)
        resultado.actualizados.push(linea)
      }
    })
  }

  return resultado
}

async function avisar(
  tx: Db,
  tenantId: string,
  rolId: string,
  nombre: string,
  antes: ReglaPermiso[],
  despues: ReglaPermiso[],
) {
  const { agregados, quitados } = diferenciaDePermisos(
    separarReglas(antes).permisos,
    separarReglas(despues).permisos,
  )
  // Si sólo cambió una regla especial, la grilla no cambia y no hay nada que contar.
  if (!agregados.length && !quitados.length) return

  const titulares = await tx
    .select({ id: usuarioRol.usuarioId })
    .from(usuarioRol)
    .where(eq(usuarioRol.rolId, rolId))
  if (titulares.length === 0) return

  const texto = `El sistema actualizó el rol ${nombre}: ${cambiosEnPalabras(agregados, quitados)}.`
  await tx.insert(aviso).values(titulares.map((u) => ({ tenantId, usuarioId: u.id, texto })))
}
