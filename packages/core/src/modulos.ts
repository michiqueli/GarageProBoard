/**
 * Los módulos que se contratan, y lo que cada uno necesita para funcionar.
 *
 * Un módulo se prende y se apaga **por concesionaria**: es cómo se vende el producto.
 * No es lo mismo que un permiso — el permiso dice qué puede hacer una persona, el
 * módulo dice qué compró la concesionaria — y se evalúa antes: a quien no tiene el
 * módulo no se le habla de permisos, porque no hay permiso que le sirva.
 *
 * Lo que pertenece a un módulo es **la pantalla y la operación, no el dato**. La orden
 * de compra se genera en contable y se recibe en repuestos, y es una sola tabla.
 *
 * Ver `docs/tecnicos/modulos-del-sistema.md`.
 */

export const MODULOS = [
  'nucleo',
  'contable',
  'servicios',
  'repuestos',
  'cartera',
  'ventas',
  'rrhh',
] as const

export type Modulo = (typeof MODULOS)[number]

export const ETIQUETA_MODULO: Readonly<Record<Modulo, string>> = {
  nucleo: 'Núcleo',
  contable: 'Contable',
  servicios: 'Servicios',
  repuestos: 'Repuestos',
  cartera: 'Cartera de vehículos',
  ventas: 'Ventas',
  rrhh: 'Recursos humanos',
}

/**
 * De qué módulos depende cada uno para funcionar.
 *
 * Servicios no abre una orden sin vehículos, contable no factura sin clientes: todos
 * cuelgan del núcleo. El núcleo tiene flag igual que los demás — no hay una excepción
 * escrita en el código — y lo que impide apagarlo es esto.
 *
 * Es un `Record` completo a propósito: un módulo nuevo no compila hasta declarar de
 * qué depende, aunque sea de nada.
 */
export const DEPENDENCIAS: Readonly<Record<Modulo, readonly Modulo[]>> = {
  nucleo: [],
  contable: ['nucleo'],
  servicios: ['nucleo'],
  repuestos: ['nucleo'],
  cartera: ['nucleo'],
  ventas: ['nucleo'],
  rrhh: ['nucleo'],
}

export interface DependenciaRota {
  modulo: Modulo
  falta: Modulo
}

/**
 * Qué módulos prendidos se quedan sin algo de lo que dependen.
 *
 * La usa el back-office antes de guardar: apagar el piso de un módulo prendido se
 * rechaza ahí, con el motivo escrito, y no se descubre cuando un usuario abre la
 * pantalla. Una lista vacía quiere decir que la combinación se puede vender.
 */
export function dependenciasRotas(activos: Iterable<Modulo>): DependenciaRota[] {
  const prendidos = new Set(activos)
  const rotas: DependenciaRota[] = []

  for (const modulo of MODULOS) {
    if (!prendidos.has(modulo)) continue
    for (const falta of DEPENDENCIAS[modulo]) {
      if (!prendidos.has(falta)) rotas.push({ modulo, falta })
    }
  }

  return rotas
}

/** «Servicios necesita Núcleo», para el back-office. */
export function describirDependencia({ modulo, falta }: DependenciaRota): string {
  return `${ETIQUETA_MODULO[modulo]} necesita ${ETIQUETA_MODULO[falta]}`
}
