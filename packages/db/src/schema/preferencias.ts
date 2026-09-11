import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, pk, tenantId } from './_comunes.ts'
import { usuario } from './acceso.ts'
import { sucursal } from './organizacion.ts'
import { tenant } from './tenant.ts'

/**
 * Preferencias de cada usuario. Se crea junto con el usuario, con los valores por
 * omisión, así la fila siempre existe y la interfaz no tiene que contemplar el caso
 * de que falte.
 */
export const usuarioConfig = pgTable(
  'usuario_config',
  {
    usuarioId: uuid()
      .primaryKey()
      .references(() => usuario.id),
    tenantId: tenantId().references(() => tenant.id),
    /** 'claro' | 'oscuro' | 'sistema' */
    tema: text().notNull().default('sistema'),
    /** 'compacta' | 'comoda' — 32px o 40px de alto de fila. */
    densidad: text().notNull().default('compacta'),
    filasPorPagina: integer().notNull().default(50),
    /** A qué sucursal entra al iniciar sesión, si tiene acceso a varias. */
    sucursalPredeterminadaId: uuid().references(() => sucursal.id),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    check('usuario_config_tema_valido', sql`${t.tema} in ('claro', 'oscuro', 'sistema')`),
    check('usuario_config_densidad_valida', sql`${t.densidad} in ('compacta', 'comoda')`),
    check('usuario_config_filas_rango', sql`${t.filasPorPagina} between 10 and 200`),
  ],
)

/**
 * El mapa de teclas de cada usuario.
 *
 * Va en su propia tabla y no dentro de un JSON de preferencias por una restricción que
 * un JSON no puede garantizar: **la misma tecla no puede quedar en dos acciones**. Un
 * mapa con F3 duplicado no es un dato feo, es un usuario cuyo teclado hace cosas al
 * azar según el orden en que se recorra el objeto.
 *
 * Se siembra completo al crear el usuario. El catálogo de acciones vive en
 * `@garagepro/core` porque cada una necesita un manejador en el front: no tiene
 * sentido que exista en la base algo que no hay quién ejecute.
 */
export const usuarioAtajo = pgTable(
  'usuario_atajo',
  {
    id: pk(),
    tenantId: tenantId().references(() => tenant.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id),
    /** 'global' o el módulo: 'ordenes', 'entregas', 'repuestos', 'caja'… */
    ambito: text().notNull(),
    /** Identificador de `CATALOGO`, con la forma `ambito.verbo`. */
    accion: text().notNull(),
    /** Forma canónica, con los modificadores en orden fijo: `Ctrl+Alt+Shift+Tecla`. */
    tecla: text().notNull(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('usuario_atajo_accion_uq').on(t.usuarioId, t.accion),

    // Unicidad **por ámbito**, no global: dos módulos pueden compartir una tecla
    // porque nunca están en pantalla a la vez — F4 es «facturar» en caja y «entregar»
    // en entregas, y ésa es justamente la idea.
    //
    // El choque que esto no puede ver es el de una acción de módulo contra una global.
    // Ése lo valida `validarAtajos()` en @garagepro/core, que resuelve el mapa
    // efectivo de cada módulo antes de guardar.
    unique('usuario_atajo_tecla_uq').on(t.usuarioId, t.ambito, t.tecla),

    index('usuario_atajo_usuario_idx').on(t.usuarioId),

    // El ámbito es derivable del prefijo de la acción, pero se guarda para que el
    // índice único de arriba pueda existir. El check impide que se desincronicen.
    check('usuario_atajo_ambito_coherente', sql`${t.accion} like ${t.ambito} || '.%'`),

    // El navegador se queda con estas teclas: asignarlas no falla con un error,
    // simplemente no pasa nada y el usuario concluye que el sistema está roto.
    check(
      'usuario_atajo_tecla_permitida',
      sql`${t.tecla} not in ('F11', 'F12', 'Tab', 'Shift+Tab',
                             'Ctrl+W', 'Ctrl+T', 'Ctrl+N',
                             'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N')`,
    ),
  ],
)
