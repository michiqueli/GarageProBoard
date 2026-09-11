import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Boton } from '../src/componentes/Boton.tsx'
import { PantallaOrdenes } from '../src/modulos/ordenes/PantallaOrdenes.tsx'
import { ProveedorTeclado } from '../src/teclado/index.ts'
import { conAncho } from './preparar.ts'

/**
 * El listado con su proveedor, que es como lo monta la aplicación una vez que hay
 * sesión. No se renderiza `<App />` porque eso arrancaría por el login y estos tests
 * son sobre el teclado y el listado, no sobre autenticarse.
 */
function montarOrdenes() {
  return render(
    <ProveedorTeclado modulo="ordenes">
      <PantallaOrdenes />
    </ProveedorTeclado>,
  )
}

afterEach(() => {
  cleanup()
  conAncho(1440)
})

describe('la pantalla se monta', () => {
  it('renderiza el listado con el shell y la barra de estado', () => {
    montarOrdenes()

    expect(screen.getByRole('heading', { name: 'Órdenes de trabajo', level: 1 })).toBeDefined()
    expect(screen.getByText('AB123CD')).toBeDefined()
    // El importe formateado a la argentina, no el string crudo de la base.
    expect(screen.getByText('1.140.200,00')).toBeDefined()
  })

  it('la barra de estado anuncia las teclas del contexto', () => {
    montarOrdenes()

    // Las globales, más la del módulo activo.
    expect(screen.getAllByText('F2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('F4').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cerrar la orden').length).toBeGreaterThan(0)
  })

  it('no muestra teclas de otros módulos', () => {
    montarOrdenes()
    expect(screen.queryByText('Facturar')).toBeNull()
    expect(screen.queryByText('Entregar el vehículo')).toBeNull()
  })
})

describe('el registro de atajos', () => {
  it('dispara la acción cuando se presiona su tecla', async () => {
    const guardar = vi.fn()
    render(
      <ProveedorTeclado>
        <Boton accion="global.guardar" onClick={guardar}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    await userEvent.keyboard('{F2}')
    expect(guardar).toHaveBeenCalledOnce()
  })

  it('el botón muestra la tecla que salió del mapa, no una escrita a mano', () => {
    render(
      <ProveedorTeclado diferencias={{ 'global.guardar': 'Ctrl+G' }}>
        <Boton accion="global.guardar" onClick={() => {}}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    // Se muestra en la forma legible, con el separador espaciado.
    expect(screen.getByText('Ctrl + G')).toBeDefined()
    expect(screen.queryByText('F2')).toBeNull()
  })

  it('respeta la reasignación del usuario al disparar', async () => {
    const guardar = vi.fn()
    render(
      <ProveedorTeclado diferencias={{ 'global.guardar': 'Ctrl+G' }}>
        <Boton accion="global.guardar" onClick={guardar}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    await userEvent.keyboard('{F2}')
    expect(guardar, 'F2 ya no debería hacer nada').not.toHaveBeenCalled()

    await userEvent.keyboard('{Control>}g{/Control}')
    expect(guardar).toHaveBeenCalledOnce()
  })

  it('no dispara una acción que esta pantalla no ofrece', async () => {
    const guardar = vi.fn()
    render(
      <ProveedorTeclado>
        <Boton accion="global.guardar" onClick={guardar}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    // F7 es Imprimir, que acá no está registrada: no tiene que romper nada.
    await userEvent.keyboard('{F7}')
    expect(guardar).not.toHaveBeenCalled()
  })

  it('guarda con F2 aunque el foco esté dentro de un campo', async () => {
    // Es el punto entero de que guardar sea una tecla de función: no hay que sacar
    // las manos del formulario para grabarlo.
    const guardar = vi.fn()
    render(
      <ProveedorTeclado>
        <input aria-label="Patente" />
        <Boton accion="global.guardar" onClick={guardar}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    await userEvent.click(screen.getByLabelText('Patente'))
    await userEvent.keyboard('AB123CD')
    await userEvent.keyboard('{F2}')

    expect(guardar).toHaveBeenCalledOnce()
    expect(screen.getByLabelText<HTMLInputElement>('Patente').value).toBe('AB123CD')
  })

  it('deja de escuchar cuando el botón se desmonta', async () => {
    const guardar = vi.fn()
    const { unmount } = render(
      <ProveedorTeclado>
        <Boton accion="global.guardar" onClick={guardar}>
          Guardar
        </Boton>
      </ProveedorTeclado>,
    )

    unmount()
    await userEvent.keyboard('{F2}')
    expect(guardar).not.toHaveBeenCalled()
  })
})

describe('el listado responsive', () => {
  it('en teléfono muestra tarjetas y no una tabla con scroll horizontal', () => {
    conAncho(390)
    montarOrdenes()

    expect(screen.queryByRole('table')).toBeNull()
    // La patente sigue estando, pero una sola vez: se renderiza una forma, no las dos.
    expect(screen.getAllByText('AB123CD')).toHaveLength(1)
    expect(screen.getByText('1.140.200,00')).toBeDefined()
  })

  it('en escritorio muestra la tabla densa', () => {
    conAncho(1440)
    montarOrdenes()

    expect(screen.getByRole('table')).toBeDefined()
    expect(screen.getAllByText('AB123CD')).toHaveLength(1)
  })
})
