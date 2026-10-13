import 'reflect-metadata'
import { crc32, deflateSync } from 'node:zlib'
import { eq } from '@gpb/db'
import { vehiculo } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Almacen, crearAlmacenEnMemoria } from '../src/comun/almacen.ts'
import { ALMACEN } from '../src/comun/simbolos.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La firma del cliente en la pantalla: se firma la recepción con la orden abierta y la entrega
 * con la orden terminada, y volver a firmar no borra lo firmado. El almacén va en memoria, como
 * en los dibujos de la hoja.
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

function firmar(momento: string, aclaracion: string, contenido: Buffer, tipo = 'image/png') {
  const borde = '----gpb'
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${borde}\r\nContent-Disposition: form-data; name="aclaracion"\r\n\r\n${aclaracion}\r\n` +
        `--${borde}\r\nContent-Disposition: form-data; name="imagen"; filename="firma.png"\r\n` +
        `Content-Type: ${tipo}\r\n\r\n`,
    ),
    contenido,
    Buffer.from(`\r\n--${borde}--\r\n`),
  ])
  return app.inject({
    method: 'POST',
    url: `/api/ordenes/${ordenId}/firmas/${momento}`,
    headers: {
      authorization: `Bearer ${gerente}`,
      'content-type': `multipart/form-data; boundary=${borde}`,
    },
    payload: cuerpo,
  })
}

const pedir = (method: 'GET' | 'POST', url: string, payload?: object) =>
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
    slug: 'firmas',
    email: 'gerente@firmas.test',
    vehiculos: [{ chasis: '8AJFB8CD5N3334445', dominio: 'AB111CD' }],
  })
  const [auto] = await api.pg.dbDuenio
    .select()
    .from(vehiculo)
    .where(eq(vehiculo.tenantId, semilla.tenant.id))
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email: 'gerente@firmas.test', password: CLAVE, entrega: 'cuerpo' },
  })
  gerente = r.json().access
  const orden = await pedir('POST', '/ordenes', {
    vehiculoId: auto?.id,
    pedido: 'Service',
    items: [{ tipo: 'trabajo', descripcion: 'Service', cantidad: '1', precioUnitario: '50000' }],
  })
  expect(orden.statusCode, orden.body).toBe(201)
  ordenId = orden.json().id
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

describe('la firma en la pantalla', () => {
  it('la recepción se firma con la orden abierta, y queda en la orden', async () => {
    const r = await firmar('ingreso', 'Juan Pérez', png(600, 200))
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().ingreso).toMatchObject({ aclaracion: 'Juan Pérez' })
    expect(r.json().egreso).toBeNull()

    const orden = (await pedir('GET', `/ordenes/${ordenId}`)).json()
    expect(orden.firmas.ingreso.aclaracion).toBe('Juan Pérez')

    const imagen = await pedir('GET', `/ordenes/${ordenId}/firmas/ingreso`)
    expect(imagen.statusCode).toBe(200)
    expect(imagen.headers['content-type']).toMatch(/image\/png/)
  })

  it('la entrega no se firma antes de terminar la orden', async () => {
    const r = await firmar('egreso', 'Juan Pérez', png(600, 200))
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('ESTADO_INVALIDO_FIRMA')
  })

  it('terminada, se firma la entrega; firmar de nuevo reemplaza y conserva la anterior', async () => {
    const terminada = await pedir('POST', `/ordenes/${ordenId}/terminar`)
    expect(terminada.statusCode, terminada.body).toBe(200)

    expect((await firmar('egreso', 'Juan Pérez', png(600, 200))).statusCode).toBe(201)
    const otra = await firmar('egreso', 'María Pérez', png(640, 220))
    expect(otra.json().egreso.aclaracion).toBe('María Pérez')

    const egresos = almacen.claves().filter((c) => c.includes(`firmas/${ordenId}/egreso-`))
    expect(egresos).toHaveLength(2)
  })

  it('sólo un PNG, y con aclaración', async () => {
    expect((await firmar('ingreso', 'Juan', Buffer.from('no es una imagen'))).statusCode).toBe(422)
    expect((await firmar('ingreso', '', png(600, 200))).statusCode).toBe(400)
  })
})

/** Un PNG entero, que pdfkit pueda leer: blanco, del tamaño pedido. */
function pngDeVerdad(ancho: number, alto: number): Buffer {
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4)
    largo.writeUInt32BE(datos.length)
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(cuerpo))
    return Buffer.concat([largo, cuerpo, crc])
  }
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(ancho, 0)
  cabecera.writeUInt32BE(alto, 4)
  cabecera.set([8, 0, 0, 0, 0], 8) // 8 bits, escala de grises
  const filas = Buffer.alloc((ancho + 1) * alto, 0xff)
  for (let f = 0; f < alto; f++) filas[f * (ancho + 1)] = 0 // sin filtro
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

const imagenesEn = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length

describe('la orden impresa', () => {
  it('una firma que no se puede leer no impide imprimirla', async () => {
    // La de arriba es sólo una cabecera de PNG: se guardó, pero no se puede dibujar.
    const r = await pedir('GET', `/ordenes/${ordenId}/pdf`)
    expect(r.statusCode, r.body).toBe(200)
  })

  it('firmada en la pantalla al recibir el auto, la copia del cliente sale con la firma', async () => {
    const antes = imagenesEn((await pedir('GET', `/ordenes/${ordenId}/pdf`)).rawPayload)
    expect((await firmar('ingreso', 'Juan Pérez', pngDeVerdad(600, 200))).statusCode).toBe(201)
    const despues = imagenesEn((await pedir('GET', `/ordenes/${ordenId}/pdf`)).rawPayload)
    expect(despues).toBe(antes + 1)
  })
})
