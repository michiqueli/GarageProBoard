import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { confirmarDialogo, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

/**
 * El personal y sus credenciales.
 *
 * Lo que se prueba acá es lo que la pantalla decide sola: que el que no tiene credencial se
 * vea de lejos, que reemplazar una vigente **no se pueda hacer sin decir por qué** —porque
 * revoca la anterior— y que imprimir un lote no dispare sin preguntar. Las reglas las aplica
 * la API y se prueban allá.
 */

const personal = {
  listar: vi.fn(),
  opciones: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  emitirCredencial: vi.fn(),
  revocarCredencial: vi.fn(),
  pdfCredenciales: vi.fn(),
}
const padron = { consultar: vi.fn() }
const fichaje = { asistencia: vi.fn() }
const renovar = vi.fn()

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    padron: { consultar: (x: unknown) => padron.consultar(x) },
    fichaje: { asistencia: (x: unknown) => fichaje.asistencia(x) },
    personal: {
      listar: (x: unknown) => personal.listar(x),
      opciones: () => personal.opciones(),
      crear: (x: unknown) => personal.crear(x),
      editar: (x: unknown) => personal.editar(x),
      emitirCredencial: (x: unknown) => personal.emitirCredencial(x),
      revocarCredencial: (x: unknown) => personal.revocarCredencial(x),
      pdfCredenciales: (x: unknown) => personal.pdfCredenciales(x),
    },
  },
  renovar: () => renovar(),
}))

const CON_CREDENCIAL = {
  id: 'e1',
  tipoDocumento: 86,
  numeroDocumento: '20123456783',
  nombre: 'Jorge',
  apellido: 'Pérez',
  razonSocial: 'Pérez, Jorge',
  legajo: '0001',
  puesto: 'mecanico' as const,
  sucursalId: 's1',
  sucursal: 'Casa Central',
  convenio: 'SMATA',
  categoria: 'Oficial múltiple',
  fechaIngreso: '2020-03-01',
  fechaEgreso: null,
  email: null,
  telefono: null,
  activo: true,
  credencial: { id: 'c1', codigo: 'A7K2P9QX', emitidaEn: '2026-09-18T10:00:00.000Z' },
  usuario: { id: 'u2', email: 'taller@litoral.test' },
}

const SIN_CREDENCIAL = {
  ...CON_CREDENCIAL,
  id: 'e2',
  numeroDocumento: '20987654321',
  nombre: 'Rosa',
  apellido: 'Ledesma',
  razonSocial: 'Ledesma, Rosa',
  legajo: '0002',
  puesto: 'lavador' as const,
  credencial: null,
  usuario: null,
}

function entraComo(sesion: typeof SESION) {
  renovar.mockImplementation(async () => {
    usarSesion.getState().establecer(sesion)
    return true
  })
}

const fila = (nombre: string) => screen.getByText(nombre).closest('tr') as HTMLElement

beforeEach(() => {
  for (const f of [...Object.values(personal), padron.consultar, fichaje.asistencia, renovar])
    f.mockReset()
  fichaje.asistencia.mockResolvedValue({ fecha: '2026-09-18', datos: [] })
  usarSesion.getState().limpiar()
  personal.listar.mockResolvedValue({ datos: [SIN_CREDENCIAL, CON_CREDENCIAL], total: 2 })
  personal.opciones.mockResolvedValue({ sucursales: [{ id: 's1', nombre: 'Casa Central' }] })
})

afterEach(cleanup)

describe('el listado', () => {
  it('el que no tiene credencial se ve, y el que tiene dice desde cuándo', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    expect(within(fila('Ledesma, Rosa')).getByText('Sin credencial')).toBeDefined()
    expect(within(fila('Pérez, Jorge')).getByText('Vigente')).toBeDefined()
  })

  it('cuenta cuántos tienen credencial: es lo que falta imprimir', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')

    expect(await screen.findByText('2 · 1 con credencial')).toBeDefined()
  })

  it('el mecánico no tiene la sección en el menú', async () => {
    entraComo(SESION_MECANICO)
    await montarApp('/ordenes')

    await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
    expect(screen.queryByRole('link', { name: 'RRHH' })).toBeNull()
  })

  /**
   * La fila dibuja el cursor de «se abre» (`FILA_CLICABLE`). Estuvo prometiéndolo sin hacer
   * nada: la clase estaba y el manejador no. Un cursor que miente es peor que no tenerlo.
   */
  it('el clic en la fila abre al empleado, igual que Enter', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(screen.getByText('Pérez, Jorge'))

    expect(await screen.findByRole('form', { name: /Modificar a Pérez, Jorge/ })).toBeDefined()
  })

  it('el clic en la casilla de imprimir no abre la ficha', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Imprimir la credencial de Pérez, Jorge' }),
    )

    expect(screen.queryByRole('form', { name: /Modificar a/ })).toBeNull()
  })

  it('la pestaña de asistencia muestra quién entró, y quién sigue adentro', async () => {
    entraComo(SESION)
    fichaje.asistencia.mockResolvedValue({
      fecha: '2026-09-18',
      datos: [
        {
          id: 'j1',
          empleadoId: 'e1',
          nombre: 'Jorge Pérez',
          legajo: '0001',
          puesto: 'mecanico',
          fecha: '2026-09-18',
          entrada: '2026-09-18T11:12:00.000Z',
          salida: null,
          fuente: 'escaneo',
          minutos: null,
        },
      ],
    })
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(screen.getByRole('button', { name: 'Asistencia' }))

    expect(await screen.findByText('Jorge Pérez')).toBeDefined()
    expect(screen.getByText('Adentro')).toBeDefined()
  })

  it('un día sin marcas explica de dónde tendrían que salir', async () => {
    entraComo(SESION)
    fichaje.asistencia.mockResolvedValue({ fecha: '2026-09-18', datos: [] })
    await montarApp('/rrhh?ver=asistencia')

    expect(await screen.findByText(/reloj de la entrada/)).toBeDefined()
  })
})

describe('emitir la credencial', () => {
  it('al que no tiene, se emite sin más preguntas', async () => {
    entraComo(SESION)
    personal.emitirCredencial.mockResolvedValue({
      ...SIN_CREDENCIAL,
      credencial: { id: 'c2', codigo: 'BBBBBBBB', emitidaEn: '2026-09-18T11:00:00.000Z' },
    })
    await montarApp('/rrhh')
    await screen.findByText('Ledesma, Rosa')

    await userEvent.click(within(fila('Ledesma, Rosa')).getByRole('button', { name: 'Emitir' }))

    expect(personal.emitirCredencial).toHaveBeenCalledWith({ id: 'e2' })
  })

  /**
   * La regla que importa: emitir una nueva **revoca la que tenía**, así que no se hace sin
   * motivo. Es lo único que después explica por qué una tarjeta dejó de fichar un martes.
   */
  it('reemplazar una vigente pide el motivo antes de revocarla', async () => {
    entraComo(SESION)
    personal.emitirCredencial.mockResolvedValue(CON_CREDENCIAL)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(within(fila('Pérez, Jorge')).getByRole('button', { name: 'Reemplazar' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/deja de fichar en el momento/i)).toBeDefined()
    expect(personal.emitirCredencial).not.toHaveBeenCalled()

    await userEvent.type(within(dialogo).getByLabelText('Por qué se reemplaza'), 'La perdió')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Emitir una nueva' }))

    expect(personal.emitirCredencial).toHaveBeenCalledWith({ id: 'e1', motivo: 'La perdió' })
  })

  it('sin motivo escrito no se puede confirmar el reemplazo', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(within(fila('Pérez, Jorge')).getByRole('button', { name: 'Reemplazar' }))
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Emitir una nueva' }))

    expect(personal.emitirCredencial).not.toHaveBeenCalled()
  })
})

describe('revocar', () => {
  it('pide el motivo y deja al empleado sin poder fichar', async () => {
    entraComo(SESION)
    personal.revocarCredencial.mockResolvedValue({ ...CON_CREDENCIAL, credencial: null })
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(within(fila('Pérez, Jorge')).getByRole('button', { name: /^Revocar/ }))
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.type(within(dialogo).getByLabelText('Por qué se revoca'), 'Renunció')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Revocar' }))

    expect(personal.revocarCredencial).toHaveBeenCalledWith({ id: 'e1', motivo: 'Renunció' })
  })

  it('al que no tiene credencial no se le ofrece revocarla', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Ledesma, Rosa')

    expect(within(fila('Ledesma, Rosa')).queryByRole('button', { name: /^Revocar/ })).toBeNull()
  })
})

describe('imprimir', () => {
  it('sin nadie tildado pregunta antes, y dice cuántas son', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(screen.getByRole('button', { name: /Imprimir credenciales/ }))

    const dialogo = await screen.findByRole('alertdialog')
    // Una sola: la de Rosa no existe todavía y no sale en blanco.
    expect(within(dialogo).getByText(/¿Imprimir 1 credencial\?/)).toBeDefined()
    expect(personal.pdfCredenciales).not.toHaveBeenCalled()
  })

  it('los tildados se imprimen derecho, sin preguntar', async () => {
    entraComo(SESION)
    personal.pdfCredenciales.mockResolvedValue(new Blob(['%PDF-']))
    vi.spyOn(window, 'open').mockReturnValue(null)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Imprimir la credencial de Pérez, Jorge' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /Imprimir credenciales/ }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(personal.pdfCredenciales).toHaveBeenCalledWith({ ids: ['e1'] })
  })

  /**
   * Reimprimir la de uno solo, que es el caso de todos los días: se le rompió la funda, la
   * dejó en el otro pantalón. No hay que emitir otra —la credencial es la misma— ni tildar y
   * usar el botón de arriba.
   */
  it('cada fila con credencial se puede reimprimir sola', async () => {
    entraComo(SESION)
    personal.pdfCredenciales.mockResolvedValue(new Blob(['%PDF-']))
    vi.spyOn(window, 'open').mockReturnValue(null)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(within(fila('Pérez, Jorge')).getByRole('button', { name: 'Imprimir' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(personal.pdfCredenciales).toHaveBeenCalledWith({ ids: ['e1'] })
  })

  it('al que no tiene credencial no se le ofrece reimprimirla', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Ledesma, Rosa')

    expect(within(fila('Ledesma, Rosa')).queryByRole('button', { name: 'Imprimir' })).toBeNull()
  })

  it('al que no tiene credencial no se lo puede tildar para imprimir', async () => {
    entraComo(SESION)
    await montarApp('/rrhh')
    await screen.findByText('Ledesma, Rosa')

    const casilla = screen.getByRole('checkbox', {
      name: 'Imprimir la credencial de Ledesma, Rosa',
    }) as HTMLInputElement
    expect(casilla.disabled).toBe(true)
  })
})

describe('el alta', () => {
  it('trae el nombre de AFIP con el CUIL y lo separa en apellido y nombre', async () => {
    entraComo(SESION)
    padron.consultar.mockResolvedValue({
      cuit: '20123456783',
      razonSocial: 'GOMEZ, MARIA LAURA',
      tipoPersona: 'fisica',
      tipoClave: 'CUIL',
      activo: true,
      condicionIva: { codigo: 5, fuente: 'afip', motivo: '' },
      domicilio: null,
      origen: 'a13',
    })
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(screen.getByRole('button', { name: /Nuevo empleado/ }))
    const formulario = await screen.findByRole('form', { name: 'Nuevo empleado' })

    await userEvent.type(within(formulario).getByLabelText('CUIL'), '20123456783')
    await userEvent.click(within(formulario).getByRole('button', { name: /Traer el nombre/ }))

    expect((within(formulario).getByLabelText('Apellido') as HTMLInputElement).value).toBe('GOMEZ')
    expect((within(formulario).getByLabelText('Nombre') as HTMLInputElement).value).toBe(
      'MARIA LAURA',
    )
  })

  it('guarda con el legajo y el puesto elegidos', async () => {
    entraComo(SESION)
    personal.crear.mockResolvedValue(SIN_CREDENCIAL)
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(screen.getByRole('button', { name: /Nuevo empleado/ }))
    const formulario = await screen.findByRole('form', { name: 'Nuevo empleado' })

    await userEvent.type(within(formulario).getByLabelText('CUIL'), '20987654321')
    await userEvent.type(within(formulario).getByLabelText('Apellido'), 'Ledesma')
    await userEvent.type(within(formulario).getByLabelText('Nombre'), 'Rosa')
    await userEvent.type(within(formulario).getByLabelText('Legajo'), '0002')
    await userEvent.selectOptions(within(formulario).getByLabelText('Puesto'), 'Preparador')
    await userEvent.click(within(formulario).getByRole('button', { name: /Dar de alta/ }))

    expect(personal.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumento: 86,
        numeroDocumento: '20987654321',
        apellido: 'Ledesma',
        nombre: 'Rosa',
        legajo: '0002',
        puesto: 'lavador',
      }),
    )
  })
})

describe('la baja', () => {
  it('avisa que se le revoca la credencial antes de confirmar', async () => {
    entraComo(SESION)
    personal.editar.mockResolvedValue({ ...CON_CREDENCIAL, activo: false, credencial: null })
    await montarApp('/rrhh')
    await screen.findByText('Pérez, Jorge')

    await userEvent.click(within(fila('Pérez, Jorge')).getByRole('button', { name: 'Modificar' }))
    const formulario = await screen.findByRole('form', { name: /Modificar a Pérez, Jorge/ })
    await userEvent.click(within(formulario).getByLabelText(/Trabaja en la concesionaria/))
    await userEvent.click(within(formulario).getByRole('button', { name: /Guardar cambios/ }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/se le revoca la credencial/i)).toBeDefined()
    expect(personal.editar).not.toHaveBeenCalled()

    await confirmarDialogo('Dar de baja')
    expect(personal.editar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', activo: false }),
    )
  })
})
