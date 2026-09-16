import { describe, expect, it } from 'vitest'
import { ROLES_PREDEFINIDOS } from '../src/permisos.ts'
import {
  armarReglas,
  describirEspecial,
  diferenciaDePermisos,
  separarReglas,
} from '../src/roles.ts'

function reglasDe(nombre: string) {
  const rol = ROLES_PREDEFINIDOS.find((r) => r.nombre === nombre)
  if (!rol) throw new Error(`No existe el rol ${nombre}`)
  return rol.habilidades
}

describe('separar un rol en grilla y reglas especiales', () => {
  it('el gerente es «todo», sin casillas ni especiales', () => {
    expect(separarReglas(reglasDe('Gerente'))).toEqual({ todo: true, permisos: [], especiales: [] })
  })

  it('el mecánico: lo simple va a la grilla, y «sólo sus órdenes» queda aparte', () => {
    const { todo, permisos, especiales } = separarReglas(reglasDe('Mecánico'))

    expect(todo).toBe(false)
    expect(permisos).toEqual([
      { accion: 'ver', sujeto: 'Orden' },
      { accion: 'ver', sujeto: 'Vehiculo' },
      { accion: 'ver', sujeto: 'Repuesto' },
    ])
    expect(especiales.map(describirEspecial)).toEqual([
      'Puede modificar órdenes de trabajo sólo si las tiene asignadas',
    ])
  })

  it('una prohibición queda como especial, con su motivo', () => {
    const { especiales } = separarReglas(reglasDe('Asesor de servicios'))
    expect(especiales.map(describirEspecial)).toEqual([
      'No puede ver legajos de empleados: Contiene datos de sueldo.',
    ])
  })

  it('una acción fuera de la grilla no se pierde: queda como especial', () => {
    const { permisos, especiales } = separarReglas([{ action: 'facturar', subject: 'Vehiculo' }])
    expect(permisos).toEqual([])
    expect(especiales).toEqual([{ action: 'facturar', subject: 'Vehiculo' }])
  })
})

describe('armar las reglas a guardar', () => {
  it('ida y vuelta: separar y armar da los mismos permisos, con las especiales intactas', () => {
    for (const rol of ROLES_PREDEFINIDOS.filter((r) => r.nombre !== 'Gerente')) {
      const separado = separarReglas(rol.habilidades)
      const vuelta = separarReglas(armarReglas(separado.permisos, separado.especiales))
      expect(vuelta, rol.nombre).toEqual(separado)
    }
  })

  it('agrupa por sujeto, en el orden de la grilla, y descarta lo que no tiene casilla', () => {
    expect(
      armarReglas(
        [
          { accion: 'editar', sujeto: 'Cliente' },
          { accion: 'ver', sujeto: 'Cliente' },
          { accion: 'ver', sujeto: 'Orden' },
          { accion: 'facturar', sujeto: 'Cliente' },
        ],
        [],
      ),
    ).toEqual([
      { action: ['ver'], subject: 'Orden' },
      { action: ['ver', 'editar'], subject: 'Cliente' },
    ])
  })
})

describe('la diferencia, en palabras', () => {
  it('dice qué se agregó y qué se quitó', () => {
    expect(
      diferenciaDePermisos(
        [
          { accion: 'ver', sujeto: 'Cliente' },
          { accion: 'anular', sujeto: 'Comprobante' },
        ],
        [
          { accion: 'ver', sujeto: 'Cliente' },
          { accion: 'crear', sujeto: 'Cliente' },
        ],
      ),
    ).toEqual({ agregados: ['dar de alta clientes'], quitados: ['anular comprobantes'] })
  })
})
