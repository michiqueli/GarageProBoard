import { atajosParaSembrar } from '@gpb/core'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarSesion } from '../src/sesion/almacen.ts'
import { EN_NORTE, montarApp, SESION, SESION_MECANICO } from './montar.tsx'

/**
 * Configuración: las preferencias y las teclas rápidas.
 *
 * Lo que importa acá es que el cambio se vea **en el momento** —el tema y la densidad se
 * estampan en la raíz, la tecla nueva aparece en los botones— y que una combinación que no
 * sirve se rechace diciendo por qué, en vez de guardarse y dejar un teclado que hace cosas
 * al azar.
 */

const configuracion = { guardar: vi.fn(), guardarAtajos: vi.fn() }

vi.mock('../src/sesion/cliente.ts', () => ({
  api: {
    auth: { iniciar: vi.fn(), cerrar: vi.fn().mockResolvedValue({}), cambiarSucursal: vi.fn() },
    configuracion: {
      guardar: (x: unknown) => configuracion.guardar(x),
      guardarAtajos: (x: unknown) => configuracion.guardarAtajos(x),
    },
  },
  renovar: vi.fn().mockResolvedValue(false),
}))

const DE_FABRICA = Object.fromEntries(atajosParaSembrar().map((a) => [a.accion, a.tecla]))

beforeEach(() => {
  for (const f of Object.values(configuracion)) f.mockReset()
  usarSesion.getState().limpiar()
  delete document.documentElement.dataset.densidad
  configuracion.guardar.mockImplementation(async (entrada: Record<string, unknown>) => entrada)
  configuracion.guardarAtajos.mockImplementation(
    async ({ atajos }: { atajos: Record<string, string> }) => ({
      atajos: { ...DE_FABRICA, ...atajos },
    }),
  )
})

afterEach(cleanup)

async function abrir(ruta = '/configuracion', sesion: typeof SESION = SESION) {
  usarSesion.getState().entrar(sesion)
  const router = await montarApp(ruta)
  await screen.findByRole('heading', { name: 'Configuración', level: 1 })
  return router
}

const guardar = () => screen.getByRole('button', { name: /^Guardar/ })

describe('la pantalla', () => {
  it('está en el menú y no pide ningún permiso', async () => {
    // Un mecánico no ve ni un cliente, pero el tema de su pantalla es suyo: si esto pidiera
    // permiso, el gerente le estaría eligiendo las teclas al de al lado.
    await abrir('/configuracion', SESION_MECANICO)

    expect(screen.getByRole('tab', { name: 'Generales' })).toBeTruthy()
    expect(guardar()).toBeTruthy()
  })

  it('la dirección elige la pestaña, para que el buscador lleve derecho a las teclas', async () => {
    await abrir('/configuracion?ver=teclas')

    expect(screen.getByRole('tab', { name: 'Teclas rápidas' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Caja y facturación' })).toBeTruthy()
  })

  it('las flechas pasan de una pestaña a la otra', async () => {
    const router = await abrir()

    await userEvent.keyboard('{ArrowRight}')
    await screen.findByRole('heading', { name: 'Generales', level: 2 })
    expect(router.state.location.search).toEqual({ ver: 'teclas' })
  })
})

describe('preferencias', () => {
  it('el tema se guarda y se ve en el momento', async () => {
    await abrir()

    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    await userEvent.click(guardar())

    expect(configuracion.guardar).toHaveBeenCalledWith({
      tema: 'claro',
      densidad: 'compacta',
      filasPorPagina: 50,
      sucursalPredeterminadaId: null,
    })
    // No hace falta recargar: la sesión es la fuente de verdad y el tema sale de ahí.
    await vi.waitFor(() => expect(document.documentElement.dataset.tema).toBe('claro'))
  })

  it('la densidad cómoda estampa el atributo que sube el alto de fila', async () => {
    await abrir()

    await userEvent.click(screen.getByRole('radio', { name: /Cómoda/ }))
    await userEvent.click(guardar())

    await vi.waitFor(() => expect(document.documentElement.dataset.densidad).toBe('comoda'))
  })

  it('sin cambios no hay nada que guardar', async () => {
    await abrir()
    expect(guardar().hasAttribute('disabled')).toBe(true)
  })

  it('las filas fuera de rango se marcan al salir del campo, no mientras se escribe', async () => {
    await abrir()
    const campo = screen.getByLabelText('Filas por página')

    await userEvent.clear(campo)
    await userEvent.type(campo, '5')
    // Todavía escribiendo: marcarlo en rojo acá es hostil.
    expect(screen.queryByText('Entre 10 y 200 filas.')).toBeNull()

    await userEvent.tab()
    expect(screen.getByText('Entre 10 y 200 filas.')).toBeTruthy()
    expect(guardar().hasAttribute('disabled')).toBe(true)
    expect(configuracion.guardar).not.toHaveBeenCalled()
  })

  it('con una sola sucursal no hay nada que elegir', async () => {
    await abrir()

    expect(screen.queryByLabelText('Al entrar')).toBeNull()
    expect(screen.getByText(/Entrás siempre a Casa Central/)).toBeTruthy()
  })

  it('con varias, elegir una deja de preguntar al entrar', async () => {
    await abrir('/configuracion', EN_NORTE)

    await userEvent.selectOptions(screen.getByLabelText('Al entrar'), 'Entrar a Taller Norte')
    await userEvent.click(guardar())

    expect(configuracion.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalPredeterminadaId: 's2' }),
    )
  })
})

/**
 * La fila de una acción, con su tecla y sus botones.
 *
 * Busca el nombre en el `<b>` de la fila y no en cualquier texto: «Guardar» es además el
 * botón de esta pantalla y una acción del catálogo, y sin acotar la búsqueda encuentra los
 * dos.
 */
function filaDe(etiqueta: string): HTMLElement {
  const panel = screen.getByRole('tabpanel')
  const fila = within(panel).getByText(etiqueta, { selector: 'b' }).closest('li')
  if (!fila) throw new Error(`No hay fila para ${etiqueta}`)
  return fila
}

async function cambiarTeclaDe(etiqueta: string, teclas: string) {
  await userEvent.click(within(filaDe(etiqueta)).getByRole('button', { name: 'Cambiar' }))
  const dialogo = await screen.findByRole('dialog')
  await userEvent.keyboard(teclas)
  return dialogo
}

describe('teclas rápidas', () => {
  it('muestra cada acción agrupada por pantalla, con la tecla que rige', async () => {
    await abrir('/configuracion?ver=teclas')

    expect(within(filaDe('Guardar')).getByText('F2')).toBeTruthy()
    expect(within(filaDe('Facturar')).getByText('F4')).toBeTruthy()
  })

  it('la fija se muestra y no se puede cambiar', async () => {
    await abrir('/configuracion?ver=teclas')
    const fila = filaDe('Cancelar')

    expect(within(fila).getByText('Esc')).toBeTruthy()
    expect(within(fila).queryByRole('button', { name: 'Cambiar' })).toBeNull()
  })

  it('se elige apretando la combinación', async () => {
    await abrir('/configuracion?ver=teclas')

    await cambiarTeclaDe('Guardar', '{Control>}g{/Control}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(filaDe('Guardar')).getByText('Ctrl + G')).toBeTruthy()

    await userEvent.click(guardar())
    // Sólo la diferencia: guardar el mapa entero congelaría las teclas de hoy en la base.
    expect(configuracion.guardarAtajos).toHaveBeenCalledWith({
      atajos: { 'global.guardar': 'Ctrl+G' },
    })
  })

  it('la tecla nueva aparece en los botones sin recargar', async () => {
    await abrir('/configuracion?ver=teclas')

    await cambiarTeclaDe('Guardar', '{Control>}g{/Control}')
    await userEvent.click(guardar())

    // El botón de Guardar de esta misma pantalla ya la dibuja: sale del mapa de la sesión.
    await vi.waitFor(() => expect(within(guardar()).getByText('Ctrl + G')).toBeTruthy())
  })

  it('mientras se elige, la tecla no dispara su acción', async () => {
    await abrir('/configuracion?ver=teclas')

    // F2 acá elige F2, no guarda: el diálogo es modal y el registro de atajos no escucha.
    await cambiarTeclaDe('Refrescar', '{F2}')

    expect(configuracion.guardarAtajos).not.toHaveBeenCalled()
  })

  it('rechaza la que el navegador se queda, con el motivo escrito', async () => {
    await abrir('/configuracion?ver=teclas')

    const dialogo = await cambiarTeclaDe('Guardar', '{F12}')

    expect(within(dialogo).getByRole('alert').textContent).toContain('F12')
    // Sigue abierto: no se eligió nada.
    expect(within(filaDe('Guardar')).getByText('F2')).toBeTruthy()
  })

  it('rechaza la que ya está en otra acción, y dice en cuál', async () => {
    await abrir('/configuracion?ver=teclas')

    const dialogo = await cambiarTeclaDe('Facturar', '{F3}')

    expect(within(dialogo).getByRole('alert').textContent).toContain('Buscar')
  })

  it('Esc deja la tecla como estaba', async () => {
    await abrir('/configuracion?ver=teclas')

    await cambiarTeclaDe('Guardar', '{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(filaDe('Guardar')).getByText('F2')).toBeTruthy()
  })

  it('cada fila cambiada puede volver sola a su valor de fábrica', async () => {
    await abrir('/configuracion?ver=teclas')

    await cambiarTeclaDe('Guardar', '{Control>}g{/Control}')
    await userEvent.click(within(filaDe('Guardar')).getByRole('button', { name: 'Volver a F2' }))

    expect(within(filaDe('Guardar')).getByText('F2')).toBeTruthy()
    expect(guardar().hasAttribute('disabled')).toBe(true)
  })

  it('restaurar todas vuelve el mapa entero a fábrica', async () => {
    usarSesion.getState().entrar({ ...SESION, atajos: { 'global.guardar': 'Ctrl+G' } })
    await montarApp('/configuracion?ver=teclas')
    await screen.findByRole('heading', { name: 'Configuración', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Volver a las de fábrica' }))
    await userEvent.click(guardar())

    expect(configuracion.guardarAtajos).toHaveBeenCalledWith({ atajos: {} })
  })
})
