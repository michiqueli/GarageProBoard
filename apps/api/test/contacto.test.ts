import 'reflect-metadata'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Mensaje } from '../src/comun/correo.ts'
import { CORREO } from '../src/comun/simbolos.ts'
import { type ApiDePrueba, levantarApi } from './fixture.ts'

/** El formulario de la landing: público, y por eso con trampa para robots y un tope. */

let api: ApiDePrueba
let app: NestFastifyApplication
const enviados: Mensaje[] = []

const DATOS = {
  nombre: 'Ana Paz',
  concesionaria: 'Autos del Sur',
  email: 'ana@autos.test',
  telefono: '342 555-1234',
  mensaje: 'Quiero verlo funcionando',
}
const pedir = (payload: object) =>
  app.inject({ method: 'POST', url: '/api/publico/contacto', payload })

beforeAll(async () => {
  api = await levantarApi((m) =>
    m.overrideProvider(CORREO).useValue({
      enviar: async (x: Mensaje) => {
        enviados.push(x)
      },
    }),
  )
  app = api.app
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

beforeEach(() => {
  enviados.length = 0
})

describe('el formulario de contacto', () => {
  it('llega por mail, y se le responde a quien escribió', async () => {
    const r = await pedir(DATOS)
    expect(r.statusCode, r.body).toBe(200)
    expect(enviados[0]).toMatchObject({
      responderA: 'ana@autos.test',
      asunto: 'Pedido de demo: Autos del Sur',
    })
    expect(enviados[0]?.texto).toContain('Quiero verlo funcionando')
  })

  it('un salto de línea no se mete en el asunto', async () => {
    await pedir({ ...DATOS, concesionaria: 'Autos\r\nBcc: otro@spam.test' })
    expect(enviados[0]?.asunto).toBe('Pedido de demo: Autos Bcc: otro@spam.test')
  })

  it('sin correo válido no entra', async () => {
    expect((await pedir({ ...DATOS, email: 'no' })).statusCode).toBe(400)
  })

  it('al robot le dice que salió bien, y no manda nada', async () => {
    const r = await pedir({ ...DATOS, sitio: 'http://spam.test' })
    expect(r.statusCode).toBe(200)
    expect(enviados).toHaveLength(0)
  })

  it('tiene tope por dirección', async () => {
    for (let i = 0; i < 5; i++) await pedir(DATOS)
    const r = await pedir(DATOS)
    expect(r.statusCode).toBe(429)
    expect(r.json().code).toBe('DEMASIADOS')
  })
})
