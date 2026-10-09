import { ORPCError } from '@orpc/client'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { montarApp } from './montar.tsx'

/**
 * El tótem de la puerta. Lo que decide la pantalla: los tres pasos, que el número salga aunque
 * no haya red —y se mande después—, y que nunca muestre un nombre.
 */

const totem = { estado: vi.fn(), anotar: vi.fn() }
const estacion = vi.fn()
const recordada = vi.fn()

vi.mock('../src/modulos/fichaje/estacion.ts', () => ({
  apiEstacion: {
    fichaje: { estacion: () => estacion(), escanear: vi.fn(), tableroEstacion: vi.fn() },
    totem: {
      estado: () => totem.estado(),
      anotar: (x: unknown) => totem.anotar(x),
    },
  },
  tomarTokenDeLaUrl: () => undefined,
  tokenDeLaEstacion: () => 'un-token',
  olvidarEstacion: vi.fn(),
  recordarEstacion: vi.fn(),
  estacionRecordada: () => recordada(),
}))

const TOTEM = {
  id: 'e1',
  nombre: 'Tótem de la puerta',
  tipo: 'totem' as const,
  sucursal: 'Casa Central',
  concesionaria: 'Litoral',
}

beforeEach(() => {
  localStorage.clear()
  for (const f of [...Object.values(totem), estacion, recordada]) f.mockReset()
  estacion.mockResolvedValue(TOTEM)
  recordada.mockReturnValue(null)
  totem.estado.mockResolvedValue({ fecha: '2026-10-09', ultimo: 0 })
})

afterEach(cleanup)

async function marcar(documento: string) {
  for (const d of documento) await userEvent.click(screen.getByRole('button', { name: d }))
}

describe('el tótem', () => {
  it('a qué viene, el documento y el número; con turno, la hora y ningún nombre', async () => {
    totem.anotar.mockResolvedValue({ numero: 'T-001', turnoHora: '10:30' })
    await montarApp('/fichaje')

    await userEvent.click(await screen.findByRole('button', { name: 'Servicio' }))
    await marcar('28456789')
    expect(screen.getByLabelText('Documento').textContent).toBe('28456789')
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }))

    expect(await screen.findByText('T-001')).toBeDefined()
    expect(screen.getByText('Tenés turno a las 10:30')).toBeDefined()
    expect(totem.anotar).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'servicio', documento: '28456789', numero: 1 }),
    )
  })

  it('sin red da el número igual, lo guarda, y lo manda cuando vuelve', async () => {
    totem.anotar.mockRejectedValue(new TypeError('Failed to fetch'))
    await montarApp('/fichaje')

    await userEvent.click(await screen.findByRole('button', { name: 'Plan de ahorro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir sin documento' }))

    expect(await screen.findByText('T-001')).toBeDefined()
    expect(screen.getByText('Quedaste anotado igual.')).toBeDefined()
    expect(screen.getByText('Sin conexión: 1 por mandar')).toBeDefined()

    // Vuelve la red: se manda la misma visita, con el mismo id.
    const { id } = totem.anotar.mock.calls[0]?.[0] as { id: string }
    totem.anotar.mockResolvedValue({ numero: 'T-001', turnoHora: null })
    window.dispatchEvent(new Event('online'))
    await waitFor(() =>
      expect(totem.anotar).toHaveBeenLastCalledWith(expect.objectContaining({ id, numero: 1 })),
    )
    await waitFor(() => expect(screen.queryByText(/por mandar/)).toBeNull())
  })

  it('sigue la cuenta del servidor: si se reinició, no repite números', async () => {
    totem.estado.mockResolvedValue({
      fecha: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date()),
      ultimo: 41,
    })
    totem.anotar.mockResolvedValue({ numero: 'T-042', turnoHora: null })
    await montarApp('/fichaje')
    await waitFor(() => expect(totem.estado).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: 'Repuestos' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir sin documento' }))
    await waitFor(() =>
      expect(totem.anotar).toHaveBeenCalledWith(expect.objectContaining({ numero: 42 })),
    )
  })

  it('arranca sin red con lo que recordaba', async () => {
    estacion.mockRejectedValue(new ORPCError('INTERNAL_SERVER_ERROR', { status: 503 }))
    recordada.mockReturnValue(TOTEM)
    await montarApp('/fichaje')
    expect(await screen.findByRole('heading', { name: '¿A qué venís?' })).toBeDefined()
  })
})
