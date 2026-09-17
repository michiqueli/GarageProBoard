import 'reflect-metadata'
import {
  ComprobanteRechazado,
  type Contribuyente,
  FacturacionNoDisponible,
  PadronNoDisponible,
  type SolicitudComprobante,
} from '@gpb/afip'
import { firmarComoAfip } from '@gpb/afip/pruebas'
import { eq } from '@gpb/db'
import { comprobante, entidadComercial, cliente as tablaCliente } from '@gpb/db/schema'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FISCAL } from '../src/comun/simbolos.ts'
import { PADRON } from '../src/padron/padron.service.ts'
import { type ApiDePrueba, CLAVE, levantarApi, sembrarConcesionaria } from './fixture.ts'

/**
 * Emitir facturas. AFIP y el padrón están simulados: lo que se prueba es qué letra sale, qué
 * número se usa, qué queda guardado en cada desenlace y que nunca haya dos en vuelo.
 */

let api: ApiDePrueba
let app: NestFastifyApplication
let gerente: string
let mecanico: string
let puntoVentaId: string
let tenantId: string

const afip = {
  ultimo: 0,
  autorizar: vi.fn(),
  consultar: vi.fn(),
}
const padron = new Map<string, Contribuyente | null | 'caido'>()

function contribuyente(
  cuit: string,
  condicion: number | null,
  extra: Partial<Contribuyente> = {},
): Contribuyente {
  return {
    cuit,
    razonSocial: `CONTRIBUYENTE ${cuit.slice(-4)}`,
    tipoPersona: 'juridica',
    tipoClave: 'CUIT',
    activo: true,
    condicionIva: { codigo: condicion, fuente: 'afip', motivo: '' },
    domicilio: {
      direccion: 'San Martín 100',
      localidad: 'Rafaela',
      codigoPostal: null,
      provinciaCodigo: 12,
    },
    origen: 'constancia',
    ...extra,
  }
}

// Como AFIP: lo que autoriza pasa a ser el último.
const autorizadoCon = (s: SolicitudComprobante) => {
  afip.ultimo = s.numero
  return {
    cae: `7${String(s.numero).padStart(13, '0')}`,
    vencimientoCae: '2026-09-30',
    numero: s.numero,
    observaciones: [],
    respuestaCruda: { ok: true },
  }
}

beforeAll(async () => {
  api = await levantarApi((m) =>
    m
      .overrideProvider(FISCAL)
      .useValue(() => ({
        puntosDeVenta: async () => [
          { numero: 5, tipoEmision: 'CAE', bloqueado: false, dadoDeBaja: false },
        ],
        ultimoAutorizado: async () => afip.ultimo,
        autorizar: (_: unknown, s: SolicitudComprobante) => afip.autorizar(s),
        consultarComprobante: (_: unknown, pv: number, tipo: number, numero: number) =>
          afip.consultar(pv, tipo, numero),
      }))
      .overrideProvider(PADRON)
      .useValue({
        consultar: async (cuit: string) => {
          const r = padron.get(cuit)
          if (r === 'caido') throw new PadronNoDisponible('caído')
          return r ?? null
        },
      }),
  )
  app = api.app
  const semilla = await sembrarConcesionaria(api.pg.dbDuenio, {
    slug: 'facturacion',
    email: 'gerente@facturacion.test',
    otros: [{ email: 'mecanico@facturacion.test', rol: 'Mecánico' }],
  })
  tenantId = semilla.tenant.id
  gerente = await entrar('gerente@facturacion.test')
  mecanico = await entrar('mecanico@facturacion.test')

  // Punto de venta y certificado, por el camino de verdad.
  const sucursalId = semilla.sucursales[0]?.id as string
  const alta = await pedir(gerente, 'POST', `/sucursales/${sucursalId}/puntos-venta`, {
    numero: 5,
    uso: 'facturacion',
    modo: 'CAE',
    predeterminado: true,
  })
  expect(alta.statusCode).toBe(201)
  const base = `/empresas/${semilla.empresa.id}/certificado-afip`
  const pedido = (await pedir(gerente, 'POST', `${base}/pedido`, { alias: 'gpb' })).json().pendiente
    .pedido
  await pedir(gerente, 'PUT', `${base}/pedido/certificado`, {
    certificado: await firmarComoAfip(pedido),
  })
  expect((await pedir(gerente, 'POST', `${base}/prueba`)).statusCode).toBe(200)

  const opciones = (await pedir(gerente, 'GET', '/facturacion/opciones')).json()
  puntoVentaId = opciones.puntosVenta[0].id
}, 180_000)

afterAll(async () => {
  await api?.cerrar()
})

beforeEach(() => {
  afip.ultimo = 0
  afip.autorizar.mockReset().mockImplementation(async (s: SolicitudComprobante) => autorizadoCon(s))
  afip.consultar.mockReset()
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

const renglon = (precio = '121', alicuota = 5) => ({
  descripcion: 'Service de 10.000 km',
  cantidad: '1',
  precioUnitario: precio,
  codigoAlicuota: alicuota,
})

function emitir(receptor: object, renglones = [renglon()]) {
  return pedir(gerente, 'POST', '/comprobantes', {
    puntoVentaId,
    receptor,
    concepto: 1,
    condicionVenta: 'Contado',
    renglones,
  })
}

describe('con qué se factura', () => {
  it('los puntos de venta de la sucursal, con el certificado vigente', async () => {
    const r = await pedir(gerente, 'GET', '/facturacion/opciones')
    expect(r.json().puntosVenta).toEqual([
      expect.objectContaining({ numero: 5, certificado: 'vigente', entorno: 'homologacion' }),
    ])
  })

  it('el mecánico no factura', async () => {
    expect((await pedir(mecanico, 'GET', '/facturacion/opciones')).statusCode).toBe(403)
  })
})

describe('qué comprobante corresponde', () => {
  it('consumidor final: Factura B, sin consultar el padrón', async () => {
    const r = await pedir(gerente, 'GET', `/facturacion/receptor?puntoVentaId=${puntoVentaId}`)
    expect(r.json()).toMatchObject({ letra: 'B', tipoDocReceptor: 99, condicionIva: 5, avisos: [] })
  })

  it('con CUIT de un Responsable Inscripto, según el padrón: Factura A con sus datos', async () => {
    padron.set('30711111111', contribuyente('30711111111', 1))
    const r = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&cuit=30711111111`,
    )
    expect(r.json()).toMatchObject({
      letra: 'A',
      tipoDocReceptor: 80,
      nombre: 'CONTRIBUYENTE 1111',
      domicilio: 'San Martín 100, Rafaela',
    })
  })

  it('a un monotributista también A (RG 5.003)', async () => {
    padron.set('20222222223', contribuyente('20222222223', 6))
    const r = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&cuit=20222222223`,
    )
    expect(r.json().letra).toBe('A')
  })

  it('un CUIT inactivo o inexistente no recibe factura con CUIT', async () => {
    padron.set('30733333339', contribuyente('30733333339', 1, { activo: false }))
    const inactivo = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&cuit=30733333339`,
    )
    expect(inactivo.json().code).toBe('CUIT_INACTIVO')
    const inexistente = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&cuit=30744444442`,
    )
    expect(inexistente.json().code).toBe('CUIT_INEXISTENTE')
  })

  it('sin padrón, un CUIT suelto no se factura; un cliente cargado sí, con su condición y un aviso', async () => {
    padron.set('30755555556', 'caido')
    const suelto = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&cuit=30755555556`,
    )
    expect(suelto.statusCode).toBe(503)

    const [e] = await api.pg.dbDuenio
      .insert(entidadComercial)
      .values({
        tenantId,
        tipoDocumento: 80,
        numeroDocumento: '30755555556',
        tipoPersona: 'juridica',
        razonSocial: 'Flota del Litoral SA',
        condicionIva: 1,
      })
      .returning()
    await api.pg.dbDuenio.insert(tablaCliente).values({ id: e?.id as string, tenantId })
    const cargado = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&clienteId=${e?.id}`,
    )
    expect(cargado.json()).toMatchObject({ letra: 'A', nombre: 'Flota del Litoral SA' })
    expect(cargado.json().avisos[0]).toMatch(/padrón de AFIP no contestó/)
  })

  it('la condición de AFIP le gana a la de la ficha, y lo avisa', async () => {
    const [e] = await api.pg.dbDuenio
      .insert(entidadComercial)
      .values({
        tenantId,
        tipoDocumento: 80,
        numeroDocumento: '30777777773',
        tipoPersona: 'juridica',
        razonSocial: 'Ficha vieja SRL',
        condicionIva: 5,
      })
      .returning()
    await api.pg.dbDuenio.insert(tablaCliente).values({ id: e?.id as string, tenantId })
    padron.set('30777777773', contribuyente('30777777773', 1))
    const r = await pedir(
      gerente,
      'GET',
      `/facturacion/receptor?puntoVentaId=${puntoVentaId}&clienteId=${e?.id}`,
    )
    expect(r.json().letra).toBe('A')
    expect(r.json().avisos.join(' ')).toMatch(/no es la de la ficha/)
  })
})

describe('emitir', () => {
  it('una B a consumidor final: número de AFIP, CAE, importes y renglones guardados', async () => {
    afip.ultimo = 41
    const r = await emitir({ consumidorFinal: { nombre: 'Juan', dni: '20123456' } }, [
      renglon('121'),
      { ...renglon('50'), cantidad: '2', bonificacionPorcentaje: '10' },
    ])
    expect(r.statusCode).toBe(201)
    const d = r.json()
    expect(d).toMatchObject({
      estado: 'autorizado',
      letra: 'B',
      numero: 42,
      puntoVenta: 5,
      tipoDocReceptor: 96,
      numeroDocReceptor: '20123456',
      receptorNombre: 'Juan',
      importeTotal: '211.00',
      cae: '70000000000042',
    })
    expect(d.renglones.map((x: { total: string }) => x.total)).toEqual(['121.00', '90.00'])

    const enviado = afip.autorizar.mock.calls[0]?.[0] as SolicitudComprobante
    expect(enviado).toMatchObject({
      numero: 42,
      tipoComprobante: 6,
      condicionIvaReceptor: 5,
      importeTotal: '211.00',
    })
  })

  it('una A a un Responsable Inscripto, con el IVA discriminado', async () => {
    padron.set('30711111111', contribuyente('30711111111', 1))
    const r = await emitir({ cuit: '30711111111' })
    expect(r.json()).toMatchObject({
      letra: 'A',
      tipoComprobante: 1,
      importeNeto: '100.00',
      importeIva: '21.00',
      importeTotal: '121.00',
      receptorCondicionIva: 1,
    })
  })

  it('rechazada: queda con los motivos y el número vuelve a estar libre', async () => {
    afip.ultimo = 7
    afip.autorizar.mockRejectedValueOnce(
      new ComprobanteRechazado([{ codigo: 10016, mensaje: 'Número incorrecto' }], [], {}),
    )
    const rechazo = await emitir({ consumidorFinal: {} })
    expect(rechazo.statusCode).toBe(422)
    expect(rechazo.json()).toMatchObject({
      code: 'RECHAZADO',
      data: { errores: [{ codigo: 10016, mensaje: 'Número incorrecto' }] },
    })
    const [guardado] = await api.pg.dbDuenio
      .select({ estado: comprobante.estado, numero: comprobante.numero })
      .from(comprobante)
      .where(eq(comprobante.id, rechazo.json().data.comprobanteId))
    expect(guardado).toEqual({ estado: 'rechazado', numero: 8 })

    const otra = await emitir({ consumidorFinal: {} })
    expect(otra.json()).toMatchObject({ estado: 'autorizado', numero: 8 })
  })

  it('AFIP no contesta: queda incierta, la serie se frena, y verificarla la destraba', async () => {
    afip.ultimo = 99
    afip.autorizar.mockRejectedValueOnce(new FacturacionNoDisponible(new Error('timeout')))
    const caida = await emitir({ consumidorFinal: {} })
    expect(caida.statusCode).toBe(503)
    const id = caida.json().data.comprobanteId

    const bloqueada = await emitir({ consumidorFinal: {} })
    expect(bloqueada.statusCode).toBe(409)
    expect(bloqueada.json()).toMatchObject({ code: 'SERIE_OCUPADA', data: { comprobanteId: id } })

    // AFIP sí la había emitido.
    afip.consultar.mockResolvedValueOnce({
      cae: '71234567890123',
      vencimientoCae: '2026-09-30',
      fecha: '2026-09-16',
      importeTotal: '121.00',
      tipoDocReceptor: 99,
      numeroDocReceptor: '0',
    })
    const verificada = await pedir(gerente, 'POST', `/comprobantes/${id}/verificar`)
    expect(verificada.json()).toMatchObject({
      estado: 'autorizado',
      numero: 100,
      cae: '71234567890123',
    })
    expect(afip.consultar).toHaveBeenCalledWith(5, 6, 100)

    afip.ultimo = 100
    expect((await emitir({ consumidorFinal: {} })).json()).toMatchObject({
      estado: 'autorizado',
      numero: 101,
    })
  })

  it('si AFIP no la tiene, verificar la da por no emitida', async () => {
    afip.ultimo = 200
    afip.autorizar.mockRejectedValueOnce(new FacturacionNoDisponible(new Error('timeout')))
    const id = (await emitir({ consumidorFinal: {} })).json().data.comprobanteId
    afip.consultar.mockResolvedValueOnce(null)
    const r = await pedir(gerente, 'POST', `/comprobantes/${id}/verificar`)
    expect(r.json()).toMatchObject({ estado: 'rechazado' })
  })

  it('el mecánico no emite', async () => {
    const r = await pedir(mecanico, 'POST', '/comprobantes', {
      puntoVentaId,
      receptor: { consumidorFinal: {} },
      concepto: 1,
      renglones: [renglon()],
    })
    expect(r.statusCode).toBe(403)
  })
})

describe('consultar e imprimir', () => {
  it('el listado, los últimos primero', async () => {
    const r = await pedir(gerente, 'GET', '/comprobantes?porPagina=5')
    expect(r.statusCode).toBe(200)
    expect(r.json().total).toBeGreaterThan(3)
    expect(r.json().datos[0]).toHaveProperty('letra')
  })

  it('el PDF de una autorizada; una rechazada no tiene PDF', async () => {
    afip.ultimo = 300
    const d = (await emitir({ consumidorFinal: {} })).json()
    const pdf = await pedir(gerente, 'GET', `/comprobantes/${d.id}/pdf`)
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/)
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')

    afip.autorizar.mockRejectedValueOnce(
      new ComprobanteRechazado([{ codigo: 1, mensaje: 'no' }], [], {}),
    )
    const rechazada = (await emitir({ consumidorFinal: {} })).json().data.comprobanteId
    const sinPdf = await pedir(gerente, 'GET', `/comprobantes/${rechazada}/pdf`)
    expect(sinPdf.statusCode).toBe(409)
  })
})
