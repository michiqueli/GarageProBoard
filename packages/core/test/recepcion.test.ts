import { describe, expect, it } from 'vitest'
import {
  ESPERA_AMBAR_MINUTOS,
  ESPERA_ROJO_MINUTOS,
  LETRA_VISITA,
  MOTIVOS_VISITA,
  nivelEspera,
  numeroVisita,
} from '../src/recepcion.ts'

describe('el número de la visita', () => {
  it('es la letra y tres cifras, como se llama por pantalla', () => {
    expect(numeroVisita('S', 1)).toBe('S-001')
    expect(numeroVisita('V', 42)).toBe('V-042')
    expect(numeroVisita('A', 1234)).toBe('A-1234')
  })

  it('venta, plan de ahorro y usados comparten la V: los atiende el mismo salón', () => {
    expect(new Set([LETRA_VISITA.venta, LETRA_VISITA.plan_ahorro, LETRA_VISITA.usados])).toEqual(
      new Set(['V']),
    )
  })

  it('todo motivo tiene su letra', () => {
    for (const m of MOTIVOS_VISITA) expect(LETRA_VISITA[m]).toMatch(/^[A-Z]$/)
  })
})

describe('la espera', () => {
  it('pasa a ámbar y a rojo en los umbrales, no un minuto después', () => {
    expect(nivelEspera(0)).toBe('bien')
    expect(nivelEspera(ESPERA_AMBAR_MINUTOS - 1)).toBe('bien')
    expect(nivelEspera(ESPERA_AMBAR_MINUTOS)).toBe('ambar')
    expect(nivelEspera(ESPERA_ROJO_MINUTOS - 1)).toBe('ambar')
    expect(nivelEspera(ESPERA_ROJO_MINUTOS)).toBe('rojo')
  })
})
