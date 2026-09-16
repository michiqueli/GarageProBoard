import { contrato } from '@gpb/contracts'
import { count, desc, eq, ilike, or } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'

/**
 * Los permisos no están acá: los declara el contrato — el módulo y el permiso, con
 * `conPermiso('nucleo', 'ver', 'Vehiculo')` — y los aplica la guardia antes de que el
 * manejador corra. Y el tenant tampoco: lo pone `DatosDelTenant` desde la sesión. Lo que
 * queda en el controlador es sólo el negocio.
 */
@Controller()
export class ControladorVehiculos {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  @Operacion(contrato.vehiculos.listar)
  listar() {
    return implement(contrato.vehiculos.listar).handler(({ input }) =>
      // Ni siquiera hace falta filtrar por tenant en el WHERE: la política de RLS lo
      // hace, y la transacción ya viene con el de la sesión puesto.
      this.datos.transaccion(async (tx) => {
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
      }),
    )
  }

  @Operacion(contrato.vehiculos.crear)
  crear() {
    return implement(contrato.vehiculos.crear).handler(({ input, errors }) =>
      this.datos.transaccion(async (tx, sesion) => {
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
      }),
    )
  }
}
