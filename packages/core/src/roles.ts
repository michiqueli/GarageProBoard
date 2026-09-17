import {
  type AccionPermiso,
  describirPermiso,
  type ReglaPermiso,
  SUJETOS,
  type Sujeto,
} from './permisos.ts'

/**
 * La grilla con la que se edita un rol: cada sujeto con las acciones que tienen sentido
 * para él. «Facturar vehículos» no existe, y ofrecerlo en una casilla invita a marcarlo.
 *
 * Es un `Record` completo: un sujeto nuevo sin su fila no compila.
 */
export const ACCIONES_POR_SUJETO: Readonly<
  Record<Exclude<Sujeto, 'all'>, readonly AccionPermiso[]>
> = {
  Orden: ['ver', 'crear', 'editar', 'anular', 'configurar'],
  Vehiculo: ['ver', 'crear', 'editar'],
  Cliente: ['ver', 'crear', 'editar'],
  Proveedor: ['ver', 'crear', 'editar'],
  Repuesto: ['ver', 'crear', 'editar', 'anular', 'configurar'],
  Comprobante: ['ver', 'crear', 'facturar', 'anular', 'configurar'],
  Empleado: ['ver', 'crear', 'editar'],
  Empresa: ['ver', 'crear', 'editar'],
  Usuario: ['ver', 'crear', 'editar', 'administrar'],
  Configuracion: ['ver', 'editar'],
  Auditoria: ['ver'],
}

export const SUJETOS_DE_ROL = SUJETOS.filter((s): s is Exclude<Sujeto, 'all'> => s !== 'all')

export interface Permiso {
  accion: AccionPermiso
  sujeto: Exclude<Sujeto, 'all'>
}

/** Un rol como lo muestra y lo edita la pantalla. */
export interface RolSeparado {
  /** `administrar all`: puede todo, y no se edita desde la aplicación. */
  todo: boolean
  /** Lo que cabe en la grilla, una casilla por permiso. */
  permisos: Permiso[]
  /**
   * Lo que no cabe: reglas con condiciones —«edita las órdenes que tiene asignadas»—,
   * prohibiciones, o acciones fuera de la grilla. Se muestran y se conservan tal cual.
   */
  especiales: ReglaPermiso[]
}

function enGrilla(accion: AccionPermiso, sujeto: Sujeto): sujeto is Exclude<Sujeto, 'all'> {
  return sujeto !== 'all' && ACCIONES_POR_SUJETO[sujeto].includes(accion)
}

/**
 * Parte las reglas guardadas de un rol en lo que se edita con casillas y lo que no. Una
 * regla simple con varias acciones o sujetos se abre en un permiso por casilla.
 */
export function separarReglas(reglas: readonly ReglaPermiso[]): RolSeparado {
  const permisos: Permiso[] = []
  const especiales: ReglaPermiso[] = []
  let todo = false

  for (const regla of reglas) {
    const acciones = Array.isArray(regla.action) ? regla.action : [regla.action]
    const sujetos = Array.isArray(regla.subject) ? regla.subject : [regla.subject]
    const simple = !regla.inverted && !regla.conditions && !regla.fields

    if (simple && acciones.includes('administrar') && sujetos.includes('all')) todo = true

    for (const accion of acciones) {
      for (const sujeto of sujetos) {
        if (simple && enGrilla(accion, sujeto)) {
          if (!permisos.some((p) => p.accion === accion && p.sujeto === sujeto)) {
            permisos.push({ accion, sujeto })
          }
        } else if (!(simple && accion === 'administrar' && sujeto === 'all')) {
          especiales.push({ ...regla, action: accion, subject: sujeto })
        }
      }
    }
  }

  return { todo, permisos: ordenar(permisos), especiales }
}

/**
 * Las reglas a guardar: una por sujeto con sus acciones, más las especiales tal cual.
 * Los permisos fuera de la grilla se descartan: no hay casilla que los haya marcado.
 */
export function armarReglas(
  permisos: readonly Permiso[],
  especiales: readonly ReglaPermiso[],
): ReglaPermiso[] {
  const porSujeto = new Map<Sujeto, AccionPermiso[]>()
  for (const { accion, sujeto } of ordenar(permisos)) {
    if (!enGrilla(accion, sujeto)) continue
    const acciones = porSujeto.get(sujeto) ?? []
    if (!acciones.includes(accion)) acciones.push(accion)
    porSujeto.set(sujeto, acciones)
  }
  return [
    ...[...porSujeto].map(([sujeto, acciones]) => ({ action: acciones, subject: sujeto })),
    ...especiales,
  ]
}

/** En el orden de la grilla, para que dos roles iguales se guarden igual. */
function ordenar(permisos: readonly Permiso[]): Permiso[] {
  return [...permisos].sort(
    (a, b) =>
      SUJETOS_DE_ROL.indexOf(a.sujeto) - SUJETOS_DE_ROL.indexOf(b.sujeto) ||
      ACCIONES_POR_SUJETO[a.sujeto].indexOf(a.accion) -
        ACCIONES_POR_SUJETO[b.sujeto].indexOf(b.accion),
  )
}

/**
 * Una regla especial dicha en palabras. Las condiciones que se conocen tienen su frase; las
 * que no, se dicen como «con condiciones», que al menos avisa que la regla no es completa.
 */
export function describirEspecial(regla: ReglaPermiso): string {
  const accion = (Array.isArray(regla.action) ? regla.action[0] : regla.action) ?? 'ver'
  const sujeto = (Array.isArray(regla.subject) ? regla.subject[0] : regla.subject) ?? 'all'
  const permiso = describirPermiso(accion, sujeto)

  if (regla.inverted) return `No puede ${permiso}${regla.reason ? `: ${regla.reason}` : ''}`
  if (regla.conditions && 'mecanicoId' in regla.conditions) {
    return `Puede ${permiso} sólo si las tiene asignadas`
  }
  if (regla.conditions || regla.fields) return `Puede ${permiso}, con condiciones`
  return `Puede ${permiso}`
}

/** «Le agregó ver clientes y le quitó anular comprobantes», para la auditoría y el aviso. */
export function diferenciaDePermisos(
  antes: readonly Permiso[],
  despues: readonly Permiso[],
): { agregados: string[]; quitados: string[] } {
  const clave = (p: Permiso) => `${p.accion}:${p.sujeto}`
  const a = new Set(antes.map(clave))
  const d = new Set(despues.map(clave))
  return {
    agregados: despues
      .filter((p) => !a.has(clave(p)))
      .map((p) => describirPermiso(p.accion, p.sujeto)),
    quitados: antes
      .filter((p) => !d.has(clave(p)))
      .map((p) => describirPermiso(p.accion, p.sujeto)),
  }
}
