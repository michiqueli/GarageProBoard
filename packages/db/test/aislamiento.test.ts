import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { conTenant } from '../src/index.ts'
import { ROL_APP, TABLAS_CON_TENANT } from '../src/rls/index.ts'
import { vehiculo } from '../src/schema/index.ts'
import {
  type EntornoPrueba,
  errorPg,
  levantarEntorno,
  SQLSTATE,
  sembrar,
  TENANT_A,
  TENANT_B,
} from './entorno.ts'

let e: EntornoPrueba

beforeAll(async () => {
  e = await levantarEntorno()
  await sembrar(e.poolDuenio)
})

afterAll(async () => {
  await e?.cerrar()
})

describe('aislamiento entre concesionarias', () => {
  it('cada tenant ve solamente sus vehículos', async () => {
    const deA = await conTenant(e.dbApp, TENANT_A, (tx) => tx.select().from(vehiculo))
    const deB = await conTenant(e.dbApp, TENANT_B, (tx) => tx.select().from(vehiculo))

    expect(deA).toHaveLength(2)
    expect(deB).toHaveLength(1)
    expect(deA.map((v) => v.dominio).sort()).toEqual(['AB123CD', 'ABC123'])
    expect(deB[0]?.dominio).toBe('XY987ZW')
  })

  it('el tenant A no puede leer un vehículo del B ni sabiendo su patente', async () => {
    const encontrado = await conTenant(e.dbApp, TENANT_A, (tx) =>
      tx.select().from(vehiculo).where(sql`dominio = 'XY987ZW'`),
    )
    expect(encontrado).toHaveLength(0)
  })

  it('sin tenant en la sesión la consulta falla, no devuelve todo', async () => {
    // Ésta es la propiedad que justifica llamar a current_setting sin missing_ok:
    // una consulta que se escapó de conTenant() tiene que romperse ruidosamente.
    const error = await errorPg(e.dbApp.select().from(vehiculo))
    expect(error.code).toBe(SQLSTATE.SIN_TENANT)
    expect(error.message).toMatch(/conTenant/)
  })

  it('no se puede insertar una fila a nombre de otro tenant', async () => {
    const error = await errorPg(
      conTenant(e.dbApp, TENANT_A, (tx) =>
        tx.insert(vehiculo).values({
          tenantId: TENANT_B,
          chasis: 'INTRUSO1234567890',
        }),
      ),
    )
    // El WITH CHECK de la política: no alcanza con filtrar lo que se lee.
    expect(error.code).toBe(SQLSTATE.VIOLA_RLS)
  })

  it('no se puede modificar ni borrar lo ajeno', async () => {
    const modificados = await conTenant(e.dbApp, TENANT_A, (tx) =>
      tx.execute(sql`update vehiculo set color = 'rojo' where dominio = 'XY987ZW'`),
    )
    expect(modificados.rowCount).toBe(0)

    const borrados = await conTenant(e.dbApp, TENANT_A, (tx) =>
      tx.execute(sql`delete from vehiculo where dominio = 'XY987ZW'`),
    )
    expect(borrados.rowCount).toBe(0)
  })

  it('el tenant no se queda pegado a la conexión cuando vuelve al pool', async () => {
    // El pool reutiliza conexiones. Si set_config no fuera local a la transacción,
    // el siguiente request heredaría el tenant del anterior: la peor fuga posible,
    // porque es intermitente y depende de la carga.
    await conTenant(e.dbApp, TENANT_A, (tx) => tx.select().from(vehiculo))
    // Y falla con el MISMO error que la primera vez: set_config local revierte el
    // parámetro a cadena vacía, no lo borra, y app_tenant_id() cubre los dos casos.
    const errorTrasVolver = await errorPg(e.dbApp.select().from(vehiculo))
    expect(errorTrasVolver.code).toBe(SQLSTATE.SIN_TENANT)
  })
})

describe('configuración del aislamiento', () => {
  it('el rol de la aplicación no puede saltearse RLS', async () => {
    const { rows } = await e.poolDuenio.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      'select rolbypassrls, rolsuper from pg_roles where rolname = $1',
      [ROL_APP],
    )
    expect(rows[0]?.rolbypassrls).toBe(false)
    expect(rows[0]?.rolsuper).toBe(false)
  })

  it('toda tabla con tenant_id está declarada y protegida', async () => {
    // El agujero realista no es una política mal escrita: es una tabla nueva que
    // se sumó al esquema y a nadie se le ocurrió agregarla a TABLAS_CON_TENANT.
    const { rows } = await e.poolDuenio.query<{ tabla: string }>(`
      select c.relname as tabla
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
       where n.nspname = 'public'
         and c.relkind = 'r'
         and a.attname = 'tenant_id'
         and not a.attisdropped
       order by 1
    `)

    const enLaBase = rows.map((r) => r.tabla).sort()
    expect(enLaBase).toEqual([...TABLAS_CON_TENANT].sort())
  })

  it('todas tienen RLS habilitado y forzado', async () => {
    const { rows } = await e.poolDuenio.query<{
      tabla: string
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      `
      select c.relname as tabla, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relname = any($1)
    `,
      [[...TABLAS_CON_TENANT, 'tenant']],
    )

    for (const fila of rows) {
      expect(fila.relrowsecurity, `${fila.tabla} sin RLS`).toBe(true)
      // FORCE es lo que impide que el dueño de la tabla se saltee la política.
      expect(fila.relforcerowsecurity, `${fila.tabla} sin FORCE`).toBe(true)
    }
    expect(rows).toHaveLength(TABLAS_CON_TENANT.length + 1)
  })
})
