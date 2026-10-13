import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Firma } from '../src/componentes/Firma.tsx'
import { ProveedorTeclado } from '../src/teclado/index.ts'

/**
 * El lienzo de la firma. jsdom no dibuja, así que se prueba lo que la pantalla decide: dónde se
 * firma, que borrar arranca de cero y que avisa con `null`.
 */

afterEach(cleanup)

describe('la firma', () => {
  it('se ve dónde firmar, y borrar sólo se puede después de firmar', async () => {
    const alCambiar = vi.fn()
    render(
      <ProveedorTeclado>
        <Firma etiqueta="Firma del cliente" alCambiar={alCambiar} />
      </ProveedorTeclado>,
    )

    expect(screen.getByLabelText('Firma del cliente')).toBeDefined()
    expect(screen.getByText('Firmá acá')).toBeDefined()
    const borrar = screen.getByRole('button', { name: 'Borrar y firmar de nuevo' })
    expect((borrar as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(borrar)
    expect(alCambiar).not.toHaveBeenCalled()
  })
})
