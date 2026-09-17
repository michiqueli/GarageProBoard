import 'reflect-metadata'
import { eq } from '@gpb/db'
import { cliente, entidadComercial, titularidad, usuario, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Órdenes de trabajo: la recepción, lo que se carga, los estados y quién puede qué. El paso a
 * caja y la facturación se prueban en comprobantes.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let mecanico: string
let mecanicoId: string
let vehiculoId: string
let otroVehiculoId: string
let titularId: string

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'ordenes',
    email: 'gerente@ordenes.test',
    otros: [{ email: 'mecanico@ordenes.test', rol: 'Mecánico' }],
    vehiculos: [
      { chasis: '8AJFB8CD5N1234567', dominio: 'AE123BC' },
      { chasis: '9BWZZZ377VT004251', dominio: 'AB123CD' },
    ],
  })
  const db = api.pg.dbDuenio
  const tenantId = semilla.tenant.id
  const autos = await db.select().from(vehiculo).where(eq(vehiculo.tenantId, tenantId))
  vehiculoId = autos.find((a) => a.dominio === 'AE123BC')?.id as string
  otroVehiculoId = autos.find((a) => a.dominio === 'AB123CD')?.id as string

  const [e] = await db
    .insert(entidadComercial)
    .values({
      tenantId,
      tipoDocumento: 80,
      numeroDocumento: '30711111111',
      tipoPersona: 'juridica',
      razonSocial: 'Transportes del Sur SRL',
      condicionIva: 1,
    })
    .returning()
  titularId = e?.id as string
  await db.insert(cliente).values({ id: titularId, tenantId })
  await db
    .insert(titularidad)
    .values({ tenantId, vehiculoId, clienteId: titularId, desde: '2024-01-01' })

  const [m] = await db.select().from(usuario).where(eq(usuario.email, 'mecanico@ordenes.test'))
  mecanicoId = m?.id as string
  gerente = await entrar('gerente@ordenes.test')
  mecanico = await entrar('mecanico@ordenes.test')
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

function pedir(access: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

const SERVICE = [
  { tipo: 'trabajo', descripcion: 'Service 50.000 km', cantidad: '1', precioUnitario: '180000' },
  { tipo: 'repuesto', descripcion: 'Aceite 5W30', cantidad: '6', precioUnitario: '12000.50' },
]

let ordenId: string

describe('la recepción', () => {
  it('abre la orden 1 de la sucursal, con el titular como quien paga y los kilómetros al día', async () => {
    const r = await pedir(gerente, 'POST', '/ordenes', {
      vehiculoId,
      traeNombre: 'Juan Gómez',
      traeTelefono: '342 555-1234',
      kilometraje: 48210,
      combustible: 'medio',
      pedido: 'Service de 50.000 km. Ruido al frenar.',
      observaciones: 'Rayón en paragolpes trasero',
      prometidaPara: '2026-09-18',
    })
    expect(r.statusCode).toBe(201)
    const o = r.json()
    ordenId = o.id
    expect(o).toMatchObject({
      numero: 1,
      estado: 'recibida',
      vehiculo: { dominio: 'AE123BC' },
      titular: { id: titularId, razonSocial: 'Transportes del Sur SRL' },
      paga: { id: titularId },
      kilometraje: 48210,
      total: '0.00',
      items: [],
    })

    const [auto] = await api.pg.dbDuenio.select().from(vehiculo).where(eq(vehiculo.id, vehiculoId))
    expect(auto?.kilometraje).toBe(48210)
  })

  it('el mismo auto no entra dos veces al taller; otro auto lleva el número siguiente', async () => {
    const repetida = await pedir(gerente, 'POST', '/ordenes', { vehiculoId, pedido: 'Otra cosa' })
    expect(repetida.statusCode).toBe(409)
    expect(repetida.json()).toMatchObject({ code: 'VEHICULO_CON_ORDEN', data: { numero: 1 } })

    const otra = await pedir(gerente, 'POST', '/ordenes', {
      vehiculoId: otroVehiculoId,
      pedido: 'Cambio de pastillas',
      items: [SERVICE[0]],
    })
    expect(otra.json()).toMatchObject({ numero: 2, titular: null, paga: null, total: '180000.00' })
  })

  it('el listado busca por patente y por número', async () => {
    const porPatente = (await pedir(gerente, 'GET', '/ordenes?buscar=ae 123')).json()
    expect(porPatente.datos.map((o: { numero: number }) => o.numero)).toEqual([1])
    const porNumero = (await pedir(gerente, 'GET', '/ordenes?buscar=0002')).json()
    expect(porNumero.datos.map((o: { numero: number }) => o.numero)).toEqual([2])
  })
})

describe('en el taller', () => {
  it('carga trabajos y repuestos, con su total', async () => {
    const r = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, { items: SERVICE })
    expect(r.json()).toMatchObject({
      total: '252003.00',
      items: [
        { tipo: 'trabajo', total: '180000.00' },
        { tipo: 'repuesto', cantidad: '6.0000', total: '72003.00' },
      ],
    })
  })

  it('cambia de estado mientras está en el taller', async () => {
    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/estado`, {
      estado: 'esperando_repuesto',
    })
    expect(r.json().estado).toBe('esperando_repuesto')
  })

  it('el mecánico no toca una orden que no tiene asignada; asignada, sí', async () => {
    const ajena = await pedir(mecanico, 'POST', `/ordenes/${ordenId}/estado`, {
      estado: 'en_proceso',
    })
    expect(ajena.statusCode).toBe(404)

    const orden = (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json()
    await pedir(gerente, 'PUT', `/ordenes/${ordenId}`, {
      pedido: orden.pedido,
      pagaId: orden.paga.id,
      mecanicoId,
    })
    const propia = await pedir(mecanico, 'POST', `/ordenes/${ordenId}/estado`, {
      estado: 'en_proceso',
    })
    expect(propia.json()).toMatchObject({ estado: 'en_proceso', mecanico: { id: mecanicoId } })
  })

  it('terminada pasa a caja: ya no se cambian los items, salvo reabriéndola', async () => {
    const vacia = (
      await pedir(gerente, 'POST', '/ordenes', { vehiculoId: otroVehiculoId, pedido: 'Otra vez' })
    ).json()
    expect(vacia.code).toBe('VEHICULO_CON_ORDEN')

    const terminada = await pedir(gerente, 'POST', `/ordenes/${ordenId}/terminar`)
    expect(terminada.json()).toMatchObject({ estado: 'terminada' })
    expect(terminada.json().terminadaEn).not.toBeNull()

    const tarde = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, { items: [] })
    expect(tarde.statusCode).toBe(409)
    expect(tarde.json().data.motivo).toMatch(/reabrila/)

    const reabierta = await pedir(gerente, 'POST', `/ordenes/${ordenId}/reabrir`)
    expect(reabierta.json().estado).toBe('en_proceso')
    expect((await pedir(gerente, 'POST', `/ordenes/${ordenId}/terminar`)).json().estado).toBe(
      'terminada',
    )
  })

  it('sin nada que cobrar no se termina; se entrega recién facturada; se anula antes', async () => {
    const sinItems = (await pedir(gerente, 'GET', '/ordenes?buscar=2')).json().datos[0]
    await pedir(gerente, 'PUT', `/ordenes/${sinItems.id}/items`, { items: [] })
    const r = await pedir(gerente, 'POST', `/ordenes/${sinItems.id}/terminar`)
    expect(r.json().code).toBe('SIN_ITEMS')

    const entregar = await pedir(gerente, 'POST', `/ordenes/${ordenId}/entregar`)
    expect(entregar.statusCode).toBe(409)

    const anulada = await pedir(gerente, 'POST', `/ordenes/${sinItems.id}/anular`)
    expect(anulada.json().estado).toBe('anulada')
    // Anulada, el auto puede volver a entrar.
    const nueva = await pedir(gerente, 'POST', '/ordenes', {
      vehiculoId: otroVehiculoId,
      pedido: 'Vuelve',
    })
    expect(nueva.json()).toMatchObject({ numero: 3 })
  })

  it('la orden impresa sale en PDF', async () => {
    const r = await pedir(gerente, 'GET', `/ordenes/${ordenId}/pdf`)
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/application\/pdf/)
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('presupuesto y autorización', () => {
  let otra: { id: string }
  let presupuestoId: string

  it('quien autoriza se anota en la recepción', async () => {
    otra = (await pedir(gerente, 'GET', '/ordenes?buscar=3')).json().datos[0]
    const r = await pedir(gerente, 'PUT', `/ordenes/${otra.id}`, {
      pedido: 'Vuelve',
      autorizaNombre: 'Jorge Pérez (dueño de la flota)',
      autorizaTelefono: '342 400-9000',
    })
    expect(r.json()).toMatchObject({
      autorizaNombre: 'Jorge Pérez (dueño de la flota)',
      autorizaTelefono: '342 400-9000',
      presupuestos: [],
    })
  })

  it('se arma con los renglones elegidos: quedan pendientes y la orden espera autorización', async () => {
    const cargada = (
      await pedir(gerente, 'PUT', `/ordenes/${otra.id}/items`, {
        items: [
          { tipo: 'trabajo', descripcion: 'Diagnóstico', cantidad: '1', precioUnitario: '20000' },
          {
            tipo: 'trabajo',
            descripcion: 'Cambio de embrague',
            cantidad: '1',
            precioUnitario: '210000',
          },
          {
            tipo: 'repuesto',
            descripcion: 'Kit de embrague',
            cantidad: '1',
            precioUnitario: '325000',
          },
        ],
      })
    ).json()
    const [diagnostico, mano, kit] = cargada.items

    const vacio = await pedir(gerente, 'POST', `/ordenes/${otra.id}/presupuestos`, { itemIds: [] })
    expect(vacio.statusCode).toBe(400)

    const r = await pedir(gerente, 'POST', `/ordenes/${otra.id}/presupuestos`, {
      itemIds: [mano.id, kit.id],
    })
    expect(r.statusCode, r.body).toBe(201)
    const o = r.json()
    presupuestoId = o.presupuestos[0].id
    expect(o).toMatchObject({
      estado: 'esperando_autorizacion',
      presupuestos: [{ numero: 1, estado: 'pendiente', total: '535000.00', totalAutorizado: null }],
    })
    expect(o.items.map((i: { autorizacion: string | null }) => i.autorizacion)).toEqual([
      null,
      'pendiente',
      'pendiente',
    ])

    // Un renglón que ya está en un presupuesto no entra en otro.
    const otraVez = await pedir(gerente, 'POST', `/ordenes/${otra.id}/presupuestos`, {
      itemIds: [kit.id],
    })
    expect(otraVez.json().code).toBe('ITEM_INVALIDO')

    // Lo presupuestado no se cambia ni se quita mientras espera; lo demás, sí.
    const cambiado = await pedir(gerente, 'PUT', `/ordenes/${otra.id}/items`, {
      items: [diagnostico, mano, { ...kit, precioUnitario: '1' }],
    })
    expect(cambiado.json().code).toBe('PRESUPUESTO_PENDIENTE')
    const conOtro = await pedir(gerente, 'PUT', `/ordenes/${otra.id}/items`, {
      items: [
        mano,
        kit,
        { tipo: 'trabajo', descripcion: 'Lavado', cantidad: '1', precioUnitario: '5000' },
      ],
    })
    expect(conOtro.statusCode, conOtro.body).toBe(200)
    expect(conOtro.json().items.slice(0, 2)).toMatchObject([
      { id: mano.id, autorizacion: 'pendiente' },
      { id: kit.id, autorizacion: 'pendiente' },
    ])

    // Sin respuesta no se termina.
    const terminar = await pedir(gerente, 'POST', `/ordenes/${otra.id}/terminar`)
    expect(terminar.json().code).toBe('PRESUPUESTO_PENDIENTE')
  })

  it('el PDF del presupuesto sale con su casilla por renglón', async () => {
    const r = await pedir(gerente, 'GET', `/ordenes/${otra.id}/presupuestos/${presupuestoId}/pdf`)
    expect(r.statusCode).toBe(200)
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('la respuesta dice quién y cómo; lo rechazado no se cobra y la orden vuelve a trabajarse', async () => {
    const antes = (await pedir(gerente, 'GET', `/ordenes/${otra.id}`)).json()
    const [mano, kit] = antes.items

    const r = await pedir(
      gerente,
      'POST',
      `/ordenes/${otra.id}/presupuestos/${presupuestoId}/respuesta`,
      {
        autorizados: [mano.id],
        autorizaNombre: 'Jorge Pérez',
        medio: 'whatsapp',
        nota: 'El kit lo trae él',
      },
    )
    expect(r.statusCode, r.body).toBe(200)
    const o = r.json()
    expect(o).toMatchObject({
      estado: 'en_proceso',
      // Mano de obra 210.000 + lavado 5.000: el kit rechazado no suma.
      total: '215000.00',
      presupuestos: [
        {
          estado: 'respondido',
          totalAutorizado: '210000.00',
          autorizaNombre: 'Jorge Pérez',
          autorizaMedio: 'whatsapp',
          nota: 'El kit lo trae él',
        },
      ],
    })
    expect(o.items.find((i: { id: string }) => i.id === kit.id).autorizacion).toBe('rechazado')

    const otraVez = await pedir(
      gerente,
      'POST',
      `/ordenes/${otra.id}/presupuestos/${presupuestoId}/respuesta`,
      { autorizados: [], autorizaNombre: 'Jorge', medio: 'telefono' },
    )
    expect(otraVez.json().code).toBe('ESTADO_INVALIDO')

    const terminada = await pedir(gerente, 'POST', `/ordenes/${otra.id}/terminar`)
    expect(terminada.json().estado).toBe('terminada')

    const cambios = (await pedir(gerente, 'GET', '/auditoria/cambios?pagina=1&porPagina=100')).body
    expect(cambios).toContain('Jorge Pérez autorizó 1 y rechazó 1, por WhatsApp')
  })
})
