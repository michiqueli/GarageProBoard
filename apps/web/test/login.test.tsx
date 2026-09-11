import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const iniciar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: { auth: { iniciar: (...args: unknown[]) => iniciar(...args) } },
}))

const { PantallaLogin } = await import('../src/modulos/auth/PantallaLogin.tsx')
const { usarSesion } = await import('../src/sesion/almacen.ts')

function montar(children: ReactNode) {
  // Sin reintentos: acá se prueba qué muestra la pantalla ante un error, y el
  // reintento automático sólo haría esperar al test.
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={cliente}>{children}</QueryClientProvider>)
}

const SESION = {
  access: 'un-access',
  refresh: 'un-refresh',
  expiraEn: new Date().toISOString(),
  usuario: { id: 'u1', email: 'admin@litoral.test', nombre: 'Martín', apellido: 'Gutiérrez' },
  tenant: { id: 't1', nombre: 'Litoral', slug: 'litoral' },
  sucursalActiva: { id: 's1', nombre: 'Casa Central', empresaId: 'e1', razonSocial: 'Litoral SAS' },
  sucursales: [{ id: 's1', nombre: 'Casa Central', empresaId: 'e1', razonSocial: 'Litoral SAS' }],
  habilidades: [],
  atajos: {},
  config: {
    tema: 'oscuro' as const,
    densidad: 'compacta' as const,
    filasPorPagina: 50,
    sucursalPredeterminadaId: null,
  },
}

beforeEach(() => {
  iniciar.mockReset()
  usarSesion.getState().limpiar()
})

afterEach(cleanup)

describe('pantalla de inicio de sesión', () => {
  it('pide sólo correo y contraseña', () => {
    montar(<PantallaLogin />)

    expect(screen.getByLabelText('Correo')).toBeDefined()
    expect(screen.getByLabelText('Contraseña')).toBeDefined()
    // La concesionaria sale del correo: no se le pregunta a nadie dónde trabaja.
    expect(screen.queryByLabelText('Concesionaria')).toBeNull()
  })

  it('arranca con el foco puesto, sin tocar el mouse', () => {
    montar(<PantallaLogin />)
    expect(document.activeElement).toBe(screen.getByLabelText('Correo'))
  })

  it('guarda la sesión cuando las credenciales son correctas', async () => {
    iniciar.mockResolvedValue(SESION)
    montar(<PantallaLogin />)

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@litoral.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'garagepro')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(usarSesion.getState().datos?.usuario.email).toBe('admin@litoral.test')
    })
    expect(iniciar).toHaveBeenCalledWith({
      email: 'admin@litoral.test',
      password: 'garagepro',
    })
  })

  it('muestra el mensaje del contrato cuando la credencial es inválida', async () => {
    iniciar.mockRejectedValue(
      new ORPCError('CREDENCIALES_INVALIDAS', {
        status: 401,
        message: 'El correo o la contraseña no son correctos',
      }),
    )
    montar(<PantallaLogin />)

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@litoral.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe('El correo o la contraseña no son correctos')
    expect(usarSesion.getState().datos).toBeNull()
  })

  it('ante un fallo de red no le muestra al usuario el error del sistema', async () => {
    // "Failed to fetch" no le dice nada a un asesor de servicios.
    iniciar.mockRejectedValue(new TypeError('Failed to fetch'))
    montar(<PantallaLogin />)

    await userEvent.type(screen.getByLabelText('Correo'), 'admin@litoral.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'garagepro')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toMatch(/No se pudo conectar/)
    expect(aviso.textContent).not.toMatch(/fetch/i)
  })
})
