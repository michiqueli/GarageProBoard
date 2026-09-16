import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BotonCopiar } from '../src/componentes/Copiar.tsx'
import { Notificaciones } from '../src/componentes/Notificaciones.tsx'

const escribir = vi.fn()

beforeEach(() => {
  escribir.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  // userEvent instala su propio portapapeles: se pisa después de montar.
})

afterEach(cleanup)

describe('copiar patente y chasis', () => {
  it('copia el valor sin espacios y avisa', async () => {
    render(
      <>
        <BotonCopiar valor="8AJFB8CD5N1234567" que="Chasis" />
        <Notificaciones />
      </>,
    )
    const usuario = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribir },
      configurable: true,
    })

    await usuario.click(screen.getByRole('button', { name: 'Copiar chasis 8AJFB8CD5N1234567' }))

    expect(escribir).toHaveBeenCalledWith('8AJFB8CD5N1234567')
    expect(
      await screen.findByRole('listitem', { name: 'Listo: Chasis 8AJFB8CD5N1234567 copiado' }),
    ).toBeDefined()
  })

  it('si no se puede copiar, dice cómo hacerlo a mano', async () => {
    render(
      <>
        <BotonCopiar valor="AE123BC" que="Patente" />
        <Notificaciones />
      </>,
    )
    const usuario = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('sin permiso')) },
      configurable: true,
    })
    document.execCommand = vi.fn(() => false)

    await act(() => usuario.click(screen.getByRole('button', { name: 'Copiar patente AE123BC' })))

    expect(
      await screen.findByText('No se pudo copiar. Seleccioná la patente y usá Ctrl + C.'),
    ).toBeDefined()
  })
})
