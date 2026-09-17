import { type Db, sql } from '@gpb/db'
import { auditoria } from '@gpb/db/schema'
import type { Sesion } from './contexto.ts'

/**
 * Anotar un cambio en la auditoría. **Es el único lugar del sistema que escribe esa tabla.**
 *
 * Antes cada servicio tenía su propia copia del `insert`: once copias del mismo párrafo, con
 * siete parámetros posicionales y dos `unknown` pegados —`datosAntes` y `datosDespues`—, que
 * es una invitación a intercambiarlos sin que nada se queje. Acá van con nombre.
 *
 * Que haya un solo punto de contacto es además lo que hace barato el paso siguiente: pasar la
 * auditoría a triggers de Postgres es cambiar este archivo, no dieciséis llamadas.
 */

/**
 * Las tablas que la pantalla de Auditoría sabe contar.
 *
 * Es una unión cerrada a propósito: `sobreQue()` y `describirCambio()` tienen una frase para
 * cada una, y la tabla que no esté acá se mostraría en la pantalla como el nombre pelado de
 * una tabla de Postgres. Agregar una es sumarla acá **y** darle su frase; hay un test que
 * verifica que no falte ninguna.
 */
export type TablaAuditada =
  | 'empresa'
  | 'sucursal'
  | 'punto_venta'
  | 'cliente'
  | 'proveedor'
  | 'certificado_afip'
  | 'comprobante'
  | 'orden'
  | 'repuesto'
  | 'pedido_repuestos'
  | 'compra'
  | 'rol'
  | 'usuario'
  | 'vehiculo'
  | 'titularidad'
  | 'dispositivo'

export type AccionAuditada = 'alta' | 'modificacion' | 'baja'

export interface Anotacion {
  tabla: TablaAuditada
  registroId: string
  accion: AccionAuditada
  /**
   * Cómo estaba antes y cómo quedó. La auditoría guarda los datos tal cual y **no la frase**:
   * cómo se cuentan puede mejorar sin reescribir la historia. Los módulos que sí anotan una
   * frase la ponen en `despues.texto`, porque la operación sabe mejor que nadie qué pasó.
   */
  antes?: unknown
  despues?: unknown
  ip?: string | undefined
}

/** Una anotación o varias del mismo movimiento: anular una orden anula todos sus pedidos. */
export async function auditar(
  tx: Db,
  sesion: Sesion,
  anotacion: Anotacion | readonly Anotacion[],
): Promise<void> {
  const anotaciones = Array.isArray(anotacion) ? anotacion : [anotacion as Anotacion]
  if (anotaciones.length === 0) return

  await tx.insert(auditoria).values(
    anotaciones.map((a) => ({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: a.tabla,
      registroId: a.registroId,
      accion: a.accion,
      datosAntes: a.antes ?? null,
      datosDespues: a.despues ?? null,
      ip: a.ip ?? sesion.ip ?? null,
      // La misma transacción que firmó el trigger: es lo que junta esta narración con los
      // cambios crudos que dejó la misma operación, sin tener que adivinar por fecha.
      transaccion: sql<string>`pg_current_xact_id()::text`,
    })),
  )
}
