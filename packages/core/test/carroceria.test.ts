import { describe, expect, it } from 'vitest'
import { centro, DANIOS, VISTA, ZONAS, zonaEn } from '../src/carroceria.ts'

describe('el auto dibujado', () => {
  it('cada zona entra en el dibujo y tiene un nombre propio', () => {
    for (const z of ZONAS) {
      expect(z.x).toBeGreaterThanOrEqual(0)
      expect(z.y).toBeGreaterThanOrEqual(0)
      expect(z.x + z.ancho).toBeLessThanOrEqual(VISTA.ancho)
      expect(z.y + z.alto).toBeLessThanOrEqual(VISTA.alto)
    }
    expect(new Set(ZONAS.map((z) => z.id)).size).toBe(ZONAS.length)
    expect(new Set(ZONAS.map((z) => z.nombre)).size).toBe(ZONAS.length)
  })

  // Si una zona quedara tapada entera por otra, no habría forma de marcarla: el toque
  // siempre caería en la de arriba.
  it('ninguna queda tapada: tocar su centro la elige a ella', () => {
    for (const z of ZONAS) {
      const c = centro(z)
      expect(zonaEn(c.x, c.y)?.id).toBe(z.id)
    }
  })

  it('las ópticas le ganan al capot y al baúl que las rodean', () => {
    const optica = ZONAS.find((z) => z.id === 'optica_delantera_izquierda')
    if (!optica) throw new Error('falta la óptica')
    expect(zonaEn(optica.x + 2, optica.y + 2)?.id).toBe('optica_delantera_izquierda')
  })

  it('fuera del auto no hay zona', () => {
    expect(zonaEn(2, 2)).toBeUndefined()
  })

  // La letra es la tecla con que se marca: dos tipos con la misma letra serían una tecla que
  // hace dos cosas.
  it('cada tipo de daño tiene su propia letra', () => {
    const letras = Object.values(DANIOS).map((d) => d.letra)
    expect(new Set(letras).size).toBe(letras.length)
  })
})
