import { usarSesion } from './almacen.ts'
import { api } from './cliente.ts'

/**
 * Salir: cierra la sesión también del lado del servidor, que anula la familia entera de
 * tokens. Limpiar sólo el estado local dejaría la sesión viva del lado del servidor, que es
 * exactamente lo que alguien que dice «salir» no quiere.
 *
 * No navega: al quedar sin sesión, la raíz manda adonde corresponde.
 */
export async function salir(): Promise<void> {
  await api.auth.cerrar({}).catch(() => undefined)
  usarSesion.getState().limpiar()
}
