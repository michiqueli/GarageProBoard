import { type Contribuyente, PadronNoDisponible, type ServicioPadron } from '@gpb/afip'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PADRON } from '../src/padron/padron.service.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * La consulta al padrón, con AFIP reemplazada: lo que se prueba es cómo la API traduce lo
 * que contesta, no AFIP. El adaptador real se probó contra AFIP y sus reglas tienen sus
 * propios tests en `packages/afip`.
 */

const SOCIEDAD: Contribuyente = {
  cuit: '30712345671',
  razonSocial: 'AUTOMOTORES LITORAL SAS',
  tipoPersona: 'juridica',
  tipoClave: 'CUIT',
  activo: true,
  condicionIva: {
    codigo: 1,
    fuente: 'afip',
    motivo: 'AFIP lo informa como Responsable Inscripto.',
  },
  domicilio: {
    direccion: 'BV PELLEGRINI 2500',
    localidad: 'SANTA FE',
    codigoPostal: '3000',
    provinciaCodigo: 12,
  },
  origen: 'constancia',
}

const consultar = vi.fn<ServicioPadron['consultar']>(async (cuit) => {
  if (cuit === SOCIEDAD.cuit) return SOCIEDAD
  if (cuit === '30719876540') throw new PadronNoDisponible(new Error('connect ETIMEDOUT'))
  return null
})

let api: ApiDePrueba
let app: NestFastifyApplication
let access: string

beforeAll(async () => {
  api = await levantarApi((m) => m.overrideProvider(PADRON).useValue({ consultar }))
  app = api.app
  await sembrarConcesionaria(api.pg.dbDuenio, { slug: 'padron', email: 'gerente@padron.test' })
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/iniciar',
    payload: { email: 'gerente@padron.test', password: CLAVE, entrega: 'cuerpo' },
  })
  access = r.json().access
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

const pedir = (cuit: string) =>
  app.inject({
    method: 'GET',
    url: `/api/padron/${cuit}`,
    headers: { authorization: `Bearer ${access}` },
  })

describe('el padrón', () => {
  it('devuelve lo que dice AFIP', async () => {
    const r = await pedir('30712345671')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual(SOCIEDAD)
  })

  it('recuerda la respuesta: el mismo CUIT no se le pregunta dos veces a AFIP', async () => {
    consultar.mockClear()
    await pedir('30712345671')
    await pedir('30712345671')
    expect(consultar).not.toHaveBeenCalled()
  })

  it('un CUIT que AFIP no conoce es un 404 que lo dice', async () => {
    const r = await pedir('20999999973')
    expect(r.statusCode).toBe(404)
    expect(r.json().code).toBe('CUIT_INEXISTENTE')
  })

  it('con AFIP caída contesta que se puede cargar a mano, y no lo recuerda', async () => {
    const r = await pedir('30719876540')
    expect(r.statusCode).toBe(503)
    expect(r.json().message).toMatch(/cargá los datos a mano/)

    consultar.mockClear()
    await pedir('30719876540')
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('un CUIT con el dígito mal ni siquiera llega a AFIP', async () => {
    consultar.mockClear()
    const r = await pedir('30712345679')
    expect(r.statusCode).toBe(400)
    expect(consultar).not.toHaveBeenCalled()
  })

  it('sin sesión no se consulta', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/padron/30712345671' })
    expect(r.statusCode).toBe(401)
  })
})
