import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sembrarHojasPorOmision } from '../src/index.ts'
import { hojaImagen } from '../src/schema/index.ts'
import { type EntornoPrueba, levantarEntorno, sembrar, TENANT_A, TENANT_B } from './entorno.ts'

/** El dibujo de la hoja que trae el sistema va donde falta uno, y nunca encima de uno propio. */

let e: EntornoPrueba

beforeAll(async () => {
  e = await levantarEntorno()
  await sembrar(e.poolDuenio)
  // Automotores Litoral ya subió su sedán.
  await e.dbDuenio.insert(hojaImagen).values({
    tenantId: TENANT_A,
    tipo: 'sedan',
    ruta: 'hojas/sedan/propia.png',
    formato: 'image/png',
    ancho: 1200,
    alto: 800,
    bytes: 1000,
  })
})

afterAll(async () => {
  await e?.cerrar()
})

const vigentes = (tenantId: string) =>
  e.dbDuenio
    .select()
    .from(hojaImagen)
    .where(and(eq(hojaImagen.tenantId, tenantId), isNull(hojaImagen.reemplazadaEn)))

describe('los dibujos por omisión', () => {
  it('van a cada carrocería sin dibujo, y el propio queda', async () => {
    expect(await sembrarHojasPorOmision(e.dbDuenio)).toBe(7)

    const litoral = await vigentes(TENANT_A)
    expect(litoral).toHaveLength(4)
    expect(litoral.find((h) => h.tipo === 'sedan')).toMatchObject({
      porOmision: false,
      ruta: 'hojas/sedan/propia.png',
    })
    expect(
      litoral
        .filter((h) => h.porOmision)
        .map((h) => h.tipo)
        .sort(),
    ).toEqual(['hatchback', 'pickup', 'suv'])
    expect((await vigentes(TENANT_B)).every((h) => h.porOmision)).toBe(true)
  })

  it('correrla otra vez no agrega nada', async () => {
    expect(await sembrarHojasPorOmision(e.dbDuenio)).toBe(0)
  })
})
