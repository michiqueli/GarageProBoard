import 'reflect-metadata'
import { eq } from '@gpb/db'
import { orden, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El egreso: el auto vuelve al cliente. Se anota cómo sale contra cómo entró; se entrega
 * facturada, o sin factura si lo autoriza quien puede y dice por qué. Ver
 * `docs/tecnicos/egreso.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let asesor: string
const autos: string[] = []

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

const pedir = (access: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })

/** Una orden recibida con 10.000 km y el auxilio, y terminada: lista para entregar. */
async function terminada(vehiculoId: string) {
  const abierta = await pedir(gerente, 'POST', '/ordenes', {
    vehiculoId,
    pedido: 'Service',
    kilometraje: 10000,
    combustible: 'medio',
    inventario: { auxilio: 'esta', gato: 'falta' },
    items: [{ tipo: 'trabajo', descripcion: 'Service', cantidad: '1', precioUnitario: '60000' }],
  })
  expect(abierta.statusCode, abierta.body).toBe(201)
  const id = abierta.json().id as string
  expect((await pedir(gerente, 'POST', `/ordenes/${id}/terminar`)).statusCode).toBe(200)
  return id
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'egreso',
    email: 'gerente@egreso.test',
    otros: [{ email: 'asesor@egreso.test', rol: 'Asesor de servicios' }],
    vehiculos: [
      { chasis: '8AJFB8CD5N7778889', dominio: 'AD333EF' },
      { chasis: '8AJFB8CD5N7778890', dominio: 'AD333EG' },
    ],
  })
  const filas = await api.pg.dbDuenio
    .select({ id: vehiculo.id })
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  autos.push(...filas.map((f) => f.id))
  gerente = await entrar('gerente@egreso.test')
  asesor = await entrar('asesor@egreso.test')
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('sin factura', () => {
  let ordenId: string

  it('terminada y sin factura no se entrega, y el asesor no lo puede autorizar', async () => {
    ordenId = await terminada(autos[0] as string)

    const antes = await pedir(asesor, 'GET', `/ordenes/${ordenId}/egreso/pdf`)
    expect(antes.statusCode).toBe(409)

    const sinMotivo = await pedir(asesor, 'POST', `/ordenes/${ordenId}/entregar`, {})
    expect(sinMotivo.statusCode).toBe(409)
    expect(sinMotivo.json().data.motivo).toMatch(/Falta facturarla/)

    const conMotivo = await pedir(asesor, 'POST', `/ordenes/${ordenId}/entregar`, {
      sinFactura: { motivo: 'Garantía: se factura a la terminal' },
    })
    expect(conMotivo.statusCode).toBe(403)
    expect(conMotivo.json().code).toBe('SIN_AUTORIZACION')
  })

  it('los km de salida no pueden ser menos que los de entrada', async () => {
    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/entregar`, {
      kilometraje: 9000,
      sinFactura: { motivo: 'Garantía: se factura a la terminal' },
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().code).toBe('KILOMETRAJE_MENOR')
  })

  it('quien puede autorizar la entrega sin factura, y queda cómo salió', async () => {
    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/entregar`, {
      kilometraje: 10012,
      combustible: 'cuarto',
      inventario: { auxilio: 'esta', gato: 'falta' },
      danios: [{ tipo: 'rayon', x: 0.4, y: 0.5, nota: 'Puerta trasera' }],
      sinFactura: { motivo: 'Garantía: se factura a la terminal' },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      estado: 'entregada',
      egreso: {
        entregadaPor: 'Prueba Gerente',
        kilometraje: 10012,
        combustible: 'cuarto',
        inventario: { auxilio: 'esta', gato: 'falta' },
        danios: [{ tipo: 'rayon', nota: 'Puerta trasera' }],
        sinFactura: {
          motivo: 'Garantía: se factura a la terminal',
          autorizadoPor: 'Prueba Gerente',
        },
      },
    })

    // Los km de salida quedan en el auto.
    const [auto] = await api.pg.dbDuenio
      .select({ km: vehiculo.kilometraje })
      .from(vehiculo)
      .where(eq(vehiculo.id, autos[0] as string))
    expect(auto?.km).toBe(10012)
  })
})

describe('facturada', () => {
  it('cualquiera que edite órdenes la entrega, sin autorización', async () => {
    const id = await terminada(autos[1] as string)
    // La factura se prueba en caja, contra AFIP de mentira: acá alcanza con que esté facturada.
    await api.pg.dbDuenio.update(orden).set({ estado: 'facturada' }).where(eq(orden.id, id))

    const lista = (await pedir(asesor, 'GET', '/ordenes?estado=para_entregar')).json().datos
    expect(lista.map((o: { id: string }) => o.id)).toEqual([id])

    const r = await pedir(asesor, 'POST', `/ordenes/${id}/entregar`, {
      kilometraje: 10003,
      // Una factura no necesita autorización: si viene, no se anota.
      sinFactura: { motivo: 'No hace falta' },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().egreso).toMatchObject({
      entregadaPor: 'Prueba Asesor de servicios',
      sinFactura: null,
    })
    expect(r.json().noSeHizo).toEqual([])

    // El comprobante de la entrega sale una vez entregado.
    const pdf = await pedir(asesor, 'GET', `/ordenes/${id}/egreso/pdf`)
    expect(pdf.statusCode, pdf.body).toBe(200)
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')

    expect((await pedir(asesor, 'GET', '/ordenes?estado=para_entregar')).json().datos).toEqual([])
  })
})
