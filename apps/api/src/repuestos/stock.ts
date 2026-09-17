import { type Importe, plata } from '@gpb/core'
import { and, type Db, eq, inArray, sql } from '@gpb/db'
import { movimientoStock, repuesto, repuestoStock, repuestosSecuencia } from '@gpb/db/schema'
import type { Sesion } from '../comun/contexto.ts'

type Decimal = Importe

export type TipoMovimiento =
  | 'inicial'
  | 'ajuste'
  | 'compra'
  | 'orden'
  | 'mostrador'
  | 'transferencia'

export interface Movimiento {
  repuestoId: string
  sucursalId: string
  /** Con signo: entra positivo, sale negativo. */
  cantidad: Decimal | string
  tipo: TipoMovimiento
  costoUnitario?: string | null
  ordenId?: string | null
  pedidoId?: string | null
  compraId?: string | null
  otraSucursalId?: string | null
  motivo?: string | null
}

/**
 * La única forma de mover stock: suma en la fila de la sucursal y anota el movimiento con el
 * saldo que quedó, en la misma transacción. La suma la hace Postgres sobre la fila bloqueada,
 * así que dos salidas a la vez no se pisan.
 *
 * Devuelve el saldo. Puede ser negativo, y está bien: ver `repuesto_stock`.
 */
export async function moverStock(tx: Db, sesion: Sesion, m: Movimiento): Promise<string> {
  const cantidad = plata(m.cantidad.toString())
  if (cantidad.isZero()) throw new Error('Un movimiento de stock en cero no mueve nada.')
  const valor = cantidad.toFixed(4)
  const [fila] = await tx
    .insert(repuestoStock)
    .values({
      tenantId: sesion.tenantId,
      repuestoId: m.repuestoId,
      sucursalId: m.sucursalId,
      cantidad: valor,
    })
    .onConflictDoUpdate({
      target: [repuestoStock.sucursalId, repuestoStock.repuestoId],
      set: {
        cantidad: sql`${repuestoStock.cantidad} + ${valor}::numeric`,
        actualizadoEn: new Date(),
      },
    })
    .returning({ saldo: repuestoStock.cantidad })
  if (!fila) throw new Error('No se pudo mover el stock.')

  await tx.insert(movimientoStock).values({
    tenantId: sesion.tenantId,
    repuestoId: m.repuestoId,
    sucursalId: m.sucursalId,
    tipo: m.tipo,
    cantidad: valor,
    saldo: fila.saldo,
    costoUnitario: m.costoUnitario ?? null,
    ordenId: m.ordenId ?? null,
    pedidoId: m.pedidoId ?? null,
    compraId: m.compraId ?? null,
    otraSucursalId: m.otraSucursalId ?? null,
    motivo: m.motivo ?? null,
    usuarioId: sesion.usuarioId,
  })
  return fila.saldo
}

/** Cuánto de cada repuesto del catálogo hay en una lista de renglones. Los sueltos no cuentan. */
export function porRepuesto(
  items: ReadonlyArray<{ repuestoId?: string | null | undefined; cantidad: string }>,
) {
  const suma = new Map<string, Decimal>()
  for (const i of items) {
    if (!i.repuestoId) continue
    suma.set(i.repuestoId, (suma.get(i.repuestoId) ?? plata('0')).plus(plata(i.cantidad)))
  }
  return suma
}

/**
 * Mueve la diferencia entre lo que había cargado y lo que queda: sumar una pieza a una orden
 * la saca del depósito, sacarla la devuelve. Lo que no cambió no deja movimiento.
 */
export async function moverDiferencia(
  tx: Db,
  sesion: Sesion,
  antes: Map<string, Decimal>,
  despues: Map<string, Decimal>,
  base: Omit<Movimiento, 'repuestoId' | 'cantidad'>,
) {
  for (const id of new Set([...antes.keys(), ...despues.keys()])) {
    const salen = (despues.get(id) ?? plata('0')).minus(antes.get(id) ?? plata('0'))
    if (!salen.isZero())
      await moverStock(tx, sesion, { ...base, repuestoId: id, cantidad: salen.negated() })
  }
}

/** Todos los ids existen en el catálogo de la concesionaria. RLS se encarga del resto. */
export async function repuestosExisten(tx: Db, ids: Iterable<string>) {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return true
  const filas = await tx
    .select({ id: repuesto.id })
    .from(repuesto)
    .where(inArray(repuesto.id, unicos))
  return filas.length === unicos.length
}

/** Lo que hay de cada repuesto en una sucursal. */
export async function stockEn(tx: Db, sucursalId: string, ids: string[]) {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return new Map<string, string>()
  const filas = await tx
    .select({ id: repuestoStock.repuestoId, cantidad: repuestoStock.cantidad })
    .from(repuestoStock)
    .where(and(eq(repuestoStock.sucursalId, sucursalId), inArray(repuestoStock.repuestoId, unicos)))
  return new Map(filas.map((f) => [f.id, f.cantidad]))
}

/** El número siguiente de pedido o de compra de la sucursal, atómico. */
export async function siguienteNumero(tx: Db, sesion: Sesion, tipo: 'pedido' | 'compra') {
  const [fila] = await tx
    .insert(repuestosSecuencia)
    .values({ tenantId: sesion.tenantId, sucursalId: sesion.sucursalId, tipo, ultimo: 1 })
    .onConflictDoUpdate({
      target: [repuestosSecuencia.sucursalId, repuestosSecuencia.tipo],
      set: { ultimo: sql`${repuestosSecuencia.ultimo} + 1` },
    })
    .returning({ ultimo: repuestosSecuencia.ultimo })
  if (!fila) throw new Error('No se pudo numerar.')
  return fila.ultimo
}

/** «000045». */
export const seis = (n: number) => String(n).padStart(6, '0')
