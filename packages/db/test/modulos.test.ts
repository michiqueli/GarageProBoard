import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { conTenant, modulosVigentes } from '../src/index.ts'
import { tenantModulo } from '../src/schema/index.ts'
import {
  type EntornoPrueba,
  errorPg,
  levantarEntorno,
  SQLSTATE,
  sembrar,
  TENANT_A,
  TENANT_B,
} from './entorno.ts'

/**
 * Los módulos contratados: qué cuenta como prendido, y que la concesionaria no pueda
 * cambiar lo que compró.
 */

let e: EntornoPrueba

beforeAll(async () => {
  e = await levantarEntorno()
  await sembrar(e.poolDuenio)

  // Lo escribe el dueño, que es lo que hará el back-office con su propio rol.
  await e.poolDuenio.query(`
    insert into tenant_modulo (tenant_id, modulo, activo, vigente_desde, vigente_hasta) values
      ('${TENANT_A}', 'nucleo',    true,  now() - interval '1 year', null),
      ('${TENANT_A}', 'servicios', true,  now() - interval '1 year', now() + interval '1 month'),
      -- Suspendido: la llave apagada, el contrato intacto.
      ('${TENANT_A}', 'contable',  false, now() - interval '1 year', null),
      -- La prueba de treinta días que ya terminó.
      ('${TENANT_A}', 'repuestos', true,  now() - interval '40 days', now() - interval '10 days'),
      -- Contratado para el mes que viene.
      ('${TENANT_A}', 'rrhh',      true,  now() + interval '1 month', null),
      ('${TENANT_B}', 'nucleo',    true,  now() - interval '1 year', null),
      ('${TENANT_B}', 'cartera',   true,  now() - interval '1 year', null);
  `)
})

afterAll(async () => {
  await e?.cerrar()
})

describe('qué módulos están prendidos', () => {
  it('sólo los que tienen la llave puesta y el período corriendo', async () => {
    const prendidos = await conTenant(e.dbApp, TENANT_A, modulosVigentes)
    expect(prendidos).toEqual(['nucleo', 'servicios'])
  })

  it('cada concesionaria ve sólo los suyos', async () => {
    const prendidos = await conTenant(e.dbApp, TENANT_B, modulosVigentes)
    expect(prendidos).toEqual(['nucleo', 'cartera'])
  })
})

describe('la aplicación no puede cambiar lo que se contrató', () => {
  it('no puede darse de alta un módulo', async () => {
    const error = await errorPg(
      conTenant(e.dbApp, TENANT_A, (tx) =>
        tx.insert(tenantModulo).values({ tenantId: TENANT_A, modulo: 'ventas' }),
      ),
    )
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('no puede prender uno suspendido', async () => {
    const error = await errorPg(
      conTenant(e.dbApp, TENANT_A, (tx) => tx.update(tenantModulo).set({ activo: true })),
    )
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('ni borrar uno para esconder que lo tenía', async () => {
    const error = await errorPg(conTenant(e.dbApp, TENANT_A, (tx) => tx.delete(tenantModulo)))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })
})

describe('la tabla rechaza lo que no tiene sentido', () => {
  it('un módulo que el sistema no conoce', async () => {
    const error = await errorPg(
      e.poolDuenio.query(
        `insert into tenant_modulo (tenant_id, modulo) values ('${TENANT_B}', 'inventado')`,
      ),
    )
    expect(error.message).toMatch(/tenant_modulo_conocido/)
  })

  it('un período que termina antes de empezar', async () => {
    const error = await errorPg(
      e.poolDuenio.query(
        `insert into tenant_modulo (tenant_id, modulo, vigente_desde, vigente_hasta)
         values ('${TENANT_B}', 'ventas', now(), now() - interval '1 day')`,
      ),
    )
    expect(error.message).toMatch(/tenant_modulo_vigencia/)
  })
})
