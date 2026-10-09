import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { actualizadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { empleado, entidadComercial } from './comercial.ts'
import { orden } from './orden.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/**
 * Alguien que está en la concesionaria. El porqué, en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * **Los estados salen de las fechas**, no de una columna aparte: esperando es sin
 * `atendida_en`, atendiendo es con `atendida_en` y sin `cerrada_en`. Así el estado no puede
 * decir una cosa y las horas otra, y las dos esperas se calculan sin más datos.
 *
 * **«Se fue» es un resultado, no una baja.** El que se cansó de esperar es justamente lo que
 * esto viene a medir, y por eso una visita no se borra nunca.
 */
export const visita = pgTable(
  'visita',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    /** El día, en hora de Argentina. El número vuelve a empezar cada día. */
    fecha: date().notNull(),
    /** `S`, `V`, `R` o `A`: sale del motivo, y se guarda porque el número es por letra. */
    letra: text().notNull(),
    numero: integer().notNull(),
    origen: text().notNull(),
    motivo: text().notNull(),
    /**
     * La persona, si existe. Puede no existir: el que viene a preguntar no tiene por qué
     * dejarnos el documento.
     */
    entidadId: uuid().references(() => entidadComercial.id),
    /**
     * Lo que dijo. Se copia aunque haya `entidad_id`, igual que la orden copia quién trae el
     * auto: es lo que se anotó ese día, y si mañana corrige el teléfono no cambia acá.
     */
    nombre: text(),
    telefono: text(),
    /**
     * El empleado que lo tiene que atender. Empleado y no usuario: un vendedor puede no
     * entrar al sistema, y el nombre de quién lo atendió tiene que quedar igual.
     */
    derivadaA: uuid().references(() => empleado.id),
    /** Quién lo agarró en el sistema, y cuándo. Desde `llego_en` hasta acá es la espera. */
    atendidaPor: uuid().references(() => usuario.id),
    atendidaEn: timestamp({ withTimezone: true }),
    cerradaEn: timestamp({ withTimezone: true }),
    resultado: text(),
    ordenId: uuid().references(() => orden.id),
    nota: text(),
    /** Quién la anotó. Vacío cuando la anotó el tótem. */
    creadaPor: uuid().references(() => usuario.id),
    /** Cuando se anotó. El tótem sin red la manda con su hora, por eso no es `creado_en`. */
    llegoEn: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('visita_numero_uq').on(t.sucursalId, t.fecha, t.letra, t.numero),
    index('visita_dia_idx').on(t.tenantId, t.sucursalId, t.fecha),
    // Escrito a mano y no armado desde `@gpb/core`: drizzle-kit no resuelve los paquetes del
    // workspace al generar.
    check(
      'visita_motivo_valido',
      sql`${t.motivo} in ('servicio', 'venta', 'plan_ahorro', 'usados', 'repuestos', 'administracion', 'otro')`,
    ),
    check('visita_origen_valido', sql`${t.origen} in ('recepcion', 'totem')`),
    check(
      'visita_resultado_valido',
      sql`${t.resultado} is null or ${t.resultado} in ('atendida', 'se_fue', 'orden')`,
    ),
    // Cerrada es con resultado, y abierta sin: así no hay visitas que no se sabe cómo terminaron.
    check('visita_cierre_con_resultado', sql`(${t.cerradaEn} is null) = (${t.resultado} is null)`),
    check('visita_orden_con_resultado', sql`${t.ordenId} is null or ${t.resultado} = 'orden'`),
  ],
)

/** El último número de cada letra, por sucursal y por día. */
export const visitaSecuencia = pgTable(
  'visita_secuencia',
  {
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    fecha: date().notNull(),
    letra: text().notNull(),
    ultimo: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sucursalId, t.fecha, t.letra] })],
)
