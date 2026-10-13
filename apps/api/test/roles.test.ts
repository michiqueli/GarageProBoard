import { type ReglaPermiso, ROLES_PREDEFINIDOS } from '@gpb/core'
import { eq } from '@gpb/db'
import { rol as tablaRol } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Roles: crear, clonar y modificar. Lo que importa: las reglas que no caben en casillas se
 * conservan, nadie modifica un rol que tiene, el que puede todo no se toca, y quien tiene
 * el rol se entera y recibe el cambio en el próximo pedido.
 */

let api: ApiDePrueba
let app: NestFastifyApplication

interface Rol {
  id: string
  nombre: string
  todo: boolean
  permisos: Array<{ accion: string; sujeto: string }>
  especiales: string[]
  usuarios: number
  noEditable: string | null
  novedad: { agrega: string[]; quita: string[] } | null
}

beforeAll(async () => {
  api = await levantarApi()
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'roles',
    email: 'gerente@roles.test',
    otros: [
      { email: 'sistemas@roles.test', rol: 'Administrador de sistema' },
      { email: 'mecanico@roles.test', rol: 'Mecánico' },
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
  return r.json() as { access: string; avisos: Array<{ texto: string }> }
}

function pedir(
  access: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${access}` },
    ...(payload ? { payload } : {}),
  })
}

async function roles(access: string): Promise<Rol[]> {
  const r = await pedir(access, 'GET', '/roles')
  expect(r.statusCode).toBe(200)
  return r.json().datos
}

async function rol(access: string, nombre: string): Promise<Rol> {
  const encontrado = (await roles(access)).find((r) => r.nombre === nombre)
  if (!encontrado) throw new Error(`No está el rol ${nombre}`)
  return encontrado
}

describe('el listado', () => {
  it('separa la grilla de las reglas especiales, y dice por qué no se puede tocar cada uno', async () => {
    const { access } = await entrar('sistemas@roles.test')

    const mecanico = await rol(access, 'Mecánico')
    expect(mecanico).toMatchObject({ todo: false, usuarios: 1, noEditable: null })
    expect(mecanico.permisos).toContainEqual({ accion: 'ver', sujeto: 'Vehiculo' })
    expect(mecanico.especiales).toEqual([
      'Puede modificar órdenes de trabajo sólo si las tiene asignadas',
    ])

    expect((await rol(access, 'Gerente')).noEditable).toMatch(/Puede todo el sistema/)
    expect((await rol(access, 'Administrador de sistema')).noEditable).toMatch(/Lo tenés vos/)
  })

  it('el mecánico no ve roles', async () => {
    const { access } = await entrar('mecanico@roles.test')
    expect((await pedir(access, 'GET', '/roles')).statusCode).toBe(403)
  })
})

describe('modificar', () => {
  it('nadie modifica un rol que tiene', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const propio = await rol(access, 'Administrador de sistema')

    const r = await pedir(access, 'PUT', `/roles/${propio.id}`, {
      nombre: propio.nombre,
      descripcion: null,
      permisos: [...propio.permisos, { accion: 'configurar', sujeto: 'Comprobante' }],
    })
    expect(r.statusCode).toBe(403)
    expect(r.json()).toMatchObject({
      code: 'NO_EDITABLE',
      data: { motivo: expect.stringMatching(/Lo tenés vos/) },
    })
  })

  it('el que puede todo no se modifica, ni siquiera el gerente', async () => {
    const { access } = await entrar('gerente@roles.test')
    const gerente = await rol(access, 'Gerente')

    const r = await pedir(access, 'PUT', `/roles/${gerente.id}`, {
      nombre: 'Gerente',
      descripcion: null,
      permisos: [],
    })
    expect(r.json().code).toBe('NO_EDITABLE')
  })

  it('agregarle un permiso al mecánico: vale en el acto, conserva lo suyo y le avisa', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const mecanico = await rol(access, 'Mecánico')

    // Antes: no ve clientes.
    const antes = await entrar('mecanico@roles.test')
    expect((await pedir(antes.access, 'GET', '/clientes')).statusCode).toBe(403)

    const r = await pedir(access, 'PUT', `/roles/${mecanico.id}`, {
      nombre: 'Mecánico',
      descripcion: null,
      permisos: [...mecanico.permisos, { accion: 'ver', sujeto: 'Cliente' }],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().especiales).toEqual([
      'Puede modificar órdenes de trabajo sólo si las tiene asignadas',
    ])

    // Con el mismo token de antes: los permisos se leen en cada pedido.
    expect((await pedir(antes.access, 'GET', '/clientes')).statusCode).toBe(200)

    const despues = await entrar('mecanico@roles.test')
    expect(despues.avisos.map((a) => a.texto)).toContainEqual(
      expect.stringMatching(/cambió el rol Mecánico .*: ahora podés ver clientes\.$/),
    )

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0]).toMatchObject({
      sobre: 'el rol Mecánico',
      detalle: 'Le agregó ver clientes',
    })
  })

  it('el nombre no se repite', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const mecanico = await rol(access, 'Mecánico')

    const r = await pedir(access, 'PUT', `/roles/${mecanico.id}`, {
      nombre: 'Cajero',
      descripcion: null,
      permisos: mecanico.permisos,
    })
    expect(r.json().code).toBe('NOMBRE_DUPLICADO')
  })
})

describe('crear y clonar', () => {
  it('clonar al mecánico copia también «sólo sus órdenes»', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const mecanico = await rol(access, 'Mecánico')

    const r = await pedir(access, 'POST', '/roles', {
      nombre: 'Mecánico de guardia',
      descripcion: 'El de los sábados',
      permisos: [...mecanico.permisos, { accion: 'crear', sujeto: 'Orden' }],
      basadoEn: mecanico.id,
    })

    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      nombre: 'Mecánico de guardia',
      usuarios: 0,
      noEditable: null,
      especiales: ['Puede modificar órdenes de trabajo sólo si las tiene asignadas'],
    })
    expect(r.json().permisos).toContainEqual({ accion: 'crear', sujeto: 'Orden' })

    const { datos: cambios } = (await pedir(access, 'GET', '/auditoria/cambios')).json()
    expect(cambios[0]).toMatchObject({
      sobre: 'el rol Mecánico de guardia',
      detalle: 'Lo creó a partir de Mecánico',
    })
  })

  it('uno desde cero, sin reglas especiales', async () => {
    const { access } = await entrar('gerente@roles.test')
    const r = await pedir(access, 'POST', '/roles', {
      nombre: 'Recepción',
      descripcion: null,
      permisos: [
        { accion: 'ver', sujeto: 'Cliente' },
        { accion: 'crear', sujeto: 'Cliente' },
      ],
    })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ especiales: [], todo: false })
  })

  it('quien no administra usuarios no crea roles', async () => {
    const { access } = await entrar('mecanico@roles.test')
    const r = await pedir(access, 'POST', '/roles', {
      nombre: 'Otro',
      descripcion: null,
      permisos: [],
    })
    expect(r.statusCode).toBe(403)
  })
})

describe('la versión nueva de un rol predefinido', () => {
  // Una versión anterior del sistema, sin la recepción. Al cajero y al repuestero de esta
  // concesionaria, además, alguien les dio «ver vehículos»: por eso la sincronización no
  // los actualizó solos y la pantalla les ofrece la versión nueva.
  const sinRecepcion = (reglas: ReglaPermiso[]) =>
    reglas.flatMap((r): ReglaPermiso[] => {
      const sujetos = (Array.isArray(r.subject) ? r.subject : [r.subject]).filter(
        (s) => s !== 'Visita' && s !== 'Turno',
      )
      return sujetos.length ? [{ ...r, subject: sujetos }] : []
    })

  beforeAll(async () => {
    for (const clave of ['cajero', 'repuestero']) {
      const predefinido = ROLES_PREDEFINIDOS.find((p) => p.clave === clave)
      if (!predefinido) throw new Error(`sin ${clave}`)
      const viejo = sinRecepcion(predefinido.habilidades)
      await api.pg.dbDuenio
        .update(tablaRol)
        .set({
          habilidades: [...viejo, { action: 'ver', subject: 'Vehiculo' }],
          versionSistema: viejo,
        })
        .where(eq(tablaRol.predefinido, clave))
    }
  })

  it('el listado dice qué cambió el sistema, y sólo en los que la tienen', async () => {
    const { access } = await entrar('sistemas@roles.test')
    expect((await rol(access, 'Cajero')).novedad).toEqual({
      agrega: ['ver las visitas de la recepción', 'modificar las visitas de la recepción'],
      quita: [],
    })
    expect((await rol(access, 'Mecánico')).novedad).toBeNull()
  })

  it('aplicarla suma lo del sistema y conserva lo que la concesionaria había cambiado', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const cajero = await rol(access, 'Cajero')

    const r = await pedir(access, 'POST', `/roles/${cajero.id}/novedad`)
    expect(r.statusCode).toBe(200)
    const aplicado = r.json() as Rol
    expect(aplicado.novedad).toBeNull()
    expect(aplicado.permisos).toContainEqual({ accion: 'editar', sujeto: 'Visita' })
    expect(aplicado.permisos).toContainEqual({ accion: 'ver', sujeto: 'Vehiculo' })
    expect(aplicado.especiales).toEqual(cajero.especiales)

    const otraVez = await pedir(access, 'POST', `/roles/${cajero.id}/novedad`)
    expect(otraVez.statusCode).toBe(409)
  })

  it('dejarlo como está no le cambia nada, y la novedad deja de ofrecerse', async () => {
    const { access } = await entrar('sistemas@roles.test')
    const repuestero = await rol(access, 'Repuestero')

    const r = await pedir(access, 'DELETE', `/roles/${repuestero.id}/novedad`)
    expect(r.statusCode).toBe(200)
    const dejado = r.json() as Rol
    expect(dejado.novedad).toBeNull()
    expect(dejado.permisos).toEqual(repuestero.permisos)
  })

  it('quien no administra usuarios no decide', async () => {
    const { access } = await entrar('mecanico@roles.test')
    const { access: sistemas } = await entrar('sistemas@roles.test')
    const cajero = await rol(sistemas, 'Cajero')
    expect((await pedir(access, 'POST', `/roles/${cajero.id}/novedad`)).statusCode).toBe(403)
  })
})
