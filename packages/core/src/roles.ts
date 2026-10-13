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
  Orden: ['ver', 'crear', 'editar', 'anular', 'autorizar', 'configurar'],
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
  Visita: ['ver', 'crear', 'editar'],
  Turno: ['ver', 'crear', 'editar'],
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

/**
 * Un rol partido en piezas que se pueden comparar: cada casilla de la grilla y cada regla
 * especial, con una clave. Dos roles con las mismas piezas permiten lo mismo aunque sus
 * reglas estén escritas en otro orden o agrupadas de otra forma, que es lo que pasa en
 * cuanto alguien guarda un rol desde la pantalla sin tocar nada.
 */
interface Pieza {
  permiso?: Permiso
  especial?: ReglaPermiso
}

const PIEZA_TODO = 'todo'

function piezas(reglas: readonly ReglaPermiso[]): Map<string, Pieza> {
  const { todo, permisos, especiales } = separarReglas(reglas)
  const salida = new Map<string, Pieza>()
  if (todo) salida.set(PIEZA_TODO, {})
  for (const permiso of permisos) salida.set(`p:${permiso.accion}:${permiso.sujeto}`, { permiso })
  for (const especial of especiales) salida.set(`e:${estable(especial)}`, { especial })
  return salida
}

/** JSON con las claves ordenadas y sin las que valen `undefined`. */
function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`
  if (valor && typeof valor === 'object') {
    const pares = Object.entries(valor)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${pares.map(([k, v]) => `${JSON.stringify(k)}:${estable(v)}`).join(',')}}`
  }
  return JSON.stringify(valor)
}

function describirPieza(clave: string, pieza: Pieza): string {
  if (clave === PIEZA_TODO) return 'todo el sistema'
  if (pieza.permiso) return describirPermiso(pieza.permiso.accion, pieza.permiso.sujeto)
  return describirEspecial(pieza.especial ?? { action: 'ver', subject: 'all' })
}

/** Si dos juegos de reglas permiten exactamente lo mismo. */
export function mismasReglas(a: readonly ReglaPermiso[], b: readonly ReglaPermiso[]): boolean {
  const pa = piezas(a)
  const pb = piezas(b)
  return pa.size === pb.size && [...pa.keys()].every((k) => pb.has(k))
}

/** Lo que cambió el sistema en un rol predefinido, en palabras. */
export interface NovedadDeRol {
  agrega: string[]
  quita: string[]
}

/**
 * Qué cambió entre la versión de un rol predefinido que la concesionaria conoce y la que
 * trae el sistema ahora, o `null` si son la misma.
 */
export function novedadDeRol(
  conocida: readonly ReglaPermiso[],
  nueva: readonly ReglaPermiso[],
): NovedadDeRol | null {
  const antes = piezas(conocida)
  const despues = piezas(nueva)
  const agrega = [...despues].filter(([k]) => !antes.has(k)).map(([k, p]) => describirPieza(k, p))
  const quita = [...antes].filter(([k]) => !despues.has(k)).map(([k, p]) => describirPieza(k, p))
  return agrega.length || quita.length ? { agrega, quita } : null
}

/**
 * Aplica a un rol lo que el sistema cambió entre dos versiones de su predefinido, **y nada
 * más**: lo que la concesionaria le agregó o le sacó por su cuenta queda como estaba. Si
 * el sistema agrega algo que el rol ya tenía, o quita algo que ya no tenía, no pasa nada.
 */
export function aplicarNovedad(
  reglas: readonly ReglaPermiso[],
  conocida: readonly ReglaPermiso[],
  nueva: readonly ReglaPermiso[],
): ReglaPermiso[] {
  const antes = piezas(conocida)
  const despues = piezas(nueva)
  const resultado = piezas(reglas)
  for (const clave of antes.keys()) if (!despues.has(clave)) resultado.delete(clave)
  for (const [clave, pieza] of despues) if (!antes.has(clave)) resultado.set(clave, pieza)

  const permisos = [...resultado.values()].flatMap((p) => (p.permiso ? [p.permiso] : []))
  const especiales = [...resultado.values()].flatMap((p) => (p.especial ? [p.especial] : []))
  const todo: ReglaPermiso[] = resultado.has(PIEZA_TODO)
    ? [{ action: 'administrar', subject: 'all' }]
    : []
  return [...todo, ...armarReglas(permisos, especiales)]
}

/** «ahora podés ver clientes y dar de alta clientes; ya no podés anular comprobantes». */
export function cambiosEnPalabras(agregados: readonly string[], quitados: readonly string[]) {
  return [
    agregados.length ? `ahora podés ${enumerar(agregados)}` : '',
    quitados.length ? `ya no podés ${enumerar(quitados)}` : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function enumerar(frases: readonly string[]): string {
  return frases.length <= 1
    ? (frases[0] ?? '')
    : `${frases.slice(0, -1).join(', ')} y ${frases.at(-1)}`
}
