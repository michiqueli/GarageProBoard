import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useCacheDeSesion } from '../src/ganchos/useCacheDeSesion.ts'

afterEach(cleanup)

function Sonda({ usuarioId }: { usuarioId: string | undefined }) {
  useCacheDeSesion(usuarioId)
  return null
}

function montar(cliente: QueryClient, hijo: ReactNode) {
  return render(<QueryClientProvider client={cliente}>{hijo}</QueryClientProvider>)
}

/**
 * La regresión que motivó este gancho: cerrar sesión, entrar con otro usuario y ver
 * durante medio minuto los datos del anterior.
 *
 * En una concesionaria la computadora del mostrador es compartida y el cambio de turno
 * es exactamente este caso. Aunque el servidor nunca entregue un dato ajeno, una
 * pantalla que lo muestra por caché parece una fuga — y quien la ve no tiene forma de
 * distinguir una cosa de la otra.
 */
describe('la caché no sobrevive a un cambio de usuario', () => {
  it('se tira cuando entra otra persona', () => {
    const cliente = new QueryClient()
    cliente.setQueryData(['vehiculos'], { total: 5 })

    const { rerender } = montar(cliente, <Sonda usuarioId="usuario-a" />)
    expect(cliente.getQueryData(['vehiculos'])).toEqual({ total: 5 })

    rerender(
      <QueryClientProvider client={cliente}>
        <Sonda usuarioId="usuario-b" />
      </QueryClientProvider>,
    )

    expect(cliente.getQueryData(['vehiculos'])).toBeUndefined()
  })

  it('también se tira al cerrar sesión', () => {
    const cliente = new QueryClient()
    cliente.setQueryData(['vehiculos'], { total: 5 })

    const { rerender } = montar(cliente, <Sonda usuarioId="usuario-a" />)
    rerender(
      <QueryClientProvider client={cliente}>
        <Sonda usuarioId={undefined} />
      </QueryClientProvider>,
    )

    expect(cliente.getQueryData(['vehiculos'])).toBeUndefined()
  })

  it('no la tira si el usuario es el mismo', () => {
    // Un rerender cualquiera no puede costar todas las consultas en curso.
    const cliente = new QueryClient()
    cliente.setQueryData(['vehiculos'], { total: 5 })

    const { rerender } = montar(cliente, <Sonda usuarioId="usuario-a" />)
    rerender(
      <QueryClientProvider client={cliente}>
        <Sonda usuarioId="usuario-a" />
      </QueryClientProvider>,
    )

    expect(cliente.getQueryData(['vehiculos'])).toEqual({ total: 5 })
  })

  it('no la tira en el primer montaje', () => {
    // Al arrancar todavía no hubo cambio de nadie: borrar acá tiraría lo que la
    // pantalla acaba de pedir.
    const cliente = new QueryClient()
    cliente.setQueryData(['vehiculos'], { total: 5 })

    montar(cliente, <Sonda usuarioId="usuario-a" />)

    expect(cliente.getQueryData(['vehiculos'])).toEqual({ total: 5 })
  })
})
