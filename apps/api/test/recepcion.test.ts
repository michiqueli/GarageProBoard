import 'reflect-metadata'
import { eq } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type ApiDePrueba,
  CLAVE,
  levantarApi,
  sembrarConcesionaria,
  sembrarEmpleado,
} from './fixture.ts'

/**
 * La puerta: anotar a quien llega con su número del día, derivarlo, agarrarlo sin que dos lo
 * agarren a la vez, y cerrarlo —incluido el que se fue sin que lo atiendan—.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let recepcionista: string
let asesor: string
let gerente: string
let mecanico: string
let otroGerente: string
let vehiculos: string[] = []
let vendedorId: string
let mecanicoId: string
let deOtraSucursalId: string

interface Visita {
  id: string
  numero: string
  motivo: string
  nombre: string | null
  telefono: string | null
  derivadaA: { id: string; nombre: string } | null
  atendidaPor: { id: string; nombre: string } | null
  atendidaEn: string | null
  cerradaEn: string | null
  resultado: string | null
  ordenId: string | null
  llegoEn: string
  nota: string | null
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'puerta',
    email: 'gerente@puerta.test',
    sucursales: ['Casa Central', 'Sucursal Norte'],
    vehiculos: [
      { chasis: '8AJFB8CD5N1234567', dominio: 'AE123BC' },
      { chasis: '9BWZZZ377VT004251', dominio: 'AB456CD' },
      { chasis: '93YBSR7RHAJ123456', dominio: 'AC789DE' },
    ],
    otros: [
      { email: 'recepcion@puerta.test', rol: 'Recepcionista' },
      { email: 'asesor@puerta.test', rol: 'Asesor de servicios' },
      { email: 'mecanico@puerta.test', rol: 'Mecánico' },
    ],
  })
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'puerta-otra',
    email: 'gerente@puerta-otra.test',
  })
  const [central, norte] = semilla.sucursales
  vehiculos = (
    await api.pg.dbDuenio
      .select({ id: vehiculo.id })
      .from(vehiculo)
      .where(eq(vehiculo.tenantId, semilla.tenant.id))
  ).map((v) => v.id)
  const tenantId = semilla.tenant.id
  vendedorId = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '10',
    nombre: 'Laura',
    apellido: 'Gómez',
    puesto: 'vendedor',
    sucursalId: central?.id,
  })
  mecanicoId = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '11',
    nombre: 'Pedro',
    apellido: 'Ríos',
    puesto: 'mecanico',
    sucursalId: central?.id,
  })
  deOtraSucursalId = await sembrarEmpleado(api.pg.dbDuenio, {
    tenantId,
    legajo: '12',
    nombre: 'Marta',
    apellido: 'Sosa',
    puesto: 'vendedor',
    sucursalId: norte?.id,
  })
  recepcionista = await entrar('recepcion@puerta.test')
  asesor = await entrar('asesor@puerta.test')
  gerente = await entrar('gerente@puerta.test')
  mecanico = await entrar('mecanico@puerta.test')
  otroGerente = await entrar('gerente@puerta-otra.test')
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

function pedir(access: string, method: 'GET' | 'POST', url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

async function anotar(datos: object, quien = recepcionista): Promise<Visita> {
  const r = await pedir(quien, 'POST', '/recepcion/visitas', datos)
  expect(r.statusCode, r.body).toBe(201)
  return r.json()
}

async function hoy(quien = recepcionista): Promise<Visita[]> {
  const r = await pedir(quien, 'GET', '/recepcion/visitas')
  expect(r.statusCode, r.body).toBe(200)
  return r.json().datos
}

describe('anotar a quien llega', () => {
  it('numera por letra y por día: servicio con la S, venta y plan de ahorro con la V', async () => {
    const a = await anotar({ motivo: 'servicio', nombre: 'Juan Pérez', telefono: '351 555-1234' })
    const b = await anotar({ motivo: 'plan_ahorro', nombre: 'Ana López' })
    const c = await anotar({ motivo: 'venta', nombre: 'Luis Díaz', derivadaA: vendedorId })
    const d = await anotar({ motivo: 'servicio', nombre: 'Carla Ruiz' })

    expect([a.numero, b.numero, c.numero, d.numero]).toEqual(['S-001', 'V-001', 'V-002', 'S-002'])
    expect(c.derivadaA).toEqual({ id: vendedorId, nombre: 'Laura Gómez' })
    expect(a.atendidaEn).toBeNull()
    expect(a.cerradaEn).toBeNull()
  })

  it('se puede anotar sin nombre: el que viene a preguntar no tiene por qué dejarlo', async () => {
    const v = await anotar({ motivo: 'usados', nombre: '  ', telefono: '' })
    expect(v.nombre).toBeNull()
    expect(v.telefono).toBeNull()
  })

  it('no se le deriva a un mecánico ni a alguien de otra sucursal', async () => {
    for (const id of [mecanicoId, deOtraSucursalId]) {
      const r = await pedir(recepcionista, 'POST', '/recepcion/visitas', {
        motivo: 'venta',
        derivadaA: id,
      })
      expect(r.statusCode).toBe(422)
      expect(r.json().code).toBe('NO_ES_RECEPTOR')
    }
  })

  it('las visitas de hoy salen en el orden en que llegaron', async () => {
    const lista = await hoy()
    expect(lista.slice(0, 4).map((v) => v.numero)).toEqual(['S-001', 'V-001', 'V-002', 'S-002'])
  })
})

describe('a quién se le deriva', () => {
  it('la recepcionista ve nombre y puesto de los de su sucursal, sin el piso del taller', async () => {
    const r = await pedir(recepcionista, 'GET', '/recepcion/receptores')
    expect(r.statusCode).toBe(200)
    const ids = r.json().datos.map((p: { id: string }) => p.id)
    expect(ids).toContain(vendedorId)
    expect(ids).not.toContain(mecanicoId)
    expect(ids).not.toContain(deOtraSucursalId)
    // Nada del legajo: ni sueldo, ni categoría, ni documento.
    expect(Object.keys(r.json().datos[0]).sort()).toEqual(['conUsuario', 'id', 'nombre', 'puesto'])
  })

  it('el asesor, que no ve legajos, igual puede elegir a quién', async () => {
    expect((await pedir(asesor, 'GET', '/personal')).statusCode).toBe(403)
    expect((await pedir(asesor, 'GET', '/recepcion/receptores')).statusCode).toBe(200)
  })

  it('cambiar a quién se le deriva, y dejarla sin nadie', async () => {
    const v = await anotar({ motivo: 'venta', nombre: 'Rosa' })
    const r1 = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/derivar`, {
      derivadaA: vendedorId,
    })
    expect(r1.json().derivadaA.id).toBe(vendedorId)
    const r2 = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/derivar`, {
      derivadaA: null,
    })
    expect(r2.json().derivadaA).toBeNull()
  })
})

describe('agarrarla', () => {
  it('queda a nombre de quien la agarró, y otro no se la puede sacar', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Tomás' })

    const r1 = await pedir(asesor, 'POST', `/recepcion/visitas/${v.id}/atender`)
    expect(r1.statusCode, r1.body).toBe(200)
    expect(r1.json().atendidaPor.nombre).toBe('Prueba Asesor de servicios')
    const empezo = r1.json().atendidaEn

    // Un segundo toque del mismo no le cambia la hora en que empezó.
    const r2 = await pedir(asesor, 'POST', `/recepcion/visitas/${v.id}/atender`)
    expect(r2.json().atendidaEn).toBe(empezo)

    const r3 = await pedir(gerente, 'POST', `/recepcion/visitas/${v.id}/atender`)
    expect(r3.statusCode).toBe(409)
    expect(r3.json()).toMatchObject({
      code: 'YA_LA_TIENE',
      data: { nombre: 'Prueba Asesor de servicios' },
    })
  })

  it('dos que tocan la misma a la vez: la agarra uno solo', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Simultáneo' })
    const [a, b] = await Promise.all([
      pedir(asesor, 'POST', `/recepcion/visitas/${v.id}/atender`),
      pedir(gerente, 'POST', `/recepcion/visitas/${v.id}/atender`),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })
})

describe('cerrarla', () => {
  it('«se fue» queda como resultado, sin quién la atendió', async () => {
    const v = await anotar({ motivo: 'plan_ahorro', nombre: 'Impaciente' })
    const r = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/cerrar`, {
      resultado: 'se_fue',
      nota: 'Esperó 40 minutos',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      resultado: 'se_fue',
      atendidaPor: null,
      nota: 'Esperó 40 minutos',
    })
    expect(r.json().cerradaEn).not.toBeNull()

    // Sigue en la lista del día: «se fue» no es una baja.
    expect((await hoy()).some((x) => x.id === v.id)).toBe(true)
  })

  it('cerrar como atendida una que nadie agarró la deja a nombre de quien la cierra', async () => {
    const v = await anotar({ motivo: 'administracion', nombre: 'Consulta rápida' })
    const r = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/cerrar`, {
      resultado: 'atendida',
    })
    expect(r.json().atendidaPor.nombre).toBe('Prueba Recepcionista')
    expect(r.json().atendidaEn).toBe(r.json().cerradaEn)
  })

  it('una cerrada no se vuelve a tocar', async () => {
    const v = await anotar({ motivo: 'otro' })
    await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/cerrar`, { resultado: 'se_fue' })
    for (const [url, payload] of [
      ['cerrar', { resultado: 'atendida' }],
      ['atender', undefined],
      ['derivar', { derivadaA: null }],
    ] as const) {
      const r = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/${url}`, payload)
      expect(r.statusCode, url).toBe(409)
      expect(r.json().code).toBe('YA_CERRADA')
    }
  })
})

describe('quién puede', () => {
  it('el mecánico no ve la puerta', async () => {
    expect((await pedir(mecanico, 'GET', '/recepcion/visitas')).statusCode).toBe(403)
  })

  it('otra concesionaria no ve ni toca las visitas de ésta', async () => {
    expect(await hoy(otroGerente)).toEqual([])
    const v = await anotar({ motivo: 'venta', nombre: 'Ajena' })
    const r = await pedir(otroGerente, 'POST', `/recepcion/visitas/${v.id}/atender`)
    expect(r.statusCode).toBe(404)
  })
})

describe('la cola de las tablets', () => {
  function abrirOrden(quien: string, vehiculoId: string, visitaId?: string) {
    return pedir(quien, 'POST', '/ordenes', {
      vehiculoId,
      pedido: 'Hace ruido al frenar',
      ...(visitaId ? { visitaId } : {}),
    })
  }

  it('soltarla la devuelve a la cola, con la hora en que llegó', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Agarrado por error' })
    await pedir(asesor, 'POST', `/recepcion/visitas/${v.id}/atender`)

    // La suelta la recepcionista: la tablet que la tenía se quedó sin batería.
    const r = await pedir(recepcionista, 'POST', `/recepcion/visitas/${v.id}/soltar`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ atendidaPor: null, atendidaEn: null, llegoEn: v.llegoEn })

    // Y otro la puede agarrar.
    expect((await pedir(gerente, 'POST', `/recepcion/visitas/${v.id}/atender`)).statusCode).toBe(
      200,
    )
  })

  it('abrir la orden desde la visita la cierra con su orden', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Con turno' })
    await pedir(asesor, 'POST', `/recepcion/visitas/${v.id}/atender`)

    const r = await abrirOrden(asesor, vehiculos[0] as string, v.id)
    expect(r.statusCode, r.body).toBe(201)

    const cerrada = (await hoy()).find((x) => x.id === v.id)
    expect(cerrada).toMatchObject({ resultado: 'orden', ordenId: r.json().id })
    expect(cerrada?.atendidaPor?.nombre).toBe('Prueba Asesor de servicios')
  })

  it('si la tiene otro, no se abre la orden: nada queda a medias', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Disputado' })
    await pedir(gerente, 'POST', `/recepcion/visitas/${v.id}/atender`)

    const r = await abrirOrden(asesor, vehiculos[1] as string, v.id)
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('VISITA_INVALIDA')
    // El auto no quedó con una orden abierta.
    expect((await abrirOrden(gerente, vehiculos[1] as string)).statusCode).toBe(201)
  })

  it('una recibida desde el escritorio sin que nadie la agarre queda a nombre de quien abre', async () => {
    const v = await anotar({ motivo: 'servicio', nombre: 'Directo' })
    const r = await abrirOrden(asesor, vehiculos[2] as string, v.id)
    expect(r.statusCode, r.body).toBe(201)
    const cerrada = (await hoy()).find((x) => x.id === v.id)
    expect(cerrada?.atendidaPor?.nombre).toBe('Prueba Asesor de servicios')
    expect(cerrada?.atendidaEn).not.toBeNull()
  })
})
