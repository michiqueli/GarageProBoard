import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Patente } from '../src/componentes/Patente.tsx'

afterEach(cleanup)

describe('la patente como chapa', () => {
  it('Mercosur: con la banda azul y los grupos como en la calle', () => {
    render(<Patente dominio="ae123bc" />)
    expect(screen.getByText('AE 123 BC')).toBeDefined()
    expect(screen.getByText('REPÚBLICA ARGENTINA').getAttribute('aria-hidden')).toBe('true')
  })

  it('la anterior: tres letras y tres números', () => {
    render(<Patente dominio="ABC-123" />)
    expect(screen.getByText('ABC 123')).toBeDefined()
    expect(screen.getByText('ARGENTINA')).toBeDefined()
  })

  it('el 0 km: una chapa que dice que no está patentado, y eso es lo que se lee', () => {
    render(<Patente dominio={null} />)
    expect(screen.getByText('SIN PATENTAR').getAttribute('aria-hidden')).toBeNull()
    expect(screen.getByText('KM 000 KM').getAttribute('aria-hidden')).toBe('true')
  })

  it('un formato desconocido se muestra tal cual, no se esconde', () => {
    render(<Patente dominio="X123456" />)
    expect(screen.getByText('X123456')).toBeDefined()
  })
})
