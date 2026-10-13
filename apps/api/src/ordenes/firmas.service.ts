import { randomUUID } from 'node:crypto'
import {
  MAXIMO_BYTES_FIRMA,
  MAXIMO_LADO_FIRMA,
  MINIMO_LADO_FIRMA,
  type MomentoFirma,
  medirImagen,
} from '@gpb/core'
import { and, type Db, eq, isNull } from '@gpb/db'
import { orden, ordenFirma } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { AlmacenNoConfigurado, ArchivosDelTenant } from '../comun/almacen.ts'
import { DatosDelTenant } from '../comun/datos.ts'

type Codigo =
  | 'NO_ENCONTRADA'
  | 'FORMATO_INVALIDO'
  | 'DEMASIADO_GRANDE'
  | 'ESTADO_INVALIDO'
  | 'SIN_ALMACEN'

export class ErrorFirmas extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: { motivo: string },
  ) {
    super(codigo)
  }
}

/** En qué estados de la orden se firma cada momento. */
const SE_FIRMA: Record<MomentoFirma, { estados: string[]; motivo: string }> = {
  ingreso: {
    estados: [
      'recibida',
      'en_proceso',
      'esperando_repuesto',
      'esperando_autorizacion',
      'terminada',
      'facturada',
    ],
    motivo: 'La recepción se firma mientras la orden está abierta.',
  },
  egreso: {
    estados: ['terminada', 'facturada'],
    motivo: 'La entrega se firma con la orden terminada, antes de entregar el auto.',
  },
}

/** Lo que se cuenta de cada firma vigente de una orden. */
export async function firmasDe(tx: Db, ordenId: string) {
  const filas = await tx
    .select({
      momento: ordenFirma.momento,
      aclaracion: ordenFirma.aclaracion,
      creadoEn: ordenFirma.creadoEn,
    })
    .from(ordenFirma)
    .where(and(eq(ordenFirma.ordenId, ordenId), isNull(ordenFirma.reemplazadaEn)))
  const de = (momento: MomentoFirma) => {
    const f = filas.find((x) => x.momento === momento)
    return f ? { aclaracion: f.aclaracion, firmadoEn: f.creadoEn.toISOString() } : null
  }
  return { ingreso: de('ingreso'), egreso: de('egreso') }
}

/**
 * La firma del cliente en la pantalla, al recibir el auto y al devolverlo. Ver
 * `docs/tecnicos/egreso.md`.
 */
@Injectable()
export class ServicioFirmas {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(ArchivosDelTenant) private readonly archivos: ArchivosDelTenant,
  ) {}

  /**
   * Primero la imagen, después la fila, como los dibujos de la hoja: un corte en el medio deja
   * un archivo que nadie apunta y no una firma rota. La firma anterior del mismo momento queda
   * marcada como reemplazada.
   */
  firmar(ordenId: string, momento: MomentoFirma, aclaracion: string, contenido: Uint8Array) {
    if (contenido.length > MAXIMO_BYTES_FIRMA) throw new ErrorFirmas('DEMASIADO_GRANDE')
    const medida = medirImagen(contenido)
    if (
      medida?.formato !== 'image/png' ||
      [medida.ancho, medida.alto].some((l) => l < MINIMO_LADO_FIRMA || l > MAXIMO_LADO_FIRMA)
    ) {
      throw new ErrorFirmas('FORMATO_INVALIDO')
    }
    const ruta = `firmas/${ordenId}/${momento}-${randomUUID()}.png`

    return this.datos
      .transaccion(async (tx, sesion) => {
        const [o] = await tx
          .select({ estado: orden.estado })
          .from(orden)
          .where(eq(orden.id, ordenId))
          .for('update')
        if (!o) throw new ErrorFirmas('NO_ENCONTRADA')
        const regla = SE_FIRMA[momento]
        if (!regla.estados.includes(o.estado)) {
          throw new ErrorFirmas('ESTADO_INVALIDO', { motivo: regla.motivo })
        }

        await this.archivos
          .guardar(ruta, { contenido, tipo: 'image/png' })
          .catch((error: unknown) => {
            if (error instanceof AlmacenNoConfigurado) throw new ErrorFirmas('SIN_ALMACEN')
            throw error
          })
        await tx
          .update(ordenFirma)
          .set({ reemplazadaEn: new Date() })
          .where(
            and(
              eq(ordenFirma.ordenId, ordenId),
              eq(ordenFirma.momento, momento),
              isNull(ordenFirma.reemplazadaEn),
            ),
          )
        await tx.insert(ordenFirma).values({
          tenantId: sesion.tenantId,
          ordenId,
          momento,
          aclaracion,
          ruta,
          ancho: medida.ancho,
          alto: medida.alto,
          bytes: contenido.length,
          creadoPor: sesion.usuarioId,
        })
        return firmasDe(tx, ordenId)
      })
      .catch((error: unknown) => {
        if (!(error instanceof ErrorFirmas)) void this.archivos.borrar(ruta).catch(() => {})
        throw error
      })
  }

  /** Los bytes de la firma vigente, para la pantalla y para el comprobante. */
  async imagen(ordenId: string, momento: MomentoFirma) {
    const fila = await this.datos.transaccion(async (tx) => {
      const [f] = await tx
        .select()
        .from(ordenFirma)
        .where(
          and(
            eq(ordenFirma.ordenId, ordenId),
            eq(ordenFirma.momento, momento),
            isNull(ordenFirma.reemplazadaEn),
          ),
        )
      return f
    })
    if (!fila) throw new ErrorFirmas('NO_ENCONTRADA')
    const objeto = await this.archivos.leer(fila.ruta).catch((error: unknown) => {
      if (error instanceof AlmacenNoConfigurado) throw new ErrorFirmas('SIN_ALMACEN')
      throw error
    })
    if (!objeto) throw new ErrorFirmas('NO_ENCONTRADA')
    return { contenido: objeto.contenido, aclaracion: fila.aclaracion }
  }
}
