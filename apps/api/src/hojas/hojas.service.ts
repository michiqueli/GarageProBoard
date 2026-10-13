import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  type FormatoHoja,
  MAXIMO_BYTES_HOJA,
  MAXIMO_LADO_HOJA,
  MINIMO_LADO_HOJA,
  medirImagen,
  TIPOS_HOJA,
  type TipoHoja,
} from '@gpb/core'
import { and, desc, eq, hojaPorOmisionPara, isNull } from '@gpb/db'
import { hojaImagen } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { AlmacenNoConfigurado, ArchivosDelTenant } from '../comun/almacen.ts'
import { DatosDelTenant } from '../comun/datos.ts'

/**
 * Los dibujos que trae el sistema, en el repositorio. La ruta es relativa a este módulo, y vale
 * igual desde `src` que desde `dist`: los dos están a la misma altura de `assets`.
 */
const CARPETA_POR_OMISION = new URL('../../assets/hojas/', import.meta.url)

type Codigo =
  | 'NO_ENCONTRADA'
  | 'FORMATO_INVALIDO'
  | 'DEMASIADO_GRANDE'
  | 'MEDIDAS_INVALIDAS'
  | 'SIN_ALMACEN'

export class ErrorHojas extends Error {
  constructor(readonly codigo: Codigo) {
    super(codigo)
  }
}

const EXTENSION: Record<FormatoHoja, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }

/**
 * Las imágenes de la hoja de recepción: una por tipo de carrocería, con todas las vistas del
 * vehículo adentro.
 *
 * Lo que hay que tener presente al leer esto es que **las filas no se modifican**. Subir
 * reemplaza, y reemplazar es marcar la vieja y agregar una nueva, porque hay órdenes firmadas
 * que apuntan a la vieja y tienen que seguir imprimiéndose igual.
 */
@Injectable()
export class ServicioHojas {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(ArchivosDelTenant) private readonly archivos: ArchivosDelTenant,
  ) {}

  /** Los cuatro dibujos, estén cargados o no: es la grilla de la pantalla de configuración. */
  listar() {
    return this.datos.transaccion(async (tx) => {
      const propias = await tx
        .select()
        .from(hojaImagen)
        .where(isNull(hojaImagen.reemplazadaEn))
        .orderBy(desc(hojaImagen.creadoEn))

      const porTipo = new Map(propias.map((i) => [i.tipo, i]))
      const datos = TIPOS_HOJA.map((tipo) => {
        const propia = porTipo.get(tipo)
        return { tipo, propia: propia ? salida(propia) : null }
      })
      return { datos }
    })
  }

  /**
   * Primero el objeto, después la fila.
   *
   * Al revés, un corte entre las dos dejaría una fila apuntando a un archivo que no está: una
   * hoja rota en la pantalla, y peor, en una orden ya firmada. Así el peor caso es un huérfano
   * en el bucket, que no se le nota a nadie y lo junta una limpieza aparte.
   */
  subir(tipo: TipoHoja, contenido: Uint8Array, usuarioId?: string) {
    if (contenido.length > MAXIMO_BYTES_HOJA) throw new ErrorHojas('DEMASIADO_GRANDE')

    // El formato sale de los bytes, no de lo que diga el navegador: un ejecutable que se
    // presenta como image/png quedaría guardado como imagen.
    const medida = medirImagen(contenido)
    if (!medida) throw new ErrorHojas('FORMATO_INVALIDO')
    const lados = [medida.ancho, medida.alto]
    if (lados.some((l) => l < MINIMO_LADO_HOJA || l > MAXIMO_LADO_HOJA)) {
      throw new ErrorHojas('MEDIDAS_INVALIDAS')
    }

    const ruta = `hojas/${tipo}/${randomUUID()}.${EXTENSION[medida.formato]}`

    return this.datos
      .transaccion(async (tx, sesion) => {
        await this.archivos
          .guardar(ruta, { contenido, tipo: medida.formato })
          .catch((error: unknown) => {
            if (error instanceof AlmacenNoConfigurado) throw new ErrorHojas('SIN_ALMACEN')
            throw error
          })

        await tx
          .update(hojaImagen)
          .set({ reemplazadaEn: new Date() })
          .where(and(eq(hojaImagen.tipo, tipo), isNull(hojaImagen.reemplazadaEn)))

        const [creada] = await tx
          .insert(hojaImagen)
          .values({
            tenantId: sesion.tenantId,
            tipo,
            ruta,
            formato: medida.formato,
            ancho: medida.ancho,
            alto: medida.alto,
            bytes: contenido.length,
            creadoPor: usuarioId ?? sesion.usuarioId,
          })
          .returning()
        if (!creada) throw new Error('No se pudo guardar la imagen de la hoja.')
        return salida(creada)
      })
      .catch((error: unknown) => {
        // La fila no llegó a escribirse: el objeto que quedó arriba no lo apunta nadie.
        if (error instanceof ErrorHojas) throw error
        void this.archivos.borrar(ruta).catch(() => {})
        throw error
      })
  }

  /** Los bytes, para la pantalla y para la hoja impresa. */
  async bytes(id: string): Promise<{
    contenido: Uint8Array
    formato: string
    nombre: string
    ancho: number
    alto: number
  }> {
    const fila = await this.datos.transaccion(async (tx) => {
      const [f] = await tx.select().from(hojaImagen).where(eq(hojaImagen.id, id))
      return f
    })
    if (!fila) throw new ErrorHojas('NO_ENCONTRADA')

    if (fila.porOmision) {
      return {
        contenido: new Uint8Array(await readFile(new URL(`${fila.tipo}.png`, CARPETA_POR_OMISION))),
        formato: fila.formato,
        nombre: `${fila.tipo}.png`,
        ancho: fila.ancho,
        alto: fila.alto,
      }
    }

    const objeto = await this.archivos.leer(fila.ruta).catch((error: unknown) => {
      if (error instanceof AlmacenNoConfigurado) throw new ErrorHojas('SIN_ALMACEN')
      throw error
    })
    // La fila es la que manda, así que si el objeto no está es que el almacén perdió algo:
    // no es «no existe», es que hay que ir a mirar.
    if (!objeto) throw new ErrorHojas('NO_ENCONTRADA')

    return {
      contenido: objeto.contenido,
      formato: fila.formato,
      nombre: `${fila.tipo}.${EXTENSION[fila.formato as FormatoHoja] ?? 'png'}`,
      ancho: fila.ancho,
      alto: fila.alto,
    }
  }

  /**
   * Vuelve al dibujo que trae el sistema. No borra: marca. El archivo tampoco se borra, porque
   * las órdenes recibidas con él lo siguen mostrando. Quitar el que trae el sistema no tiene
   * a dónde volver, y no se puede.
   */
  quitar(tipo: TipoHoja) {
    return this.datos.transaccion(async (tx, sesion) => {
      const marcadas = await tx
        .update(hojaImagen)
        .set({ reemplazadaEn: new Date() })
        .where(
          and(
            eq(hojaImagen.tipo, tipo),
            isNull(hojaImagen.reemplazadaEn),
            eq(hojaImagen.porOmision, false),
          ),
        )
        .returning({ id: hojaImagen.id })
      if (!marcadas.length) throw new ErrorHojas('NO_ENCONTRADA')
      await tx.insert(hojaImagen).values(hojaPorOmisionPara(sesion.tenantId, tipo))
      return { hecho: true as const }
    })
  }
}

function salida(f: typeof hojaImagen.$inferSelect) {
  return {
    id: f.id,
    tipo: f.tipo as TipoHoja,
    formato: f.formato as FormatoHoja,
    ancho: f.ancho,
    alto: f.alto,
    bytes: f.bytes,
    creadoEn: f.creadoEn.toISOString(),
    creadoPor: f.creadoPor,
    porOmision: f.porOmision,
  }
}
