import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const hojas = { listar: vi.fn(), subir: vi.fn(), imagen: vi.fn(), quitar: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    hojas: {
      listar: () => hojas.listar(),
      subir: (x: unknown) => hojas.subir(x),
      imagen: (x: unknown) => hojas.imagen(x),
      quitar: (x: unknown) => hojas.quitar(x),
    },
  },
  renovar: () => renovar(),
}))

const TIPOS = ['sedan', 'hatchback', 'pickup'] as const
const VISTAS = ['frente', 'atras', 'izquierda', 'derecha', 'arriba'] as const

/** Las quince casillas, todas con la del sistema, que es como arranca un taller nuevo. */
const vacias = () => ({
  datos: TIPOS.flatMap((tipo) => VISTAS.map((vista) => ({ tipo, vista, propia: null }))),
})

const propia = {
  id: '77777777-7777-4777-8777-777777777777',
  tipo: 'sedan' as const,
  vista: 'frente' as const,
  formato: 'image/png' as const,
  ancho: 1200,
  alto: 800,
  bytes: 46080,
  creadoEn: '2026-09-29T12:00:00.000Z',
  creadoPor: null,
}

beforeEach(() => {
  for (const f of [...Object.values(hojas), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(SESION)
    return true
  })
  hojas.listar.mockResolvedValue(vacias())
  hojas.imagen.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
  URL.createObjectURL = vi.fn(() => 'blob:dibujo')
  URL.revokeObjectURL = vi.fn()
})

afterEach(cleanup)

describe('la hoja de recepción', () => {
  it('muestra las quince casillas, y las que no tienen dibujo propio usan la del sistema', async () => {
    await montarApp('/hoja-recepcion')
    expect(await screen.findByText('Sedán')).toBeDefined()

    // Tres secciones, cinco vistas cada una.
    for (const tipo of ['Sedán', 'Hatchback', 'Pickup']) {
      const seccion = screen.getByRole('region', { name: tipo })
      expect(within(seccion).getAllByRole('listitem')).toHaveLength(5)
      expect(within(seccion).getByText('0 de 5 con dibujo propio')).toBeDefined()
    }
    expect(screen.getAllByText('El que trae el sistema')).toHaveLength(15)
  })

  it('subir un dibujo lo manda con su tipo y su vista, y refresca la lista', async () => {
    hojas.subir.mockResolvedValue(propia)
    await montarApp('/hoja-recepcion')
    const sedan = await screen.findByRole('region', { name: 'Sedán' })
    await within(sedan).findAllByRole('button', { name: 'Subir el mío' })

    hojas.listar.mockResolvedValue({
      datos: vacias().datos.map((c) =>
        c.tipo === 'sedan' && c.vista === 'frente' ? { ...c, propia } : c,
      ),
    })

    const archivo = new File([new Uint8Array([1, 2, 3])], 'frente.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Elegir el dibujo de Sedán, frente'), archivo)

    await waitFor(() =>
      expect(hojas.subir).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sedan', vista: 'frente', imagen: archivo }),
      ),
    )
    // Y la casilla pasa a mostrar las medidas del dibujo propio.
    expect(await screen.findByText('1200×800 · 45 KB')).toBeDefined()
  })

  /**
   * Volver al del sistema no borra nada, y el aviso lo tiene que decir: hay órdenes firmadas
   * que muestran el dibujo viejo y se imprimen con él.
   */
  it('quitar avisa que las órdenes viejas lo siguen mostrando, y pregunta antes', async () => {
    hojas.listar.mockResolvedValue({
      datos: vacias().datos.map((c) =>
        c.tipo === 'sedan' && c.vista === 'frente' ? { ...c, propia } : c,
      ),
    })
    hojas.quitar.mockResolvedValue({ hecho: true })
    await montarApp('/hoja-recepcion')

    await userEvent.click((await screen.findAllByRole('button', { name: 'Quitar' }))[0] as Element)
    expect(await screen.findByText(/las órdenes que se recibieron con él/i)).toBeDefined()
    await confirmarDialogo('Volver al del sistema')

    await waitFor(() =>
      expect(hojas.quitar).toHaveBeenCalledWith({ tipo: 'sedan', vista: 'frente' }),
    )
  })

  /** Ver el dibujo es ver órdenes; cambiarlo es configurar el módulo, que es otra cosa. */
  it('el mecánico ve los dibujos y no los botones de cambiarlos', async () => {
    renovar.mockImplementation(async () => {
      usarSesion.getState().establecer(SESION_MECANICO)
      return true
    })
    await montarApp('/hoja-recepcion')
    expect(await screen.findByText('Sedán')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Subir el mío' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull()
  })
})
