import { MOTIVOS_VISITA, type MotivoVisita } from '@gpb/core'
import { and, eq, gte, lte, sql } from '@gpb/db'
import { visita } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorEsperas extends Error {
  constructor(readonly codigo: 'RANGO_INVALIDO') {
    super(codigo)
  }
}

const ZONA = 'America/Argentina/Buenos_Aires'
const MAXIMO_DIAS = 92

/** Minutos desde que llegó hasta que alguien la agarró. */
const espera = sql<number>`extract(epoch from (${visita.atendidaEn} - ${visita.llegoEn})) / 60`

/** Lo que se cuenta de cada grupo de visitas. */
const medidas = {
  visitas: sql<number>`count(*)::int`,
  atendidas: sql<number>`count(${visita.atendidaEn})::int`,
  seFueron: sql<number>`(count(*) filter (where ${visita.resultado} = 'se_fue'))::int`,
  esperaMedia: sql<number | null>`round(avg(${espera})::numeric, 1)::float`,
  esperaMaxima: sql<number | null>`round(max(${espera})::numeric, 1)::float`,
}

/**
 * Cuánto se espera en la puerta. Es la mitad del tótem que no se ve: lo que un gerente mira
 * para saber si le falta gente en el mostrador a las diez de la mañana.
 */
@Injectable()
export class ServicioEsperas {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  medir(desde: string, hasta: string) {
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000
    if (!(dias >= 0 && dias < MAXIMO_DIAS)) throw new ErrorEsperas('RANGO_INVALIDO')

    return this.datos.transaccion(async (tx, sesion) => {
      const rango = and(
        eq(visita.sucursalId, sesion.sucursalId),
        gte(visita.fecha, desde),
        lte(visita.fecha, hasta),
      )
      const motivo = sql<MotivoVisita>`${visita.motivo}`
      // La zona va escrita y no como parámetro: el GROUP BY compara la expresión, y dos
      // parámetros con el mismo valor para Postgres son dos expresiones distintas.
      const hora = sql<number>`extract(hour from ${visita.llegoEn} at time zone ${sql.raw(`'${ZONA}'`)})::int`

      const [total] = await tx.select(medidas).from(visita).where(rango)
      const porMotivo = await tx
        .select({ motivo, ...medidas })
        .from(visita)
        .where(rango)
        .groupBy(motivo)
      const porHora = await tx
        .select({ hora, ...medidas })
        .from(visita)
        .where(rango)
        .groupBy(hora)
        .orderBy(hora)

      // En el orden en que se ofrecen los motivos, no en el alfabético.
      const lugar = (m: MotivoVisita) => MOTIVOS_VISITA.indexOf(m)
      return {
        total: total ?? {
          visitas: 0,
          atendidas: 0,
          seFueron: 0,
          esperaMedia: null,
          esperaMaxima: null,
        },
        porMotivo: porMotivo.sort((a, b) => lugar(a.motivo) - lugar(b.motivo)),
        porHora,
      }
    })
  }
}
