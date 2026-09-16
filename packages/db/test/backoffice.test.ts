import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { conTenant, eq } from '../src/index.ts'
import {
  auditoriaBackoffice,
  empresa,
  operador,
  tenant,
  tenantModulo,
  vehiculo,
} from '../src/schema/index.ts'
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
 * Los dos roles, cada uno en su carril: la API no ve nada del back-office, y el
 * back-office ve todas las concesionarias pero sólo lo que hace a su contrato.
 */

let e: EntornoPrueba
let operadorId: string

beforeAll(async () => {
  e = await levantarEntorno()
  await sembrar(e.poolDuenio)

  const { rows } = await e.poolDuenio.query<{ id: string }>(`
    insert into operador (email, hash_password, nombre)
    values ('ops@garagepro.test', 'hash', 'Operaciones') returning id
  `)
  operadorId = rows[0]?.id ?? ''

  await e.poolDuenio.query(`
    insert into tenant_modulo (tenant_id, modulo) values
      ('${TENANT_A}', 'nucleo'), ('${TENANT_A}', 'contable'), ('${TENANT_B}', 'nucleo');
  `)
})

afterAll(async () => {
  await e?.cerrar()
})

describe('la API no ve el back-office', () => {
  it('ni los operadores', async () => {
    const error = await errorPg(e.dbApp.select().from(operador))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('ni la auditoría de lo que hicimos', async () => {
    const error = await errorPg(e.dbApp.select().from(auditoriaBackoffice))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('y sigue sin ver las concesionarias de otros', async () => {
    // La política de aislamiento de `tenant` pasó a aplicarse sólo a la API: que eso no
    // la haya aflojado.
    const vistas = await conTenant(e.dbApp, TENANT_A, (tx) => tx.select().from(tenant))
    expect(vistas.map((t) => t.id)).toEqual([TENANT_A])
  })
})

describe('el back-office ve todas las concesionarias', () => {
  it('las lista sin fijar un tenant', async () => {
    const todas = await e.dbBackoffice.select().from(tenant)
    expect(todas.map((t) => t.id).sort()).toEqual([TENANT_A, TENANT_B].sort())
  })

  it('y los módulos de todas', async () => {
    const modulos = await e.dbBackoffice.select().from(tenantModulo)
    expect(modulos).toHaveLength(3)
  })

  it('puede apagar un módulo', async () => {
    await e.dbBackoffice
      .update(tenantModulo)
      .set({ activo: false })
      .where(eq(tenantModulo.modulo, 'contable'))

    const { rows } = await e.poolDuenio.query(
      `select activo from tenant_modulo where modulo = 'contable'`,
    )
    expect(rows[0]?.activo).toBe(false)
  })

  it('pero no borrarlo: apagado no es borrado', async () => {
    const error = await errorPg(e.dbBackoffice.delete(tenantModulo))
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })
})

describe('el back-office no ve los datos de las concesionarias', () => {
  it('ni con un tenant fijado', async () => {
    const error = await errorPg(
      conTenant(e.dbBackoffice, TENANT_A, (tx) => tx.select().from(vehiculo)),
    )
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('y lo que da de alta queda dentro de la concesionaria que fijó', async () => {
    const error = await errorPg(
      conTenant(e.dbBackoffice, TENANT_A, (tx) =>
        tx.insert(empresa).values({
          tenantId: TENANT_B,
          razonSocial: 'Intrusa SAS',
          cuit: '30111111118',
          condicionIva: 1,
        }),
      ),
    )
    expect(error.code).toBe(SQLSTATE.VIOLA_RLS)
  })
})

describe('la auditoría no se toca', () => {
  it('se escribe y se lee', async () => {
    await e.dbBackoffice
      .insert(auditoriaBackoffice)
      .values({ operadorId, tenantAfectado: TENANT_A, accion: 'modulo', motivo: 'prueba' })

    const filas = await e.dbBackoffice.select().from(auditoriaBackoffice)
    expect(filas).toHaveLength(1)
  })

  it('pero no se corrige ni se borra', async () => {
    const corregir = await errorPg(
      e.dbBackoffice.update(auditoriaBackoffice).set({ motivo: 'otro' }),
    )
    expect(corregir.code).toBe(SQLSTATE.SIN_PRIVILEGIO)

    const borrar = await errorPg(e.dbBackoffice.delete(auditoriaBackoffice))
    expect(borrar.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })

  it('y el panel no puede crear operadores', async () => {
    const error = await errorPg(
      e.dbBackoffice
        .insert(operador)
        .values({ email: 'yo@x.test', hashPassword: 'h', nombre: 'Yo' }),
    )
    expect(error.code).toBe(SQLSTATE.SIN_PRIVILEGIO)
  })
})
