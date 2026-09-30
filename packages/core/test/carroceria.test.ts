import { describe, expect, it } from 'vitest'
import { CARROCERIAS, CARROCERIAS_NOMBRE, DANIOS } from '../src/carroceria.ts'

describe('lo que trae el vehículo al entrar', () => {
  // La letra es la tecla con que se marca: dos tipos con la misma letra serían una tecla que
  // hace dos cosas.
  it('cada tipo de daño tiene su propia letra', () => {
    const letras = Object.values(DANIOS).map((d) => d.letra)
    expect(new Set(letras).size).toBe(letras.length)
  })

  it('cada carrocería tiene su nombre, y ninguno se repite', () => {
    const nombres = CARROCERIAS.map((c) => CARROCERIAS_NOMBRE[c])
    expect(new Set(nombres).size).toBe(CARROCERIAS.length)
  })
})
