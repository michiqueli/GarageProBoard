import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { tenant } from './tenant.ts'

/**
 * Las imágenes de la hoja de recepción: cinco vistas por cada tipo de carrocería, cargadas por
 * la concesionaria. Quince por taller. El porqué, en `docs/tecnicos/hoja-de-recepcion.md`.
 *
 * **Las filas no se modifican.** Subir una imagen nueva marca la anterior como reemplazada e
 * inserta otra, y cada orden apunta a la que tenía cuando se recibió el vehículo. Es lo que
 * permite reimprimir una hoja firmada hace dos años y que las marcas caigan donde el cliente
 * las vio: son puntos de **ese** dibujo, no del que esté vigente hoy.
 *
 * Los bytes no están acá: están en el almacén, en `ruta`. Esta fila es la que manda —si existe,
 * la imagen existe—, y por eso se escribe **después** de subir el objeto. Al revés, un corte en
 * el medio dejaría una hoja rota en la pantalla en vez de un huérfano en el bucket.
 */
export const hojaImagen = pgTable(
  'hoja_imagen',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    tipo: text().notNull(),
    vista: text().notNull(),
    /**
     * Dónde está en el almacén, **sin** el prefijo del tenant: ése lo pone
     * `ArchivosDelTenant` con el de la sesión, y no puede salir de una fila. Si saliera,
     * una fila con la ruta de otra concesionaria sería una fuga.
     */
    ruta: text().notNull(),
    formato: text().notNull(),
    ancho: integer().notNull(),
    alto: integer().notNull(),
    bytes: integer().notNull(),
    creadoEn: creadoEn(),
    creadoPor: uuid().references(() => usuario.id),
    /** `null` es la que se usa hoy. Las otras quedan porque hay órdenes que las apuntan. */
    reemplazadaEn: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Una sola vigente por tipo y vista. Las reemplazadas no entran, así que pueden ser muchas.
    uniqueIndex('hoja_imagen_vigente_uq')
      .on(t.tenantId, t.tipo, t.vista)
      .where(sql`reemplazada_en is null`),
    // Escritos a mano y no armados desde `@gpb/core`, como el resto del esquema: sumar un
    // valor al catálogo genera la migración que lo admite, y así se ve en el diff.
    check('hoja_imagen_tipo_valido', sql`${t.tipo} in ('sedan', 'hatchback', 'pickup')`),
    check(
      'hoja_imagen_vista_valida',
      sql`${t.vista} in ('frente', 'atras', 'izquierda', 'derecha', 'arriba')`,
    ),
    check('hoja_imagen_formato_valido', sql`${t.formato} in ('image/png', 'image/jpeg')`),
    check(
      'hoja_imagen_medidas_positivas',
      sql`${t.ancho} > 0 and ${t.alto} > 0 and ${t.bytes} > 0`,
    ),
  ],
)
