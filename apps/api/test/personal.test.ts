import { and, eq, isNull } from '@gpb/db'
import { credencial, empleado } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El personal y sus credenciales.
 *
 * Lo que importa: la credencial cuelga del **empleado** y no de una cuenta —la mayoría de los
 * que fichan no entran al sistema—, emitir una nueva revoca la anterior con motivo, y nada se
 * borra: una credencial revocada queda, que es lo único que después explica un fichaje raro.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let tenantId: string
let sucursalId: string

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  const { tenant, sucursales } = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'personal',
    email: 'gerente@personal.test',
    otros: [
      { email: 'asesor@personal.test', rol: 'Asesor de servicios' },
      { email: 'mecanico@personal.test', rol: 'Mecánico' },
    ],
  })
  tenantId = tenant.id
  sucursalId = sucursales[0]?.id ?? ''
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

const BASE = {
  convenio: '',
  categoria: '',
  fechaIngreso: null,
  email: '',
  telefono: '',
}

const JORGE = {
  ...BASE,
  tipoDocumento: 86,
  numeroDocumento: '20123456783',
  nombre: 'Jorge',
  apellido: 'Pérez',
  legajo: '0001',
  puesto: 'mecanico',
  sucursalId: null as string | null,
}

/** Da de alta a alguien y devuelve su id. */
async function alta(access: string, datos: object) {
  const r = await pedir(access, 'POST', '/personal', { ...JORGE, ...datos })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().id as string
}

describe('el alta', () => {
  it('guarda el legajo y el puesto, y arma la razón social como la escribe AFIP', async () => {
    const access = await entrar('gerente@personal.test')
    const r = await pedir(access, 'POST', '/personal', { ...JORGE, sucursalId })

    expect(r.statusCode, r.body).toBe(201)
    expect(r.json()).toMatchObject({
      razonSocial: 'Pérez, Jorge',
      nombre: 'Jorge',
      apellido: 'Pérez',
      legajo: '0001',
      puesto: 'mecanico',
      activo: true,
      credencial: null,
      usuario: null,
    })
  })

  it('el CUIL son once dígitos, y el dígito verificador no se revisa como un CUIT', async () => {
    const access = await entrar('gerente@personal.test')
    const r = await pedir(access, 'POST', '/personal', {
      ...JORGE,
      numeroDocumento: '2012345',
      legajo: '0099',
    })
    expect(r.statusCode).toBe(400)
    expect(r.body).toMatch(/El CUIL son 11 dígitos/)
  })

  it('el legajo no se repite, y el error dice de quién es', async () => {
    const access = await entrar('gerente@personal.test')
    const r = await pedir(access, 'POST', '/personal', {
      ...JORGE,
      numeroDocumento: '27111111118',
      nombre: 'Otra',
      apellido: 'Persona',
    })

    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({
      code: 'LEGAJO_DUPLICADO',
      data: { razonSocial: 'Pérez, Jorge' },
    })
  })

  it('la misma persona dos veces no', async () => {
    const access = await entrar('gerente@personal.test')
    const r = await pedir(access, 'POST', '/personal', { ...JORGE, legajo: '0050' })

    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ code: 'EMPLEADO_DUPLICADO' })
  })
})

describe('las credenciales', () => {
  it('se emite una, con su código de ocho caracteres', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '27222222223',
      nombre: 'Rosa',
      apellido: 'Ledesma',
      legajo: '0002',
      puesto: 'lavador',
    })

    const r = await pedir(access, 'POST', `/personal/${id}/credencial`)
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().credencial.codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('reemplazarla sin decir por qué no se puede: la nueva revoca la anterior', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20333333338',
      nombre: 'Luis',
      apellido: 'Sosa',
      legajo: '0003',
    })
    await pedir(access, 'POST', `/personal/${id}/credencial`)

    const sinMotivo = await pedir(access, 'POST', `/personal/${id}/credencial`)
    expect(sinMotivo.statusCode).toBe(422)
    expect(sinMotivo.json()).toMatchObject({ code: 'FALTA_MOTIVO' })
  })

  it('con motivo se emite otra, y la vieja queda revocada con su motivo', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20444444446',
      nombre: 'Ana',
      apellido: 'Rivas',
      legajo: '0004',
    })
    const primera = (await pedir(access, 'POST', `/personal/${id}/credencial`)).json().credencial
      .codigo

    const r = await pedir(access, 'POST', `/personal/${id}/credencial`, {
      motivo: 'La perdió en el foso',
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().credencial.codigo).not.toBe(primera)

    // La vieja no se borró: queda con su fecha y su motivo. Es lo que contesta «¿por qué este
    // código dejó de fichar?».
    const todas = await api.pg.dbDuenio
      .select()
      .from(credencial)
      .where(eq(credencial.empleadoId, id))
    expect(todas).toHaveLength(2)
    const vieja = todas.find((c) => c.codigo === primera)
    expect(vieja?.revocadaEn).not.toBeNull()
    expect(vieja?.motivoRevocacion).toBe('La perdió en el foso')
  })

  it('sólo hay una vigente a la vez', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20555555554',
      nombre: 'Hugo',
      apellido: 'Paz',
      legajo: '0005',
    })
    await pedir(access, 'POST', `/personal/${id}/credencial`)
    await pedir(access, 'POST', `/personal/${id}/credencial`, { motivo: 'Se arruinó' })
    await pedir(access, 'POST', `/personal/${id}/credencial`, { motivo: 'Otra vez' })

    const vigentes = await api.pg.dbDuenio
      .select()
      .from(credencial)
      .where(and(eq(credencial.empleadoId, id), isNull(credencial.revocadaEn)))
    expect(vigentes).toHaveLength(1)
  })

  it('revocar sin emitir otra deja al empleado sin poder fichar', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20666666662',
      nombre: 'Elsa',
      apellido: 'Vera',
      legajo: '0006',
    })
    await pedir(access, 'POST', `/personal/${id}/credencial`)

    const r = await pedir(access, 'POST', `/personal/${id}/credencial/revocar`, {
      motivo: 'Renunció',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().credencial).toBeNull()

    const otra = await pedir(access, 'POST', `/personal/${id}/credencial/revocar`, {
      motivo: 'De nuevo',
    })
    expect(otra.statusCode).toBe(422)
    expect(otra.json()).toMatchObject({ code: 'SIN_CREDENCIAL' })
  })

  it('al que ya no trabaja acá no se le emite una', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20777777770',
      nombre: 'Raúl',
      apellido: 'Gil',
      legajo: '0007',
    })
    await pedir(access, 'PUT', `/personal/${id}`, {
      ...JORGE,
      nombre: 'Raúl',
      apellido: 'Gil',
      legajo: '0007',
      activo: false,
      fechaEgreso: '2026-09-18',
    })

    const r = await pedir(access, 'POST', `/personal/${id}/credencial`)
    expect(r.statusCode).toBe(422)
    expect(r.json()).toMatchObject({ code: 'EMPLEADO_INACTIVO' })
  })

  /**
   * La regla que evita el agujero más tonto: el que se fue el viernes no ficha el lunes. Si la
   * baja no revocara, la tarjeta sigue abriendo sesiones de trabajo a su nombre.
   */
  it('dar de baja a alguien le revoca la credencial', async () => {
    const access = await entrar('gerente@personal.test')
    const id = await alta(access, {
      numeroDocumento: '20888888889',
      nombre: 'Nora',
      apellido: 'Díaz',
      legajo: '0008',
    })
    await pedir(access, 'POST', `/personal/${id}/credencial`)

    const r = await pedir(access, 'PUT', `/personal/${id}`, {
      ...JORGE,
      nombre: 'Nora',
      apellido: 'Díaz',
      legajo: '0008',
      activo: false,
      fechaEgreso: '2026-09-18',
    })

    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().credencial).toBeNull()
    const vigentes = await api.pg.dbDuenio
      .select()
      .from(credencial)
      .where(and(eq(credencial.empleadoId, id), isNull(credencial.revocadaEn)))
    expect(vigentes).toHaveLength(0)
  })
})

describe('el listado', () => {
  it('filtra por los que todavía no tienen credencial: es la cola de impresión', async () => {
    const access = await entrar('gerente@personal.test')
    const sin = await pedir(access, 'GET', '/personal?credencial=sin')

    expect(sin.statusCode, sin.body).toBe(200)
    const datos = sin.json().datos as Array<{ credencial: unknown }>
    expect(datos.length).toBeGreaterThan(0)
    expect(datos.every((e) => e.credencial === null)).toBe(true)
  })

  it('encuentra por legajo y por documento, no sólo por nombre', async () => {
    const access = await entrar('gerente@personal.test')
    const porLegajo = await pedir(access, 'GET', '/personal?buscar=0001')
    const porDocumento = await pedir(access, 'GET', '/personal?buscar=20123456783')

    expect(porLegajo.json().datos[0]).toMatchObject({ razonSocial: 'Pérez, Jorge' })
    expect(porDocumento.json().datos[0]).toMatchObject({ razonSocial: 'Pérez, Jorge' })
  })

  it('por omisión no trae a los que se fueron', async () => {
    const access = await entrar('gerente@personal.test')
    const activos = (await pedir(access, 'GET', '/personal')).json().datos as Array<{
      activo: boolean
    }>
    const todos = (await pedir(access, 'GET', '/personal?estado=todos')).json().datos as unknown[]

    expect(activos.every((e) => e.activo)).toBe(true)
    expect(todos.length).toBeGreaterThan(activos.length)
  })
})

describe('los permisos', () => {
  /**
   * El legajo lleva convenio y categoría, y va a llevar sueldos. El rol de asesor lo prohíbe
   * explícitamente, y eso es justamente lo que esta pantalla tiene que respetar.
   */
  it('el asesor de servicios no ve los legajos', async () => {
    const access = await entrar('asesor@personal.test')
    const r = await pedir(access, 'GET', '/personal')

    expect(r.statusCode).toBe(403)
    expect(r.json()).toMatchObject({ code: 'SIN_PERMISO' })
  })

  it('el mecánico tampoco emite credenciales', async () => {
    const gerente = await entrar('gerente@personal.test')
    const id = (await pedir(gerente, 'GET', '/personal?buscar=0001')).json().datos[0].id

    const access = await entrar('mecanico@personal.test')
    const r = await pedir(access, 'POST', `/personal/${id}/credencial`)
    expect(r.statusCode).toBe(403)
  })
})

describe('el aislamiento', () => {
  it('el código de una credencial es único en todo el sistema, no por concesionaria', async () => {
    // Dos concesionarias no pueden compartir un código: el lector manda el código pelado y el
    // servidor tiene que poder resolverlo sin saber antes de qué concesionaria es.
    const filas = await api.pg.dbDuenio.select({ codigo: credencial.codigo }).from(credencial)
    const codigos = new Set(filas.map((f) => f.codigo))
    expect(codigos.size).toBe(filas.length)
  })

  it('los empleados son de su concesionaria', async () => {
    const mios = await api.pg.dbDuenio
      .select({ id: empleado.id })
      .from(empleado)
      .where(eq(empleado.tenantId, tenantId))
    expect(mios.length).toBeGreaterThan(0)
  })
})
