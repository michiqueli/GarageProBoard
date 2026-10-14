import { contrato } from '@gpb/contracts'
import { eq, sql } from '@gpb/db'
import { motivoEspera } from '@gpb/db/schema'
import { Controller, Inject, Injectable } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'
import { motivosDelTaller } from './esperas.ts'

class MotivoNoEncontrado extends Error {}

function salida(motivos: Array<typeof motivoEspera.$inferSelect>) {
  return {
    datos: motivos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      activo: m.activo,
      propio: m.clave === null,
    })),
  }
}

/**
 * El catálogo de motivos de espera. Sin baja: uno que no se usa más se apaga, porque hay esperas
 * que lo usaron.
 */
@Injectable()
export class ServicioMotivosEspera {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar() {
    return this.datos.transaccion(async (tx, sesion) => salida(await motivosDelTaller(tx, sesion)))
  }

  crear(nombre: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await motivosDelTaller(tx, sesion)
      const [ultimo] = await tx
        .select({ n: sql<number>`coalesce(max(${motivoEspera.orden}), 0)::int` })
        .from(motivoEspera)
      await tx
        .insert(motivoEspera)
        .values({ tenantId: sesion.tenantId, nombre, orden: (ultimo?.n ?? 0) + 1 })
      return salida(await motivosDelTaller(tx, sesion))
    })
  }

  editar(id: string, nombre: string, activo: boolean) {
    return this.datos.transaccion(async (tx, sesion) => {
      const cambiados = await tx
        .update(motivoEspera)
        .set({ nombre, activo, actualizadoEn: new Date() })
        .where(eq(motivoEspera.id, id))
        .returning({ id: motivoEspera.id })
      if (!cambiados.length) throw new MotivoNoEncontrado()
      return salida(await motivosDelTaller(tx, sesion))
    })
  }
}

const c = contrato.motivosEspera

@Controller()
export class ControladorMotivosEspera {
  constructor(@Inject(ServicioMotivosEspera) private readonly servicio: ServicioMotivosEspera) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(() => this.servicio.listar())
  }

  @Operacion(c.crear)
  crear() {
    return implement(c.crear).handler(({ input }) => this.servicio.crear(input.nombre))
  }

  @Operacion(c.editar)
  editar() {
    return implement(c.editar).handler(({ input, errors }) =>
      this.servicio.editar(input.id, input.nombre, input.activo).catch((e: unknown) => {
        if (e instanceof MotivoNoEncontrado) throw errors.NO_ENCONTRADO()
        throw e
      }),
    )
  }
}
