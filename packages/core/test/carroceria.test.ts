import { describe, expect, it } from 'vitest'
import {
  CARROCERIAS,
  CARROCERIAS_NOMBRE,
  centro,
  DANIOS,
  SILUETA_DE,
  SILUETAS,
  VISTA,
  zonaEn,
  zonas,
} from '../src/carroceria.ts'

describe('el auto dibujado', () => {
  // Las tres siluetas se prueban con las mismas reglas: la que se agregue mañana entra sola.
  for (const silueta of SILUETAS) {
    describe(silueta, () => {
      it('cada zona entra en el dibujo y tiene un nombre propio', () => {
        const lista = zonas(silueta)
        for (const z of lista) {
          expect(z.x).toBeGreaterThanOrEqual(0)
          expect(z.y).toBeGreaterThanOrEqual(0)
          expect(z.x + z.ancho).toBeLessThanOrEqual(VISTA.ancho)
          expect(z.y + z.alto).toBeLessThanOrEqual(VISTA.alto)
        }
        expect(new Set(lista.map((z) => z.id)).size).toBe(lista.length)
        expect(new Set(lista.map((z) => z.nombre)).size).toBe(lista.length)
      })

      // Si una zona quedara tapada entera por otra, no habría forma de marcarla: el toque
      // siempre caería en la de arriba.
      it('ninguna queda tapada: tocar su centro la elige a ella', () => {
        for (const z of zonas(silueta)) {
          const c = centro(z)
          expect(zonaEn(silueta, c.x, c.y)?.id).toBe(z.id)
        }
      })

      it('las ópticas le ganan a la chapa que las rodea', () => {
        const optica = zonas(silueta).find((z) => z.id === 'optica_delantera_izquierda')
        if (!optica) throw new Error('falta la óptica')
        expect(zonaEn(silueta, optica.x + 2, optica.y + 2)?.id).toBe('optica_delantera_izquierda')
      })

      it('fuera del auto no hay zona', () => {
        expect(zonaEn(silueta, 2, 2)).toBeUndefined()
      })
    })
  }

  // Lo que distingue a cada dibujo, que es el motivo de que haya tres y no uno.
  it('la pickup tiene caja, el furgón portones, y el auto baúl', () => {
    const ids = (s: (typeof SILUETAS)[number]) => zonas(s).map((z) => z.id)
    expect(ids('auto')).toContain('baul')
    expect(ids('pickup')).toContain('caja')
    expect(ids('pickup')).not.toContain('baul')
    expect(ids('furgon')).toContain('porton_trasero')
    expect(ids('furgon')).not.toContain('luneta')
    expect(ids('furgon')).toContain('puerta_lateral_izquierda')
  })

  it('toda carrocería sabe con qué se dibuja y cómo se llama', () => {
    for (const c of CARROCERIAS) {
      expect(SILUETAS).toContain(SILUETA_DE[c])
      expect(CARROCERIAS_NOMBRE[c]).toBeTruthy()
    }
  })

  // La letra es la tecla con que se marca: dos tipos con la misma letra serían una tecla que
  // hace dos cosas.
  it('cada tipo de daño tiene su propia letra', () => {
    const letras = Object.values(DANIOS).map((d) => d.letra)
    expect(new Set(letras).size).toBe(letras.length)
  })
})
