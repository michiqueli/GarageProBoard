import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarEnIndice, entradasDeCertificados, indiceEstatico } from '../src/indice.ts'
import { usarSesion } from '../src/sesion/almacen.ts'
import { autorizacionActual } from '../src/sesion/permisos.ts'
import { montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const listarEmpresas = vi.fn()
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    vehiculos: { listar: vi.fn().mockResolvedValue({ datos: [], total: 0 }) },
    ordenes: {},
    organizacion: {
      listar: (x: unknown) => listarEmpresas(x),
      catalogos: vi.fn().mockResolvedValue({ condicionesIva: [], provincias: [] }),
    },
    certificados: {
      estado: vi.fn().mockResolvedValue({
        empresa: { id: 'e1', razonSocial: 'Litoral SAS', cuit: '30712345671', condicionIva: 1 },
        activo: null,
        pendiente: null,
      }),
    },
  },
  renovar: () => renovar(),
}))

const EMPRESA = { id: '11111111-1111-4111-8111-111111111111', razonSocial: 'Litoral SAS' }

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  listarEmpresas.mockReset().mockResolvedValue({ datos: [{ ...EMPRESA, sucursales: [] }] })
  renovar.mockReset()
  usarSesion.getState().limpiar()
})

afterEach(cleanup)

describe('el índice', () => {
  const todo = [...indiceEstatico(), ...entradasDeCertificados([EMPRESA])]
  // La autorización de verdad, armada con la sesión de cada uno.
  const como = (sesion: typeof SESION) => {
    usarSesion.getState().establecer(sesion)
    return autorizacionActual()
  }

  it('«afip» encuentra todo lo que tiene que ver con AFIP, aunque no se llame así', () => {
    const titulos = buscarEnIndice(todo, 'afip', como(SESION)).map((e) => e.titulo)
    expect(titulos).toContain('Certificado de AFIP')
    expect(titulos).toContain('Puntos de venta')
    expect(titulos).toContain('Dar de alta un cliente con los datos de AFIP')
    expect(titulos).toContain('Facturar')
  })

  it('sin acentos ni mayúsculas, y por palabras en cualquier orden', () => {
    const titulos = (q: string) => buscarEnIndice(todo, q, como(SESION)).map((e) => e.id)
    expect(titulos('AUDITORIA')).toContain('auditoria')
    expect(titulos('electronica factura')).toEqual(titulos('Factura electrónica'))
  })

  it('lo que no puede ver no aparece', () => {
    const ids = buscarEnIndice(todo, 'afip', como(SESION_MECANICO)).map((e) => e.id)
    expect(ids).not.toContain(`certificado.${EMPRESA.id}`)
    expect(ids).not.toContain('empresas.puntosVenta')
  })
})

describe('el campo de la barra lateral', () => {
  it('F10 lleva al campo; «certificados» y Enter abre el certificado de la empresa', async () => {
    entraComo(SESION)
    const router = await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.keyboard('{F10}')
    const campo = screen.getByRole('combobox', { name: 'Buscar pantallas y configuraciones' })
    expect(document.activeElement).toBe(campo)

    await userEvent.type(campo, 'certificados')
    const lista = await screen.findByRole('list', { name: 'Lugares del sistema' })
    await within(lista).findByText('Certificado de AFIP')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/empresas/${EMPRESA.id}/certificado-afip`),
    )
  })

  it('lo que no está construido aparece atenuado y dice dónde va a estar', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Buscar pantallas y configuraciones' }),
      'atajos',
    )
    expect(
      await screen.findByText('Todavía no está disponible · va a estar en Configuración'),
    ).toBeDefined()
  })

  it('Esc cierra la lista', async () => {
    entraComo(SESION)
    await montarApp('/vehiculos')
    await screen.findByRole('heading', { name: 'Vehículos', level: 1 })

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Buscar pantallas y configuraciones' }),
      'usuarios',
    )
    await screen.findByRole('list', { name: 'Lugares del sistema' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('list', { name: 'Lugares del sistema' })).toBeNull()
  })
})
