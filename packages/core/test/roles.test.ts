import { describe, expect, it } from 'vitest'
import { type ReglaPermiso, ROLES_PREDEFINIDOS } from '../src/permisos.ts'
import {
  aplicarNovedad,
  armarReglas,
  describirEspecial,
  diferenciaDePermisos,
  mismasReglas,
  novedadDeRol,
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

describe('las versiones de un rol predefinido', () => {
  const asesorViejo: ReglaPermiso[] = [
    { action: ['ver', 'crear', 'editar'], subject: ['Orden', 'Vehiculo', 'Cliente'] },
    { action: 'ver', subject: ['Repuesto', 'Comprobante'] },
    { action: 'ver', subject: 'Empleado', inverted: true, reason: 'Contiene datos de sueldo.' },
  ]
  const asesorNuevo = reglasDe('Asesor de servicios')

  it('el mismo rol escrito de otra forma es el mismo rol', () => {
    const guardadoDesdeLaPantalla = armarReglas(
      separarReglas(asesorNuevo).permisos.toReversed(),
      separarReglas(asesorNuevo).especiales,
    )
    expect(guardadoDesdeLaPantalla).not.toEqual(asesorNuevo)
    expect(mismasReglas(guardadoDesdeLaPantalla, asesorNuevo)).toBe(true)
  })

  it('una prohibición con otro motivo es otra regla', () => {
    const otroMotivo = asesorNuevo.map((r) => (r.inverted ? { ...r, reason: 'Otro.' } : r))
    expect(mismasReglas(otroMotivo, asesorNuevo)).toBe(false)
  })

  it('la novedad dice qué agrega y qué quita el sistema', () => {
    expect(novedadDeRol(asesorViejo, asesorNuevo)).toEqual({
      agrega: [
        'ver las visitas de la recepción',
        'dar de alta las visitas de la recepción',
        'modificar las visitas de la recepción',
        'ver los turnos del taller',
        'dar de alta los turnos del taller',
        'modificar los turnos del taller',
      ],
      quita: [],
    })
    expect(novedadDeRol(asesorNuevo, asesorNuevo)).toBeNull()
  })

  it('aplicar la novedad conserva lo que la concesionaria cambió por su cuenta', () => {
    // Al asesor de esta concesionaria le sacaron «ver comprobantes» y le dieron
    // «ver proveedores». El sistema le agrega visitas y turnos.
    const editado = armarReglas(
      [
        ...separarReglas(asesorViejo).permisos.filter((p) => p.sujeto !== 'Comprobante'),
        { accion: 'ver', sujeto: 'Proveedor' },
      ],
      separarReglas(asesorViejo).especiales,
    )
    const resultado = separarReglas(aplicarNovedad(editado, asesorViejo, asesorNuevo))

    const tiene = (accion: string, sujeto: string) =>
      resultado.permisos.some((p) => p.accion === accion && p.sujeto === sujeto)
    expect(tiene('crear', 'Turno')).toBe(true)
    expect(tiene('ver', 'Visita')).toBe(true)
    expect(tiene('ver', 'Proveedor')).toBe(true)
    expect(tiene('ver', 'Comprobante')).toBe(false)
    expect(resultado.especiales.map(describirEspecial)).toEqual([
      'No puede ver legajos de empleados: Contiene datos de sueldo.',
    ])
  })

  it('lo que el sistema quita se va, y lo que ya no estaba no vuelve', () => {
    const sinRepuestos = aplicarNovedad(
      asesorViejo.filter((r) => r.subject !== 'Empleado'),
      asesorViejo,
      asesorViejo.filter((r) => !(Array.isArray(r.subject) && r.subject.includes('Repuesto'))),
    )
    expect(separarReglas(sinRepuestos).permisos.some((p) => p.sujeto === 'Repuesto')).toBe(false)
    expect(separarReglas(sinRepuestos).especiales).toEqual([])
  })

  it('cada predefinido tiene una clave propia', () => {
    const claves = ROLES_PREDEFINIDOS.map((r) => r.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })
})
