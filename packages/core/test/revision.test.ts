import { describe, expect, it } from 'vitest'
import {
  ESTADOS_REVISION,
  ESTADOS_REVISION_INFO,
  MAXIMO_NOMBRE_PUNTO,
  PUNTOS_REVISION_INICIALES,
  SECCIONES_REVISION,
  SECCIONES_REVISION_NOMBRE,
  trabajoDePunto,
} from '../src/revision.ts'

describe('la semilla de la revisión', () => {
  it('no repite claves: es lo que impide sembrar dos veces el mismo punto', () => {
    const claves = PUNTOS_REVISION_INICIALES.map((p) => p.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('las claves sirven de ruta y de identificador: minúsculas y guiones bajos', () => {
    for (const p of PUNTOS_REVISION_INICIALES) expect(p.clave).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })

  it('cada sección tiene nombre y al menos un punto', () => {
    for (const s of SECCIONES_REVISION) {
      expect(SECCIONES_REVISION_NOMBRE[s]).toBeTruthy()
      expect(
        PUNTOS_REVISION_INICIALES.some((p) => p.seccion === s),
        s,
      ).toBe(true)
    }
  })

  it('viene agrupada por sección, en el orden de la hoja', () => {
    const orden = PUNTOS_REVISION_INICIALES.map((p) => SECCIONES_REVISION.indexOf(p.seccion))
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
  })

  it('ningún nombre pasa del largo que acepta un punto propio', () => {
    for (const p of PUNTOS_REVISION_INICIALES) {
      expect(p.nombre.length).toBeLessThanOrEqual(MAXIMO_NOMBRE_PUNTO)
    }
  })
})

describe('los colores', () => {
  it('cada uno tiene un signo distinto, porque la hoja se imprime en blanco y negro', () => {
    const signos = ESTADOS_REVISION.map((e) => ESTADOS_REVISION_INFO[e].signo)
    expect(new Set(signos).size).toBe(ESTADOS_REVISION.length)
  })
})

describe('el renglón que sale de un punto', () => {
  it('lleva el nombre, y la nota si alguien la escribió', () => {
    expect(trabajoDePunto('Correas', null)).toBe('Correas')
    expect(trabajoDePunto('Correas', '  ')).toBe('Correas')
    expect(trabajoDePunto('Correas', 'la de accesorios cuarteada')).toBe(
      'Correas: la de accesorios cuarteada',
    )
  })
})
