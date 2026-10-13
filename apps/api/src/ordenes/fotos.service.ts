import { randomUUID } from 'node:crypto'
import {
  MAXIMO_BYTES_FOTO,
  MAXIMO_FOTOS,
  MAXIMO_LADO_FOTO,
  type MomentoFoto,
  medirImagen,
} from '@gpb/core'
import { and, asc, count, type Db, eq, isNull, sql } from '@gpb/db'
import { orden, ordenFoto, usuario } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { AlmacenNoConfigurado, ArchivosDelTenant } from '../comun/almacen.ts'
import { DatosDelTenant } from '../comun/datos.ts'

type Codigo =
  | 'NO_ENCONTRADA'
  | 'FORMATO_INVALIDO'
  | 'DEMASIADO_GRANDE'
  | 'DEMASIADAS_FOTOS'
  | 'ESTADO_INVALIDO'
  | 'SIN_ALMACEN'

export class ErrorFotos extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: { motivo: string },
  ) {
    super(codigo)
  }
}

/** Mientras el auto está en el taller: las de entrada, en cualquier momento antes de entregarlo. */
const ABIERTA = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
  'terminada',
  'facturada',
]

/** En qué estados de la orden se sube cada momento. */
const SE_SUBE: Record<MomentoFoto, { estados: string[]; motivo: string }> = {
  ingreso: {
    estados: ABIERTA,
    motivo: 'Las fotos de cuando entró se suben mientras la orden está abierta.',
  },
  egreso: {
    estados: ['terminada', 'facturada'],
    motivo: 'Las fotos de cuando sale se suben con la orden terminada, antes de entregarla.',
  },
}

/** Las fotos vigentes de una orden, en el orden en que se sacaron. */
export async function fotosDe(tx: Db, ordenId: string) {
  const filas = await tx
    .select({
      id: ordenFoto.id,
      momento: ordenFoto.momento,
      nota: ordenFoto.nota,
      creadoEn: ordenFoto.creadoEn,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
    })
    .from(ordenFoto)
    .leftJoin(usuario, eq(usuario.id, ordenFoto.creadoPor))
    .where(and(eq(ordenFoto.ordenId, ordenId), isNull(ordenFoto.borradaEn)))
    .orderBy(asc(ordenFoto.creadoEn), asc(ordenFoto.id))
  return filas.map((f) => ({
    id: f.id,
    momento: f.momento as MomentoFoto,
    nota: f.nota,
    sacadaEn: f.creadoEn.toISOString(),
    sacadaPor: f.nombre ? `${f.nombre} ${f.apellido}` : null,
  }))
}

/**
 * Las fotos del vehículo, al recibirlo y al devolverlo. Optativas: el dibujo de la hoja sigue
 * siendo lo que se firma. Ver `docs/tecnicos/egreso.md`.
 */
@Injectable()
export class ServicioFotos {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(ArchivosDelTenant) private readonly archivos: ArchivosDelTenant,
  ) {}

  /**
   * Primero la imagen, después la fila, como la firma: un corte en el medio deja un archivo que
   * nadie apunta y no una foto rota.
   */
  subir(ordenId: string, momento: MomentoFoto, nota: string | null, contenido: Uint8Array) {
    if (contenido.length > MAXIMO_BYTES_FOTO) throw new ErrorFotos('DEMASIADO_GRANDE')
    const medida = medirImagen(contenido)
    if (!medida || [medida.ancho, medida.alto].some((l) => l < 1 || l > MAXIMO_LADO_FOTO)) {
      throw new ErrorFotos('FORMATO_INVALIDO')
    }
    const extension = medida.formato === 'image/png' ? 'png' : 'jpg'
    const ruta = `fotos/${ordenId}/${momento}-${randomUUID()}.${extension}`

    return this.datos
      .transaccion(async (tx, sesion) => {
        const [o] = await tx
          .select({ estado: orden.estado })
          .from(orden)
          .where(eq(orden.id, ordenId))
          .for('update')
        if (!o) throw new ErrorFotos('NO_ENCONTRADA')
        const regla = SE_SUBE[momento]
        if (!regla.estados.includes(o.estado)) {
          throw new ErrorFotos('ESTADO_INVALIDO', { motivo: regla.motivo })
        }
        const [ya] = await tx
          .select({ n: count() })
          .from(ordenFoto)
          .where(
            and(
              eq(ordenFoto.ordenId, ordenId),
              eq(ordenFoto.momento, momento),
              isNull(ordenFoto.borradaEn),
            ),
          )
        if ((ya?.n ?? 0) >= MAXIMO_FOTOS) throw new ErrorFotos('DEMASIADAS_FOTOS')

        await this.archivos
          .guardar(ruta, { contenido, tipo: medida.formato })
          .catch((error: unknown) => {
            if (error instanceof AlmacenNoConfigurado) throw new ErrorFotos('SIN_ALMACEN')
            throw error
          })
        const [nueva] = await tx
          .insert(ordenFoto)
          .values({
            tenantId: sesion.tenantId,
            ordenId,
            momento,
            nota: nota || null,
            ruta,
            tipo: medida.formato,
            ancho: medida.ancho,
            alto: medida.alto,
            bytes: contenido.length,
            creadoPor: sesion.usuarioId,
          })
          .returning({ id: ordenFoto.id })
        const foto = (await fotosDe(tx, ordenId)).find((f) => f.id === nueva?.id)
        if (!foto) throw new ErrorFotos('NO_ENCONTRADA')
        return foto
      })
      .catch((error: unknown) => {
        if (!(error instanceof ErrorFotos)) void this.archivos.borrar(ruta).catch(() => {})
        throw error
      })
  }

  /** Los bytes de una foto vigente. */
  async imagen(ordenId: string, fotoId: string) {
    const fila = await this.datos.transaccion(async (tx) => {
      const [f] = await tx
        .select({ ruta: ordenFoto.ruta, tipo: ordenFoto.tipo })
        .from(ordenFoto)
        .where(
          and(
            eq(ordenFoto.id, fotoId),
            eq(ordenFoto.ordenId, ordenId),
            isNull(ordenFoto.borradaEn),
          ),
        )
      return f
    })
    if (!fila) throw new ErrorFotos('NO_ENCONTRADA')
    const objeto = await this.archivos.leer(fila.ruta).catch((error: unknown) => {
      if (error instanceof AlmacenNoConfigurado) throw new ErrorFotos('SIN_ALMACEN')
      throw error
    })
    if (!objeto) throw new ErrorFotos('NO_ENCONTRADA')
    return { contenido: objeto.contenido, tipo: fila.tipo }
  }

  /** La marca como dada de baja. El archivo queda: la auditoría tiene que poder mostrarla. */
  quitar(ordenId: string, fotoId: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [o] = await tx
        .select({ estado: orden.estado })
        .from(orden)
        .where(eq(orden.id, ordenId))
        .for('update')
      if (!o) throw new ErrorFotos('NO_ENCONTRADA')
      if (!ABIERTA.includes(o.estado)) {
        throw new ErrorFotos('ESTADO_INVALIDO', {
          motivo: 'La orden ya se cerró: sus fotos quedan como están.',
        })
      }
      const [quitada] = await tx
        .update(ordenFoto)
        .set({ borradaEn: sql`now()`, borradaPor: sesion.usuarioId })
        .where(
          and(
            eq(ordenFoto.id, fotoId),
            eq(ordenFoto.ordenId, ordenId),
            isNull(ordenFoto.borradaEn),
          ),
        )
        .returning({ id: ordenFoto.id })
      if (!quitada) throw new ErrorFotos('NO_ENCONTRADA')
      return { hecho: true as const }
    })
  }
}
