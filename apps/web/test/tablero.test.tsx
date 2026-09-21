import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { montarApp, SESION, SESION_REPUESTERO, SESION_SIN_TALLER_NI_CAJA } from './montar.tsx'

/**
 * El tablero de piso.
 *
 * Lo que se prueba acá es lo que la pantalla decide: que un auto sin nadie fichado se vea
 * **parado** de lejos, que los dos relojes se cuenten separados, y que desde una fila se entre
 * a la orden. Los números los calcula la API y se prueban allá.
 */

const fichaje = { tablero: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    fichaje: { tablero: () => fichaje.tablero() },
    ordenes: { ficha: vi.fn(), personal: vi.fn() },
  },
  renovar: () => renovar(),
}))

const TRABAJANDO = {
  id: 'o1',
  numero: 123,
  estado: 'en_proceso' as const,
  dominio: 'AB123CD',
  vehiculo: 'Volkswagen Amarok',
  pedido: 'Hace ruido al frenar',
  ingreso: '2026-09-20T11:00:00.000Z',
  prometidaPara: null,
  asignado: 'Diego Sosa',
  trabajando: [{ nombre: 'Diego Sosa', desde: '2026-09-20T12:00:00.000Z' }],
  manoDeObraMin: 95,
  enTallerMin: 240,
  muertoMin: 145,
}

const PARADO = {
  ...TRABAJANDO,
  id: 'o2',
  numero: 124,
  estado: 'esperando_repuesto' as const,
  dominio: 'MFV872',
  vehiculo: 'Renault Kangoo',
  pedido: 'Service de 20.000',
  trabajando: [],
  manoDeObraMin: 30,
  enTallerMin: 600,
  muertoMin: 570,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

const fila = (texto: string) => screen.getByText(texto).closest('tr') as HTMLElement

beforeEach(() => {
  for (const f of [fichaje.tablero, renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  fichaje.tablero.mockResolvedValue({
    sucursal: 'Casa Central',
    alMomento: '2026-09-20T15:00:00.000Z',
    autos: [TRABAJANDO, PARADO],
    resumen: { enTaller: 2, conAlguien: 1, parados: 1 },
  })
})

afterEach(cleanup)

describe('el tablero', () => {
  it('dice quién tiene cada auto, y marca el que está parado', async () => {
    entraComo(SESION)
    await montarApp('/taller')
    await screen.findByText('Volkswagen Amarok')

    expect(within(fila('Volkswagen Amarok')).getByText(/Diego Sosa/)).toBeDefined()
    expect(within(fila('Renault Kangoo')).getByText('Parado')).toBeDefined()
  })

  it('los tres números del encabezado', async () => {
    entraComo(SESION)
    await montarApp('/taller')
    await screen.findByText('Volkswagen Amarok')

    expect(screen.getByText('en el taller')).toBeDefined()
    expect(screen.getByText('con alguien')).toBeDefined()
    expect(screen.getByText('parados')).toBeDefined()
  })

  /**
   * Los dos relojes son cosas distintas y por eso van los dos. Mostrar uno solo —o sumarlos—
   * es exactamente el error que hace que los números de productividad salgan basura.
   */
  it('muestra la mano de obra y el tiempo en taller por separado, con el muerto', async () => {
    entraComo(SESION)
    await montarApp('/taller')
    const suya = within(
      await screen.findByText('Volkswagen Amarok').then((e) => fila(e.textContent ?? '')),
    )

    expect(suya.getByText('4 h 00 min')).toBeDefined()
    expect(suya.getByText('1 h 35 min')).toBeDefined()
    expect(suya.getByText('2 h 25 min')).toBeDefined()
  })

  it('desde una fila se entra a la orden', async () => {
    entraComo(SESION)
    const router = await montarApp('/taller')
    await screen.findByText('Volkswagen Amarok')

    await userEvent.click(screen.getByText('Volkswagen Amarok'))

    expect(router.state.location.pathname).toBe('/ordenes/o1')
  })

  it('el taller vacío lo dice, y dice de dónde van a salir los autos', async () => {
    entraComo(SESION)
    fichaje.tablero.mockResolvedValue({
      sucursal: 'Casa Central',
      alMomento: '2026-09-20T15:00:00.000Z',
      autos: [],
      resumen: { enTaller: 0, conAlguien: 0, parados: 0 },
    })
    await montarApp('/taller')

    expect(await screen.findByText(/Cuando recepción abra una orden/)).toBeDefined()
  })

  /**
   * El repuestero **sí** lo ve, y está bien: su rol trae `ver Orden`, y saber qué autos hay en
   * el taller es justamente lo que le sirve para ir preparando repuestos. Lo que hace
   * desaparecer la sección es no tener contratado el módulo, que se mira antes que el permiso.
   */
  it('la concesionaria que no contrató servicios no tiene la sección', async () => {
    entraComo(SESION_SIN_TALLER_NI_CAJA)
    await montarApp('/vehiculos')

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'Taller' })).toBeNull()
  })

  it('el repuestero sí lo ve: le sirve saber qué autos hay', async () => {
    entraComo(SESION_REPUESTERO)
    await montarApp('/taller')

    expect(await screen.findByText('Volkswagen Amarok')).toBeDefined()
  })
})
