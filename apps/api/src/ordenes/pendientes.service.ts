import { and, type Db, desc, eq, isNull } from '@gpb/db'
import { orden, vehiculoPendiente } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorPendientes extends Error {
  constructor(readonly codigo: 'NO_ENCONTRADO') {
    super(codigo)
  }
}

/** Los pendientes sin resolver de un vehículo, los más nuevos primero. */
export async function pendientesDe(tx: Db, vehiculoId: string) {
  const filas = await tx
    .select({ p: vehiculoPendiente, numero: orden.numero })
    .from(vehiculoPendiente)
    .innerJoin(orden, eq(orden.id, vehiculoPendiente.ordenId))
    .where(and(eq(vehiculoPendiente.vehiculoId, vehiculoId), isNull(vehiculoPendiente.resueltoEn)))
    .orderBy(desc(vehiculoPendiente.creadoEn))
  return filas.map(({ p, numero }) => ({
    id: p.id,
    descripcion: p.descripcion,
    origen: p.origen as 'presupuesto' | 'revision',
    semaforo: p.semaforo as 'ambar' | 'rojo' | null,
    informadoEn: p.creadoEn.toISOString(),
    orden: { id: p.ordenId, numero },
  }))
}

/**
 * Lo que se le recomendó a un vehículo y no se hizo. Se anota al entregarlo
 * (`ServicioOrdenes.entregar`), se suma a la orden siguiente al abrirla, o se descarta acá.
 */
@Injectable()
export class ServicioPendientes {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(vehiculoId: string) {
    return this.datos.transaccion(async (tx) => ({ datos: await pendientesDe(tx, vehiculoId) }))
  }

  descartar(id: string, motivo: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [descartado] = await tx
        .update(vehiculoPendiente)
        .set({
          resueltoEn: new Date(),
          resolucion: 'descartado',
          motivo,
          resueltoPor: sesion.usuarioId,
        })
        .where(and(eq(vehiculoPendiente.id, id), isNull(vehiculoPendiente.resueltoEn)))
        .returning({ id: vehiculoPendiente.id })
      if (!descartado) throw new ErrorPendientes('NO_ENCONTRADO')
      return { hecho: true as const }
    })
  }
}
