import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const hojas = { listar: vi.fn(), subir: vi.fn(), imagen: vi.fn(), quitar: vi.fn() }
const revision = { listar: vi.fn(), crear: vi.fn(), editar: vi.fn(), mover: vi.fn() }
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
    revision: {
      listar: () => revision.listar(),
      crear: (x: unknown) => revision.crear(x),
      editar: (x: unknown) => revision.editar(x),
      mover: (x: unknown) => revision.mover(x),
    },
  },
  renovar: () => renovar(),
}))

const TIPOS = ['sedan', 'hatchback', 'suv', 'pickup'] as const

/** Los cuatro dibujos, todos con el del sistema: así arranca un taller nuevo. */
const vacias = () => ({ datos: TIPOS.map((tipo) => ({ tipo, propia: null })) })

const propia = {
  id: '77777777-7777-4777-8777-777777777777',
  tipo: 'sedan' as const,
  formato: 'image/png' as const,
  ancho: 1200,
  alto: 800,
  bytes: 46080,
  creadoEn: '2026-09-29T12:00:00.000Z',
  creadoPor: null,
}

/** Dos puntos de motor y uno de la sección que se completa en el taller. */
const PUNTOS = [
  { id: 'a0000000-0000-4000-8000-000000000001', seccion: 'motor', nombre: 'Correas' },
  { id: 'a0000000-0000-4000-8000-000000000002', seccion: 'motor', nombre: 'Estado de batería' },
  { id: 'a0000000-0000-4000-8000-000000000003', seccion: 'dinamica', nombre: 'Escape' },
].map((p, i) => ({ ...p, orden: i + 1, activo: true, propio: false }))

beforeEach(() => {
  for (const f of [...Object.values(hojas), ...Object.values(revision), renovar]) f.mockReset()
  revision.listar.mockResolvedValue({ datos: PUNTOS })
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
  it('muestra un dibujo por carrocería, y los que no son propios usan el del sistema', async () => {
    await montarApp('/hoja-recepcion')
    const dibujos = await screen.findByRole('list', { name: 'Dibujos' })

    expect(within(dibujos).getAllByRole('listitem')).toHaveLength(4)
    for (const tipo of ['Sedán', 'Hatchback', 'SUV', 'Pickup']) {
      expect(within(dibujos).getByRole('heading', { name: tipo })).toBeDefined()
    }
    expect(within(dibujos).getAllByText('Del sistema')).toHaveLength(4)
  })

  it('subir un dibujo lo manda con su tipo, y refresca la lista', async () => {
    hojas.subir.mockResolvedValue(propia)
    await montarApp('/hoja-recepcion')
    await screen.findAllByRole('button', { name: 'Subir el mío' })

    hojas.listar.mockResolvedValue({
      datos: vacias().datos.map((c) => (c.tipo === 'sedan' ? { ...c, propia } : c)),
    })

    const archivo = new File([new Uint8Array([1, 2, 3])], 'frente.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Elegir el dibujo de Sedán'), archivo)

    await waitFor(() =>
      expect(hojas.subir).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sedan', imagen: archivo }),
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
      datos: vacias().datos.map((c) => (c.tipo === 'sedan' ? { ...c, propia } : c)),
    })
    hojas.quitar.mockResolvedValue({ hecho: true })
    await montarApp('/hoja-recepcion')

    await userEvent.click((await screen.findAllByRole('button', { name: 'Quitar' }))[0] as Element)
    expect(await screen.findByText(/las órdenes que se recibieron con él/i)).toBeDefined()
    await confirmarDialogo('Volver al del sistema')

    await waitFor(() => expect(hojas.quitar).toHaveBeenCalledWith({ tipo: 'sedan' }))
  })

  it('los puntos de la revisión van por sección, y la del taller dice que es después', async () => {
    await montarApp('/hoja-recepcion')
    const motor = await screen.findByRole('region', { name: 'Motor' })
    expect(within(motor).getByText('Correas')).toBeDefined()
    const dinamica = screen.getByRole('region', { name: 'Inspección dinámica' })
    expect(within(dinamica).getByText('Se completa en el taller, con prueba de ruta')).toBeDefined()
    // En la punta no se sube, y en el fondo no se baja.
    const [subir] = within(motor).getAllByRole('button', { name: 'Subir' })
    expect(subir).toHaveProperty('disabled', true)
  })

  it('agregar un punto pregunta qué se revisa y lo manda a su sección', async () => {
    revision.crear.mockResolvedValue({ datos: PUNTOS })
    await montarApp('/hoja-recepcion')
    const motor = await screen.findByRole('region', { name: 'Motor' })
    await userEvent.click(within(motor).getByRole('button', { name: 'Agregar' }))
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.type(within(dialogo).getByLabelText('Qué se revisa'), 'Equipo de GNC')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))
    await waitFor(() =>
      expect(revision.crear).toHaveBeenCalledWith({ seccion: 'motor', nombre: 'Equipo de GNC' }),
    )
  })

  it('apagar un punto pregunta antes, y dice que las órdenes viejas lo siguen mostrando', async () => {
    revision.editar.mockResolvedValue({ datos: PUNTOS })
    await montarApp('/hoja-recepcion')
    const motor = await screen.findByRole('region', { name: 'Motor' })
    await userEvent.click(
      within(motor).getAllByRole('button', { name: 'Apagar' })[0] as HTMLElement,
    )
    const dialogo = await confirmarDialogo('Dejar de revisarlo')
    expect(dialogo.textContent).toMatch(/lo siguen mostrando/)
    await waitFor(() =>
      expect(revision.editar).toHaveBeenCalledWith({
        id: PUNTOS[0]?.id,
        nombre: 'Correas',
        activo: false,
      }),
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
    // Y los puntos, igual: los ve, no los toca.
    expect(await screen.findByText('Correas')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull()
  })
})
