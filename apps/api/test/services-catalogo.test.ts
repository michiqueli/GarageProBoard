import 'reflect-metadata'
import { eq } from '@gpb/db'
import { repuesto, serviceCatalogoItem } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El catálogo de services: a mano, importado de una planilla —todo o nada, y con la validación
 * del lado del servidor aunque el navegador ya haya mirado—, y cargado en una orden. Ver
 * `docs/tecnicos/catalogo-de-services.md`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let mecanico: string
let tenantId: string
let vehiculoId: string
let filtroId: string

const COLUMNAS = {
  marca: 'Renault',
  modelo: 'Kangoo',
  service: 'Service 10.000 km',
  kilometros: '10.000',
  tipo: 'Trabajo',
  descripcion: 'Cambio de aceite',
  codigo: '',
  cantidad: '1',
  minutos: '30',
  precio: '20000',
}
const fila = (parcial: Partial<typeof COLUMNAS> = {}) => ({ ...COLUMNAS, ...parcial })

function pedir(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
  token: string = gerente,
) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  })
}

async function entrar(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email, password: CLAVE, entrega: 'cuerpo' },
  })
  expect(r.statusCode, `no pudo entrar ${email}`).toBe(200)
  return r.json().access as string
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'services',
    email: 'gerente@services.test',
    otros: [{ email: 'mecanico@services.test', rol: 'Mecánico' }],
    vehiculos: [{ chasis: '8AJFB8CD5N1234567', dominio: 'AE123BC' }],
  })
  tenantId = semilla.tenant.id
  const db = api.pg.dbDuenio
  const [p] = await db
    .insert(repuesto)
    .values({
      tenantId,
      codigo: 'FIL.01',
      descripcion: 'Filtro de aceite',
      precioVenta: '12000',
      codigoAlicuota: 4,
    })
    .returning()
  filtroId = p?.id as string
  gerente = await entrar('gerente@services.test')
  mecanico = await entrar('mecanico@services.test')
  const autos = (await pedir('GET', '/vehiculos')).json()
  vehiculoId = autos.datos[0].id
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('a mano', () => {
  const DATOS = {
    marca: 'Fiat',
    modelo: null,
    nombre: 'Service 20.000 km',
    kilometros: 20000,
    renglones: [
      {
        tipo: 'trabajo',
        descripcion: 'Cambio de bujías',
        cantidad: '1',
        precioUnitario: '15000',
        minutos: 45,
      },
      {
        tipo: 'repuesto',
        repuestoId: null as string | null,
        descripcion: 'Filtro',
        cantidad: '1',
        precioUnitario: '0',
      },
    ],
  }
  const conPieza = () => ({
    ...DATOS,
    renglones: [DATOS.renglones[0], { ...DATOS.renglones[1], repuestoId: filtroId }],
  })

  let id: string

  it('se carga con sus renglones, y la pieza trae el precio de hoy', async () => {
    const r = await pedir('POST', '/taller/services', conPieza())
    expect(r.statusCode, r.body).toBe(201)
    id = r.json().id
    expect(r.json()).toMatchObject({ trabajos: 1, repuestos: 1, minutos: 45 })
    expect(r.json().renglones[1]).toMatchObject({
      codigo: 'FIL.01',
      precioUnitario: '12000.0000',
      codigoAlicuota: 4,
    })
  })

  it('no repite marca, modelo y nombre, sin mirar mayúsculas', async () => {
    const r = await pedir('POST', '/taller/services', {
      ...conPieza(),
      nombre: 'SERVICE 20.000 KM',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('DUPLICADO')
  })

  it('un repuesto no lleva minutos', async () => {
    const r = await pedir('POST', '/taller/services', {
      ...DATOS,
      nombre: 'Otro',
      renglones: [{ ...DATOS.renglones[1], repuestoId: null, minutos: 10 }],
    })
    expect(r.statusCode).toBe(400)
  })

  it('apagado no se ofrece, y se vuelve a prender', async () => {
    const apagado = await pedir('PUT', `/taller/services/${id}`, {
      ...conPieza(),
      activo: false,
    })
    expect(apagado.statusCode, apagado.body).toBe(200)
    const activos = (await pedir('GET', '/taller/services')).json()
    expect(activos.datos.map((s: { id: string }) => s.id)).not.toContain(id)
    const todos = (await pedir('GET', '/taller/services?estado=todos')).json()
    expect(todos.datos.map((s: { id: string }) => s.id)).toContain(id)

    await pedir('PUT', `/taller/services/${id}`, { ...conPieza(), activo: true })
  })

  it('el mecánico mira, no configura', async () => {
    expect((await pedir('GET', '/taller/services', undefined, mecanico)).statusCode).toBe(200)
    expect((await pedir('POST', '/taller/services', conPieza(), mecanico)).statusCode).toBe(403)
  })
})

describe('importar una planilla', () => {
  const PLANILLA = [
    fila(),
    fila({
      tipo: 'Repuesto',
      descripcion: '',
      codigo: 'fil.01',
      minutos: '',
      precio: '',
    }),
    fila({
      tipo: 'Repuesto',
      descripcion: 'Junta',
      codigo: 'NOEXISTE',
      minutos: '',
      precio: '500',
    }),
    fila({ descripcion: 'Revisión general', minutos: '' }),
  ]

  it('el preview no guarda nada, y separa errores de avisos', async () => {
    const r = await pedir('POST', '/taller/services/previsualizar', {
      filas: [...PLANILLA, fila({ tipo: 'cualquiera', service: 'Otro' })],
    })
    expect(r.statusCode, r.body).toBe(200)
    const { filas, services } = r.json()
    expect(filas[0]).toEqual({ errores: {}, avisos: {} })
    expect(filas[2].avisos.codigo).toMatch(/No está en repuestos/)
    expect(filas[3].avisos.minutos).toMatch(/Sin tiempo/)
    expect(filas[4].errores.tipo).toMatch(/Trabajo/)
    expect(services).toEqual([
      expect.objectContaining({
        nombre: 'Service 10.000 km',
        accion: 'nuevo',
        trabajos: 2,
        repuestos: 2,
        minutos: 30,
      }),
    ])
    const todos = (await pedir('GET', '/taller/services?buscar=10.000')).json()
    expect(todos.total).toBe(0)
  })

  it('un código desconocido sin descripción es un error', async () => {
    const r = await pedir('POST', '/taller/services/previsualizar', {
      filas: [fila({ tipo: 'Repuesto', descripcion: '', codigo: 'NADA', minutos: '' })],
    })
    expect(r.json().filas[0].errores.codigo).toMatch(/no está en repuestos/)
  })

  it('con una fila mala no entra ninguna', async () => {
    const r = await pedir('POST', '/taller/services/importar', {
      filas: [fila({ service: 'Bueno' }), fila({ service: '' })],
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().code).toBe('FILAS_INVALIDAS')
    expect((await pedir('GET', '/taller/services?buscar=Bueno')).json().total).toBe(0)
  })

  it('crea el service, engancha la pieza por código y completa su descripción', async () => {
    const r = await pedir('POST', '/taller/services/importar', { filas: PLANILLA })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toEqual({ creados: 1, reemplazados: 0 })

    const lista = (await pedir('GET', '/taller/services?buscar=10.000')).json()
    expect(lista.datos[0]).toMatchObject({ marca: 'Renault', kilometros: 10000 })
    const ficha = (await pedir('GET', `/taller/services/${lista.datos[0].id}`)).json()
    expect(ficha.renglones[1]).toMatchObject({
      repuestoId: filtroId,
      codigo: 'FIL.01',
      descripcion: 'Filtro de aceite',
    })
    expect(ficha.renglones[2]).toMatchObject({ repuestoId: null, precioUnitario: '500.0000' })
  })

  it('reimportar reemplaza los renglones y lo dice antes', async () => {
    const filas = [fila({ descripcion: 'Sólo esto', minutos: '50' })]
    const preview = (await pedir('POST', '/taller/services/previsualizar', { filas })).json()
    expect(preview.services[0].accion).toBe('reemplaza')

    const r = await pedir('POST', '/taller/services/importar', { filas })
    expect(r.json()).toEqual({ creados: 0, reemplazados: 1 })

    const lista = (await pedir('GET', '/taller/services?buscar=10.000')).json()
    const renglones = await api.pg.dbDuenio
      .select()
      .from(serviceCatalogoItem)
      .where(eq(serviceCatalogoItem.serviceId, lista.datos[0].id))
    expect(renglones).toHaveLength(1)
  })

  it('el mecánico no importa', async () => {
    const r = await pedir('POST', '/taller/services/importar', { filas: PLANILLA }, mecanico)
    expect(r.statusCode).toBe(403)
  })
})

describe('para una orden', () => {
  it('con la marca del auto, ofrece esa marca y los genéricos', async () => {
    await pedir('POST', '/taller/services/importar', {
      filas: [fila({ marca: '', modelo: '', service: 'Genérico' })],
    })
    const r = (await pedir('GET', '/taller/services?marca=renault')).json()
    expect(r.datos.map((s: { nombre: string }) => s.nombre)).toEqual([
      'Service 10.000 km',
      'Genérico',
    ])
  })

  it('la orden guarda lo estipulado, y guardar los renglones no lo pierde', async () => {
    const abierta = await pedir('POST', '/ordenes', {
      vehiculoId,
      pedido: 'Service',
      items: [
        {
          tipo: 'trabajo',
          descripcion: 'Aceite',
          cantidad: '1',
          precioUnitario: '100',
          minutosEstipulados: 30,
        },
        {
          tipo: 'trabajo',
          descripcion: 'Frenos',
          cantidad: '1',
          precioUnitario: '100',
          minutosEstipulados: 60,
        },
        { tipo: 'trabajo', descripcion: 'Lavado', cantidad: '1', precioUnitario: '100' },
      ],
    })
    expect(abierta.statusCode, abierta.body).toBe(201)
    expect(abierta.json().minutosEstipulados).toBe(90)
    const id = abierta.json().id

    // Guardar los renglones sin mandar el tiempo no lo pierde.
    const items = abierta.json().items.map((i: Record<string, unknown>) => ({
      id: i.id,
      tipo: i.tipo,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
    }))
    const guardada = await pedir('PUT', `/ordenes/${id}/items`, { items })
    expect(guardada.json().minutosEstipulados).toBe(90)
  })
})
