import { ORPCError } from '@orpc/client'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { errorNotificado, montarApp, SESION, textoDelError } from './montar.tsx'

const certificados = {
  estado: vi.fn(),
  pedir: vi.fn(),
  cargar: vi.fn(),
  probar: vi.fn(),
  importar: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    certificados: Object.fromEntries(
      ['estado', 'pedir', 'cargar', 'probar', 'importar'].map((nombre) => [
        nombre,
        (x: unknown) => (certificados as Record<string, (x: unknown) => unknown>)[nombre]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const EMPRESA = {
  id: '11111111-1111-4111-8111-111111111111',
  razonSocial: 'Automotores Litoral SAS',
  cuit: '30712345671',
  condicionIva: 1,
}
const RUTA = `/empresas/${EMPRESA.id}/certificado-afip`
const PEDIDO = '-----BEGIN CERTIFICATE REQUEST-----\nabc\n-----END CERTIFICATE REQUEST-----'

const pendiente = (extra: object = {}) => ({
  id: 'c1',
  alias: 'garageproboard',
  entorno: null,
  vigenteDesde: null,
  vigenteHasta: null,
  creadoEn: '2026-09-16T12:00:00.000Z',
  pedido: PEDIDO,
  conCertificado: false,
  ...extra,
})

const activo = (extra: object = {}) => ({
  id: 'c0',
  alias: 'gpb-viejo',
  entorno: 'produccion',
  vigenteDesde: '2026-01-01T00:00:00.000Z',
  vigenteHasta: '2028-02-24T00:00:00.000Z',
  creadoEn: '2026-01-01T00:00:00.000Z',
  ...extra,
})

beforeEach(() => {
  for (const f of [...Object.values(certificados), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  // La descarga del pedido: jsdom no navega.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(cleanup)

describe('el asistente del certificado de AFIP', () => {
  it('sin certificado: dice que no factura y empieza por el pedido', async () => {
    certificados.estado.mockResolvedValue({ empresa: EMPRESA, activo: null, pendiente: null })
    certificados.pedir.mockResolvedValue({ empresa: EMPRESA, activo: null, pendiente: pendiente() })
    await montarApp(RUTA)

    expect(await screen.findByText(/Todavía no factura: falta el certificado/)).toBeDefined()
    const paso1 = screen.getByRole('listitem', { name: 'Paso 1: Crear el pedido de certificado' })
    expect(paso1.getAttribute('aria-current')).toBe('step')

    await userEvent.click(
      within(paso1).getByRole('button', { name: 'Generar y descargar el pedido' }),
    )
    expect(certificados.pedir).toHaveBeenCalledWith({
      empresaId: EMPRESA.id,
      alias: 'garageproboard',
    })
    // Descargó el pedido, y ahora el paso actual es subir el certificado.
    expect(URL.createObjectURL).toHaveBeenCalled()
    const paso3 = await screen.findByRole('listitem', { name: 'Paso 3: Subir el certificado' })
    expect(paso3.getAttribute('aria-current')).toBe('step')
  })

  it('el certificado de otro sistema se carga con su clave, sin pasar por ARCA', async () => {
    certificados.estado.mockResolvedValue({ empresa: EMPRESA, activo: null, pendiente: null })
    certificados.importar.mockResolvedValue({
      empresa: EMPRESA,
      activo: null,
      pendiente: pendiente({
        pedido: '',
        alias: 'ecoparrilla',
        conCertificado: true,
        entorno: 'produccion',
        vigenteHasta: '2028-02-24T00:00:00.000Z',
      }),
    })
    await montarApp(RUTA)

    await userEvent.click(
      await screen.findByRole('button', {
        name: '¿Ya tenés el certificado y la clave de otro sistema?',
      }),
    )
    await userEvent.upload(
      screen.getByLabelText('Certificado (.crt)'),
      new File(['CERT'], 'cert.crt'),
    )
    await userEvent.upload(
      screen.getByLabelText('Clave privada (.key)'),
      new File(['KEY'], 'clave.key'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cargar el certificado' }))

    expect(certificados.importar).toHaveBeenCalledWith({
      empresaId: EMPRESA.id,
      certificado: 'CERT',
      clavePrivada: 'KEY',
    })
    expect(await screen.findByText(/traído de otro sistema/)).toBeDefined()
    // Lo que sigue es probarlo.
    const paso6 = screen.getByRole('listitem', { name: 'Paso 6: Probar contra AFIP' })
    expect(paso6.getAttribute('aria-current')).toBe('step')
  })

  it('un certificado que no corresponde dice qué hacer', async () => {
    certificados.estado.mockResolvedValue({
      empresa: EMPRESA,
      activo: null,
      pendiente: pendiente(),
    })
    certificados.cargar.mockRejectedValue(
      new ORPCError('CERTIFICADO_RECHAZADO', {
        status: 422,
        data: { motivo: 'OTRO_CUIT' },
      }),
    )
    await montarApp(RUTA)

    const paso3 = await screen.findByRole('listitem', { name: 'Paso 3: Subir el certificado' })
    const archivo = new File(['-----BEGIN CERTIFICATE-----'], 'cert.crt')
    await userEvent.upload(within(paso3).getByLabelText('El archivo .crt que te dio ARCA'), archivo)

    expect(await textoDelError()).toBe(
      'Ese certificado es de otro CUIT. Entrá a ARCA con la clave fiscal de Automotores Litoral SAS (30-71234567-1).',
    )
    expect(certificados.cargar).toHaveBeenCalledWith({
      empresaId: EMPRESA.id,
      certificado: '-----BEGIN CERTIFICATE-----',
    })
  })

  it('si AFIP no lo acepta, apunta al error más común', async () => {
    certificados.estado.mockResolvedValue({
      empresa: EMPRESA,
      activo: null,
      pendiente: pendiente({
        conCertificado: true,
        entorno: 'produccion',
        vigenteHasta: '2028-09-16T00:00:00.000Z',
      }),
    })
    certificados.probar.mockRejectedValue(
      new ORPCError('AFIP_NO_ACEPTA', {
        status: 502,
        data: { detalle: 'Computador no autorizado' },
      }),
    )
    await montarApp(RUTA)

    const paso6 = await screen.findByRole('listitem', { name: 'Paso 6: Probar contra AFIP' })
    await userEvent.click(within(paso6).getByRole('button', { name: 'Probar contra AFIP' }))
    const alerta = await errorNotificado()
    expect(alerta.textContent).toContain('Casi siempre es el paso 4')
    expect(alerta.textContent).toContain('AFIP dijo: Computador no autorizado')
  })

  it('si AFIP lo acepta, avisa los puntos de venta que AFIP no tiene habilitados', async () => {
    const conCertificado = pendiente({
      conCertificado: true,
      entorno: 'produccion',
      vigenteHasta: '2028-09-16T00:00:00.000Z',
    })
    certificados.estado.mockResolvedValue({
      empresa: EMPRESA,
      activo: null,
      pendiente: conCertificado,
    })
    certificados.probar.mockResolvedValue({
      estado: {
        empresa: EMPRESA,
        activo: activo({ id: 'c1', alias: 'garageproboard' }),
        pendiente: null,
      },
      puntosDeVenta: [
        { numero: 3, tipoEmision: 'CAE', bloqueado: false, dadoDeBaja: false, cargado: true },
        { numero: 8, tipoEmision: 'CAE', bloqueado: false, dadoDeBaja: false, cargado: false },
      ],
      faltanEnAfip: [4],
    })
    await montarApp(RUTA)

    await userEvent.click(await screen.findByRole('button', { name: 'Probar contra AFIP' }))
    const resultado = await screen.findByRole('region', { name: 'Resultado de la prueba' })
    expect(
      await screen.findByRole('listitem', {
        name: 'Listo: AFIP aceptó el certificado: ya se puede facturar con él',
      }),
    ).toBeDefined()
    expect(within(resultado).getByRole('alert').textContent).toContain(
      'El punto de venta 0004 está cargado acá pero AFIP no lo tiene habilitado',
    )
    // Quedó activo y el asistente se cierra.
    expect(screen.getByText('Activo')).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Pasos' })).toBeNull()
  })

  it('con uno activo que vence pronto, lo dice y ofrece renovar', async () => {
    const enDiezDias = new Date(Date.now() + 10.5 * 86_400_000).toISOString()
    certificados.estado.mockResolvedValue({
      empresa: EMPRESA,
      activo: activo({ vigenteHasta: enDiezDias }),
      pendiente: null,
    })
    await montarApp(RUTA)

    expect(await screen.findByText(/Faltan 10 días: renovalo ahora/)).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Pasos' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Renovar' }))
    expect(screen.getByRole('list', { name: 'Pasos' })).toBeDefined()
  })

  it('uno vencido se marca lleno: hay que hacer algo', async () => {
    certificados.estado.mockResolvedValue({
      empresa: EMPRESA,
      activo: activo({ vigenteHasta: '2020-01-01T00:00:00.000Z' }),
      pendiente: null,
    })
    await montarApp(RUTA)
    expect(await screen.findByText('Vencido')).toBeDefined()
    expect(screen.getByText('No se puede facturar hasta renovarlo')).toBeDefined()
  })
})
