import 'reflect-metadata'
import { generarPedido, type PuntoVentaAfip } from '@gpb/afip'
import { firmarComoAfip } from '@gpb/afip/pruebas'
import { eq } from '@gpb/db'
import { auditoria, certificadoAfip } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CajaFuerte } from '../src/comun/secretos.ts'
import { FISCAL } from '../src/comun/simbolos.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * El certificado de AFIP de cada razón social: pedido, certificado, prueba y renovación.
 * AFIP está simulada: lo que se prueba es qué se guarda, qué se rechaza y cuándo cambia el
 * certificado con el que se factura.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let administrativo: string
let empresaId: string
let sucursalId: string
let cuit: string

let respuestaAfip: () => Promise<PuntoVentaAfip[]> = async () => []
let ultimaCredencial: { cuit: string; certificadoPem: string } | undefined
let ultimoEntorno: string | undefined

const pv = (numero: number, extra: Partial<PuntoVentaAfip> = {}): PuntoVentaAfip => ({
  numero,
  tipoEmision: 'CAE - RECE',
  bloqueado: false,
  dadoDeBaja: false,
  ...extra,
})

beforeAll(async () => {
  api = await levantarApi((m) =>
    m.overrideProvider(FISCAL).useValue((entorno: string) => ({
      puntosDeVenta: (cred: { cuit: string; certificadoPem: string }) => {
        ultimaCredencial = cred
        ultimoEntorno = entorno
        return respuestaAfip()
      },
    })),
  )
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'certificados',
    email: 'gerente@certificados.test',
    otros: [{ email: 'administrativo@certificados.test', rol: 'Administrativo' }],
  })
  empresaId = semilla.empresa.id
  cuit = semilla.empresa.cuit
  sucursalId = semilla.sucursales[0]?.id as string
  gerente = await entrar('gerente@certificados.test')
  administrativo = await entrar('administrativo@certificados.test')
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

const base = () => `/empresas/${empresaId}/certificado-afip`

describe('el certificado de una razón social', () => {
  it('sin nada cargado', async () => {
    const r = await pedir(gerente, 'GET', base())
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      empresa: { id: empresaId, cuit },
      activo: null,
      pendiente: null,
    })
  })

  it('configurarlo pide permiso de configurar comprobantes', async () => {
    expect((await pedir(administrativo, 'GET', base())).statusCode).toBe(403)
    expect(
      (await pedir(administrativo, 'POST', `${base()}/pedido`, { alias: 'gpb' })).statusCode,
    ).toBe(403)
  })

  it('el alias no lleva espacios', async () => {
    const r = await pedir(gerente, 'POST', `${base()}/pedido`, { alias: 'mi taller' })
    expect(r.statusCode).toBe(400)
  })

  it('el pedido se descarga; la clave queda cifrada y atada a la empresa', async () => {
    const r = await pedir(gerente, 'POST', `${base()}/pedido`, { alias: 'gpb-taller' })
    expect(r.statusCode).toBe(201)
    const estado = r.json()
    expect(estado.pendiente).toMatchObject({ alias: 'gpb-taller', conCertificado: false })
    expect(estado.pendiente.pedido).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----/)
    expect(JSON.stringify(estado)).not.toContain('PRIVATE KEY')

    const [fila] = await api.pg.dbDuenio
      .select()
      .from(certificadoAfip)
      .where(eq(certificadoAfip.id, estado.pendiente.id))
    const guardada = fila?.clavePrivadaCifrada as string
    expect(guardada).toMatch(/^v1\./)
    expect(guardada).not.toContain('PRIVATE KEY')

    const caja = new CajaFuerte(process.env.SECRETOS_MASTER_KEY)
    expect(caja.descifrar(guardada, `certificado_afip:${empresaId}`)).toMatch(/PRIVATE KEY/)
    // Copiada a otra empresa, no sirve.
    expect(() => caja.descifrar(guardada, 'certificado_afip:otra')).toThrow()
  })

  it('un pedido nuevo descarta el anterior', async () => {
    const antes = (await pedir(gerente, 'GET', base())).json().pendiente.id
    const r = await pedir(gerente, 'POST', `${base()}/pedido`, { alias: 'gpb-taller2' })
    expect(r.json().pendiente.id).not.toBe(antes)
    const [viejo] = await api.pg.dbDuenio
      .select({ estado: certificadoAfip.estado })
      .from(certificadoAfip)
      .where(eq(certificadoAfip.id, antes))
    expect(viejo?.estado).toBe('descartado')
  })

  it('sin certificado cargado no hay nada que probar', async () => {
    const r = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('NADA_PARA_PROBAR')
  })

  it('rechaza el certificado de otro pedido y lo que no es un certificado', async () => {
    const otro = await generarPedido({ cuit, razonSocial: 'X', alias: 'otro' })
    const r = await pedir(gerente, 'PUT', `${base()}/pedido/certificado`, {
      certificado: await firmarComoAfip(otro.pedidoPem),
    })
    expect(r.statusCode).toBe(422)
    expect(r.json()).toMatchObject({
      code: 'CERTIFICADO_RECHAZADO',
      data: { motivo: 'NO_CORRESPONDE_AL_PEDIDO' },
    })

    const texto = await pedir(gerente, 'PUT', `${base()}/pedido/certificado`, {
      certificado: 'no es un certificado',
    })
    expect(texto.json().data.motivo).toBe('ILEGIBLE')
  })

  it('carga el que corresponde, pero no lo usa hasta probarlo', async () => {
    const { pedido } = (await pedir(gerente, 'GET', base())).json().pendiente
    const r = await pedir(gerente, 'PUT', `${base()}/pedido/certificado`, {
      certificado: await firmarComoAfip(pedido),
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      activo: null,
      pendiente: { conCertificado: true, entorno: 'homologacion' },
    })
  })

  it('si AFIP no lo acepta, sigue pendiente y se sabe por qué', async () => {
    respuestaAfip = () =>
      Promise.reject(
        Object.assign(new Error('no disponible'), {
          cause: new Error('Computador no autorizado a acceder al servicio'),
        }),
      )
    const r = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(r.statusCode).toBe(502)
    expect(r.json()).toMatchObject({
      code: 'AFIP_NO_ACEPTA',
      data: { detalle: 'Computador no autorizado a acceder al servicio' },
    })
    const estado = (await pedir(gerente, 'GET', base())).json()
    expect(estado.activo).toBeNull()
    expect(estado.pendiente.conCertificado).toBe(true)
  })

  it('si AFIP lo acepta, queda activo y compara los puntos de venta', async () => {
    for (const numero of [3, 4]) {
      const alta = await pedir(gerente, 'POST', `/sucursales/${sucursalId}/puntos-venta`, {
        numero,
        uso: 'facturacion',
        modo: 'CAE',
        predeterminado: false,
      })
      expect(alta.statusCode).toBe(201)
    }
    respuestaAfip = async () => [pv(8), pv(3), pv(4, { bloqueado: true })]

    const r = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(r.statusCode).toBe(200)
    const cuerpo = r.json()
    expect(ultimoEntorno).toBe('homologacion')
    expect(ultimaCredencial?.cuit).toBe(cuit)
    expect(cuerpo.estado.pendiente).toBeNull()
    expect(cuerpo.estado.activo).toMatchObject({ alias: 'gpb-taller2', entorno: 'homologacion' })
    expect(
      cuerpo.puntosDeVenta.map((p: { numero: number; cargado: boolean }) => [p.numero, p.cargado]),
    ).toEqual([
      [3, true],
      [4, true],
      [8, false],
    ])
    // El 4 está cargado, pero AFIP lo tiene bloqueado.
    expect(cuerpo.faltanEnAfip).toEqual([4])
  })

  it('renovar no corta la facturación: el viejo sigue hasta que el nuevo pasa la prueba', async () => {
    const viejo = (await pedir(gerente, 'GET', base())).json().activo

    const { pedido } = (
      await pedir(gerente, 'POST', `${base()}/pedido`, { alias: 'gpb-renovado' })
    ).json().pendiente
    const certificado = await firmarComoAfip(pedido, { entorno: 'produccion' })
    const cargado = await pedir(gerente, 'PUT', `${base()}/pedido/certificado`, { certificado })
    expect(cargado.json().activo.id).toBe(viejo.id)

    respuestaAfip = async () => [pv(3)]
    const probado = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(probado.statusCode).toBe(200)
    expect(ultimaCredencial?.certificadoPem).toBe(certificado.trim())
    expect(ultimoEntorno).toBe('produccion')
    expect(probado.json().estado.activo).toMatchObject({
      alias: 'gpb-renovado',
      entorno: 'produccion',
    })

    const [anterior] = await api.pg.dbDuenio
      .select({ estado: certificadoAfip.estado })
      .from(certificadoAfip)
      .where(eq(certificadoAfip.id, viejo.id))
    expect(anterior?.estado).toBe('reemplazado')
  })

  it('sin pedido, la prueba es sobre el activo y no cambia nada', async () => {
    const activo = (await pedir(gerente, 'GET', base())).json().activo
    const r = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(r.statusCode).toBe(200)
    expect(r.json().estado.activo.id).toBe(activo.id)
  })

  it('la auditoría cuenta cada paso y nunca guarda la clave ni el certificado', async () => {
    const filas = await api.pg.dbDuenio
      .select()
      .from(auditoria)
      .where(eq(auditoria.tabla, 'certificado_afip'))
    expect(filas.length).toBeGreaterThanOrEqual(6)
    expect(JSON.stringify(filas)).not.toMatch(/PRIVATE KEY|BEGIN CERTIFICATE/)

    const r = await pedir(gerente, 'GET', '/auditoria/cambios?porPagina=200')
    expect(r.statusCode).toBe(200)
    const texto = JSON.stringify(r.json())
    expect(texto).toContain('el certificado de AFIP de certificados SAS')
    expect(texto).toContain('Generó el pedido de certificado para el computador «gpb-renovado»')
    expect(texto).toContain('Lo probó contra AFIP y quedó activo')
  })

  it('un certificado de otro sistema se importa con su clave, y queda pendiente de prueba', async () => {
    const activo = (await pedir(gerente, 'GET', base())).json().activo
    const existente = await generarPedido({ cuit, razonSocial: 'X', alias: 'ecoparrilla' })
    const certificado = await firmarComoAfip(existente.pedidoPem, { entorno: 'produccion' })

    const sinClave = await pedir(gerente, 'PUT', `${base()}/importado`, {
      certificado,
      clavePrivada: 'esto no es una clave',
    })
    expect(sinClave.json().code).toBe('CLAVE_ILEGIBLE')

    const otraClave = await generarPedido({ cuit, razonSocial: 'X', alias: 'otra' })
    const cruzado = await pedir(gerente, 'PUT', `${base()}/importado`, {
      certificado,
      clavePrivada: otraClave.clavePrivadaPem,
    })
    expect(cruzado.json()).toMatchObject({ data: { motivo: 'NO_CORRESPONDE_AL_PEDIDO' } })

    const r = await pedir(gerente, 'PUT', `${base()}/importado`, {
      certificado,
      clavePrivada: existente.clavePrivadaPem,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      activo: { id: activo.id },
      pendiente: { alias: 'ecoparrilla', conCertificado: true, entorno: 'produccion', pedido: '' },
    })

    respuestaAfip = async () => [pv(3)]
    const probado = await pedir(gerente, 'POST', `${base()}/prueba`)
    expect(probado.json().estado.activo).toMatchObject({ alias: 'ecoparrilla' })
    expect(ultimaCredencial?.certificadoPem).toBe(certificado.trim())
  })

  it('una empresa que no es de la concesionaria no existe', async () => {
    const r = await pedir(
      gerente,
      'GET',
      '/empresas/00000000-0000-4000-8000-000000000000/certificado-afip',
    )
    expect(r.statusCode).toBe(404)
  })
})
