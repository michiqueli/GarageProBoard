import type { Pool } from 'pg'
import type { Db } from '../src/index.ts'
import { levantarPostgres, type PostgresDePrueba } from '../src/pruebas.ts'

export interface EntornoPrueba {
  poolDuenio: Pool
  dbDuenio: Db
  poolApp: Pool
  dbApp: Db
  poolBackoffice: Pool
  dbBackoffice: Db
  cerrar: () => Promise<void>
}

export async function levantarEntorno(): Promise<EntornoPrueba> {
  const pg: PostgresDePrueba = await levantarPostgres()
  return {
    poolDuenio: pg.poolDuenio,
    dbDuenio: pg.dbDuenio,
    poolApp: pg.poolApp,
    dbApp: pg.dbApp,
    poolBackoffice: pg.poolBackoffice,
    dbBackoffice: pg.dbBackoffice,
    cerrar: pg.cerrar,
  }
}

/** Dos concesionarias distintas, cada una con su vehículo. El caso mínimo que importa. */
export const TENANT_A = '11111111-1111-4111-8111-111111111111'
export const TENANT_B = '22222222-2222-4222-8222-222222222222'

export async function sembrar(pool: Pool): Promise<void> {
  await pool.query(`
    insert into condicion_iva (codigo, descripcion, discrimina_iva) values
      (1, 'IVA Responsable Inscripto', true),
      (5, 'Consumidor Final', false),
      (6, 'Responsable Monotributo', false)
    on conflict do nothing;

    insert into tenant (id, nombre, slug) values
      ('${TENANT_A}', 'Automotores Litoral', 'automotores-litoral'),
      ('${TENANT_B}', 'Concesionaria del Norte', 'del-norte');

    insert into vehiculo (tenant_id, chasis, dominio, anio) values
      ('${TENANT_A}', '8AWZZZ377KA123456', 'AB123CD', 2019),
      ('${TENANT_A}', '9BWZZZ377KA654321', 'ABC123',  2014),
      ('${TENANT_B}', '3VWZZZ377KA999888', 'XY987ZW', 2021);
  `)
}

/** SQLSTATE de Postgres que nos interesan. */
export const SQLSTATE = {
  /** raise_exception: lo que levanta app_tenant_id() cuando no hay tenant. */
  SIN_TENANT: 'P0001',
  /** new row violates row-level security policy. */
  VIOLA_RLS: '42501',
  /**
   * insufficient_privilege. Es el mismo código que el de RLS: se distinguen por el caso.
   * Un insert en el propio tenant no viola ninguna política, y un update o un delete que
   * RLS filtrara no fallaría, devolvería cero filas.
   */
  SIN_PRIVILEGIO: '42501',
} as const

const SIN_ERROR = Symbol('sin-error')

/**
 * Devuelve el error de Postgres que hay debajo de una promesa que tiene que fallar.
 *
 * Drizzle envuelve la excepción en una propia ('Failed query: …') y deja la
 * original en `cause`, así que afirmar sobre el mensaje de arriba no prueba nada.
 * Comparar contra el SQLSTATE además es más sólido que contra el texto, que
 * cambia con el idioma del servidor.
 */
export async function errorPg(
  promesa: Promise<unknown>,
): Promise<{ code: string | undefined; message: string }> {
  let capturado: unknown = SIN_ERROR
  try {
    await promesa
  } catch (error) {
    capturado = error
  }

  if (capturado === SIN_ERROR) {
    throw new Error('Se esperaba que la consulta fallara y pasó sin error.')
  }

  let actual = capturado as { cause?: unknown; code?: string; message?: string }
  while (actual?.cause) {
    actual = actual.cause as typeof actual
  }

  return { code: actual?.code, message: String(actual?.message ?? actual) }
}
