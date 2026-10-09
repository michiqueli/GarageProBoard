import { type MotivoVisita, numeroVisita } from '@gpb/core'
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from '@gpb/db'
import { sucursal, usuario, visita } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDeLaEstacion } from '../fichaje/estacion.ts'
import { diaArgentino } from '../fichaje/fichaje.service.ts'

export class ErrorLlamador extends Error {
  constructor(readonly codigo: 'NO_ES_LLAMADOR') {
    super(codigo)
  }
}

/** Cuánto queda un llamado en la pantalla. */
const MINUTOS_EN_PANTALLA = 30
/** Cuántos llamados entran en un televisor leídos desde la otra punta de la sala. */
const MAXIMO_LLAMADOS = 6

/**
 * El televisor de la sala de espera. **Llamar es agarrar la visita**: no hay un botón aparte,
 * porque la recepcionista no va a apretar dos cosas por persona. El número aparece con el
 * nombre de quien la agarró, que es a quien hay que ir a buscar.
 */
@Injectable()
export class ServicioLlamador {
  constructor(@Inject(DatosDeLaEstacion) private readonly datos: DatosDeLaEstacion) {}

  pantalla() {
    return this.datos.transaccion(async (tx, estacion) => {
      if (estacion.tipo !== 'llamador') throw new ErrorLlamador('NO_ES_LLAMADOR')
      const hoy = diaArgentino()
      const delDia = and(eq(visita.sucursalId, estacion.sucursalId), eq(visita.fecha, hoy))

      const llamados = await tx
        .select({
          letra: visita.letra,
          numero: visita.numero,
          motivo: visita.motivo,
          atendidaEn: visita.atendidaEn,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
        })
        .from(visita)
        .innerJoin(usuario, eq(usuario.id, visita.atendidaPor))
        .where(
          and(
            delDia,
            isNotNull(visita.atendidaEn),
            gt(visita.atendidaEn, sql`now() - make_interval(mins => ${MINUTOS_EN_PANTALLA})`),
            // El que se fue no se llama.
            or(isNull(visita.resultado), ne(visita.resultado, 'se_fue')),
          ),
        )
        .orderBy(desc(visita.atendidaEn))
        .limit(MAXIMO_LLAMADOS)

      const [espera] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(visita)
        .where(and(delDia, isNull(visita.atendidaEn), isNull(visita.cerradaEn)))
      const [donde] = await tx
        .select({ nombre: sucursal.nombre })
        .from(sucursal)
        .where(inArray(sucursal.id, [estacion.sucursalId]))

      return {
        sucursal: donde?.nombre ?? null,
        llamados: llamados.map((l) => ({
          numero: numeroVisita(l.letra, l.numero),
          motivo: l.motivo as MotivoVisita,
          // El nombre y la inicial del apellido: alcanza para buscarlo, y no es una planilla.
          atiende: `${l.nombre} ${l.apellido.slice(0, 1)}.`.trim(),
          en: (l.atendidaEn as Date).toISOString(),
        })),
        esperando: espera?.n ?? 0,
      }
    })
  }
}
