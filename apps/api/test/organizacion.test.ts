import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Empresas, sucursales y puntos de venta. Lo que importa: una SAS por sucursal funciona,
 * el número de punto de venta es único por CUIT y no por concesionaria, y desactivar no
 * deja a nadie afuera sin avisar.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

type Empresa = {
  id: string
  razonSocial: string
  cuit: string
  sucursales: Array<{
    id: string
    nombre: string
    activa: boolean
    puntosVenta: Array<{ id: string; numero: number; predeterminado: boolean; activo: boolean }>
  }>
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'organizacion',
    email: 'gerente@organizacion.test',
    otros: [
      { email: 'administrativo@organizacion.test', rol: 'Administrativo' },
      { email: 'mecanico@organizacion.test', rol: 'Mecánico' },
    ],
  })
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

const EMPRESA = {
  razonSocial: 'Rafaela Automotores SAS',
  nombreFantasia: '',
  condicionIva: 1,
  inicioActividades: '2020-03-01',
  domicilioFiscal: 'Bv. Santa Fe 1200',
  provinciaCodigo: 21,
  convenioMultilateral: false,
  numeroIibb: '',
}

const SUCURSAL = { domicilio: null, provinciaCodigo: null, localidad: null, telefono: null }

describe('las razones sociales', () => {
  it('un CUIT con el dígito verificador mal se rechaza antes de llegar a la base', async () => {
    const access = await entrar('gerente@organizacion.test')
    const r = await pedir(access, 'POST', '/empresas', { ...EMPRESA, cuit: '30712345679' })

    expect(r.statusCode).toBe(400)
    expect(r.body).toMatch(/Ese CUIT no existe/)
  })

  it('se da de alta con un CUIT válido, y los campos vacíos quedan vacíos', async () => {
    const access = await entrar('gerente@organizacion.test')
    const r = await pedir(access, 'POST', '/empresas', { ...EMPRESA, cuit: '30712345671' })

    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      razonSocial: 'Rafaela Automotores SAS',
      nombreFantasia: null,
      numeroIibb: null,
      sucursales: [],
    })
  })

  it('el mismo CUIT dos veces no', async () => {
    const access = await entrar('gerente@organizacion.test')
    const r = await pedir(access, 'POST', '/empresas', { ...EMPRESA, cuit: '30712345671' })
    expect(r.json().code).toBe('CUIT_DUPLICADO')
  })

  it('al modificarla, el CUIT no cambia aunque lo manden', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const rafaela = datos.find((e: Empresa) => e.cuit === '30712345671')

    const r = await pedir(access, 'PUT', `/empresas/${rafaela.id}`, {
      ...EMPRESA,
      razonSocial: 'Rafaela Motors SAS',
      cuit: '30719876540',
    })
    expect(r.json()).toMatchObject({ razonSocial: 'Rafaela Motors SAS', cuit: '30712345671' })
  })
})

describe('una SAS por sucursal', () => {
  it('cada una con su punto de venta 1: el número es único por CUIT, no por concesionaria', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const [original] = datos.filter((e: Empresa) => e.cuit !== '30712345671')
    const rafaela = datos.find((e: Empresa) => e.cuit === '30712345671')

    const conSucursal = (
      await pedir(access, 'POST', `/empresas/${rafaela.id}/sucursales`, {
        nombre: 'Rafaela',
        ...SUCURSAL,
      })
    ).json() as Empresa
    const sucursalRafaela = conSucursal.sucursales[0]

    const primero = await pedir(
      access,
      'POST',
      `/sucursales/${original.sucursales[0].id}/puntos-venta`,
      { numero: 1, uso: 'facturacion', modo: 'CAE', predeterminado: true },
    )
    const segundo = await pedir(access, 'POST', `/sucursales/${sucursalRafaela?.id}/puntos-venta`, {
      numero: 1,
      uso: 'facturacion',
      modo: 'CAE',
      predeterminado: true,
    })

    expect(primero.statusCode).toBe(201)
    expect(segundo.statusCode).toBe(201)
  })

  it('quien da de alta la sucursal queda con acceso a ella', async () => {
    const access = await entrar('gerente@organizacion.test')
    const yo = (await pedir(access, 'GET', '/auth/yo')).json()
    expect(yo.sucursales.map((s: { nombre: string }) => s.nombre)).toContain('Rafaela')
  })

  it('pero dentro de la misma razón social, el número no se repite', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const rafaela = datos.find((e: Empresa) => e.cuit === '30712345671')

    const r = await pedir(access, 'POST', `/sucursales/${rafaela.sucursales[0].id}/puntos-venta`, {
      numero: 1,
      uso: 'remito',
      modo: 'CAE',
      predeterminado: false,
    })
    expect(r.json().code).toBe('PUNTO_VENTA_DUPLICADO')
  })
})

describe('el punto de venta predeterminado', () => {
  it('marcar otro desmarca al anterior, y desactivarlo le saca la marca', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const rafaela = datos.find((e: Empresa) => e.cuit === '30712345671')
    const sucursalId = rafaela.sucursales[0].id

    const conDos = (
      await pedir(access, 'POST', `/sucursales/${sucursalId}/puntos-venta`, {
        numero: 2,
        uso: 'facturacion',
        modo: 'CAE',
        predeterminado: true,
      })
    ).json() as Empresa
    const puntos = conDos.sucursales[0]?.puntosVenta ?? []
    expect(puntos.map((p) => [p.numero, p.predeterminado])).toEqual([
      [1, false],
      [2, true],
    ])

    const dos = puntos.find((p) => p.numero === 2)
    const desactivado = (
      await pedir(access, 'PUT', `/puntos-venta/${dos?.id}`, {
        uso: 'facturacion',
        modo: 'CAE',
        predeterminado: true,
        activo: false,
      })
    ).json() as Empresa
    expect(desactivado.sucursales[0]?.puntosVenta.find((p) => p.numero === 2)).toMatchObject({
      activo: false,
      predeterminado: false,
    })
  })
})

describe('desactivar una sucursal', () => {
  it('no se puede si hay usuarios que sólo entran a ésa, y dice quiénes', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const [original] = datos.filter((e: Empresa) => e.cuit !== '30712345671')
    const central = original.sucursales[0]

    const r = await pedir(access, 'PUT', `/sucursales/${central.id}`, {
      nombre: central.nombre,
      ...SUCURSAL,
      activa: false,
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().data.usuarios).toEqual(
      expect.arrayContaining(['administrativo@organizacion.test', 'mecanico@organizacion.test']),
    )
    // El gerente entra también a Rafaela: no queda varado, y no aparece.
    expect(r.json().data.usuarios).not.toContain('gerente@organizacion.test')
  })

  it('una sucursal a la que nadie más entra sí, y queda en la auditoría en palabras', async () => {
    const access = await entrar('gerente@organizacion.test')
    const { datos } = (await pedir(access, 'GET', '/empresas')).json()
    const rafaela = datos.find((e: Empresa) => e.cuit === '30712345671')
    const sucursal = rafaela.sucursales[0]

    const r = await pedir(access, 'PUT', `/sucursales/${sucursal.id}`, {
      nombre: sucursal.nombre,
      ...SUCURSAL,
      activa: false,
    })
    expect(r.statusCode).toBe(200)

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0]).toMatchObject({ sobre: 'la sucursal Rafaela', detalle: 'La desactivó' })
  })
})

describe('permisos', () => {
  it('el administrativo ve las empresas pero no da de alta', async () => {
    const access = await entrar('administrativo@organizacion.test')
    expect((await pedir(access, 'GET', '/empresas')).statusCode).toBe(200)
    const r = await pedir(access, 'POST', '/empresas', { ...EMPRESA, cuit: '30655443327' })
    expect(r.statusCode).toBe(403)
  })

  it('el mecánico no las ve', async () => {
    const access = await entrar('mecanico@organizacion.test')
    expect((await pedir(access, 'GET', '/empresas')).statusCode).toBe(403)
  })
})
