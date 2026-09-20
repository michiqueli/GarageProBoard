import { subject } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import {
  construirHabilidades,
  describirPermiso,
  faltaParaAsignar,
  permisosQueNoTiene,
  ROLES_PREDEFINIDOS,
  resolverCondiciones,
} from '../src/permisos.ts'

/** Las habilidades de un rol predefinido, resueltas contra un usuario de ejemplo. */
function habilidadesDe(nombre: string, contexto: Record<string, string | null> = {}) {
  const rol = ROLES_PREDEFINIDOS.find((r) => r.nombre === nombre)
  if (!rol) throw new Error(`No existe el rol ${nombre}`)
  return construirHabilidades(
    resolverCondiciones(rol.habilidades, { usuarioId: 'u-1', empleadoId: 'e-1', ...contexto }),
  )
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
    // Contra su legajo, no contra su cuenta: el mecánico de una orden es un empleado.
    const mecanico = habilidadesDe('Mecánico')

    expect(mecanico.can('editar', subject('Orden', { mecanicoId: 'e-1' }) as never)).toBe(true)
    expect(mecanico.can('editar', subject('Orden', { mecanicoId: 'e-2' }) as never)).toBe(false)
  })

  /**
   * La regresión que esto cuida: con el marcador resuelto a `null`, «mis órdenes» dichas por
   * una cuenta sin legajo pasaban a ser **las órdenes sin mecánico asignado**, que en un
   * taller son justo las que se acaban de recibir.
   */
  it('un mecánico sin legajo no edita ninguna orden, ni las que no tienen mecánico', () => {
    const sinLegajo = habilidadesDe('Mecánico', { empleadoId: null })

    expect(sinLegajo.can('editar', subject('Orden', { mecanicoId: null }) as never)).toBe(false)
    expect(sinLegajo.can('editar', subject('Orden', { mecanicoId: 'e-1' }) as never)).toBe(false)
    // Lo que no depende de su legajo lo sigue pudiendo.
    expect(sinLegajo.can('ver', 'Orden')).toBe(true)
  })

  it('una prohibición con condición que no se puede evaluar prohíbe todo', () => {
    const reglas = resolverCondiciones(
      [
        {
          action: 'ver',
          subject: 'Orden',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: marcador, no interpolación
          conditions: { sucursalId: '${sucursalId}' },
          inverted: true,
        },
      ],
      {},
    )

    expect(reglas).toHaveLength(1)
    expect(reglas[0]?.conditions).toBeUndefined()
  })

  it('el cajero factura pero no anula', () => {
    const cajero = habilidadesDe('Cajero')

    expect(cajero.can('facturar', 'Comprobante')).toBe(true)
    expect(cajero.can('anular', 'Comprobante')).toBe(false)
  })

  it('trabajar en un módulo no es poder configurarlo', () => {
    // La configuración guarda credenciales: el que edita órdenes no toca los motivos de
    // espera del taller, y el que emite comprobantes no toca los certificados de AFIP.
    expect(habilidadesDe('Asesor de servicios').can('configurar', 'Orden')).toBe(false)
    expect(habilidadesDe('Administrativo').can('configurar', 'Comprobante')).toBe(false)
    expect(habilidadesDe('Cajero').can('configurar', 'Comprobante')).toBe(false)
    expect(habilidadesDe('Gerente').can('configurar', 'Comprobante')).toBe(true)
  })

  it('ningún rol predefinido trae configurar, salvo el gerente por administrar todo', () => {
    for (const rol of ROLES_PREDEFINIDOS) {
      const acciones = rol.habilidades.flatMap((r) => r.action)
      expect(acciones, rol.nombre).not.toContain('configurar')
    }
  })

  it('el repuestero no tiene nada que hacer con el parque de vehículos', () => {
    expect(habilidadesDe('Repuestero').can('ver', 'Vehiculo')).toBe(false)
  })
})

describe('nadie da lo que no tiene', () => {
  const rol = (nombre: string) => {
    const encontrado = ROLES_PREDEFINIDOS.find((r) => r.nombre === nombre)
    if (!encontrado) throw new Error(`No existe el rol ${nombre}`)
    return encontrado.habilidades
  }

  it('el gerente puede asignar cualquier rol', () => {
    const gerente = habilidadesDe('Gerente')
    for (const r of ROLES_PREDEFINIDOS) {
      expect(permisosQueNoTiene(gerente, r.habilidades), r.nombre).toEqual([])
    }
  })

  it('el administrador de sistema puede asignar cualquier rol, el de gerente incluido', () => {
    const admin = habilidadesDe('Administrador de sistema')
    for (const r of ROLES_PREDEFINIDOS) {
      expect(faltaParaAsignar(admin, r.habilidades), r.nombre).toEqual([])
    }
  })

  it('quien sólo da de alta usuarios no puede crear un gerente, y dice qué le falta', () => {
    const altas = construirHabilidades([{ action: ['ver', 'crear', 'editar'], subject: 'Usuario' }])
    expect(faltaParaAsignar(altas, rol('Gerente'))).toEqual(['administrar todo el sistema'])
  })

  it('ni un mecánico si no ve órdenes: con esa cuenta las vería', () => {
    const altas = construirHabilidades([{ action: ['ver', 'crear', 'editar'], subject: 'Usuario' }])
    expect(faltaParaAsignar(altas, rol('Mecánico'))).toContain('ver órdenes de trabajo')
  })

  it('una prohibición le gana: el asesor no da permiso para ver legajos', () => {
    const asesor = habilidadesDe('Asesor de servicios')
    expect(permisosQueNoTiene(asesor, [{ action: 'ver', subject: 'Empleado' }])).toEqual([
      'ver legajos de empleados',
    ])
  })

  it('un permiso con condición no alcanza para dar el permiso entero', () => {
    // El mecánico edita sus órdenes, no todas: no puede dar «editar órdenes».
    const mecanico = habilidadesDe('Mecánico')
    expect(permisosQueNoTiene(mecanico, [{ action: 'editar', subject: 'Orden' }])).toEqual([
      'modificar órdenes de trabajo',
    ])
  })

  it('las prohibiciones del rol que se asigna no cuentan: no dan nada', () => {
    const asesor = habilidadesDe('Asesor de servicios')
    expect(
      permisosQueNoTiene(asesor, [{ action: 'ver', subject: 'Empleado', inverted: true }]),
    ).toEqual([])
  })
})

describe('cómo se dice un permiso', () => {
  it('en castellano y en plural, como lo diría alguien del mostrador', () => {
    expect(describirPermiso('crear', 'Vehiculo')).toBe('dar de alta vehículos')
    expect(describirPermiso('ver', 'Orden')).toBe('ver órdenes de trabajo')
    expect(describirPermiso('configurar', 'Comprobante')).toBe('configurar comprobantes')
  })
})
