import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { creadoEn, pk, tenantId } from './_comunes.ts'
import { empleado } from './comercial.ts'
import { orden } from './orden.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/**
 * El fichaje: quién está trabajando en qué, y desde cuándo.
 *
 * Todo esto sale de GarageTick, que se relevó con una concesionaria de verdad. Las reglas y
 * el porqué de cada una están en `docs/tecnicos/taller-control-de-tiempos.md`; lo que sigue
 * es el modelo.
 *
 * **Los tres conceptos que no son lo mismo**, y que es donde estos proyectos se hunden: una
 * *sesión de trabajo* son los minutos de mano de obra de una persona en una orden; el *estado
 * de la orden* es dónde está el auto. Una garantía que queda cinco días en el taller no es una
 * sesión de cinco días: es una orden abierta con sesiones cortas y esperas en el medio.
 * Modelarlo mal hace que todos los números de productividad salgan basura.
 */

export const TIPOS_ESTACION = ['taller', 'reloj', 'tablero'] as const
export const RESULTADOS_ESCANEO = ['ok', 'rechazado', 'error'] as const
export const CIERRES_SESION = ['mecanico', 'auto', 'jefe'] as const

/**
 * La PC del taller con el lector al lado, o la del reloj de entrada.
 *
 * **Se autentica el aparato, no la persona.** Si la pantalla de fichaje fuera una URL de la
 * red, cualquier máquina la abre y se ficha por otro; y eso no se arregla pidiendo usuario y
 * contraseña, porque el login es justo lo que mató al módulo del competidor. La estación se
 * registra una vez, guarda su token, y no vuelve a preguntar nada nunca.
 *
 * Es otra cosa que `dispositivo`: aquélla es el navegador desde el que alguien inicia sesión,
 * y existe para trazabilidad. Ésta es un puesto físico que la concesionaria da de alta a
 * propósito, y su token abre una pantalla sin sesión.
 */
export const estacionFichaje = pgTable(
  'estacion_fichaje',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    sucursalId: uuid()
      .notNull()
      .references(() => sucursal.id),
    /** Lo pone la concesionaria: «Taller, al lado del elevador 2». */
    nombre: text().notNull(),
    /**
     * `taller` hace los dos escaneos; `reloj` marca entrada y salida; `tablero` no ficha
     * nada — es el televisor colgado en el piso, que muestra y no se toca—.
     */
    tipo: text().notNull(),
    /**
     * SHA-256 del token, nunca el token. Se muestra una sola vez al registrar la estación, y
     * si se pierde se genera otro: un volcado de la base no alcanza para fichar.
     */
    tokenHash: text().notNull(),
    /** Una estación que se dio de baja no ficha más, y su token deja de servir. */
    activa: boolean().notNull().default(true),
    ultimoVistoEn: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [
    unique('estacion_token_uq').on(t.tokenHash),
    index('estacion_sucursal_idx').on(t.tenantId, t.sucursalId),
    check('estacion_tipo_valido', sql`${t.tipo} in ('taller', 'reloj', 'tablero')`),
  ],
)

/**
 * La entrada y la salida del día, de cualquier empleado.
 *
 * Una fila por persona y por día, y no una por marca: es lo que se mira, y con dos filas
 * sueltas —«entró», «salió»— cada consulta tiene que emparejarlas de nuevo.
 *
 * `fuente` dice de dónde salió, y por eso existe: una jornada cerrada por el trabajo de fin de
 * turno no vale lo mismo que una que el empleado marcó. El jefe tiene que poder distinguirlas
 * para corregir las primeras y no tocar las segundas.
 */
export const jornada = pgTable(
  'jornada',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    empleadoId: uuid()
      .notNull()
      .references(() => empleado.id),
    /** El día laboral, en hora de Argentina. */
    fecha: date().notNull(),
    entrada: timestamp({ withTimezone: true }),
    salida: timestamp({ withTimezone: true }),
    /** 'escaneo' | 'manual' | 'auto'. */
    fuente: text().notNull().default('escaneo'),
    estacionEntradaId: uuid().references(() => estacionFichaje.id),
    estacionSalidaId: uuid().references(() => estacionFichaje.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('jornada_empleado_fecha_uq').on(t.empleadoId, t.fecha),
    index('jornada_fecha_idx').on(t.tenantId, t.fecha),
    check('jornada_fuente_valida', sql`${t.fuente} in ('escaneo', 'manual', 'auto')`),
    check(
      'jornada_salida_despues',
      sql`${t.salida} is null or ${t.entrada} is null or ${t.salida} >= ${t.entrada}`,
    ),
  ],
)

/**
 * Un mecánico fichado en una orden. **Son los minutos de mano de obra**, y de acá sale el
 * tiempo real que se compara contra el estipulado.
 *
 * `duracion_seg` la calcula Postgres y no la aplicación: una columna generada no se puede
 * desincronizar del par inicio/fin, y todo informe de productividad se apoya en ella.
 *
 * `cerrada_por` distingue las tres formas de que termine, y la que importa es `auto`: el
 * cierre de fin de turno marca así lo que quedó abierto, para que el jefe lo corrija. Nunca se
 * descarta en silencio, porque un mecánico que se olvidó de cerrar igual trabajó.
 */
export const sesionTrabajo = pgTable(
  'sesion_trabajo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    ordenId: uuid()
      .notNull()
      .references(() => orden.id),
    empleadoId: uuid()
      .notNull()
      .references(() => empleado.id),
    /** Lo pone el servidor, siempre: los relojes de las PC del taller están todos mal. */
    inicio: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
    fin: timestamp({ withTimezone: true }),
    duracionSeg: integer().generatedAlwaysAs(sql`(extract(epoch from (fin - inicio)))::int`),
    /** 'mecanico' | 'auto' | 'jefe'. Vacío mientras está abierta. */
    cerradaPor: text(),
    estacionInicioId: uuid().references(() => estacionFichaje.id),
    estacionFinId: uuid().references(() => estacionFichaje.id),
    /** El motivo, cuando la corrigió el jefe de taller. */
    nota: text(),
    creadoEn: creadoEn(),
  },
  (t) => [
    // Las abiertas se consultan en cada escaneo: es la consulta del camino caliente, la que
    // tiene que contestar en menos de 200 ms con el mecánico esperando.
    index('sesion_trabajo_abierta_idx').on(t.empleadoId).where(sql`${t.fin} is null`),
    index('sesion_trabajo_orden_idx').on(t.ordenId),
    index('sesion_trabajo_rango_idx').on(t.tenantId, t.empleadoId, t.inicio),
    check('sesion_trabajo_cierre_valido', sql`${t.cerradaPor} in ('mecanico', 'auto', 'jefe')`),
    check('sesion_trabajo_fin_despues', sql`${t.fin} is null or ${t.fin} >= ${t.inicio}`),
  ],
)

/**
 * **Todo escaneo se registra, resuelva o falle.**
 *
 * Es la regla que más vale de las diez, y la que parece de más hasta el día que hace falta:
 * cuando un mecánico diga «yo fiché», esta tabla es la respuesta. Guarda el texto crudo tal
 * como llegó del lector, aunque sea basura, el código de barras de un repuesto o un QR de otro
 * sistema.
 *
 * La aplicación la lee y la escribe, pero **no la audita**: es una bitácora, y auditar una
 * bitácora es una recursión.
 */
export const eventoEscaneo = pgTable(
  'evento_escaneo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    estacionId: uuid().references(() => estacionFichaje.id),
    /** Tal cual llegó. Sin recortar ni normalizar: es la prueba. */
    codigoCrudo: text().notNull(),
    /** 'credencial' | 'orden' | 'manual' | null cuando no se pudo reconocer. */
    tipoDetectado: text(),
    empleadoId: uuid().references(() => empleado.id),
    ordenId: uuid().references(() => orden.id),
    resultado: text().notNull(),
    /** Qué terminó pasando: 'entrada', 'salida', 'abrio', 'cerro'. */
    accion: text(),
    /** Lo que se le mostró en la pantalla, con sus palabras. */
    mensaje: text(),
    /** Cuánto tardó el servidor. Sin esto, «el fichaje está lento» no se puede discutir. */
    latenciaMs: integer(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('evento_escaneo_fecha_idx').on(t.tenantId, t.creadoEn),
    index('evento_escaneo_empleado_idx').on(t.tenantId, t.empleadoId),
    check('evento_escaneo_resultado_valido', sql`${t.resultado} in ('ok', 'rechazado', 'error')`),
  ],
)
