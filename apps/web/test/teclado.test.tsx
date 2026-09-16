import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Boton } from '../src/componentes/Boton.tsx'
import { usarSesion } from '../src/sesion/almacen.ts'
import { ProveedorTeclado } from '../src/teclado/index.ts'
import { montarApp, SESION } from './montar.tsx'
import { conAncho } from './preparar.ts'

/**
 * La pantalla de OT tal como la monta la aplicación: por su dirección, con una sesión
 * ya abierta. La pantalla del teclado la pone la ruta, así que se prueba también que la
 * ruta lo declare bien.
 */
async function montarOrdenes() {
  usarSesion.getState().entrar(SESION)
  await montarApp('/ordenes')
  await screen.findByRole('heading', { name: 'Órdenes de trabajo', level: 1 })
}

beforeEach(() => usarSesion.getState().limpiar())

afterEach(() => {
  cleanup()
  conAncho(1440)
})

describe('la pantalla se monta', () => {
  it('renderiza el listado con el shell y la barra de estado', async () => {
    await montarOrdenes()

    expect(screen.getByText('AB123CD')).toBeDefined()
    // El importe formateado a la argentina, no el string crudo de la base.
    expect(screen.getByText('1.140.200,00')).toBeDefined()
  })

  it('la barra de estado anuncia las teclas del contexto', async () => {
    await montarOrdenes()

    // Las globales, más la de la pantalla activa.
    expect(screen.getAllByText('F2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('F4').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cerrar la orden').length).toBeGreaterThan(0)
  })

  it('no muestra teclas de otras pantallas', async () => {
    await montarOrdenes()
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
  it('en teléfono muestra tarjetas y no una tabla con scroll horizontal', async () => {
    conAncho(390)
    await montarOrdenes()

    expect(screen.queryByRole('table')).toBeNull()
    // La patente sigue estando, pero una sola vez: se renderiza una forma, no las dos.
    expect(screen.getAllByText('AB123CD')).toHaveLength(1)
    expect(screen.getByText('1.140.200,00')).toBeDefined()
  })

  it('en escritorio muestra la tabla densa', async () => {
    conAncho(1440)
    await montarOrdenes()

    expect(screen.getByRole('table')).toBeDefined()
    expect(screen.getAllByText('AB123CD')).toHaveLength(1)
  })
})
