import { randomUUID } from 'node:crypto'
import { atajosParaSembrar } from '@gpb/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La configuración personal: el tema, la densidad, las filas y el mapa de teclas.
 *
 * Lo que se prueba acá, más que el guardado, es que **nadie toque la de otro** y que el
 * mapa no pueda quedar en un estado en el que el teclado haga cosas al azar.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let semilla: Awaited<ReturnType<typeof sembrarConcesionaria>>
let otra: Awaited<ReturnType<typeof sembrarConcesionaria>>

beforeAll(async () => {
  api = await levantarApi()
  app = api.app

  semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'configuracion',
    email: 'gerente@configuracion.test',
    sucursales: ['Casa Central', 'Rafaela'],
    otros: [{ email: 'mecanico@configuracion.test', rol: 'Mecánico' }],
  })

  // Otra concesionaria, para el caso de la sucursal que existe pero no es suya.
  otra = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'configuracion-otra',
    email: 'gerente@configuracion-otra.test',
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
  return r.json() as {
    access: string
    atajos: Record<string, string>
    config: {
      tema: string
      densidad: string
      filasPorPagina: number
      sucursalPredeterminadaId: string | null
    }
  }
}

function guardar(access: string, payload: object) {
  return app.inject({
    method: 'PUT',
    url: '/api/configuracion',
    headers: { authorization: `Bearer ${access}` },
    payload,
  })
}

function guardarAtajos(access: string, atajos: Record<string, string>) {
  return app.inject({
    method: 'PUT',
    url: '/api/configuracion/atajos',
    headers: { authorization: `Bearer ${access}` },
    payload: { atajos },
  })
}

const PREFERENCIAS = {
  tema: 'claro',
  densidad: 'comoda',
  filasPorPagina: 100,
  sucursalPredeterminadaId: null,
}

const rafaelaId = () => semilla.sucursales[1]?.id ?? ''

describe('preferencias', () => {
  it('se guardan y vuelven en la sesión siguiente', async () => {
    const { access } = await entrar('gerente@configuracion.test')

    const r = await guardar(access, { ...PREFERENCIAS, sucursalPredeterminadaId: rafaelaId() })

    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({
      tema: 'claro',
      densidad: 'comoda',
      filasPorPagina: 100,
      sucursalPredeterminadaId: rafaelaId(),
    })

    // Y al entrar de nuevo llegan con la sesión, que es de donde las lee el front.
    const otraVez = await entrar('gerente@configuracion.test')
    expect(otraVez.config.tema).toBe('claro')
    expect(otraVez.config.densidad).toBe('comoda')
    expect(otraVez.config.filasPorPagina).toBe(100)
  })

  it('con una sucursal predeterminada ya no se pregunta a cuál entrar', async () => {
    // El gerente tiene dos sucursales: antes de elegir una, el login lo manda a elegir.
    const { access } = await entrar('gerente@configuracion.test')
    await guardar(access, { ...PREFERENCIAS, sucursalPredeterminadaId: rafaelaId() })

    const despues = await app.inject({
      method: 'POST',
      url: '/api/auth/iniciar',
      payload: { email: 'gerente@configuracion.test', password: CLAVE, entrega: 'cuerpo' },
    })

    const cuerpo = despues.json() as { sucursalPendiente: boolean; sucursalActiva: { id: string } }
    expect(cuerpo.sucursalPendiente).toBe(false)
    expect(cuerpo.sucursalActiva.id).toBe(rafaelaId())
  })

  it('rechaza una sucursal a la que el usuario no tiene acceso', async () => {
    // Existe, pero es de otra concesionaria. Aceptarla lo dejaría sin poder entrar: el
    // login busca la predeterminada entre las suyas y no la encuentra.
    const { access } = await entrar('gerente@configuracion.test')
    const ajena = otra.sucursales[0]?.id ?? ''

    const r = await guardar(access, { ...PREFERENCIAS, sucursalPredeterminadaId: ajena })

    expect(r.statusCode).toBe(422)
    expect(r.json()).toMatchObject({ code: 'SUCURSAL_INVALIDA' })
  })

  it('rechaza una sucursal inventada', async () => {
    const { access } = await entrar('gerente@configuracion.test')
    const r = await guardar(access, { ...PREFERENCIAS, sucursalPredeterminadaId: randomUUID() })
    expect(r.statusCode).toBe(422)
  })

  it('no la puede guardar quien no tiene sesión', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/configuracion', payload: PREFERENCIAS })
    expect(r.statusCode).toBe(401)
  })

  it('la puede guardar cualquiera que esté adentro, sin permiso especial', async () => {
    // Un mecánico no puede ver ni un cliente, pero el tema de su pantalla es suyo.
    const { access } = await entrar('mecanico@configuracion.test')
    const r = await guardar(access, PREFERENCIAS)
    expect(r.statusCode).toBe(200)
  })

  it('rechaza un valor fuera de rango antes de tocar la base', async () => {
    const { access } = await entrar('mecanico@configuracion.test')
    expect((await guardar(access, { ...PREFERENCIAS, filasPorPagina: 5 })).statusCode).toBe(400)
    expect((await guardar(access, { ...PREFERENCIAS, filasPorPagina: 500 })).statusCode).toBe(400)
    expect((await guardar(access, { ...PREFERENCIAS, tema: 'fucsia' })).statusCode).toBe(400)
  })
})

describe('mapa de teclas', () => {
  it('guarda una diferencia y devuelve el mapa completo', async () => {
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'global.guardar': 'Ctrl+G' })

    expect(r.statusCode).toBe(200)
    const { atajos } = r.json() as { atajos: Record<string, string> }
    expect(atajos['global.guardar']).toBe('Ctrl+G')
    // Completo: el front lo usa tal cual para dibujar cada botón.
    expect(Object.keys(atajos)).toHaveLength(atajosParaSembrar().length)
    // Y lo que no se tocó sigue en su valor de fábrica.
    expect(atajos['global.buscar']).toBe('F3')
  })

  it('el mapa nuevo llega en la sesión siguiente', async () => {
    const { access } = await entrar('mecanico@configuracion.test')
    await guardarAtajos(access, { 'global.guardar': 'Ctrl+G' })

    const { atajos } = await entrar('mecanico@configuracion.test')
    expect(atajos['global.guardar']).toBe('Ctrl+G')
  })

  it('intercambiar dos teclas entre dos acciones funciona', async () => {
    // El caso que rompe cualquier implementación que actualice fila por fila: la primera
    // escritura choca contra el índice único aunque el resultado final sea válido.
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'global.guardar': 'F3', 'global.buscar': 'F2' })

    expect(r.statusCode).toBe(200)
    const { atajos } = r.json() as { atajos: Record<string, string> }
    expect(atajos['global.guardar']).toBe('F3')
    expect(atajos['global.buscar']).toBe('F2')
  })

  it('rechaza una tecla que el navegador se queda, y dice por qué', async () => {
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'global.guardar': 'F12' })

    expect(r.statusCode).toBe(422)
    const cuerpo = r.json() as { code: string; data: { problemas: Array<{ motivo: string }> } }
    expect(cuerpo.code).toBe('ATAJOS_INVALIDOS')
    // El motivo escrito, no un código: es lo que la pantalla muestra debajo de la fila.
    expect(cuerpo.data.problemas[0]?.motivo).toContain('F12')
  })

  it('rechaza pisar una tecla que ya usa otra acción de la misma pantalla', async () => {
    const { access } = await entrar('mecanico@configuracion.test')

    // F3 es Buscar, que es global: choca en todas las pantallas.
    const r = await guardarAtajos(access, { 'caja.facturar': 'F3' })

    expect(r.statusCode).toBe(422)
    const cuerpo = r.json() as { data: { problemas: Array<{ motivo: string }> } }
    expect(cuerpo.data.problemas[0]?.motivo).toContain('Buscar')
  })

  it('acepta la misma tecla en dos pantallas distintas', async () => {
    // Dos módulos pueden compartir una tecla porque nunca están en pantalla a la vez: es la
    // misma razón por la que F4 es el verbo de cada pantalla.
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'caja.cobrar': 'Alt+K', 'ordenes.fichar': 'Alt+K' })

    expect(r.statusCode).toBe(200)
  })

  it('pero no la deja compartir con una global', async () => {
    // Una acción de caja en F7 choca con Imprimir aunque el usuario nunca haya tocado
    // Imprimir: el choque que el índice único de la base no puede ver.
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'caja.cobrar': 'F7' })

    expect(r.statusCode).toBe(422)
    const cuerpo = r.json() as { data: { problemas: Array<{ motivo: string }> } }
    expect(cuerpo.data.problemas[0]?.motivo).toContain('Imprimir')
  })

  it('no deja reasignar una tecla estructural', async () => {
    const { access } = await entrar('mecanico@configuracion.test')

    const r = await guardarAtajos(access, { 'global.cancelar': 'F7' })

    expect(r.statusCode).toBe(422)
    const cuerpo = r.json() as { data: { problemas: Array<{ accion: string }> } }
    expect(cuerpo.data.problemas[0]?.accion).toBe('global.cancelar')
  })

  it('un objeto vacío restaura el mapa de fábrica', async () => {
    const { access } = await entrar('mecanico@configuracion.test')
    await guardarAtajos(access, { 'global.guardar': 'Ctrl+G' })

    const r = await guardarAtajos(access, {})

    expect(r.statusCode).toBe(200)
    const { atajos } = r.json() as { atajos: Record<string, string> }
    expect(atajos['global.guardar']).toBe('F2')
    expect(Object.keys(atajos)).toHaveLength(atajosParaSembrar().length)
  })

  it('cambiar el mapa de uno no toca el del otro', async () => {
    const mecanico = await entrar('mecanico@configuracion.test')
    await guardarAtajos(mecanico.access, { 'global.guardar': 'Ctrl+G' })

    const gerente = await entrar('gerente@configuracion.test')
    expect(gerente.atajos['global.guardar']).toBe('F2')
  })

  it('rechaza una acción que no existe en el catálogo', async () => {
    const { access } = await entrar('mecanico@configuracion.test')
    const r = await guardarAtajos(access, { 'caja.inventada': 'Alt+J' })
    expect(r.statusCode).toBe(422)
  })
})
