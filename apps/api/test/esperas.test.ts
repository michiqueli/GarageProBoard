import 'reflect-metadata'
import { eq } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Las esperas del taller: por qué está parado un auto. Los estados abren y cierran la suya
 * solos, se pone en espera a mano por cualquier otro motivo, y un auto espera una cosa por vez.
 * Ver `docs/tecnicos/taller-control-de-tiempos.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
const autos: string[] = []

const pedir = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${gerente}` },
    ...(payload ? { payload } : {}),
  })

type Espera = { motivo: string; nota: string | null; hasta: string | null }
type Motivo = { id: string; nombre: string; activo: boolean; propio: boolean }

async function abrir(vehiculoId: string) {
  const r = await pedir('POST', '/ordenes', {
    vehiculoId,
    pedido: 'Ruido en el tren delantero',
    items: [
      { tipo: 'trabajo', descripcion: 'Diagnóstico', cantidad: '1', precioUnitario: '20000' },
      { tipo: 'repuesto', descripcion: 'Bieleta', cantidad: '1', precioUnitario: '45000' },
    ],
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as { id: string; items: Array<{ id: string }> }
}

async function motivos(): Promise<Motivo[]> {
  return (await pedir('GET', '/taller/motivos-espera')).json().datos
}

const motivo = async (nombre: string) => (await motivos()).find((m) => m.nombre === nombre)?.id

async function esperas(id: string): Promise<Espera[]> {
  return (await pedir('GET', `/ordenes/${id}`)).json().esperas
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'esperas',
    email: 'gerente@esperas.test',
    vehiculos: [
      { chasis: '8AJFB8CD5N9990001', dominio: 'AE100AA' },
      { chasis: '8AJFB8CD5N9990002', dominio: 'AE100AB' },
      { chasis: '8AJFB8CD5N9990003', dominio: 'AE100AC' },
    ],
  })
  const filas = await api.pg.dbDuenio
    .select({ id: vehiculo.id })
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  autos.push(...filas.map((f) => f.id))
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email: 'gerente@esperas.test', password: CLAVE, entrega: 'cuerpo' },
  })
  gerente = r.json().access
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('los motivos', () => {
  it('arranca con los del sistema; se suman propios y se apagan, sin baja', async () => {
    expect((await motivos()).map((m) => m.nombre)).toEqual([
      'Repuestos',
      'Autorización del cliente',
      'Autorización de garantía',
      'Diagnóstico',
      'Elevador libre',
    ])

    const creados = (await pedir('POST', '/taller/motivos-espera', { nombre: 'Lavadero' })).json()
    const lavadero = creados.datos.at(-1) as Motivo
    expect(lavadero).toMatchObject({ nombre: 'Lavadero', propio: true, activo: true })

    const apagado = await pedir('PUT', `/taller/motivos-espera/${lavadero.id}`, {
      nombre: 'Lavadero',
      activo: false,
    })
    expect(apagado.json().datos.at(-1)).toMatchObject({ activo: false })
  })
})

describe('las esperas de una orden', () => {
  it('«esperando repuesto» abre la de repuestos, y volver a trabajo la cierra', async () => {
    const o = await abrir(autos[0] as string)
    await pedir('POST', `/ordenes/${o.id}/estado`, { estado: 'esperando_repuesto' })
    expect(await esperas(o.id)).toMatchObject([{ motivo: 'Repuestos', hasta: null }])

    // Repetirlo no parte la espera en dos.
    await pedir('POST', `/ordenes/${o.id}/estado`, { estado: 'esperando_repuesto' })
    expect(await esperas(o.id)).toHaveLength(1)

    await pedir('POST', `/ordenes/${o.id}/estado`, { estado: 'en_proceso' })
    const [cerrada] = await esperas(o.id)
    expect(cerrada?.hasta).not.toBeNull()
  })

  it('a mano, por otro motivo; un auto espera una cosa por vez', async () => {
    const o = await abrir(autos[1] as string)
    const diagnostico = await pedir('POST', `/ordenes/${o.id}/espera`, {
      motivoId: await motivo('Diagnóstico'),
      nota: 'Espera al técnico de la marca',
    })
    expect(diagnostico.statusCode, diagnostico.body).toBe(200)
    // Diagnóstico no tiene estado propio: la orden sigue como estaba.
    expect(diagnostico.json().estado).toBe('recibida')

    // Repuestos sí: cierra la de diagnóstico y pasa la orden a su estado.
    const repuestos = await pedir('POST', `/ordenes/${o.id}/espera`, {
      motivoId: await motivo('Repuestos'),
    })
    expect(repuestos.json().estado).toBe('esperando_repuesto')
    const [primera, segunda] = await esperas(o.id)
    expect(primera).toMatchObject({ motivo: 'Diagnóstico', nota: 'Espera al técnico de la marca' })
    expect(primera?.hasta).not.toBeNull()
    expect(segunda).toMatchObject({ motivo: 'Repuestos', hasta: null })

    // Llegó: vuelve a trabajo.
    const llego = await pedir('POST', `/ordenes/${o.id}/espera/terminar`)
    expect(llego.json().estado).toBe('en_proceso')
    expect((await esperas(o.id)).every((e) => e.hasta)).toBe(true)

    const nada = await pedir('POST', `/ordenes/${o.id}/espera/terminar`)
    expect(nada.statusCode).toBe(409)
  })

  it('el tablero dice qué espera cada auto, sin la nota', async () => {
    const o = (await pedir('GET', '/ordenes?estado=en_taller')).json().datos[0]
    await pedir('POST', `/ordenes/${o.id}/espera`, {
      motivoId: await motivo('Diagnóstico'),
      nota: 'Nota que no va a la tele',
    })
    const tablero = (await pedir('GET', '/taller/tablero')).json()
    const tarjeta = tablero.autos.find((a: { id: string }) => a.id === o.id)
    expect(tarjeta.espera).toMatchObject({ motivo: 'Diagnóstico' })
    expect(tarjeta.esperadoMin).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(tarjeta)).not.toContain('Nota que no va a la tele')
  })

  it('un motivo apagado no se usa', async () => {
    const o = (await pedir('GET', '/ordenes?estado=en_taller')).json().datos[0]
    const apagado = (await motivos()).find((m) => !m.activo)
    const r = await pedir('POST', `/ordenes/${o.id}/espera`, { motivoId: apagado?.id })
    expect(r.statusCode).toBe(422)
    expect(r.json().code).toBe('MOTIVO_INVALIDO')
  })

  it('mandar el presupuesto espera al cliente; contestarlo y terminar la orden la cierran', async () => {
    const o = await abrir(autos[2] as string)
    const [, bieleta] = o.items
    await pedir('POST', `/ordenes/${o.id}/presupuestos`, { itemIds: [bieleta?.id] })
    expect(await esperas(o.id)).toMatchObject([{ motivo: 'Autorización del cliente', hasta: null }])

    const { presupuestos } = (await pedir('GET', `/ordenes/${o.id}`)).json()
    await pedir('POST', `/ordenes/${o.id}/presupuestos/${presupuestos[0].id}/respuesta`, {
      autorizados: [bieleta?.id],
      autorizaNombre: 'Jorge Pérez',
      medio: 'telefono',
    })
    expect((await esperas(o.id))[0]?.hasta).not.toBeNull()

    await pedir('POST', `/ordenes/${o.id}/espera`, { motivoId: await motivo('Elevador libre') })
    expect((await pedir('POST', `/ordenes/${o.id}/terminar`)).statusCode).toBe(200)
    expect((await esperas(o.id)).every((e) => e.hasta)).toBe(true)
  })
})
