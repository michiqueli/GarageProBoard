import 'reflect-metadata'
import { MAXIMO_FOTOS } from '@gpb/core'
import { eq } from '@gpb/db'
import { orden, vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Almacen, crearAlmacenEnMemoria } from '../src/comun/almacen.ts'
import { ALMACEN } from '../src/comun/simbolos.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Las fotos del vehículo: las de entrada con la orden abierta, las de salida con la orden
 * terminada, y darlas de baja no borra nada. El almacén va en memoria, como en la firma.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let ordenId: string
let almacen: Almacen & { claves(): string[] }

/** La cabecera de un PNG con sus medidas: es lo único que se mira. */
function png(ancho: number, alto: number): Buffer {
  const b = Buffer.alloc(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  b.writeUInt32BE(ancho, 16)
  b.writeUInt32BE(alto, 20)
  return b
}

function subir(momento: string, contenido: Buffer, nota = '') {
  const borde = '----gpb'
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${borde}\r\nContent-Disposition: form-data; name="momento"\r\n\r\n${momento}\r\n` +
        (nota
          ? `--${borde}\r\nContent-Disposition: form-data; name="nota"\r\n\r\n${nota}\r\n`
          : '') +
        `--${borde}\r\nContent-Disposition: form-data; name="imagen"; filename="foto.png"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    ),
    contenido,
    Buffer.from(`\r\n--${borde}--\r\n`),
  ])
  return app.inject({
    method: 'POST',
    url: `/api/ordenes/${ordenId}/fotos`,
    headers: {
      authorization: `Bearer ${gerente}`,
      'content-type': `multipart/form-data; boundary=${borde}`,
    },
    payload: cuerpo,
  })
}

const pedir = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${gerente}` },
    ...(payload ? { payload } : {}),
  })

beforeAll(async () => {
  almacen = crearAlmacenEnMemoria()
  api = await levantarApi((m) => m.overrideProvider(ALMACEN).useValue(almacen))
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'fotos',
    email: 'gerente@fotos.test',
    vehiculos: [{ chasis: '8AJFB8CD5N5556667', dominio: 'AC222DE' }],
  })
  const [auto] = await api.pg.dbDuenio
    .select()
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email: 'gerente@fotos.test', password: CLAVE, entrega: 'cuerpo' },
  })
  gerente = r.json().access
  const abierta = await pedir('POST', '/ordenes', {
    vehiculoId: auto?.id,
    pedido: 'Service',
    items: [{ tipo: 'trabajo', descripcion: 'Service', cantidad: '1', precioUnitario: '50000' }],
  })
  expect(abierta.statusCode, abierta.body).toBe(201)
  ordenId = abierta.json().id
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('las fotos del vehículo', () => {
  it('las de entrada se suben con la orden abierta, y quedan en la orden con quién las sacó', async () => {
    const r = await subir('ingreso', png(1600, 1200), 'Rayón en la puerta trasera')
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json()).toMatchObject({
      momento: 'ingreso',
      nota: 'Rayón en la puerta trasera',
      sacadaPor: 'Prueba Gerente',
    })

    const o = (await pedir('GET', `/ordenes/${ordenId}`)).json()
    expect(o.fotos).toHaveLength(1)
    const imagen = await pedir('GET', `/ordenes/${ordenId}/fotos/${o.fotos[0].id}`)
    expect(imagen.statusCode).toBe(200)
    expect(imagen.headers['content-type']).toMatch(/image\/png/)
  })

  it('las de salida, recién con la orden terminada', async () => {
    const r = await subir('egreso', png(1600, 1200))
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('ESTADO_INVALIDO_FOTO')
  })

  it('sólo JPEG o PNG', async () => {
    const r = await subir('ingreso', Buffer.from('no es una imagen'))
    expect(r.statusCode).toBe(422)
  })

  it(`hasta ${MAXIMO_FOTOS} por momento: dar de baja una hace lugar`, async () => {
    for (let i = 1; i < MAXIMO_FOTOS; i++) {
      expect((await subir('ingreso', png(800, 600))).statusCode).toBe(201)
    }
    const demas = await subir('ingreso', png(800, 600))
    expect(demas.statusCode).toBe(409)
    expect(demas.json().code).toBe('DEMASIADAS_FOTOS')

    const [primera] = (await pedir('GET', `/ordenes/${ordenId}`)).json().fotos
    expect((await pedir('DELETE', `/ordenes/${ordenId}/fotos/${primera.id}`)).statusCode).toBe(200)
    // Dada de baja no se ve, pero el archivo sigue: la auditoría tiene que poder mostrarla.
    expect((await pedir('GET', `/ordenes/${ordenId}/fotos/${primera.id}`)).statusCode).toBe(404)
    expect(almacen.claves().filter((c) => c.includes(`fotos/${ordenId}/`))).toHaveLength(
      MAXIMO_FOTOS,
    )
    expect((await subir('ingreso', png(800, 600))).statusCode).toBe(201)
  })

  it('terminada se suben las de salida; entregada, ya no se tocan', async () => {
    expect((await pedir('POST', `/ordenes/${ordenId}/terminar`)).statusCode).toBe(200)
    expect((await subir('egreso', png(1600, 1200))).statusCode).toBe(201)

    await api.pg.dbDuenio.update(orden).set({ estado: 'entregada' }).where(eq(orden.id, ordenId))
    const [una] = (await pedir('GET', `/ordenes/${ordenId}`)).json().fotos
    const r = await pedir('DELETE', `/ordenes/${ordenId}/fotos/${una.id}`)
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('ESTADO_INVALIDO_FOTO')
  })
})
