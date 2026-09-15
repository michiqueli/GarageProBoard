import { subject } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import {
  construirHabilidades,
  describirPermiso,
  ROLES_PREDEFINIDOS,
  resolverCondiciones,
} from '../src/permisos.ts'

/** Las habilidades de un rol predefinido, resueltas contra un usuario de ejemplo. */
function habilidadesDe(nombre: string, usuarioId = 'u-1') {
  const rol = ROLES_PREDEFINIDOS.find((r) => r.nombre === nombre)
  if (!rol) throw new Error(`No existe el rol ${nombre}`)
  return construirHabilidades(resolverCondiciones(rol.habilidades, { usuarioId }))
}

describe('los roles predefinidos', () => {
  /**
   * La regresión: `administrar` no era el comodín de CASL — ése se llama `manage` — y
   * el gerente, con `administrar all`, no podía ni ver un vehículo. Nadie lo notó
   * mientras los permisos no se aplicaban en ningún lado.
   */
  it('el gerente puede todo', () => {
    const gerente = habilidadesDe('Gerente')

    expect(gerente.can('ver', 'Vehiculo')).toBe(true)
    expect(gerente.can('crear', 'Orden')).toBe(true)
    expect(gerente.can('anular', 'Comprobante')).toBe(true)
    expect(gerente.can('ver', 'Empleado')).toBe(true)
  })

  it('el asesor atiende el mostrador pero no ve legajos', () => {
    const asesor = habilidadesDe('Asesor de servicios')

    expect(asesor.can('crear', 'Vehiculo')).toBe(true)
    expect(asesor.can('editar', 'Orden')).toBe(true)
    expect(asesor.can('ver', 'Empleado')).toBe(false)
  })

  it('el mecánico ve vehículos pero no los da de alta', () => {
    const mecanico = habilidadesDe('Mecánico')

    expect(mecanico.can('ver', 'Vehiculo')).toBe(true)
    expect(mecanico.can('crear', 'Vehiculo')).toBe(false)
  })

  it('el mecánico sólo edita las órdenes que tiene asignadas', () => {
    const mecanico = habilidadesDe('Mecánico', 'u-1')

    expect(mecanico.can('editar', subject('Orden', { mecanicoId: 'u-1' }) as never)).toBe(true)
    expect(mecanico.can('editar', subject('Orden', { mecanicoId: 'u-2' }) as never)).toBe(false)
  })

  it('el cajero factura pero no anula', () => {
    const cajero = habilidadesDe('Cajero')

    expect(cajero.can('facturar', 'Comprobante')).toBe(true)
    expect(cajero.can('anular', 'Comprobante')).toBe(false)
  })

  it('el repuestero no tiene nada que hacer con el parque de vehículos', () => {
    expect(habilidadesDe('Repuestero').can('ver', 'Vehiculo')).toBe(false)
  })
})

describe('cómo se dice un permiso', () => {
  it('en castellano y en plural, como lo diría alguien del mostrador', () => {
    expect(describirPermiso('crear', 'Vehiculo')).toBe('dar de alta vehículos')
    expect(describirPermiso('ver', 'Orden')).toBe('ver órdenes de trabajo')
  })
})
