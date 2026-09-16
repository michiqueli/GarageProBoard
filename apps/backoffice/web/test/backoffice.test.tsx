import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El back-office montado entero, con el cliente de la API simulado. Lo que se prueba es lo
 * que ve y lo que manda quien opera; que el servidor haga lo correcto lo prueban los
 * tests de `apps/backoffice/api`.
 */

const api = {
  auth: { yo: vi.fn(), iniciar: vi.fn(), cerrar: vi.fn() },
  concesionarias: {
    listar: vi.fn(),
    ver: vi.fn(),
    crear: vi.fn(),
    cambiarEstado: vi.fn(),
    cambiarModulo: vi.fn(),
  },
}

vi.mock('../src/cliente.ts', async (original) => ({
  ...(await original<typeof import('../src/cliente.ts')>()),
  api,
}))

const OPERADOR = { id: 'o1', email: 'ops@gpb.test', nombre: 'Operaciones' }

const LITORAL = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Automotores del Litoral',
  slug: 'litoral',
  activo: true,
  creadoEn: '2026-09-01T12:00:00.000Z',
  modulos: ['nucleo', 'servicios'],
}

const DETALLE = {
  ...LITORAL,
  contratos: [
    {
      modulo: 'nucleo',
      contrato: {
        modulo: 'nucleo',
        activo: true,
        vigenteDesde: '2026-09-01T12:00:00.000Z',
        vigenteHasta: null,
        vigente: true,
      },
    },
    { modulo: 'contable', contrato: null },
    {
      modulo: 'servicios',
      contrato: {
        modulo: 'servicios',
        activo: true,
        vigenteDesde: '2026-09-01T12:00:00.000Z',
        vigenteHasta: null,
        vigente: true,
      },
    },
  ],
  historial: [],
}

async function montar(ruta: string) {
  const { crearRouter } = await import('../src/rutas.tsx')
  const router = crearRouter({ history: createMemoryHistory({ initialEntries: [ruta] }) })
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cache}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  api.auth.yo.mockResolvedValue(OPERADOR)
  api.concesionarias.listar.mockResolvedValue({
    datos: [LITORAL, { ...LITORAL, id: '2', nombre: 'Del Norte', slug: 'norte', activo: false }],
  })
  api.concesionarias.ver.mockResolvedValue(DETALLE)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('la sesión', () => {
  it('sin sesión manda a entrar', async () => {
    api.auth.yo.mockRejectedValue(
      new ORPCError('NO_AUTENTICADO', { status: 401, message: 'Falta iniciar sesión' }),
    )
    const router = await montar('/')

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeDefined()
    expect(router.state.location.pathname).toBe('/entrar')
  })

  it('con credenciales equivocadas dice qué pasó', async () => {
    api.auth.iniciar.mockRejectedValue(
      new ORPCError('CREDENCIALES_INVALIDAS', {
        status: 401,
        message: 'El correo o la contraseña no son correctos',
      }),
    )
    await montar('/entrar')

    await userEvent.type(await screen.findByLabelText('Correo'), 'ops@gpb.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mal{Enter}')

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'El correo o la contraseña no son correctos',
    )
  })
})

describe('el listado', () => {
  it('muestra cada concesionaria con su estado en palabras, no sólo en color', async () => {
    await montar('/')

    const tabla = await screen.findByRole('table')
    const norte = within(tabla).getByRole('row', { name: /Del Norte/ })
    expect(within(norte).getByText('Suspendida')).toBeDefined()
    const litoral = within(tabla).getByRole('row', { name: /Automotores del Litoral/ })
    expect(within(litoral).getByText('Núcleo · Servicios')).toBeDefined()
  })
})

describe('un módulo', () => {
  it('se apaga con motivo, y lo que se manda es lo que se eligió', async () => {
    api.concesionarias.cambiarModulo.mockResolvedValue(DETALLE)
    await montar(`/concesionarias/${LITORAL.id}`)

    const fila = (await screen.findByText('Servicios')).closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Cambiar' }))
    // Estaba prendido: el formulario arranca proponiendo apagarlo.
    await userEvent.type(within(fila).getByLabelText('Motivo'), 'Falta de pago')
    await userEvent.click(within(fila).getByRole('button', { name: 'Apagar Servicios' }))

    expect(api.concesionarias.cambiarModulo).toHaveBeenCalledWith({
      id: LITORAL.id,
      modulo: 'servicios',
      activo: false,
      vigenteHasta: null,
      motivo: 'Falta de pago',
    })
  })

  it('si deja a otro sin lo que necesita, muestra el motivo del rechazo', async () => {
    api.concesionarias.cambiarModulo.mockRejectedValue(
      new ORPCError('DEPENDENCIAS_ROTAS', {
        status: 422,
        message: 'La combinación de módulos deja a alguno sin algo que necesita',
        data: { motivos: ['Servicios necesita Núcleo'] },
      }),
    )
    await montar(`/concesionarias/${LITORAL.id}`)

    const fila = (await screen.findByText('Núcleo')).closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Cambiar' }))
    await userEvent.type(within(fila).getByLabelText('Motivo'), 'Prueba')
    await userEvent.click(within(fila).getByRole('button', { name: 'Apagar Núcleo' }))

    expect((await within(fila).findByRole('alert')).textContent).toContain(
      'Servicios necesita Núcleo',
    )
  })

  it('Esc cierra el formulario sin mandar nada', async () => {
    await montar(`/concesionarias/${LITORAL.id}`)

    const fila = (await screen.findByText('Servicios')).closest('li') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: 'Cambiar' }))
    await userEvent.keyboard('{Escape}')

    expect(within(fila).queryByLabelText('Motivo')).toBeNull()
    expect(api.concesionarias.cambiarModulo).not.toHaveBeenCalled()
  })
})

describe('el alta', () => {
  it('avisa mientras se eligen módulos que no funcionan juntos', async () => {
    await montar('/nueva')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Servicios' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Núcleo' }))

    expect(screen.getByRole('alert').textContent).toBe('Servicios necesita Núcleo.')
    expect(screen.getByRole('button', { name: 'Dar de alta' })).toHaveProperty('disabled', true)
  })

  it('muestra la contraseña inicial una vez terminada', async () => {
    api.concesionarias.crear.mockResolvedValue({
      concesionaria: { ...LITORAL, id: '3', nombre: 'Nueva SA' },
      passwordInicial: 'clave-inicial-123',
    })
    await montar('/nueva')

    const campos = {
      Nombre: 'Nueva SA',
      Identificador: 'nueva',
      'Razón social': 'Nueva SA',
      CUIT: '30-71234567-9',
    }
    for (const [etiqueta, valor] of Object.entries(campos)) {
      await userEvent.type((await screen.findAllByLabelText(etiqueta))[0] as HTMLElement, valor)
    }
    await userEvent.type(screen.getByLabelText('Correo'), 'gerente@nueva.test')
    const [, nombre] = screen.getAllByLabelText('Nombre')
    await userEvent.type(nombre as HTMLElement, 'Ana')
    await userEvent.type(screen.getByLabelText('Apellido'), 'Sosa')
    await userEvent.click(screen.getByRole('button', { name: 'Dar de alta' }))

    expect(await screen.findByText('clave-inicial-123')).toBeDefined()
    // El CUIT viaja sin guiones.
    expect(api.concesionarias.crear.mock.calls[0]?.[0].empresa.cuit).toBe('30712345679')
  })
})
