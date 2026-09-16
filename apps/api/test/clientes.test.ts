import { entidadComercial, proveedor } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Clientes. Lo que importa: el documento se valida según su tipo, un CUIT que ya es
 * proveedor no se duplica, nada se borra, y el buscador encuentra por lo que la gente
 * tiene en la mano —el nombre, el CUIT con guiones, el DNI—.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let tenantId: string

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const { tenant } = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'clientes',
    email: 'gerente@clientes.test',
    otros: [
      { email: 'repuestero@clientes.test', rol: 'Repuestero' },
      { email: 'mecanico@clientes.test', rol: 'Mecánico' },
    ],
  })
  tenantId = tenant.id
  await sembrarConcesionaria(api.pg.dbDuenio, { slug: 'otra', email: 'gerente@otra.test' })
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

const DATOS = {
  condicionIva: 1,
  domicilio: '',
  provinciaCodigo: 12,
  localidad: 'Santa Fe',
  codigoPostal: '',
  email: '',
  telefono: '',
  numeroIibb: '',
  condicionIibb: 'local',
  observaciones: '',
}

const TRANSPORTES = {
  ...DATOS,
  tipoDocumento: 80,
  numeroDocumento: '30711111111',
  razonSocial: 'Transportes del Sur SRL',
}

describe('el documento', () => {
  it('un CUIT con el dígito verificador mal no pasa', async () => {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', {
      ...TRANSPORTES,
      numeroDocumento: '30711111112',
    })
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatch(/Ese CUIT no existe/)
  })

  it('un DNI son 7 u 8 dígitos', async () => {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', {
      ...DATOS,
      condicionIva: 5,
      tipoDocumento: 96,
      numeroDocumento: '123456',
      razonSocial: 'Gómez, Ana',
    })
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatch(/El DNI son 7 u 8 dígitos/)
  })
})

describe('el alta', () => {
  it('una sociedad, con los vacíos en null y la persona jurídica deducida del CUIT', async () => {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', TRANSPORTES)

    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      razonSocial: 'Transportes del Sur SRL',
      tipoPersona: 'juridica',
      domicilio: null,
      email: null,
      activo: true,
      esProveedor: false,
    })
  })

  it('una persona con DNI, que es consumidor final', async () => {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', {
      ...DATOS,
      condicionIva: 5,
      condicionIibb: 'no_inscripto',
      tipoDocumento: 96,
      numeroDocumento: '20123456',
      razonSocial: 'Gómez, Ana',
      email: 'ana@correo.test',
    })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ tipoPersona: 'fisica', email: 'ana@correo.test' })
  })

  it('el mismo documento dos veces no, y dice a nombre de quién está', async () => {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', { ...TRANSPORTES, razonSocial: 'Otro' })

    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({
      code: 'CLIENTE_DUPLICADO',
      data: { razonSocial: 'Transportes del Sur SRL' },
    })
  })

  it('otra concesionaria carga el mismo CUIT sin enterarse de que existe', async () => {
    const access = await entrar('gerente@otra.test')
    const r = await pedir(access, 'POST', '/clientes', TRANSPORTES)
    expect(r.statusCode).toBe(201)
  })

  it('un proveedor que pasa a ser cliente no se duplica: se le suma el rol', async () => {
    const [neumaticos] = await api.pg.dbDuenio
      .insert(entidadComercial)
      .values({
        tenantId,
        tipoDocumento: 80,
        numeroDocumento: '30712222227',
        tipoPersona: 'juridica',
        razonSocial: 'Neumáticos Rafaela SA',
        condicionIva: 1,
        domicilio: 'Ruta 34 km 3',
      })
      .returning()
    if (!neumaticos) throw new Error('sin proveedor')
    await api.pg.dbDuenio.insert(proveedor).values({ id: neumaticos.id, tenantId })

    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'POST', '/clientes', {
      ...DATOS,
      tipoDocumento: 80,
      numeroDocumento: '30712222227',
      razonSocial: 'Neumáticos Rafaela SA',
      domicilio: 'Ruta 34 km 3,5',
      localidad: '',
      provinciaCodigo: null,
      condicionIibb: 'no_inscripto',
    })

    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      id: neumaticos.id,
      esProveedor: true,
      domicilio: 'Ruta 34 km 3,5',
    })

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0]).toMatchObject({
      sobre: 'el cliente Neumáticos Rafaela SA',
      detalle:
        'Lo dio de alta sobre una identidad fiscal que ya existía y domicilio: «Ruta 34 km 3» → «Ruta 34 km 3,5»',
    })
  })
})

describe('el buscador', () => {
  async function buscar(texto: string) {
    const access = await entrar('gerente@clientes.test')
    const r = await pedir(access, 'GET', `/clientes?buscar=${encodeURIComponent(texto)}`)
    return (r.json().datos as Array<{ razonSocial: string }>).map((c) => c.razonSocial)
  }

  it('encuentra por nombre, sin importar mayúsculas', async () => {
    expect(await buscar('transportes')).toEqual(['Transportes del Sur SRL'])
  })

  it('por CUIT escrito con guiones', async () => {
    expect(await buscar('30-71111111-1')).toEqual(['Transportes del Sur SRL'])
  })

  it('por DNI', async () => {
    expect(await buscar('20.123.456')).toEqual(['Gómez, Ana'])
  })
})

describe('la auditoría', () => {
  it('cuenta los cambios con los nombres de los catálogos, no con sus códigos', async () => {
    const access = await entrar('gerente@clientes.test')
    const { datos } = (await pedir(access, 'GET', '/clientes?buscar=Transportes')).json()

    const r = await pedir(access, 'PUT', `/clientes/${datos[0].id}`, {
      ...TRANSPORTES,
      condicionIva: 6,
      provinciaCodigo: null,
      condicionIibb: 'convenio',
      activo: true,
    })
    expect(r.statusCode).toBe(200)

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0].detalle).toBe(
      'Condición frente al IVA: «IVA Responsable Inscripto» → «Responsable Monotributo», ' +
        'provincia: «Santa Fe» → «vacío» y ' +
        'condición en Ingresos Brutos: «Contribuyente local» → «Convenio Multilateral»',
    )
  })
})

describe('la baja', () => {
  it('desactiva, no borra: sale del listado pero sigue estando', async () => {
    const access = await entrar('gerente@clientes.test')
    const { datos } = (await pedir(access, 'GET', '/clientes?buscar=Gómez')).json()
    const ana = datos[0]

    const r = await pedir(access, 'PUT', `/clientes/${ana.id}`, {
      ...DATOS,
      condicionIva: 5,
      condicionIibb: 'no_inscripto',
      razonSocial: 'Gómez, Ana',
      email: 'ana@correo.test',
      activo: false,
      // El documento no se cambia aunque lo manden.
      numeroDocumento: '99999999',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ activo: false, numeroDocumento: '20123456' })

    const activos = (await pedir(access, 'GET', '/clientes?buscar=Gómez')).json()
    expect(activos.total).toBe(0)
    const todos = (await pedir(access, 'GET', '/clientes?buscar=Gómez&estado=todos')).json()
    expect(todos.total).toBe(1)

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0]).toMatchObject({ sobre: 'el cliente Gómez, Ana', detalle: 'Lo desactivó' })
  })
})

describe('la ficha', () => {
  it('trae los datos y la historia contada en palabras, de la más nueva a la más vieja', async () => {
    const access = await entrar('gerente@clientes.test')
    const { datos } = (await pedir(access, 'GET', '/clientes?buscar=Gómez&estado=todos')).json()

    const r = await pedir(access, 'GET', `/clientes/${datos[0].id}`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ razonSocial: 'Gómez, Ana', activo: false })
    expect(r.json().historia.map((h: { detalle: string }) => h.detalle)).toEqual([
      'Lo desactivó',
      'Lo dio de alta',
    ])
  })

  it('la de un cliente de otra concesionaria no existe', async () => {
    const access = await entrar('gerente@clientes.test')
    const { datos } = (await pedir(access, 'GET', '/clientes?buscar=Gómez&estado=todos')).json()
    const ajena = await entrar('gerente@otra.test')
    expect((await pedir(ajena, 'GET', `/clientes/${datos[0].id}`)).statusCode).toBe(404)
  })
})

describe('permisos', () => {
  it('el repuestero ve la ficha de un cliente, pero no sus vehículos', async () => {
    const access = await entrar('repuestero@clientes.test')
    const { datos } = (await pedir(access, 'GET', '/clientes?buscar=Transportes')).json()
    expect((await pedir(access, 'GET', `/clientes/${datos[0].id}`)).statusCode).toBe(200)
    expect((await pedir(access, 'GET', `/clientes/${datos[0].id}/vehiculos`)).statusCode).toBe(403)
  })

  it('el repuestero ve los clientes pero no da de alta', async () => {
    const access = await entrar('repuestero@clientes.test')
    expect((await pedir(access, 'GET', '/clientes')).statusCode).toBe(200)
    const r = await pedir(access, 'POST', '/clientes', {
      ...TRANSPORTES,
      numeroDocumento: '30713333332',
    })
    expect(r.statusCode).toBe(403)
  })

  it('el mecánico no los ve', async () => {
    const access = await entrar('mecanico@clientes.test')
    expect((await pedir(access, 'GET', '/clientes')).statusCode).toBe(403)
  })
})
