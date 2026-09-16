/**
 * El CUIT: once dígitos, el último es verificador.
 *
 * Se valida el dígito y no sólo el largo porque un número mal tipeado pasa cualquier
 * regex, y un CUIT equivocado en una empresa es una factura que AFIP rechaza —o peor,
 * una emitida a nombre de otro—.
 */

const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

/** Saca guiones, puntos y espacios: «30-71234567-1» y «30712345671» son el mismo. */
export function normalizarCuit(texto: string): string {
  return texto.replace(/[\s.-]/g, '')
}

export function cuitValido(texto: string): boolean {
  const cuit = normalizarCuit(texto)
  if (!/^[0-9]{11}$/.test(cuit)) return false

  let suma = 0
  for (let i = 0; i < 10; i++) suma += Number(cuit[i]) * (MULTIPLICADORES[i] ?? 0)

  const resto = 11 - (suma % 11)
  // Con resto 10 no hay dígito que sirva: AFIP no emite esos números.
  const verificador = resto === 11 ? 0 : resto
  return verificador !== 10 && verificador === Number(cuit[10])
}

/** «30-71234567-1», como se lee en una factura. */
export function formatearCuit(texto: string): string {
  const cuit = normalizarCuit(texto)
  return cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : texto
}
