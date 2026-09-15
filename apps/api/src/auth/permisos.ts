import { type ReglaPermiso, resolverCondiciones } from '@garagepro/core'
import { type Db, eq } from '@garagepro/db'
import { rol, tenant, usuario, usuarioRol } from '@garagepro/db/schema'

/**
 * Las reglas de CASL de un usuario, ya resueltas contra quién es y dónde está.
 *
 * Devuelve `null` si el usuario o su concesionaria ya no están activos. Es la misma
 * consulta para abrir una sesión, renovarla y autorizar cada pedido: si fueran tres,
 * alguna se olvidaría de mirar si el usuario fue dado de baja.
 *
 * Corre dentro de una transacción con el tenant ya fijado.
 */
export async function reglasDelUsuario(
  tx: Db,
  datos: { usuarioId: string; sucursalId: string; tenantId: string },
): Promise<ReglaPermiso[] | null> {
  const [estado] = await tx
    .select({ usuarioActivo: usuario.activo, tenantActivo: tenant.activo })
    .from(usuario)
    .innerJoin(tenant, eq(tenant.id, usuario.tenantId))
    .where(eq(usuario.id, datos.usuarioId))
    .limit(1)

  if (!estado?.usuarioActivo || !estado.tenantActivo) return null

  const roles = await tx
    .select({ habilidades: rol.habilidades })
    .from(usuarioRol)
    .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
    .where(eq(usuarioRol.usuarioId, datos.usuarioId))

  // Las condiciones traen marcadores como `${usuarioId}`, que sólo se pueden resolver
  // ahora que sabemos quién es.
  return resolverCondiciones(
    roles.flatMap((r) => (r.habilidades as ReglaPermiso[]) ?? []),
    datos,
  )
}
