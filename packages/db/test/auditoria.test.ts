import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  COLUMNAS_SECRETAS,
  TABLAS_AUDITADAS,
  TABLAS_CON_TENANT,
  TABLAS_SIN_AUDITAR,
} from '../src/rls/index.ts'
import {
  type EntornoPrueba,
  errorPg,
  levantarEntorno,
  SQLSTATE,
  TENANT_A,
  TENANT_B,
} from './entorno.ts'

/**
 * La auditoría que escribe Postgres.
 *
 * Es la mitad del registro que no depende de que nadie se acuerde de llamar a nada, así que
 * lo que se prueba acá es justamente eso: que el cambio quede aunque la aplicación no diga
 * una palabra, y que la aplicación no pueda sacarlo después.
 */

let e: EntornoPrueba

const USUARIO_A = '33333333-3333-4333-8333-333333333333'

/** Ejecuta como la aplicación, con el tenant y el autor puestos, igual que `conTenant()`. */
async function comoApp(
  sql: string,
  valores: unknown[] = [],
  quien: { tenant?: string; usuario?: string | null; ip?: string } = {},
) {
  const cliente = await e.poolApp.connect()
  try {
    await cliente.query('begin')
    await cliente.query('select set_config($1, $2, true)', [
      'app.tenant_id',
      quien.tenant ?? TENANT_A,
    ])
    await cliente.query('select set_config($1, $2, true)', [
      'app.usuario_id',
      quien.usuario ?? USUARIO_A,
    ])
    await cliente.query('select set_config($1, $2, true)', ['app.ip', quien.ip ?? '200.1.2.3'])
    const r = await cliente.query(sql, valores)
    await cliente.query('commit')
    return r
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}

async function cambiosDe(tabla: string) {
  const { rows } = await e.poolDuenio.query(
    `select tabla, accion, antes, despues, usuario_id, ip, transaccion
       from auditoria_cambio where tabla = $1 order by creado_en, id`,
    [tabla],
  )
  return rows as Array<{
    tabla: string
    accion: string
    antes: Record<string, unknown> | null
    despues: Record<string, unknown> | null
    usuario_id: string | null
    ip: string | null
    transaccion: string
  }>
}

beforeAll(async () => {
  e = await levantarEntorno()
  await e.poolDuenio.query(`
    insert into condicion_iva (codigo, descripcion, discrimina_iva)
      values (1, 'IVA Responsable Inscripto', true) on conflict do nothing;
    insert into tenant (id, nombre, slug) values
      ('${TENANT_A}', 'Automotores Litoral', 'automotores-litoral'),
      ('${TENANT_B}', 'Concesionaria del Norte', 'del-norte');
    insert into usuario (id, tenant_id, email, hash_password, nombre, apellido)
      values ('${USUARIO_A}', '${TENANT_A}', 'a@litoral.test', 'hash-secretisimo', 'Ana', 'Paz');
  `)
  await e.poolDuenio.query('delete from auditoria_cambio')
}, 240_000)

afterAll(async () => {
  await e?.cerrar()
})

describe('el trigger escribe sin que nadie lo llame', () => {
  it('registra el alta con la fila entera, en el vocabulario de la aplicación', async () => {
    await comoApp(
      `insert into vehiculo (tenant_id, chasis, dominio, anio) values ($1, $2, $3, $4)`,
      [TENANT_A, '8AWZZZ377KA100001', 'AA111AA', 2020],
    )

    const filas = await cambiosDe('vehiculo')
    expect(filas).toHaveLength(1)
    expect(filas[0]?.accion).toBe('alta')
    expect(filas[0]?.antes).toBeNull()
    // camelCase, no snake_case: la pantalla cuenta con las mismas frases lo que escribe el
    // trigger y lo que escribe la API.
    expect(filas[0]?.despues).toMatchObject({ chasis: '8AWZZZ377KA100001', dominio: 'AA111AA' })
    expect(Object.keys(filas[0]?.despues ?? {})).not.toContain('tenant_id')
  })

  it('anota quién y desde dónde, leyéndolo de la sesión', async () => {
    const [fila] = await cambiosDe('vehiculo')
    expect(fila?.usuario_id).toBe(USUARIO_A)
    expect(fila?.ip).toBe('200.1.2.3')
  })

  it('registra la modificación con el antes y el después', async () => {
    await comoApp(`update vehiculo set color = 'Rojo' where dominio = 'AA111AA'`)

    const filas = await cambiosDe('vehiculo')
    expect(filas).toHaveLength(2)
    expect(filas[1]?.accion).toBe('modificacion')
    expect(filas[1]?.antes).toMatchObject({ color: null })
    expect(filas[1]?.despues).toMatchObject({ color: 'Rojo' })
  })

  it('guardar sin cambiar nada no deja una línea', async () => {
    // Si no, la auditoría se vuelve ilegible justo el día que hay que leerla: `actualizado_en`
    // se mueve en cada guardado y ensuciaría el registro con cambios que no son cambios.
    await comoApp(
      `update vehiculo set color = 'Rojo', actualizado_en = now() where dominio = 'AA111AA'`,
    )

    expect(await cambiosDe('vehiculo')).toHaveLength(2)
  })

  it('registra la baja', async () => {
    await comoApp(`delete from vehiculo where dominio = 'AA111AA'`)

    const filas = await cambiosDe('vehiculo')
    expect(filas).toHaveLength(3)
    expect(filas[2]?.accion).toBe('baja')
    expect(filas[2]?.despues).toBeNull()
  })

  it('el cambio queda aunque no haya nadie sentado', async () => {
    // Una migración o una semilla no tienen sesión. Perder el cambio porque no sabemos quién
    // fue sería exactamente al revés de lo que hace falta.
    await e.poolDuenio.query(
      `insert into vehiculo (tenant_id, chasis, dominio) values ($1, $2, $3)`,
      [TENANT_A, '8AWZZZ377KA100002', 'AA222AA'],
    )

    const filas = await cambiosDe('vehiculo')
    expect(filas).toHaveLength(4)
    expect(filas[3]?.usuario_id).toBeNull()
  })
})

describe('la aplicación no la puede tocar', () => {
  it('no puede insertar una fila a mano', async () => {
    const error = await errorPg(
      comoApp(
        `insert into auditoria_cambio (tenant_id, tabla, accion, transaccion)
         values ($1, 'vehiculo', 'alta', '1')`,
        [TENANT_A],
      ),
    )
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('no puede borrar lo que ya quedó', async () => {
    // Una bitácora que el mismo proceso auditado puede reescribir no prueba nada.
    const error = await errorPg(comoApp(`delete from auditoria_cambio`))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('no puede modificarla', async () => {
    const error = await errorPg(comoApp(`update auditoria_cambio set ip = null`))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('pero la lee, y sólo la suya', async () => {
    const propios = await comoApp('select id from auditoria_cambio')
    expect(propios.rowCount).toBeGreaterThan(0)

    const ajenos = await comoApp('select id from auditoria_cambio', [], { tenant: TENANT_B })
    expect(ajenos.rowCount).toBe(0)
  })
})

describe('los secretos no entran', () => {
  it('el hash de la contraseña no queda en el registro', async () => {
    await comoApp(`update usuario set nombre = 'Ana María' where id = $1`, [USUARIO_A])

    const [fila] = await cambiosDe('usuario')
    expect(fila?.despues).toMatchObject({ nombre: 'Ana María' })
    expect(Object.keys(fila?.despues ?? {})).not.toContain('hashPassword')
    expect(JSON.stringify(fila)).not.toContain('hash-secretisimo')
  })

  it('ninguna columna con pinta de secreto quedó adentro de una tabla auditada', async () => {
    // El día que alguien agregue `token_mercadopago` a una tabla auditada, se entera acá y
    // no cuando un volcado de la auditoría valga más que la base.
    const sospechosas: string[] = []

    for (const t of TABLAS_AUDITADAS) {
      const { rows } = await e.poolDuenio.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = $1`,
        [t.tabla],
      )
      for (const { column_name } of rows) {
        if (!COLUMNAS_SECRETAS.test(column_name)) continue
        if (t.sinColumnas?.includes(column_name)) continue
        sospechosas.push(`${t.tabla}.${column_name}`)
      }
    }

    expect(sospechosas).toEqual([])
  })
})

describe('las tablas acotadas', () => {
  it('el stock sólo se audita cuando cambia dónde está o cuál es el mínimo', async () => {
    const [repuesto] = (
      await e.poolDuenio.query<{ id: string }>(
        `insert into repuesto (tenant_id, codigo, descripcion, precio_venta)
         values ($1, 'F001', 'Filtro de aceite', '1000') returning id`,
        [TENANT_A],
      )
    ).rows
    const [sucursal] = (
      await e.poolDuenio.query<{ id: string }>(
        `insert into empresa (tenant_id, razon_social, cuit, condicion_iva)
           values ($1, 'Litoral SAS', '30712345671', 1) returning id`,
        [TENANT_A],
      )
    ).rows
    const [suc] = (
      await e.poolDuenio.query<{ id: string }>(
        `insert into sucursal (tenant_id, empresa_id, nombre)
           values ($1, $2, 'Casa Central') returning id`,
        [TENANT_A, sucursal?.id],
      )
    ).rows

    await comoApp(
      `insert into repuesto_stock (tenant_id, repuesto_id, sucursal_id, cantidad)
       values ($1, $2, $3, '10')`,
      [TENANT_A, repuesto?.id, suc?.id],
    )
    const despuesDelAlta = (await cambiosDe('repuesto_stock')).length

    // Una venta mueve la cantidad: eso ya lo cuenta movimiento_stock, y auditarlo acá
    // llenaría el registro de ruido.
    await comoApp(`update repuesto_stock set cantidad = '9' where repuesto_id = $1`, [repuesto?.id])
    expect(await cambiosDe('repuesto_stock')).toHaveLength(despuesDelAlta)

    // Mover el mínimo sí: es lo que después dispara el pedido a fábrica.
    await comoApp(`update repuesto_stock set minimo = '5' where repuesto_id = $1`, [repuesto?.id])
    expect(await cambiosDe('repuesto_stock')).toHaveLength(despuesDelAlta + 1)
  })

  it('del libro de stock sólo interesa que alguien borre una línea', async () => {
    const { rows } = await e.poolDuenio.query<{ id: string }>(`select id from repuesto limit 1`)
    const [suc] = (await e.poolDuenio.query<{ id: string }>(`select id from sucursal limit 1`)).rows

    const [mov] = (
      await e.poolDuenio.query<{ id: string }>(
        `insert into movimiento_stock
           (tenant_id, repuesto_id, sucursal_id, usuario_id, cantidad, saldo, tipo, motivo)
         values ($1, $2, $3, $4, '1', '1', 'ajuste', 'recuento') returning id`,
        [TENANT_A, rows[0]?.id, suc?.id, USUARIO_A],
      )
    ).rows
    expect(await cambiosDe('movimiento_stock')).toHaveLength(0)

    await e.poolDuenio.query(`delete from movimiento_stock where id = $1`, [mov?.id])
    const filas = await cambiosDe('movimiento_stock')
    expect(filas).toHaveLength(1)
    expect(filas[0]?.accion).toBe('baja')
  })
})

describe('ninguna tabla queda sin clasificar', () => {
  it('toda tabla con datos de un cliente está auditada o excluida con su motivo', () => {
    // Éste es el test que hace que esto escale: el módulo nuevo trae tablas nuevas, y la que
    // no se clasifique rompe acá en vez de quedar sin registro durante dos años.
    const auditadas = new Set(TABLAS_AUDITADAS.map((t) => t.tabla))
    const sinClasificar = TABLAS_CON_TENANT.filter(
      (t) => !auditadas.has(t) && !(t in TABLAS_SIN_AUDITAR),
    )

    expect(sinClasificar).toEqual([])
  })

  it('ninguna está en las dos listas', () => {
    const dosVeces = TABLAS_AUDITADAS.filter((t) => t.tabla in TABLAS_SIN_AUDITAR).map(
      (t) => t.tabla,
    )
    expect(dosVeces).toEqual([])
  })

  it('cada exclusión dice por qué', () => {
    for (const [tabla, motivo] of Object.entries(TABLAS_SIN_AUDITAR)) {
      expect(motivo.length, tabla).toBeGreaterThan(20)
    }
  })

  it('cada tabla auditada tiene su trigger puesto en la base', async () => {
    const { rows } = await e.poolDuenio.query<{ event_object_table: string }>(
      `select distinct event_object_table from information_schema.triggers
        where trigger_name like 'auditar\\_%'`,
    )
    const conTrigger = new Set(rows.map((r) => r.event_object_table))
    const faltantes = TABLAS_AUDITADAS.map((t) => t.tabla).filter((t) => !conTrigger.has(t))

    expect(faltantes).toEqual([])
  })

  it('ninguna excluida quedó con trigger de una corrida anterior', async () => {
    const { rows } = await e.poolDuenio.query<{ event_object_table: string }>(
      `select distinct event_object_table from information_schema.triggers
        where trigger_name like 'auditar\\_%'`,
    )
    const deMas = rows.map((r) => r.event_object_table).filter((t) => t in TABLAS_SIN_AUDITAR)

    expect(deMas).toEqual([])
  })
})
