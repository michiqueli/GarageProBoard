import { describe, expect, it } from 'vitest'
import { DEPENDENCIAS, dependenciasRotas, describirDependencia, MODULOS } from '../src/modulos.ts'

describe('dependencias entre módulos', () => {
  it('con todo prendido no falta nada', () => {
    expect(dependenciasRotas(MODULOS)).toEqual([])
  })

  it('el núcleo solo es una combinación válida', () => {
    expect(dependenciasRotas(['nucleo'])).toEqual([])
  })

  it('apagar el núcleo deja colgados a todos los que están prendidos', () => {
    expect(dependenciasRotas(['servicios', 'contable'])).toEqual([
      { modulo: 'contable', falta: 'nucleo' },
      { modulo: 'servicios', falta: 'nucleo' },
    ])
  })

  it('un módulo apagado no reclama nada', () => {
    // Que repuestos dependa del núcleo sólo importa si repuestos está prendido.
    expect(dependenciasRotas([])).toEqual([])
  })

  it('ningún módulo depende de sí mismo ni de uno que no existe', () => {
    for (const modulo of MODULOS) {
      expect(DEPENDENCIAS[modulo]).not.toContain(modulo)
      for (const d of DEPENDENCIAS[modulo]) expect(MODULOS).toContain(d)
    }
  })

  it('el motivo se lee en castellano', () => {
    expect(describirDependencia({ modulo: 'servicios', falta: 'nucleo' })).toBe(
      'Servicios necesita Núcleo',
    )
  })
})
