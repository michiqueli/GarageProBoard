import { contrato } from '@garagetick/contracts'
import { and, conTenant, count, type Db, desc, eq, ilike, or, sql } from '@garagetick/db'
import { vehiculo } from '@garagetick/db/schema'
import { Controller, Inject } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import type { Sesion } from '../auth/auth.service.ts'
import { DeSesion } from '../auth/guard.ts'
import { DB } from '../comun/base.module.ts'

@Controller()
export class ControladorVehiculos {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Implement(contrato.vehiculos.listar)
  listar(@DeSesion() sesion: Sesion) {
    return implement(contrato.vehiculos.listar).handler(async ({ input }) => {
      // Todo pasa por conTenant. Ni siquiera hace falta filtrar por tenant en el
      // WHERE: la política de RLS lo hace, y si alguien se olvidara de envolver la
      // consulta acá, reventaría en vez de devolver datos ajenos.
      return conTenant(this.db, sesion.tenantId, async (tx) => {
        const texto = input.buscar?.trim()

        // El mecánico busca por la patente que ve en el parabrisas; el administrativo,
        // por chasis. Los dos entran por el mismo campo.
        const filtro = texto
          ? or(ilike(vehiculo.dominio, `%${texto}%`), ilike(vehiculo.chasis, `%${texto}%`))
          : undefined

        const [{ total } = { total: 0 }] = await tx
          .select({ total: count() })
          .from(vehiculo)
          .where(filtro)

        const datos = await tx
          .select({
            id: vehiculo.id,
            chasis: vehiculo.chasis,
            dominio: vehiculo.dominio,
            anio: vehiculo.anio,
            color: vehiculo.color,
          })
          .from(vehiculo)
          .where(filtro)
          .orderBy(desc(vehiculo.creadoEn))
          .limit(input.porPagina)
          .offset((input.pagina - 1) * input.porPagina)

        return { datos, total }
      })
    })
  }

  @Implement(contrato.vehiculos.crear)
  crear(@DeSesion() sesion: Sesion) {
    return implement(contrato.vehiculos.crear).handler(async ({ input, errors }) => {
      return conTenant(this.db, sesion.tenantId, async (tx) => {
        // El chasis único por tenant lo garantiza un índice, no una consulta previa:
        // entre el "select si existe" y el insert hay una ventana en la que otro
        // proceso puede meter el mismo, y con dos recepciones cargando a la vez esa
        // ventana se abre de verdad.
        const yaEsta = await tx
          .select({ id: vehiculo.id })
          .from(vehiculo)
          .where(eq(vehiculo.chasis, input.chasis))
          .limit(1)

        if (yaEsta.length > 0) throw errors.CHASIS_DUPLICADO({ data: { mensaje: input.chasis } })

        const [creado] = await tx
          .insert(vehiculo)
          .values({
            tenantId: sesion.tenantId,
            chasis: input.chasis,
            dominio: input.dominio ?? null,
            anio: input.anio ?? null,
            color: input.color ?? null,
          })
          .returning({
            id: vehiculo.id,
            chasis: vehiculo.chasis,
            dominio: vehiculo.dominio,
            anio: vehiculo.anio,
            color: vehiculo.color,
          })

        if (!creado) throw new Error('No se pudo crear el vehículo.')
        return creado
      })
    })
  }
}

// Referencias usadas sólo en los tipos de las consultas de arriba.
void and
void sql
