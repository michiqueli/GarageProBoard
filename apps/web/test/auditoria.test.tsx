import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describirNavegador } from '../src/modulos/auditoria/PantallaAuditoria.tsx'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const auditoria = {
  ingresos: vi.fn(),
  cambios: vi.fn(),
  dispositivos: vi.fn(),
  nombrarDispositivo: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    auditoria: {
      ingresos: (x: unknown) => auditoria.ingresos(x),
      cambios: (x: unknown) => auditoria.cambios(x),
      dispositivos: () => auditoria.dispositivos(),
      nombrarDispositivo: (x: unknown) => auditoria.nombrarDispositivo(x),
    },
  },
  renovar: () => renovar(),
}))

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(auditoria), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  auditoria.ingresos.mockResolvedValue({
    total: 2,
    datos: [
      {
        fecha: '2026-09-16T13:00:00.000Z',
        usuario: { id: 'u1', nombre: 'Martín Gutiérrez', email: 'admin@litoral.test' },
        dispositivo: { id: 'd2', nombre: null, agente: CHROME_WINDOWS },
        computadoraNueva: true,
        ip: '200.1.2.3',
        sucursal: 'Casa Central',
      },
      {
        fecha: '2026-09-16T12:00:00.000Z',
        usuario: { id: 'u1', nombre: 'Martín Gutiérrez', email: 'admin@litoral.test' },
        dispositivo: { id: 'd1', nombre: 'PC de gerencia', agente: CHROME_WINDOWS },
        computadoraNueva: false,
        ip: '200.1.2.3',
        sucursal: 'Casa Central',
      },
    ],
  })
  auditoria.dispositivos.mockResolvedValue({
    datos: [
      {
        id: 'd2',
        nombre: null,
        agente: CHROME_WINDOWS,
        creadoEn: '2026-09-16T13:00:00.000Z',
        ultimoUsoEn: '2026-09-16T13:00:00.000Z',
        usuarios: ['Martín Gutiérrez', 'Laura Paz'],
      },
    ],
  })
})

afterEach(cleanup)

describe('cómo se nombra un navegador sin nombre', () => {
  it('dice cuál es y en qué sistema', () => {
    expect(describirNavegador(CHROME_WINDOWS)).toBe('Chrome en Windows')
    expect(describirNavegador(null)).toBe('Navegador desconocido')
  })
})

describe('los ingresos', () => {
  it('marcan la computadora nueva, que es lo que hay que mirar', async () => {
    entraComo(SESION)
    await montarApp('/auditoria')

    const nueva = await screen.findByText('Computadora nueva')
    const fila = nueva.closest('tr') as HTMLElement
    expect(within(fila).getByText('Chrome en Windows')).toBeDefined()

    // La otra, desde su PC de siempre, no lleva marca.
    const habitual = screen.getByText('PC de gerencia').closest('tr') as HTMLElement
    expect(within(habitual).queryByText('Computadora nueva')).toBeNull()
  })
})

describe('las computadoras', () => {
  it('se les pone nombre con Enter', async () => {
    entraComo(SESION)
    auditoria.nombrarDispositivo.mockResolvedValue({})
    await montarApp('/auditoria')

    await userEvent.click(await screen.findByRole('tab', { name: 'Computadoras' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ponerle nombre' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Nombre de la computadora' }),
      'PC de sistemas{Enter}',
    )

    expect(auditoria.nombrarDispositivo).toHaveBeenCalledWith({
      id: 'd2',
      nombre: 'PC de sistemas',
    })
  })
})

describe('sin permiso', () => {
  it('el mecánico no tiene Auditoría en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'Auditoría' })).toBeNull()
  })
})
