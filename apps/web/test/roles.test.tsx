import { ORPCError } from '@orpc/client'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const roles = { listar: vi.fn(), crear: vi.fn(), editar: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    roles: {
      listar: () => roles.listar(),
      crear: (x: unknown) => roles.crear(x),
      editar: (x: unknown) => roles.editar(x),
    },
  },
  renovar: () => renovar(),
}))

const GERENTE = {
  id: 'r1',
  nombre: 'Gerente',
  descripcion: 'Acceso total a la concesionaria.',
  todo: true,
  permisos: [],
  especiales: [],
  usuarios: 1,
  noEditable:
    'Puede todo el sistema, y no se modifica desde acá. Si necesitás uno parecido, clonalo.',
}

const MECANICO = {
  id: 'r2',
  nombre: 'Mecánico',
  descripcion: 'Ve su trabajo asignado y ficha tiempos.',
  todo: false,
  permisos: [
    { accion: 'ver', sujeto: 'Orden' },
    { accion: 'ver', sujeto: 'Vehiculo' },
    { accion: 'ver', sujeto: 'Repuesto' },
  ],
  especiales: ['Puede modificar órdenes de trabajo sólo si las tiene asignadas'],
  usuarios: 4,
  noEditable: null,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(roles), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  roles.listar.mockResolvedValue({ datos: [GERENTE, MECANICO] })
})

afterEach(cleanup)

describe('el listado', () => {
  it('cada rol dice qué puede, y el que no se modifica dice por qué', async () => {
    entraComo(SESION)
    await montarApp('/roles')

    const mecanico = await screen.findByRole('region', { name: 'Mecánico' })
    expect(within(mecanico).getByText('4 usuarios')).toBeDefined()
    expect(within(mecanico).getByText('Vehículos')).toBeDefined()
    expect(
      within(mecanico).getByText('Puede modificar órdenes de trabajo sólo si las tiene asignadas'),
    ).toBeDefined()
    expect(within(mecanico).getByRole('button', { name: 'Modificar' })).toBeDefined()

    const gerente = screen.getByRole('region', { name: 'Gerente' })
    expect(within(gerente).getByText('Puede todo el sistema')).toBeDefined()
    expect(within(gerente).queryByRole('button', { name: 'Modificar' })).toBeNull()
    expect(within(gerente).getByText(/Si necesitás uno parecido, clonalo/)).toBeDefined()
  })

  it('el mecánico no tiene Roles en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')
    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'Roles' })).toBeNull()
  })
})

describe('modificar', () => {
  it('con casillas; conserva y muestra las reglas especiales, y avisa a cuántos afecta', async () => {
    roles.editar.mockResolvedValue(MECANICO)
    entraComo(SESION)
    await montarApp('/roles')

    const tarjeta = await screen.findByRole('region', { name: 'Mecánico' })
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('region', { name: 'Modificar Mecánico' })

    expect(within(formulario).getByText(/Lo tienen 4 usuarios/)).toBeDefined()
    expect(
      within(formulario).getByText('Reglas que no se cambian desde acá, y se conservan:'),
    ).toBeDefined()

    const clientes = within(formulario).getByRole('group', { name: 'Clientes' })
    await userEvent.click(within(clientes).getByRole('checkbox', { name: 'ver' }))
    await userEvent.keyboard('{F2}')

    expect(roles.editar).toHaveBeenCalledWith({
      id: 'r2',
      nombre: 'Mecánico',
      descripcion: 'Ve su trabajo asignado y ficha tiempos.',
      permisos: [
        { accion: 'ver', sujeto: 'Orden' },
        { accion: 'ver', sujeto: 'Vehiculo' },
        { accion: 'ver', sujeto: 'Cliente' },
        { accion: 'ver', sujeto: 'Repuesto' },
      ],
    })
  })

  it('si la API no lo deja, muestra su motivo', async () => {
    roles.editar.mockRejectedValue(
      new ORPCError('NO_EDITABLE', {
        status: 403,
        message: 'Ese rol no se puede modificar',
        data: { motivo: 'Lo tenés vos, y nadie modifica sus propios permisos.' },
      }),
    )
    entraComo(SESION)
    await montarApp('/roles')

    const tarjeta = await screen.findByRole('region', { name: 'Mecánico' })
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('region', { name: 'Modificar Mecánico' })
    await userEvent.keyboard('{F2}')

    expect((await within(formulario).findByRole('alert')).textContent).toBe(
      'Lo tenés vos, y nadie modifica sus propios permisos.',
    )
  })
})

describe('clonar', () => {
  it('el clon del que puede todo arranca con todas las casillas marcadas', async () => {
    roles.crear.mockResolvedValue({ ...GERENTE, id: 'r3', todo: false })
    entraComo(SESION)
    await montarApp('/roles')

    const gerente = await screen.findByRole('region', { name: 'Gerente' })
    await userEvent.click(within(gerente).getByRole('button', { name: 'Clonar' }))
    const formulario = await screen.findByRole('region', { name: 'Nuevo rol a partir de Gerente' })

    expect((within(formulario).getByLabelText('Nombre') as HTMLInputElement).value).toBe(
      'Gerente (copia)',
    )
    const casillas = within(formulario).getAllByRole('checkbox') as HTMLInputElement[]
    expect(casillas.every((c) => c.checked)).toBe(true)

    // Un subgerente: todo menos configurar la facturación.
    const nombre = within(formulario).getByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Subgerente')
    const comprobantes = within(formulario).getByRole('group', { name: 'Comprobantes' })
    await userEvent.click(within(comprobantes).getByRole('checkbox', { name: 'configurar' }))
    await userEvent.keyboard('{F2}')

    const enviado = roles.crear.mock.calls[0]?.[0] as {
      nombre: string
      basadoEn: string
      permisos: Array<{ accion: string; sujeto: string }>
    }
    expect(enviado.nombre).toBe('Subgerente')
    expect(enviado.basadoEn).toBe('r1')
    expect(enviado.permisos).toContainEqual({ accion: 'anular', sujeto: 'Comprobante' })
    expect(enviado.permisos).not.toContainEqual({ accion: 'configurar', sujeto: 'Comprobante' })
  })

  it('Ins arranca uno desde cero, sin casillas', async () => {
    entraComo(SESION)
    await montarApp('/roles')
    await screen.findByRole('region', { name: 'Mecánico' })

    await userEvent.keyboard('{Insert}')
    const formulario = await screen.findByRole('region', { name: 'Nuevo rol' })
    const casillas = within(formulario).getAllByRole('checkbox') as HTMLInputElement[]
    expect(casillas.some((c) => c.checked)).toBe(false)
  })
})
