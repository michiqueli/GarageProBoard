import { atajosParaSembrar, type Diferencias, type ProblemaAtajo, validarAtajos } from '@gpb/core'
import { and, type Db, eq } from '@gpb/db'
import { usuarioAtajo, usuarioConfig, usuarioSucursal } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorConfiguracion extends Error {
  constructor(readonly codigo: 'SUCURSAL_INVALIDA') {
    super(codigo)
  }
}

export class ErrorAtajos extends Error {
  constructor(readonly problemas: ProblemaAtajo[]) {
    super('ATAJOS_INVALIDOS')
  }
}

export interface Preferencias {
  tema: 'claro' | 'oscuro' | 'sistema'
  densidad: 'compacta' | 'comoda'
  filasPorPagina: number
  sucursalPredeterminadaId: string | null
}

/**
 * Lo que cada usuario configura de lo suyo: el tema, la densidad, las filas que ve y sus
 * teclas.
 *
 * **Ninguna operación recibe un id de usuario**, y no es una omisión: el único que se puede
 * tocar es el de la sesión. Con un parámetro, la ruta pasaría a necesitar un permiso y
 * habría que responder quién puede cambiarle el tema a quién, que es una pregunta que este
 * sistema no necesita hacerse.
 */
@Injectable()
export class ServicioConfiguracion {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  guardar(entrada: Preferencias) {
    return this.datos.transaccion(async (tx, sesion) => {
      // Una sucursal a la que no tiene acceso lo dejaría afuera en el próximo ingreso: el
      // login busca la predeterminada entre las disponibles, no la encuentra y lo manda a
      // elegir de nuevo, o —peor— alguien la configura y después le sacan el acceso.
      if (entrada.sucursalPredeterminadaId) {
        const [acceso] = await tx
          .select({ id: usuarioSucursal.sucursalId })
          .from(usuarioSucursal)
          .where(
            and(
              eq(usuarioSucursal.usuarioId, sesion.usuarioId),
              eq(usuarioSucursal.sucursalId, entrada.sucursalPredeterminadaId),
            ),
          )
          .limit(1)
        if (!acceso) throw new ErrorConfiguracion('SUCURSAL_INVALIDA')
      }

      // La fila se siembra al crear el usuario, así que el `insert` es el caso que no
      // debería pasar. Está igual porque el que no debería pasar es justo el que deja a
      // alguien sin poder guardar su tema, sin explicación.
      const valores = {
        tema: entrada.tema,
        densidad: entrada.densidad,
        filasPorPagina: entrada.filasPorPagina,
        sucursalPredeterminadaId: entrada.sucursalPredeterminadaId,
        actualizadoEn: new Date(),
      }
      const [fila] = await tx
        .insert(usuarioConfig)
        .values({ tenantId: sesion.tenantId, usuarioId: sesion.usuarioId, ...valores })
        .onConflictDoUpdate({ target: usuarioConfig.usuarioId, set: valores })
        .returning()
      if (!fila) throw new Error('No se pudo guardar la configuración.')

      return {
        tema: fila.tema as Preferencias['tema'],
        densidad: fila.densidad as Preferencias['densidad'],
        filasPorPagina: fila.filasPorPagina,
        sucursalPredeterminadaId: fila.sucursalPredeterminadaId,
      }
    })
  }

  /**
   * Reescribe el mapa de teclas a partir de las diferencias.
   *
   * **Borra y vuelve a sembrar, en una transacción.** Actualizar fila por fila se rompe con
   * el caso más obvio de todos: intercambiar dos teclas entre dos acciones choca contra el
   * índice único en la primera de las dos escrituras, aunque el resultado final sea
   * perfectamente válido.
   */
  guardarAtajos(diferencias: Diferencias) {
    return this.datos.transaccion(async (tx, sesion) => {
      // La misma función que corre en el front mientras el usuario elige. Acá es la que
      // decide: lo que llegue por otro camino que no sea nuestra pantalla se valida igual.
      const problemas = validarAtajos(diferencias)
      if (problemas.length > 0) throw new ErrorAtajos(problemas)

      await tx.delete(usuarioAtajo).where(eq(usuarioAtajo.usuarioId, sesion.usuarioId))
      await tx.insert(usuarioAtajo).values(
        atajosParaSembrar().map((a) => ({
          tenantId: sesion.tenantId,
          usuarioId: sesion.usuarioId,
          ambito: a.ambito,
          accion: a.accion,
          // Las no reasignables nunca llegan acá: `validarAtajos` las rechaza.
          tecla: diferencias[a.accion] ?? a.tecla,
        })),
      )

      return { atajos: await mapaDe(tx, sesion.usuarioId) }
    })
  }
}

/** El mapa completo tal como lo manda la sesión, para que el front no lo recomponga. */
async function mapaDe(tx: Db, usuarioId: string): Promise<Record<string, string>> {
  const filas = await tx
    .select({ accion: usuarioAtajo.accion, tecla: usuarioAtajo.tecla })
    .from(usuarioAtajo)
    .where(eq(usuarioAtajo.usuarioId, usuarioId))

  return Object.fromEntries(filas.map((f) => [f.accion, f.tecla]))
}
