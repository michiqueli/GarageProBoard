import 'reflect-metadata'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Almacen, crearAlmacenEnMemoria } from '../src/comun/almacen.ts'
import { ALMACEN } from '../src/comun/simbolos.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Las imágenes de la hoja de recepción: subir, servir y volver atrás.
 *
 * El almacén va en memoria y no contra Garage: lo que se prueba acá es el flujo —qué se acepta,
 * qué queda escrito y en qué orden—, no el cliente de S3. El aislamiento del almacén tiene sus
 * propios tests en `almacen.test.ts`.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let mecanico: string
let almacen: Almacen & { claves(): string[] }

beforeAll(async () => {
  almacen = crearAlmacenEnMemoria()
  api = await levantarApi((m) => m.overrideProvider(ALMACEN).useValue(almacen))
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'hojas',
    email: 'gerente@hojas.test',
    otros: [{ email: 'mecanico@hojas.test', rol: 'Mecánico' }],
  })
  gerente = await entrar('gerente@hojas.test')
  mecanico = await entrar('mecanico@hojas.test')
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

/** Un PNG válido hasta el IHDR, que es lo único que se lee para medirlo. */
function png(ancho: number, alto: number): Buffer {
  const b = Buffer.alloc(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  b.writeUInt32BE(ancho, 16)
  b.writeUInt32BE(alto, 20)
  return b
}

function subir(access: string, tipo: string, vista: string, contenido: Buffer, nombre = 'a.png') {
  const borde = '----gpb'
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${borde}\r\nContent-Disposition: form-data; name="imagen"; filename="${nombre}"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    ),
    contenido,
    Buffer.from(`\r\n--${borde}--\r\n`),
  ])
  return app.inject({
    method: 'POST',
    url: `/api/hojas/${tipo}/${vista}`,
    headers: {
      authorization: `Bearer ${access}`,
      'content-type': `multipart/form-data; boundary=${borde}`,
    },
    payload: cuerpo,
  })
}

const pedir = (access: string, method: 'GET' | 'DELETE', url: string) =>
  app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${access}` } })

describe('la hoja de recepción', () => {
  it('arranca con las quince casillas vacías: el taller nuevo usa las del sistema', async () => {
    const r = await pedir(gerente, 'GET', '/hojas')
    expect(r.statusCode).toBe(200)
    const datos = r.json().datos as Array<{ tipo: string; vista: string; propia: unknown }>
    expect(datos).toHaveLength(15)
    expect(datos.every((d) => d.propia === null)).toBe(true)
  })

  it('sube el dibujo, lo mide del archivo y lo sirve', async () => {
    const r = await subir(gerente, 'sedan', 'frente', png(1200, 800))
    expect(r.statusCode).toBe(201)
    const imagen = r.json()
    expect(imagen).toMatchObject({
      tipo: 'sedan',
      vista: 'frente',
      formato: 'image/png',
      ancho: 1200,
      alto: 800,
    })

    // El objeto quedó bajo el prefijo de la concesionaria, no suelto.
    expect(almacen.claves().some((k) => /^t\/[0-9a-f-]+\/hojas\/sedan\/frente\//.test(k))).toBe(
      true,
    )

    const servida = await pedir(gerente, 'GET', `/hojas/imagenes/${imagen.id}`)
    expect(servida.statusCode).toBe(200)
    expect(servida.headers['content-type']).toMatch(/image\/png/)
    expect(servida.rawPayload.subarray(0, 8)).toEqual(png(1, 1).subarray(0, 8))

    const lista = (await pedir(gerente, 'GET', '/hojas')).json().datos
    const casilla = lista.find((d: { vista: string }) => d.vista === 'frente')
    expect(casilla.propia.id).toBe(imagen.id)
  })

  /**
   * El que importa de todos: lo que decide si es una imagen son los bytes, no el
   * `Content-Type` que mandó el navegador. Acá va un ejecutable diciendo ser un PNG.
   */
  it('un archivo que dice ser PNG y no lo es, no entra', async () => {
    const r = await subir(gerente, 'sedan', 'atras', Buffer.from('MZ\x90\x00 no soy una imagen'))
    expect(r.statusCode).toBe(422)
    expect(r.json().code).toBe('FORMATO_INVALIDO')
    expect(almacen.claves().some((k) => k.includes('/atras/'))).toBe(false)
  })

  it('un dibujo demasiado chico se rechaza diciendo entre qué medidas tiene que estar', async () => {
    const r = await subir(gerente, 'sedan', 'atras', png(120, 90))
    expect(r.statusCode).toBe(422)
    expect(r.json().code).toBe('MEDIDAS_INVALIDAS')
    expect(r.json().message).toMatch(/300/)
  })

  /** Hay órdenes firmadas que apuntan a la vieja: reemplazar no puede ser pisar. */
  it('subir de nuevo deja la anterior guardada, y quitar vuelve a la del sistema', async () => {
    const primera = (await subir(gerente, 'pickup', 'arriba', png(900, 600))).json()
    const segunda = (await subir(gerente, 'pickup', 'arriba', png(1000, 700))).json()
    expect(segunda.id).not.toBe(primera.id)

    // La vieja se sigue sirviendo igual: es la que mira una orden vieja.
    expect((await pedir(gerente, 'GET', `/hojas/imagenes/${primera.id}`)).statusCode).toBe(200)

    const lista = (await pedir(gerente, 'GET', '/hojas')).json().datos
    const casilla = lista.find(
      (d: { tipo: string; vista: string }) => d.tipo === 'pickup' && d.vista === 'arriba',
    )
    expect(casilla.propia.id).toBe(segunda.id)

    expect((await pedir(gerente, 'DELETE', '/hojas/pickup/arriba')).statusCode).toBe(200)
    const despues = (await pedir(gerente, 'GET', '/hojas')).json().datos
    expect(
      despues.find(
        (d: { tipo: string; vista: string }) => d.tipo === 'pickup' && d.vista === 'arriba',
      ).propia,
    ).toBeNull()
    // Y el archivo sigue estando: las órdenes que se recibieron con él lo muestran.
    expect((await pedir(gerente, 'GET', `/hojas/imagenes/${segunda.id}`)).statusCode).toBe(200)
  })

  /**
   * Cambiar la hoja es configurar el módulo, que es una acción aparte de trabajar en él: el
   * mecánico ve el dibujo todos los días y no puede reemplazarlo.
   */
  it('el mecánico ve las hojas pero no las cambia', async () => {
    expect((await pedir(mecanico, 'GET', '/hojas')).statusCode).toBe(200)
    expect((await subir(mecanico, 'hatchback', 'frente', png(900, 600))).statusCode).toBe(403)
    expect((await pedir(mecanico, 'DELETE', '/hojas/sedan/frente')).statusCode).toBe(403)
  })

  it('una imagen que no existe da 404 y no revienta', async () => {
    const r = await pedir(gerente, 'GET', '/hojas/imagenes/11111111-1111-4111-8111-111111111111')
    expect(r.statusCode).toBe(404)
  })
})
