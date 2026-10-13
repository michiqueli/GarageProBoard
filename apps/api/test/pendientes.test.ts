import 'reflect-metadata'
import { eq } from '@gpb/db'
import { orden, vehiculo, vehiculoPendiente } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loQueNoSeHizo } from '../src/ordenes/ordenes.service.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Lo que no se hizo queda con el vehículo: se anota al entregarlo, la recepción siguiente lo
 * ofrece y se suma a la orden nueva, o se descarta con motivo. Ver `docs/tecnicos/egreso.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let tenantId: string
let vehiculoId: string

const pedir = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${gerente}` },
    ...(payload ? { payload } : {}),
  })

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'pendientes',
    email: 'gerente@pendientes.test',
    vehiculos: [{ chasis: '8AJFB8CD5N5556667', dominio: 'AC222DE' }],
  })
  tenantId = semilla.tenant.id
  const [auto] = await api.pg.dbDuenio
    .select()
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, tenantId))
  vehiculoId = auto?.id as string
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email: 'gerente@pendientes.test', password: CLAVE, entrega: 'cuerpo' },
  })
  gerente = r.json().access
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('lo que no se hizo', () => {
  it('lo rechazado del presupuesto queda pendiente al entregar el auto', async () => {
    const abierta = await pedir('POST', '/ordenes', {
      vehiculoId,
      pedido: 'Service y frenos',
      items: [
        { tipo: 'trabajo', descripcion: 'Service', cantidad: '1', precioUnitario: '60000' },
        {
          tipo: 'trabajo',
          descripcion: 'Cambio de pastillas',
          cantidad: '1',
          precioUnitario: '30000',
        },
      ],
    })
    expect(abierta.statusCode, abierta.body).toBe(201)
    const o = abierta.json()
    const pastillas = o.items[1]

    const presupuesto = await pedir('POST', `/ordenes/${o.id}/presupuestos`, {
      itemIds: [pastillas.id],
    })
    expect(presupuesto.statusCode, presupuesto.body).toBe(201)
    const respuesta = await pedir(
      'POST',
      `/ordenes/${o.id}/presupuestos/${presupuesto.json().presupuestos[0].id}/respuesta`,
      { autorizados: [], autorizaNombre: 'Jorge', medio: 'telefono' },
    )
    expect(respuesta.statusCode, respuesta.body).toBe(200)
    expect((await pedir('POST', `/ordenes/${o.id}/terminar`)).statusCode).toBe(200)

    // La factura se prueba en caja, contra AFIP de mentira: acá alcanza con que esté facturada.
    await api.pg.dbDuenio.update(orden).set({ estado: 'facturada' }).where(eq(orden.id, o.id))
    const entregada = await pedir('POST', `/ordenes/${o.id}/entregar`)
    expect(entregada.statusCode, entregada.body).toBe(200)

    const pendientes = (await pedir('GET', `/vehiculos/${vehiculoId}/pendientes`)).json().datos
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]).toMatchObject({
      descripcion: 'Cambio de pastillas',
      origen: 'presupuesto',
      semaforo: null,
      orden: { id: o.id, numero: o.numero },
    })
  })

  it('la recepción siguiente lo suma a la orden nueva, sin precio, y deja de estar pendiente', async () => {
    const [pendiente] = (await pedir('GET', `/vehiculos/${vehiculoId}/pendientes`)).json().datos
    const nueva = await pedir('POST', '/ordenes', {
      vehiculoId,
      pedido: 'Vuelve por los frenos',
      pendienteIds: [pendiente.id],
    })
    expect(nueva.statusCode, nueva.body).toBe(201)
    expect(nueva.json().items).toMatchObject([
      { tipo: 'trabajo', descripcion: 'Cambio de pastillas', total: '0.00' },
    ])
    expect((await pedir('GET', `/vehiculos/${vehiculoId}/pendientes`)).json().datos).toEqual([])

    const [fila] = await api.pg.dbDuenio
      .select()
      .from(vehiculoPendiente)
      .where(eq(vehiculoPendiente.id, pendiente.id))
    expect(fila).toMatchObject({ resolucion: 'en_orden', resueltoOrdenId: nueva.json().id })
  })

  it('se descarta con motivo, una sola vez', async () => {
    const [o] = await api.pg.dbDuenio.select().from(orden).where(eq(orden.tenantId, tenantId))
    const [creado] = await api.pg.dbDuenio
      .insert(vehiculoPendiente)
      .values({
        tenantId,
        vehiculoId,
        ordenId: o?.id as string,
        origen: 'revision',
        descripcion: 'Neumáticos traseros: desgaste parejo',
        semaforo: 'ambar',
      })
      .returning()

    const sinMotivo = await pedir('POST', `/vehiculos/pendientes/${creado?.id}/descartar`, {
      motivo: '',
    })
    expect(sinMotivo.statusCode).toBe(400)
    const r = await pedir('POST', `/vehiculos/pendientes/${creado?.id}/descartar`, {
      motivo: 'Los cambió en otro lado',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect((await pedir('GET', `/vehiculos/${vehiculoId}/pendientes`)).json().datos).toEqual([])

    const otraVez = await pedir('POST', `/vehiculos/pendientes/${creado?.id}/descartar`, {
      motivo: 'Otra vez',
    })
    expect(otraVez.statusCode).toBe(404)
  })
})

describe('qué cuenta como no hecho', () => {
  const punto = (estado: 'verde' | 'ambar' | 'rojo', itemId: string | null) => ({
    estado,
    nota: null,
    nombre: 'Pastillas de freno',
    seccion: 'frenos' as never,
    por: 'Ana',
    en: '2026-10-13T10:00:00Z',
    itemId,
  })

  it('lo rechazado lleva el color del punto del que salió; lo que no pasó a la orden, también', () => {
    const items = [
      { id: 'i1', descripcion: 'Pastillas de freno', autorizacion: 'rechazado' },
      { id: 'i2', descripcion: 'Service', autorizacion: null },
    ]
    const revision = {
      p1: punto('rojo', 'i1'),
      p2: { ...punto('ambar', null), nombre: 'Escobillas' },
      p3: { ...punto('verde', null), nombre: 'Luces' },
      // El punto que pasó a la orden y se hizo no queda pendiente.
      p4: { ...punto('ambar', 'i2'), nombre: 'Aceite' },
    }
    expect(loQueNoSeHizo(revision, items)).toEqual([
      { origen: 'presupuesto', descripcion: 'Pastillas de freno', semaforo: 'rojo' },
      { origen: 'revision', descripcion: 'Escobillas', semaforo: 'ambar' },
    ])
  })
})
