import { type ClaveMotivoEspera, ESPERA_DEL_ESTADO, MOTIVOS_ESPERA_INICIALES } from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull, sql } from '@gpb/db'
import { motivoEspera, ordenEspera, usuario } from '@gpb/db/schema'
import type { Sesion } from '../comun/contexto.ts'

/**
 * Las esperas del taller: por qué un auto está parado. Ver
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 */

type Motivo = typeof motivoEspera.$inferSelect

/**
 * Los motivos de la concesionaria, sembrados si todavía no tiene ninguno. Como los puntos de la
 * revisión: se siembran al pedirlos, así las concesionarias que ya existen los reciben sin una
 * migración, y el índice único de la clave hace que dos pedidos juntos no siembren dos veces.
 */
export async function motivosDelTaller(tx: Db, sesion: Sesion): Promise<Motivo[]> {
  const hay = await tx.select({ id: motivoEspera.id }).from(motivoEspera).limit(1)
  if (!hay.length) {
    await tx
      .insert(motivoEspera)
      .values(
        MOTIVOS_ESPERA_INICIALES.map((m, i) => ({
          tenantId: sesion.tenantId,
          clave: m.clave,
          nombre: m.nombre,
          orden: i + 1,
        })),
      )
      .onConflictDoNothing()
  }
  return tx.select().from(motivoEspera).orderBy(asc(motivoEspera.orden), asc(motivoEspera.id))
}

/** El motivo que abre un estado de la orden. Apagado o no, el estado lo usa: es del sistema. */
export async function motivoDeClave(tx: Db, sesion: Sesion, clave: ClaveMotivoEspera) {
  const motivos = await motivosDelTaller(tx, sesion)
  return motivos.find((m) => m.clave === clave)
}

/** La espera abierta de una orden, si tiene. */
export async function esperaAbierta(tx: Db, ordenId: string) {
  const [abierta] = await tx
    .select()
    .from(ordenEspera)
    .where(and(eq(ordenEspera.ordenId, ordenId), isNull(ordenEspera.hasta)))
    .for('update')
  return abierta
}

/** Cierra la espera abierta, si hay. Devuelve si había una. */
export async function cerrarEspera(tx: Db, sesion: Sesion, ordenId: string): Promise<boolean> {
  const cerradas = await tx
    .update(ordenEspera)
    .set({ hasta: sql`now()`, cerradaPor: sesion.usuarioId })
    .where(and(eq(ordenEspera.ordenId, ordenId), isNull(ordenEspera.hasta)))
    .returning({ id: ordenEspera.id })
  return cerradas.length > 0
}

/**
 * Pone la orden en espera por un motivo. **Un auto espera una cosa por vez**: si ya esperaba
 * otra, esa se cierra acá. Si ya esperaba esto mismo, queda como está —un «esperando repuesto»
 * repetido no parte la espera en dos—, salvo que traiga una nota nueva.
 */
export async function abrirEspera(
  tx: Db,
  sesion: Sesion,
  ordenId: string,
  motivoId: string,
  nota: string | null = null,
) {
  const abierta = await esperaAbierta(tx, ordenId)
  if (abierta?.motivoId === motivoId) {
    if (nota) await tx.update(ordenEspera).set({ nota }).where(eq(ordenEspera.id, abierta.id))
    return
  }
  if (abierta) await cerrarEspera(tx, sesion, ordenId)
  await tx.insert(ordenEspera).values({
    tenantId: sesion.tenantId,
    ordenId,
    motivoId,
    nota: nota || null,
    abiertaPor: sesion.usuarioId,
  })
}

/** Las esperas de una orden, de la primera a la última, con el nombre de quién las abrió y cerró. */
export async function esperasDe(tx: Db, ordenId: string) {
  const filas = await tx
    .select({
      id: ordenEspera.id,
      motivo: motivoEspera.nombre,
      nota: ordenEspera.nota,
      desde: ordenEspera.desde,
      hasta: ordenEspera.hasta,
      abiertaPor: ordenEspera.abiertaPor,
      cerradaPor: ordenEspera.cerradaPor,
    })
    .from(ordenEspera)
    .innerJoin(motivoEspera, eq(motivoEspera.id, ordenEspera.motivoId))
    .where(eq(ordenEspera.ordenId, ordenId))
    .orderBy(asc(ordenEspera.desde), asc(ordenEspera.id))

  const ids = [...new Set(filas.flatMap((f) => [f.abiertaPor, f.cerradaPor]).filter(Boolean))]
  const personas = ids.length
    ? await tx
        .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
        .from(usuario)
        .where(inArray(usuario.id, ids as string[]))
    : []
  const nombre = (id: string | null) => {
    const p = personas.find((x) => x.id === id)
    return p ? `${p.nombre} ${p.apellido}` : null
  }
  return filas.map((f) => ({
    id: f.id,
    motivo: f.motivo,
    nota: f.nota,
    desde: f.desde.toISOString(),
    hasta: f.hasta?.toISOString() ?? null,
    abiertaPor: nombre(f.abiertaPor),
    cerradaPor: nombre(f.cerradaPor),
  }))
}

/**
 * La espera que corresponde a un estado de la orden. Pasar a «esperando repuesto» o «esperando
 * autorización» abre la suya; cualquier otro estado —volvió a trabajo, se terminó, se anuló—
 * cierra la que hubiera. Así el estado y la espera no se contradicen nunca.
 */
export async function esperaSegunEstado(tx: Db, sesion: Sesion, ordenId: string, estado: string) {
  const clave = (ESPERA_DEL_ESTADO as Record<string, ClaveMotivoEspera | undefined>)[estado]
  if (!clave) {
    await cerrarEspera(tx, sesion, ordenId)
    return
  }
  const motivo = await motivoDeClave(tx, sesion, clave)
  if (motivo) await abrirEspera(tx, sesion, ordenId, motivo.id)
}

/** El estado al que lleva un motivo, si es de los que tienen uno. */
export function estadoDelMotivo(clave: string | null): string | undefined {
  return Object.entries(ESPERA_DEL_ESTADO).find(([, c]) => c === clave)?.[0]
}
