import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmar, DURACION_MS, notificar } from '../src/componentes/avisos.ts'
import { Boton } from '../src/componentes/Boton.tsx'
import { DialogoConfirmacion } from '../src/componentes/DialogoConfirmacion.tsx'
import { Notificaciones } from '../src/componentes/Notificaciones.tsx'
import { ProveedorTeclado } from '../src/teclado/index.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function montar(guardar = vi.fn()) {
  render(
    <ProveedorTeclado>
      <button type="button">Dar de baja</button>
      <Boton accion="global.guardar" onClick={guardar}>
        Guardar
      </Boton>
      <Notificaciones />
      <DialogoConfirmacion />
    </ProveedorTeclado>,
  )
  return guardar
}

describe('la confirmación', () => {
  it('en una baja, el foco arranca en Cancelar: un Enter de más no da de baja a nadie', async () => {
    montar()
    let respuesta: Promise<boolean> | undefined
    act(() => {
      respuesta = confirmar({
        titulo: '¿Dar de baja a Juan?',
        confirmar: 'Dar de baja',
        peligro: true,
      })
    })

    const dialogo = await screen.findByRole('alertdialog', { name: '¿Dar de baja a Juan?' })
    expect(document.activeElement?.textContent).toMatch(/^Cancelar/)
    await userEvent.keyboard('{Enter}')
    expect(await respuesta).toBe(false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(dialogo).toBeDefined()
  })

  it('Tab no se escapa del diálogo, y Enter sobre el botón confirma', async () => {
    montar()
    let respuesta: Promise<boolean> | undefined
    act(() => {
      respuesta = confirmar({ titulo: '¿Seguro?', confirmar: 'Sí, hacerlo', peligro: true })
    })
    const dialogo = await screen.findByRole('alertdialog')

    await userEvent.tab()
    expect(document.activeElement).toBe(
      within(dialogo).getByRole('button', { name: 'Sí, hacerlo' }),
    )
    await userEvent.tab()
    expect(document.activeElement?.textContent).toMatch(/^Cancelar/)
    await userEvent.tab({ shift: true })
    await userEvent.keyboard('{Enter}')
    expect(await respuesta).toBe(true)
  })

  it('Esc cancela, y los atajos de la pantalla de atrás no disparan mientras está abierta', async () => {
    const guardar = montar()
    let respuesta: Promise<boolean> | undefined
    act(() => {
      respuesta = confirmar({ titulo: '¿Desactivar?', confirmar: 'Desactivar' })
    })
    await screen.findByRole('alertdialog')

    await userEvent.keyboard('{F2}')
    expect(guardar).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(await respuesta).toBe(false)

    await userEvent.keyboard('{F2}')
    expect(guardar).toHaveBeenCalledOnce()
  })
})

describe('las notificaciones', () => {
  it('lo que salió bien se va solo; el error queda hasta que se cierra', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    montar()
    act(() => {
      notificar.ok('Cliente guardado')
      notificar.error('No se pudo guardar', { detalle: 'Probá de nuevo' })
    })

    const listas = {
      ok: screen.getByRole('list', { name: 'Notificaciones' }),
      error: screen.getByRole('list', { name: 'Errores' }),
    }
    expect(
      within(listas.ok).getByRole('listitem', { name: 'Listo: Cliente guardado' }),
    ).toBeDefined()
    expect(within(listas.error).getByText('Probá de nuevo')).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(DURACION_MS + 100)
    })
    expect(within(listas.ok).queryByRole('listitem')).toBeNull()
    const error = within(listas.error).getByRole('listitem', { name: 'Error: No se pudo guardar' })

    vi.useRealTimers()
    await userEvent.click(within(error).getByRole('button', { name: 'Cerrar' }))
    expect(within(listas.error).queryByRole('listitem')).toBeNull()
  })

  it('una acción en la notificación la ejecuta y la cierra', async () => {
    montar()
    const abrir = vi.fn()
    act(() => {
      notificar.error('Ya está cargado', { accion: { texto: 'Abrir su ficha', alHacer: abrir } })
    })
    await userEvent.click(screen.getByRole('button', { name: 'Abrir su ficha' }))
    expect(abrir).toHaveBeenCalledOnce()
    expect(screen.queryByText('Ya está cargado')).toBeNull()
  })
})
