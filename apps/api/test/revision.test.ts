import 'reflect-metadata'
import { PUNTOS_REVISION_INICIALES } from '@gpb/core'
import { eq } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La revisión de la hoja: el catálogo de puntos de cada taller, el semáforo de cada orden y el
 * paso de lo que quedó en ámbar o en rojo a trabajos para presupuestar.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let mecanico: string
let otroGerente: string
let vehiculoId: string

interface Punto {
  id: string
  seccion: string
  nombre: string
  orden: number
  activo: boolean
  propio: boolean
}
interface Respuesta {
  puntoId: string
  seccion: string
  nombre: string
  estado: string | null
  nota: string | null
  por: string | null
  en: string | null
  itemId: string | null
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'revision',
    email: 'gerente@revision.test',
    otros: [{ email: 'mecanico@revision.test', rol: 'Mecánico' }],
    vehiculos: [{ chasis: '8AJFB8CD5N1234567', dominio: 'AE123BC' }],
  })
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'revision-otra',
    email: 'gerente@revision-otra.test',
  })
  const autos = await api.pg.dbDuenio
    .select()
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  vehiculoId = autos[0]?.id as string
  gerente = await entrar('gerente@revision.test')
  mecanico = await entrar('mecanico@revision.test')
  otroGerente = await entrar('gerente@revision-otra.test')
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

async function puntos(access = gerente): Promise<Punto[]> {
  const r = await pedir(access, 'GET', '/revision/puntos')
  expect(r.statusCode).toBe(200)
  return r.json().datos
}

const llamado = (lista: Punto[], nombre: string) => {
  const p = lista.find((x) => x.nombre === nombre)
  if (!p) throw new Error(`no está «${nombre}»`)
  return p
}

describe('el catálogo de puntos', () => {
  it('una concesionaria que nunca los pidió recibe los del sistema, una sola vez', async () => {
    const primera = await puntos()
    expect(primera).toHaveLength(PUNTOS_REVISION_INICIALES.length)
    expect(primera.map((p) => p.nombre)).toEqual(PUNTOS_REVISION_INICIALES.map((p) => p.nombre))
    expect(primera.every((p) => p.activo && !p.propio)).toBe(true)

    // Pedirlos de nuevo no siembra otra vez.
    expect(await puntos()).toHaveLength(PUNTOS_REVISION_INICIALES.length)
  })

  it('un punto propio entra al final de su sección', async () => {
    const r = await pedir(gerente, 'POST', '/revision/puntos', {
      seccion: 'motor',
      nombre: 'Equipo de GNC',
    })
    expect(r.statusCode).toBe(201)
    const motor = (r.json().datos as Punto[]).filter((p) => p.seccion === 'motor')
    expect(motor.at(-1)).toMatchObject({ nombre: 'Equipo de GNC', propio: true, activo: true })
  })

  it('se sube y se baja dentro de su sección, y en la punta no se mueve', async () => {
    const gnc = llamado(await puntos(), 'Equipo de GNC')
    const r = await pedir(gerente, 'POST', `/revision/puntos/${gnc.id}/mover`, { hacia: 'arriba' })
    expect(r.statusCode).toBe(200)
    const motor = (r.json().datos as Punto[]).filter((p) => p.seccion === 'motor')
    expect(motor.map((p) => p.nombre).slice(-2)).toEqual(['Equipo de GNC', 'Correas'])

    const primero = motor[0] as Punto
    const quieto = await pedir(gerente, 'POST', `/revision/puntos/${primero.id}/mover`, {
      hacia: 'arriba',
    })
    const despues = (quieto.json().datos as Punto[]).filter((p) => p.seccion === 'motor')
    expect(despues[0]?.id).toBe(primero.id)
  })

  it('el mecánico lo ve pero no lo configura', async () => {
    expect((await pedir(mecanico, 'GET', '/revision/puntos')).statusCode).toBe(200)
    const r = await pedir(mecanico, 'POST', '/revision/puntos', {
      seccion: 'motor',
      nombre: 'Otro',
    })
    expect(r.statusCode).toBe(403)
  })

  it('cada concesionaria tiene el suyo', async () => {
    const ajenos = await puntos(otroGerente)
    expect(ajenos).toHaveLength(PUNTOS_REVISION_INICIALES.length)
    expect(ajenos.some((p) => p.nombre === 'Equipo de GNC')).toBe(false)
    const mios = new Set((await puntos()).map((p) => p.id))
    expect(ajenos.some((p) => mios.has(p.id))).toBe(false)
  })
})

describe('la revisión de una orden', () => {
  let ordenId: string
  let catalogo: Punto[]
  const revision = async (): Promise<Respuesta[]> =>
    (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json().revision
  const de = (lista: Respuesta[], nombre: string) => lista.find((r) => r.nombre === nombre)

  beforeAll(async () => {
    catalogo = await puntos()
    // Un punto apagado antes de recibir: en esta orden no se revisa.
    const butacas = llamado(catalogo, 'Estado de butacas')
    await pedir(gerente, 'PUT', `/revision/puntos/${butacas.id}`, {
      nombre: butacas.nombre,
      activo: false,
    })
  })

  it('se contesta en la recepción, firmado por quien la abrió', async () => {
    const r = await pedir(gerente, 'POST', '/ordenes', {
      vehiculoId,
      pedido: 'Service y ruido al frenar',
      revision: [
        { puntoId: llamado(catalogo, 'Bocina').id, estado: 'verde' },
        { puntoId: llamado(catalogo, 'Correas').id, estado: 'ambar', nota: 'Cuarteada' },
        { puntoId: llamado(catalogo, 'Estado de batería').id, estado: 'rojo' },
      ],
    })
    expect(r.statusCode).toBe(201)
    ordenId = r.json().id

    const lista: Respuesta[] = r.json().revision
    expect(de(lista, 'Correas')).toMatchObject({
      estado: 'ambar',
      nota: 'Cuarteada',
      por: 'Prueba Gerente',
      itemId: null,
    })
    expect(de(lista, 'Correas')?.en).toBeTruthy()
    // Lo que nadie tocó viene sin revisar, que no es verde.
    expect(de(lista, 'Freno de mano')).toMatchObject({ estado: null, por: null, en: null })
    // Y el apagado, sin contestar, ni aparece.
    expect(de(lista, 'Estado de butacas')).toBeUndefined()
    // En el orden de la hoja: exterior primero, neumáticos al final.
    expect(lista[0]?.seccion).toBe('exterior')
    expect(lista.at(-1)?.seccion).toBe('neumaticos')
  })

  it('después se completa de a un punto, y lo que no se manda queda como estaba', async () => {
    const antes = await revision()
    const r = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/revision`, {
      respuestas: [
        { puntoId: llamado(catalogo, 'Pastillas y discos de freno').id, estado: 'rojo' },
      ],
    })
    expect(r.statusCode).toBe(200)
    const lista: Respuesta[] = r.json().revision
    expect(de(lista, 'Pastillas y discos de freno')?.estado).toBe('rojo')
    expect(de(lista, 'Correas')).toEqual(de(antes, 'Correas'))
  })

  it('contestar lo mismo no lo vuelve a firmar, y null lo deja sin revisar', async () => {
    const antes = de(await revision(), 'Bocina')
    await pedir(gerente, 'PUT', `/ordenes/${ordenId}/revision`, {
      respuestas: [{ puntoId: antes?.puntoId, estado: 'verde' }],
    })
    expect(de(await revision(), 'Bocina')?.en).toBe(antes?.en)

    const r = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/revision`, {
      respuestas: [{ puntoId: antes?.puntoId, estado: null }],
    })
    expect(de(r.json().revision, 'Bocina')).toMatchObject({ estado: null, por: null })
  })

  it('un punto apagado no se contesta, y uno de otra concesionaria tampoco', async () => {
    const butacas = llamado(catalogo, 'Estado de butacas')
    const apagado = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/revision`, {
      respuestas: [{ puntoId: butacas.id, estado: 'verde' }],
    })
    expect(apagado.statusCode).toBe(422)
    expect(apagado.json().code).toBe('PUNTO_INVALIDO')

    const ajeno = (await puntos(otroGerente))[0] as Punto
    const r = await pedir(gerente, 'PUT', `/ordenes/${ordenId}/revision`, {
      respuestas: [{ puntoId: ajeno.id, estado: 'verde' }],
    })
    expect(r.statusCode).toBe(422)
  })

  it('renombrar un punto no reescribe lo que ya se contestó', async () => {
    const correas = llamado(catalogo, 'Correas')
    await pedir(gerente, 'PUT', `/revision/puntos/${correas.id}`, {
      nombre: 'Correas de accesorios',
      activo: true,
    })
    const lista = await revision()
    expect(lista.find((r) => r.puntoId === correas.id)?.nombre).toBe('Correas')
    // Y uno sin contestar sí se ve con el nombre de hoy.
    const frenoDeMano = llamado(catalogo, 'Freno de mano')
    await pedir(gerente, 'PUT', `/revision/puntos/${frenoDeMano.id}`, {
      nombre: 'Freno de estacionamiento',
      activo: true,
    })
    expect((await revision()).find((r) => r.puntoId === frenoDeMano.id)?.nombre).toBe(
      'Freno de estacionamiento',
    )
  })
})

describe('pasar a presupuesto', () => {
  let ordenId: string
  const ficha = async () => (await pedir(gerente, 'GET', `/ordenes/${ordenId}`)).json()
  const id = (o: { revision: Respuesta[] }, nombre: string) =>
    o.revision.find((r) => r.nombre === nombre)?.puntoId as string

  beforeAll(async () => {
    const abiertas = await pedir(gerente, 'GET', '/ordenes')
    ordenId = abiertas.json().datos[0].id
  })

  it('lo verde o sin revisar no es trabajo para ofrecer', async () => {
    const o = await ficha()
    for (const nombre of ['Bocina', 'Testigos e indicadores']) {
      const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/revision/trabajos`, {
        puntoIds: [id(o, nombre)],
      })
      expect(r.statusCode, nombre).toBe(422)
    }
  })

  it('lo ámbar y lo rojo entra como trabajos sin precio, con su nota', async () => {
    const o = await ficha()
    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/revision/trabajos`, {
      puntoIds: [id(o, 'Correas'), id(o, 'Estado de batería')],
    })
    expect(r.statusCode).toBe(200)
    const nueva = r.json()
    const trabajos = nueva.items.map((i: { descripcion: string; precioUnitario: string }) => [
      i.descripcion,
      Number(i.precioUnitario),
    ])
    expect(trabajos).toEqual([
      ['Correas: Cuarteada', 0],
      ['Estado de batería', 0],
    ])
    const correas = (nueva.revision as Respuesta[]).find((x) => x.nombre === 'Correas')
    expect(correas?.itemId).toBe(nueva.items[0].id)
    // No se cobra solo: los trabajos no pasaron por ningún presupuesto todavía.
    expect(nueva.items.every((i: { autorizacion: unknown }) => i.autorizacion === null)).toBe(true)
  })

  it('lo que ya se pasó no se pasa dos veces', async () => {
    const o = await ficha()
    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/revision/trabajos`, {
      puntoIds: [id(o, 'Correas')],
    })
    expect(r.statusCode).toBe(422)
  })

  it('si el renglón se quitó de la orden, el punto vuelve a estar para ofrecer', async () => {
    const o = await ficha()
    const quedan = o.items.filter(
      (i: { descripcion: string }) => i.descripcion !== 'Correas: Cuarteada',
    )
    await pedir(gerente, 'PUT', `/ordenes/${ordenId}/items`, { items: quedan })
    const sin = await ficha()
    expect(sin.revision.find((x: Respuesta) => x.nombre === 'Correas').itemId).toBeNull()

    const r = await pedir(gerente, 'POST', `/ordenes/${ordenId}/revision/trabajos`, {
      puntoIds: [id(sin, 'Correas')],
    })
    expect(r.statusCode).toBe(200)
  })
})
