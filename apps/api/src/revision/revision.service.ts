import { PUNTOS_REVISION_INICIALES, SECCIONES_REVISION, type SeccionRevision } from '@gpb/core'
import { asc, type Db, eq, sql } from '@gpb/db'
import { revisionPunto } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorRevision extends Error {
  constructor(readonly codigo: 'NO_ENCONTRADO') {
    super(codigo)
  }
}

type Punto = typeof revisionPunto.$inferSelect

/**
 * Los puntos de la concesionaria, sembrados si todavía no tiene ninguno.
 *
 * **Se siembra al pedirlos y no al dar de alta la concesionaria**, por dos motivos. Uno: las
 * concesionarias que ya existen los reciben sin una migración que repita la lista en SQL, y la
 * lista sigue viviendo en un solo lugar, `@gpb/core`. Dos: el back-office no necesita permiso
 * para escribir una tabla más de la concesionaria, que es justo lo que se le restringe.
 *
 * Que tenga alguno, aunque estén todos apagados, alcanza para no sembrar: un punto no se borra
 * nunca, así que «no tiene ninguno» sólo puede querer decir «nunca los tuvo». Y si dos pedidos
 * llegan juntos la primera vez, el índice único de la clave hace que el segundo no inserte nada.
 */
export async function puntosDelTaller(tx: Db, sesion: Sesion): Promise<Punto[]> {
  const ordenados = () =>
    tx.select().from(revisionPunto).orderBy(asc(revisionPunto.seccion), asc(revisionPunto.orden))

  const hay = await tx.select({ id: revisionPunto.id }).from(revisionPunto).limit(1)
  if (!hay.length) {
    const enSeccion = new Map<SeccionRevision, number>()
    await tx
      .insert(revisionPunto)
      .values(
        PUNTOS_REVISION_INICIALES.map((p) => {
          const n = (enSeccion.get(p.seccion) ?? 0) + 1
          enSeccion.set(p.seccion, n)
          return {
            tenantId: sesion.tenantId,
            clave: p.clave,
            seccion: p.seccion,
            nombre: p.nombre,
            orden: n,
          }
        }),
      )
      .onConflictDoNothing()
  }
  return enOrdenDeHoja(await ordenados())
}

/** Por sección en el orden de la hoja —no el alfabético— y dentro de cada una, en el suyo. */
export function enOrdenDeHoja<T extends { seccion: string; orden: number }>(puntos: T[]): T[] {
  const lugar = (s: string) => SECCIONES_REVISION.indexOf(s as SeccionRevision)
  return [...puntos].sort((a, b) => lugar(a.seccion) - lugar(b.seccion) || a.orden - b.orden)
}

/**
 * El catálogo de puntos que se revisan. Sin baja: un punto que no se usa más se apaga, porque
 * hay órdenes firmadas que lo contestaron.
 */
@Injectable()
export class ServicioRevision {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar() {
    return this.datos.transaccion(async (tx, sesion) => salida(await puntosDelTaller(tx, sesion)))
  }

  crear(seccion: SeccionRevision, nombre: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await puntosDelTaller(tx, sesion)
      // El último de su sección más uno. Dos altas a la vez pueden empatar, y no rompe nada:
      // quedan con el mismo número, se ordenan por cuándo se crearon, y «mover» los separa.
      const [ultimo] = await tx
        .select({ n: sql<number>`coalesce(max(${revisionPunto.orden}), 0)::int` })
        .from(revisionPunto)
        .where(eq(revisionPunto.seccion, seccion))
      await tx.insert(revisionPunto).values({
        tenantId: sesion.tenantId,
        seccion,
        nombre,
        orden: (ultimo?.n ?? 0) + 1,
      })
      return salida(await puntosDelTaller(tx, sesion))
    })
  }

  editar(id: string, nombre: string, activo: boolean) {
    return this.datos.transaccion(async (tx, sesion) => {
      const cambiados = await tx
        .update(revisionPunto)
        .set({ nombre, activo, actualizadoEn: new Date() })
        .where(eq(revisionPunto.id, id))
        .returning({ id: revisionPunto.id })
      if (!cambiados.length) throw new ErrorRevision('NO_ENCONTRADO')
      return salida(await puntosDelTaller(tx, sesion))
    })
  }

  /**
   * Cambia de lugar con el vecino de su sección; en la punta, no hace nada.
   *
   * Renumera la sección entera en vez de intercambiar dos números: dos altas a la vez pueden
   * haber quedado con el mismo, y un intercambio entre iguales no movería nada.
   */
  mover(id: string, hacia: 'arriba' | 'abajo') {
    return this.datos.transaccion(async (tx, sesion) => {
      const [p] = await tx.select().from(revisionPunto).where(eq(revisionPunto.id, id))
      if (!p) throw new ErrorRevision('NO_ENCONTRADO')
      const seccion = await tx
        .select({ id: revisionPunto.id, orden: revisionPunto.orden })
        .from(revisionPunto)
        .where(eq(revisionPunto.seccion, p.seccion))
        .orderBy(asc(revisionPunto.orden), asc(revisionPunto.creadoEn))
        .for('update')
      const i = seccion.findIndex((x) => x.id === id)
      const j = hacia === 'arriba' ? i - 1 : i + 1
      const [a, b] = [seccion[i], seccion[j]]
      if (a && b) {
        seccion[i] = b
        seccion[j] = a
        for (const [n, x] of seccion.entries()) {
          if (x.orden !== n + 1) {
            await tx
              .update(revisionPunto)
              .set({ orden: n + 1 })
              .where(eq(revisionPunto.id, x.id))
          }
        }
      }
      return salida(await puntosDelTaller(tx, sesion))
    })
  }
}

function salida(puntos: Punto[]) {
  return {
    datos: puntos.map((p) => ({
      id: p.id,
      seccion: p.seccion as SeccionRevision,
      nombre: p.nombre,
      orden: p.orden,
      activo: p.activo,
      propio: p.clave === null,
    })),
  }
}
