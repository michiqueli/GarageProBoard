import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filasDeMatriz, leerPlanilla } from '../src/modulos/services/planilla.ts'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

const services = {
  listar: vi.fn(),
  ficha: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  previsualizar: vi.fn(),
  importar: vi.fn(),
}
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    services: {
      listar: (x: unknown) => services.listar(x),
      ficha: (x: unknown) => services.ficha(x),
      crear: (x: unknown) => services.crear(x),
      editar: (x: unknown) => services.editar(x),
      previsualizar: (x: unknown) => services.previsualizar(x),
      importar: (x: unknown) => services.importar(x),
    },
  },
  renovar: () => renovar(),
}))

const SERVICE = {
  id: '0b7e3f7a-5a8e-4c1b-9d9e-2f3c4b5a6d7e',
  marca: 'Renault',
  modelo: 'Kangoo',
  nombre: 'Service 10.000 km',
  kilometros: 10000,
  activo: true,
  trabajos: 2,
  repuestos: 1,
  minutos: 90,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

beforeEach(() => {
  for (const f of [...Object.values(services), renovar]) f.mockReset()
  usarSesion.getState().limpiar()
  services.listar.mockResolvedValue({ datos: [SERVICE], total: 1 })
  entraComo(SESION)
})

afterEach(cleanup)

describe('leer la planilla', () => {
  const TITULOS = ['Marca', 'Service', 'Tipo', 'Descripción', 'Minutos', 'Observaciones']

  it('el encabezado manda, y dice qué columnas no se usan', () => {
    const r = filasDeMatriz([TITULOS, ['Renault', 'Service', 'Trabajo', 'Aceite', 30, 'nota']])
    expect(r.ignoradas).toEqual(['Observaciones'])
    expect(r.filas[0]).toMatchObject({
      numero: 2,
      datos: { marca: 'Renault', descripcion: 'Aceite', minutos: '30', precio: '' },
    })
  })

  it('un decimal de Excel no se confunde con miles', () => {
    const r = filasDeMatriz([
      ['Service', 'Tipo', 'Descripción', 'Cantidad'],
      ['S', 'Repuesto', 'Aceite', 1.234],
    ])
    expect(r.filas[0]?.datos.cantidad).toBe('1,234')
  })

  it('el número de fila es el de la planilla, aunque haya renglones vacíos', () => {
    const r = filasDeMatriz([
      [null, null],
      ['Service', 'Tipo', 'Descripción'],
      ['S', 'Trabajo', 'Uno'],
      [null, null, null],
      ['S', 'Trabajo', 'Dos'],
    ])
    expect(r.filas.map((f) => f.numero)).toEqual([3, 5])
  })

  it('dice qué columna falta', () => {
    expect(() => filasDeMatriz([['Marca', 'Service']])).toThrow(/«Tipo», «Descripción»/)
  })

  it('un archivo sin filas lo dice', () => {
    expect(() => filasDeMatriz([])).toThrow(/vacío/)
    expect(() => filasDeMatriz([['Service', 'Tipo', 'Descripción']])).toThrow(/ninguna fila/)
  })
})

describe('un Excel de verdad', () => {
  it('lo que escribe la librería de la plantilla lo lee la de la importación', async () => {
    const { default: escribir } = await import('write-excel-file/browser')
    const blob = await escribir([
      ['Service', 'Tipo', 'Descripción', 'Cantidad', 'Minutos'].map((value) => ({ value })),
      ['Service 10.000 km', 'Trabajo', 'Aceite', 1.5, 30].map((value) => ({ value })),
    ]).toBlob()

    const { filas } = await leerPlanilla(new File([blob], 'services.xlsx'))

    expect(filas[0]).toMatchObject({
      numero: 2,
      datos: { service: 'Service 10.000 km', cantidad: '1,5', minutos: '30' },
    })
  })
})

describe('el listado', () => {
  it('muestra para qué es y cuánto debería llevar', async () => {
    await montarApp('/taller/services')

    expect(await screen.findByRole('link', { name: 'Service 10.000 km' })).toBeDefined()
    expect(screen.getByText('Renault Kangoo')).toBeDefined()
    expect(screen.getByText('1 h 30 min')).toBeDefined()
  })

  it('en el menú se marca el Catálogo, y no también Taller', async () => {
    await montarApp('/taller/services')
    const catalogo = await screen.findByRole('link', { name: 'Catálogo de services' })

    expect(catalogo.className).toMatch(/bg-marca-suave/)
    expect(screen.getByRole('link', { name: 'Taller' }).className).not.toMatch(/bg-marca-suave/)
  })

  it('el mecánico lo mira, sin cargar ni importar', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/taller/services')

    expect(await screen.findByText('Service 10.000 km')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Service 10.000 km' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Importar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Nuevo service/ })).toBeNull()
  })
})

describe('a mano', () => {
  it('guarda con sus renglones, con los decimales como se escriben acá', async () => {
    services.crear.mockResolvedValue({ ...SERVICE, renglones: [] })
    const router = await montarApp('/taller/services/nuevo')

    await userEvent.type(await screen.findByLabelText('Marca'), 'Fiat')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Service 20.000 km')
    const renglon = screen.getByRole('listitem', { name: 'Renglón 1' })
    await userEvent.type(within(renglon).getByLabelText('Descripción'), 'Bujías')
    const cantidad = within(renglon).getByLabelText('Cantidad')
    await userEvent.clear(cantidad)
    await userEvent.type(cantidad, '1,5')
    await userEvent.type(within(renglon).getByLabelText('Minutos'), '45')
    await userEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(() =>
      expect(services.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          marca: 'Fiat',
          modelo: null,
          nombre: 'Service 20.000 km',
          renglones: [expect.objectContaining({ cantidad: '1.5', minutos: 45 })],
        }),
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/taller/services'))
  })

  it('sin nombre no se guarda', async () => {
    await montarApp('/taller/services/nuevo')
    const guardar = (await screen.findByRole('button', { name: /Guardar/ })) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
  })

  it('apagar pregunta antes', async () => {
    services.ficha.mockResolvedValue({
      ...SERVICE,
      renglones: [
        {
          id: 'r1',
          tipo: 'trabajo',
          repuestoId: null,
          codigo: null,
          descripcion: 'Aceite',
          cantidad: '1.0000',
          precioUnitario: '100.0000',
          codigoAlicuota: 5,
          minutos: 30,
        },
      ],
    })
    services.editar.mockResolvedValue({ ...SERVICE, renglones: [] })
    await montarApp(`/taller/services/${SERVICE.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }))
    expect(services.editar).not.toHaveBeenCalled()
    await confirmarDialogo('Apagar')

    await waitFor(() =>
      expect(services.editar).toHaveBeenCalledWith(expect.objectContaining({ activo: false })),
    )
  })
})

describe('el wizard de importación', () => {
  const CSV = [
    'Marca;Modelo;Service;Kilómetros;Tipo;Descripción;Código;Cantidad;Minutos;Precio',
    'Renault;Kangoo;Service 10.000 km;10000;Trabajo;Aceite;;1;30;20000',
    'Renault;Kangoo;Service 10.000 km;10000;Cualquiera;Filtro;;1;;',
  ].join('\n')

  const PREVIEW = {
    filas: [
      { errores: {}, avisos: {} },
      { errores: {}, avisos: { codigo: 'Sin código: se carga como texto y no descuenta stock' } },
    ],
    services: [
      {
        marca: 'Renault',
        modelo: 'Kangoo',
        nombre: 'Service 10.000 km',
        accion: 'reemplaza',
        trabajos: 1,
        repuestos: 1,
        minutos: 30,
      },
    ],
  }

  async function hastaElPreview() {
    services.previsualizar.mockResolvedValue(PREVIEW)
    const router = await montarApp('/taller/services/importar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ya tengo el archivo' }))
    const archivo = new File([CSV], 'services.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText(/Elegí el archivo/), archivo)
    await screen.findByRole('region', { name: 'Filas' })
    return router
  }

  it('arranca por la plantilla, y marca el paso en el que está', async () => {
    await montarApp('/taller/services/importar')

    expect(await screen.findByRole('button', { name: 'Plantilla de Excel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Plantilla CSV' })).toBeDefined()
    const actual = screen
      .getByRole('list', { name: 'Pasos' })
      .querySelector('[aria-current="step"]')
    expect(actual?.textContent).toMatch(/Bajá la plantilla/)
  })

  it('un archivo que no sirve se explica, y no avanza', async () => {
    await montarApp('/taller/services/importar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ya tengo el archivo' }))
    await userEvent.upload(
      screen.getByLabelText(/Elegí el archivo/),
      new File(['Marca;Otra\nx;y'], 'mal.csv', { type: 'text/csv' }),
    )

    expect((await screen.findByRole('alert')).textContent).toMatch(/«Service»/)
    expect(screen.queryByRole('region', { name: 'Filas' })).toBeNull()
  })

  it('marca el error en su celda, no deja importar, y se corrige ahí mismo', async () => {
    const router = await hastaElPreview()
    services.importar.mockResolvedValue({ creados: 0, reemplazados: 1 })

    const tipo = screen.getByLabelText('Tipo de la fila 3') as HTMLInputElement
    expect(tipo.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Poné «Trabajo» o «Repuesto»')).toBeDefined()
    expect(screen.getByText(/1 con errores/)).toBeDefined()
    const importar = screen.getByRole('button', { name: /^Importar/ }) as HTMLButtonElement
    expect(importar.disabled).toBe(true)
    expect(services.importar).not.toHaveBeenCalled()

    await userEvent.clear(tipo)
    await userEvent.type(tipo, 'Repuesto')

    expect(tipo.getAttribute('aria-invalid')).toBe('false')
    expect(await screen.findByText('Sin errores')).toBeDefined()
    // El aviso no frena: se puede importar igual, y dice que ya existía.
    expect(await screen.findByText(/Sin código/)).toBeDefined()
    expect(
      within(await screen.findByRole('list', { name: 'Qué va a pasar' })).getByText('Reemplaza'),
    ).toBeDefined()
    await waitFor(() => expect(importar.disabled).toBe(false))

    await userEvent.click(importar)
    expect(services.importar).not.toHaveBeenCalled()
    await confirmarDialogo('Importar')

    await waitFor(() => expect(services.importar).toHaveBeenCalledTimes(1))
    const enviadas = services.importar.mock.calls[0]?.[0].filas
    expect(enviadas[1]).toMatchObject({ tipo: 'Repuesto', descripcion: 'Filtro' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/taller/services'))
  })

  it('quitar una fila pregunta, y la saca de lo que se importa', async () => {
    await hastaElPreview()

    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[1] as HTMLElement)
    await confirmarDialogo('Quitar')

    await waitFor(() => expect(screen.queryByLabelText('Tipo de la fila 3')).toBeNull())
    expect(await screen.findByText('Sin errores')).toBeDefined()
  })

  it('↓ baja a la misma columna de la fila siguiente', async () => {
    await hastaElPreview()

    const arriba = screen.getByLabelText('Descripción de la fila 2')
    arriba.focus()
    await userEvent.keyboard('{ArrowDown}')

    expect(document.activeElement).toBe(screen.getByLabelText('Descripción de la fila 3'))
  })
})
