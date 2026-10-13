import { ORPCError } from '@orpc/client'
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInactividad } from '../src/ganchos/useInactividad.ts'
import { montarApp, SESION_SIN_ROL } from './montar.tsx'

/**
 * La tablet de recepción: arranca pidiendo la credencial, entra con el lector o la cámara y
 * va a la recepción; y la sesión se cierra sola cuando nadie la toca.
 */

const entrarConCredencial = vi.fn()

vi.mock('../src/modulos/fichaje/estacion.ts', () => ({
  apiEstacion: {
    fichaje: { estacion: async () => TABLET, escanear: vi.fn() },
    auth: { entrarConCredencial: (x: unknown) => entrarConCredencial(x) },
  },
  tomarTokenDeLaUrl: () => undefined,
  tokenDeLaEstacion: () => 'un-token',
  olvidarEstacion: vi.fn(),
  recordarEstacion: vi.fn(),
  estacionRecordada: () => TABLET,
  esTabletDeRecepcion: () => true,
}))

vi.mock('../src/sesion/cliente.ts', () => ({
  api: { auth: { cerrar: vi.fn().mockResolvedValue({}) } },
  renovar: async () => false,
}))

const TABLET = {
  id: 'e1',
  nombre: 'Tablet del mostrador',
  tipo: 'recepcion' as const,
  sucursal: 'Casa Central',
  concesionaria: 'Litoral',
}

/** Un QR de credencial bien formado: la firma la verifica el servidor, no la pantalla. */
const CREDENCIAL = 'GT1:M:ABCDEFGH:0123456789'

beforeEach(() => {
  entrarConCredencial.mockReset()
  // Sin cámara en el entorno de pruebas: queda el lector, que es lo que se prueba.
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => Promise.reject(new Error('sin cámara')) },
  })
})

afterEach(cleanup)

describe('entrar en la tablet', () => {
  it('sin sesión pide la credencial, y con ella entra a la recepción', async () => {
    entrarConCredencial.mockResolvedValue(SESION_SIN_ROL)
    const router = await montarApp('/')

    expect(await screen.findByRole('heading', { name: 'Pasá tu credencial' })).toBeDefined()
    expect(await screen.findByText(/No se pudo usar la cámara/)).toBeDefined()

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    expect(entrarConCredencial).toHaveBeenCalledWith({ codigo: CREDENCIAL })
    await waitFor(() => expect(router.state.location.pathname).toBe('/recepcion'))
  })

  it('si no sirve, dice por qué', async () => {
    entrarConCredencial.mockRejectedValue(
      new ORPCError('SIN_CUENTA', {
        message:
          'Tu legajo no tiene una cuenta del sistema. Pedile a quien administra usuarios que la vincule.',
      }),
    )
    await montarApp('/fichaje')
    await screen.findByRole('heading', { name: 'Pasá tu credencial' })

    await userEvent.keyboard(`${CREDENCIAL}{Enter}`)

    expect(await screen.findByText(/no tiene una cuenta del sistema/)).toBeDefined()
  })

  it('lo que no es una credencial no se manda', async () => {
    await montarApp('/fichaje')
    await screen.findByRole('heading', { name: 'Pasá tu credencial' })
    await userEvent.keyboard('7790001234567{Enter}')
    expect(entrarConCredencial).not.toHaveBeenCalled()
  })
})

describe('la inactividad', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('avisa en el último minuto y cierra a los quince sin tocarla', () => {
    const vencer = vi.fn()
    const { result } = renderHook(() => useInactividad(true, 15, vencer))

    act(() => vi.advanceTimersByTime(13 * 60_000))
    expect(result.current).toBeNull()

    act(() => vi.advanceTimersByTime(60_000 + 30_000))
    expect(result.current).toBe(30)

    act(() => vi.advanceTimersByTime(30_000))
    expect(vencer).toHaveBeenCalledOnce()
  })

  it('tocar la pantalla vuelve a contar desde cero', () => {
    const vencer = vi.fn()
    const { result } = renderHook(() => useInactividad(true, 15, vencer))

    act(() => vi.advanceTimersByTime(14 * 60_000 + 30_000))
    expect(result.current).toBe(30)

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current).toBeNull()

    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(vencer).not.toHaveBeenCalled()
  })

  it('fuera de la tablet no cuenta nada', () => {
    const vencer = vi.fn()
    renderHook(() => useInactividad(false, 15, vencer))
    act(() => vi.advanceTimersByTime(60 * 60_000))
    expect(vencer).not.toHaveBeenCalled()
  })
})
