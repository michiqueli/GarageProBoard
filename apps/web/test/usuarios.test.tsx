import { ORPCError } from '@orpc/client'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO, textoDelError } from './montar.tsx'

/**
 * La pantalla de usuarios. Las reglas las aplica la API —y las prueba allá—; lo que se
 * prueba acá es que la pantalla no ofrezca lo que va a ser rechazado, y que cuando igual
 * pase, diga por qué.
 */

const usuarios = {
  listar: vi.fn(),
  opciones: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  nuevaPassword: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    usuarios: {
      listar: () => usuarios.listar(),
      opciones: () => usuarios.opciones(),
      crear: (x: unknown) => usuarios.crear(x),
      editar: (x: unknown) => usuarios.editar(x),
      nuevaPassword: (x: unknown) => usuarios.nuevaPassword(x),
    },
  },
  renovar: () => renovar(),
}))

const CENTRAL = { id: 's1', nombre: 'Casa Central' }

const YO = {
  id: 'u1',
  email: 'admin@litoral.test',
  nombre: 'Martín',
  apellido: 'Gutiérrez',
  activo: true,
  ultimoAcceso: '2026-09-16T12:00:00.000Z',
  roles: [{ id: 'r-gerente', nombre: 'Gerente' }],
  sucursales: [CENTRAL],
  editable: false,
}

const MECANICO = {
  ...YO,
  id: 'u2',
  email: 'taller@litoral.test',
  nombre: 'Pedro',
  apellido: 'Sosa',
  ultimoAcceso: null,
  roles: [{ id: 'r-mecanico', nombre: 'Mecánico' }],
  editable: true,
}

const DUENIO = {
  ...YO,
  id: 'u3',
  email: 'duenio@litoral.test',
  nombre: 'Ana',
  apellido: 'Arce',
  editable: false,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(usuarios), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  usuarios.listar.mockResolvedValue({ datos: [DUENIO, YO, MECANICO] })
  usuarios.opciones.mockResolvedValue({
    roles: [
      {
        id: 'r-gerente',
        nombre: 'Gerente',
        descripcion: null,
        leFalta: ['administrar todo el sistema'],
      },
      { id: 'r-mecanico', nombre: 'Mecánico', descripcion: null, leFalta: [] },
    ],
    sucursales: [{ ...CENTRAL, razonSocial: 'Litoral SAS' }],
  })
})

afterEach(cleanup)

describe('el listado', () => {
  it('dice con quién no se puede hacer nada, y por qué', async () => {
    entraComo(SESION)
    await montarApp('/usuarios')

    const fila = (email: string) => screen.getByText(email).closest('tr') as HTMLElement
    await screen.findByText('taller@litoral.test')

    expect(within(fila('admin@litoral.test')).getByText('Sos vos')).toBeDefined()
    expect(within(fila('duenio@litoral.test')).getByText('Tiene más permisos')).toBeDefined()
    expect(
      within(fila('taller@litoral.test')).getByRole('button', { name: 'Modificar' }),
    ).toBeDefined()
  })

  it('el mecánico no tiene la sección en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull()
  })
})

describe('el alta', () => {
  it('se abre con Ins, no ofrece el rol que no puede dar y guarda con F2', async () => {
    entraComo(SESION)
    usuarios.crear.mockResolvedValue({
      usuario: { ...MECANICO, id: 'u9', email: 'nuevo@litoral.test' },
      passwordInicial: 'clave-inicial',
    })
    await montarApp('/usuarios')
    await screen.findByText('taller@litoral.test')

    await userEvent.keyboard('{Insert}')
    const formulario = await screen.findByRole('form', { name: 'Nuevo usuario' })

    const gerente = within(formulario).getByRole('checkbox', { name: /Gerente/ })
    expect(gerente).toHaveProperty('disabled', true)
    expect(within(formulario).getByText(/te falta administrar todo el sistema/)).toBeDefined()

    await userEvent.type(within(formulario).getByLabelText('Correo'), 'nuevo@litoral.test')
    await userEvent.type(within(formulario).getByLabelText('Nombre'), 'Luis')
    await userEvent.type(within(formulario).getByLabelText('Apellido'), 'Paz')
    await userEvent.click(within(formulario).getByRole('checkbox', { name: /Mecánico/ }))
    await userEvent.keyboard('{F2}')

    // Con una sola sucursal, queda elegida sin preguntar.
    expect(usuarios.crear).toHaveBeenCalledWith({
      email: 'nuevo@litoral.test',
      nombre: 'Luis',
      apellido: 'Paz',
      rolIds: ['r-mecanico'],
      sucursalIds: ['s1'],
    })
    expect(await screen.findByText('clave-inicial')).toBeDefined()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('si la API igual lo rechaza, dice qué permiso falta', async () => {
    entraComo(SESION)
    usuarios.crear.mockRejectedValue(
      new ORPCError('ROL_NO_OTORGABLE', {
        status: 403,
        message: 'No podés asignar un rol con permisos que vos no tenés',
        data: { rol: 'Gerente', leFalta: ['administrar todo el sistema'] },
      }),
    )
    await montarApp('/usuarios')
    await screen.findByText('taller@litoral.test')

    await userEvent.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    const formulario = await screen.findByRole('form', { name: 'Nuevo usuario' })
    await userEvent.type(within(formulario).getByLabelText('Correo'), 'x@litoral.test')
    await userEvent.type(within(formulario).getByLabelText('Nombre'), 'X')
    await userEvent.type(within(formulario).getByLabelText('Apellido'), 'Y')
    await userEvent.keyboard('{F2}')

    expect(await textoDelError()).toBe(
      'No podés asignar Gerente: te falta administrar todo el sistema.',
    )
  })

  it('Esc cierra el formulario sin mandar nada', async () => {
    entraComo(SESION)
    await montarApp('/usuarios')
    await screen.findByText('taller@litoral.test')

    await userEvent.keyboard('{Insert}')
    await screen.findByRole('form', { name: 'Nuevo usuario' })
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('form')).toBeNull()
    expect(usuarios.crear).not.toHaveBeenCalled()
  })
})

describe('modificar', () => {
  it('dar de baja manda activo en falso con los mismos roles', async () => {
    entraComo(SESION)
    usuarios.editar.mockResolvedValue({ ...MECANICO, activo: false })
    await montarApp('/usuarios')

    const fila = (await screen.findByText('taller@litoral.test')).closest('tr') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('form', { name: 'Modificar a taller@litoral.test' })

    await userEvent.click(
      await within(formulario).findByRole('checkbox', { name: /Puede entrar al sistema/ }),
    )
    expect(within(formulario).getByText(/se cierran sus sesiones/)).toBeDefined()
    await userEvent.click(within(formulario).getByRole('button', { name: /Guardar cambios/ }))
    expect(usuarios.editar).not.toHaveBeenCalled()
    await confirmarDialogo('Dar de baja')

    expect(usuarios.editar).toHaveBeenCalledWith({
      id: 'u2',
      nombre: 'Pedro',
      apellido: 'Sosa',
      rolIds: ['r-mecanico'],
      sucursalIds: ['s1'],
      activo: false,
    })
  })
})
