/**
 * Los códigos de barras de las cajas de repuestos.
 *
 * Casi siempre es un EAN-13 —el del producto, igual en todas las cajas de esa pieza—, pero una
 * terminal puede imprimir su propio código, con letras, o un número de serie o de lote. Por eso
 * se guarda como texto y no se valida el dígito verificador: un lector que ya leyó el código lo
 * leyó bien, y uno que se tipea a mano se compara contra el catálogo de todas formas.
 */

export const LARGO_MINIMO_CODIGO_BARRAS = 4
export const LARGO_MAXIMO_CODIGO_BARRAS = 64

/**
 * El código como se guarda: sin espacios y en mayúsculas. Un lector manda lo mismo cada vez, pero
 * una persona que lo tipea mirando la caja pone espacios donde el impreso los tiene.
 */
export function normalizarCodigoBarras(crudo: string): string {
  return crudo.replace(/\s+/g, '').toUpperCase()
}

/** Si es algo que se puede guardar como código de barras. */
export function esCodigoBarras(codigo: string): boolean {
  return new RegExp(
    `^[A-Z0-9./-]{${LARGO_MINIMO_CODIGO_BARRAS},${LARGO_MAXIMO_CODIGO_BARRAS}}$`,
  ).test(codigo)
}
