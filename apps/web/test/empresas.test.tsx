import { ORPCError } from '@orpc/client'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const organizacion = {
  catalogos: vi.fn(),
  listar: vi.fn(),
  crearEmpresa: vi.fn(),
  editarEmpresa: vi.fn(),
  crearSucursal: vi.fn(),
  editarSucursal: vi.fn(),
  crearPuntoVenta: vi.fn(),
  editarPuntoVenta: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    organizacion: Object.fromEntries(
      [
        'catalogos',
        'listar',
        'crearEmpresa',
        'editarEmpresa',
        'crearSucursal',
        'editarSucursal',
        'crearPuntoVenta',
        'editarPuntoVenta',
      ].map((nombre) => [
        nombre,
        (x: unknown) => (organizacion as Record<string, (x: unknown) => unknown>)[nombre]?.(x),
      ]),
    ),
  },
  renovar: () => renovar(),
}))

const CENTRAL = {
  id: 's1',
  nombre: 'Casa Central',
  domicilio: 'Bv. Pellegrini 2500',
  provinciaCodigo: 21,
  localidad: 'Santa Fe',
  telefono: null,
  activa: true,
  usuarios: 3,
  puntosVenta: [
    { id: 'p2', numero: 2, uso: 'facturacion', modo: 'CAE', predeterminado: true, activo: true },
  ],
}

const RAFAELA = {
  ...CENTRAL,
  id: 's2',
  nombre: 'Rafaela',
  usuarios: 1,
  puntosVenta: [],
}

const LITORAL = {
  id: 'e1',
  razonSocial: 'Automotores Litoral SAS',
  nombreFantasia: null,
  cuit: '30712345671',
  condicionIva: 1,
  inicioActividades: null,
  domicilioFiscal: null,
  provinciaCodigo: 21,
  convenioMultilateral: false,
  numeroIibb: null,
  sucursales: [CENTRAL, RAFAELA],
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(organizacion), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  organizacion.listar.mockResolvedValue({ datos: [LITORAL] })
  organizacion.catalogos.mockResolvedValue({
    condicionesIva: [{ codigo: 1, descripcion: 'IVA Responsable Inscripto' }],
    provincias: [{ codigo: 21, nombre: 'Santa Fe' }],
  })
})

afterEach(cleanup)

describe('el árbol de la concesionaria', () => {
  it('muestra cada razón social con su CUIT como en una factura, y sus sucursales', async () => {
    entraComo(SESION)
    await montarApp('/empresas')

    const litoral = await screen.findByRole('region', { name: 'Automotores Litoral SAS' })
    expect(within(litoral).getByText('30-71234567-1')).toBeDefined()
    expect(await within(litoral).findByText('IVA Responsable Inscripto')).toBeDefined()
    expect(within(litoral).getByText('predeterminado')).toBeDefined()
    // La que no tiene punto de venta lo dice: todavía no puede facturar.
    expect(within(litoral).getByText('Sin punto de venta: todavía no factura')).toBeDefined()
  })

  it('el mecánico no tiene Empresas en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'Empresas' })).toBeNull()
  })
})

describe('una razón social nueva', () => {
  it('con el CUIT mal escrito avisa al lado del campo y no manda nada', async () => {
    entraComo(SESION)
    await montarApp('/empresas')
    await screen.findByRole('region', { name: 'Automotores Litoral SAS' })

    await userEvent.keyboard('{Insert}')
    const formulario = await screen.findByRole('region', { name: 'Nueva razón social' })
    await userEvent.type(within(formulario).getByLabelText('CUIT'), '30-71234567-9')
    await userEvent.type(within(formulario).getByLabelText('Razón social'), 'Otra SAS')
    await userEvent.keyboard('{F2}')

    expect(within(formulario).getByText('Ese CUIT no existe: revisá los números')).toBeDefined()
    expect(organizacion.crearEmpresa).not.toHaveBeenCalled()
  })

  it('con el CUIT bien, lo manda sin guiones', async () => {
    entraComo(SESION)
    organizacion.crearEmpresa.mockResolvedValue({ ...LITORAL, id: 'e2', sucursales: [] })
    await montarApp('/empresas')
    await screen.findByRole('region', { name: 'Automotores Litoral SAS' })

    await userEvent.keyboard('{Insert}')
    const formulario = await screen.findByRole('region', { name: 'Nueva razón social' })
    await userEvent.type(within(formulario).getByLabelText('CUIT'), '30-71987654-0')
    await userEvent.type(within(formulario).getByLabelText('Razón social'), 'Litoral Repuestos SAS')
    await userEvent.keyboard('{F2}')

    expect(organizacion.crearEmpresa).toHaveBeenCalledWith(
      expect.objectContaining({ cuit: '30719876540', razonSocial: 'Litoral Repuestos SAS' }),
    )
  })
})

describe('desactivar una sucursal', () => {
  it('si hay usuarios que sólo entran ahí, dice quiénes y qué hacer', async () => {
    entraComo(SESION)
    organizacion.editarSucursal.mockRejectedValue(
      new ORPCError('SUCURSAL_CON_USUARIOS', {
        status: 409,
        message: 'Hay usuarios que sólo entran a esta sucursal',
        data: { usuarios: ['taller@litoral.test'] },
      }),
    )
    await montarApp('/empresas')

    const litoral = await screen.findByRole('region', { name: 'Automotores Litoral SAS' })
    const fila = within(litoral).getByText('Rafaela').closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Modificar' }))

    const formulario = await screen.findByRole('region', { name: 'Modificar la sucursal Rafaela' })
    await userEvent.click(within(formulario).getByRole('checkbox', { name: /Activa/ }))
    await userEvent.keyboard('{F2}')

    expect((await within(formulario).findByRole('alert')).textContent).toBe(
      'No se puede desactivar: taller@litoral.test sólo entran a esta sucursal. Dales acceso a otra desde Usuarios.',
    )
  })
})
