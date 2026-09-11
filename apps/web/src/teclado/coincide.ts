/**
 * Decide si un evento de teclado tiene que disparar un atajo.
 *
 * Está separado del contexto de React a propósito: es la parte con reglas y por lo
 * tanto la parte que conviene tener bajo test sin montar un árbol de componentes.
 */

/** Elementos donde el usuario está escribiendo y hay que tener cuidado. */
function estaEscribiendo(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false

  const etiqueta = destino.tagName
  return (
    etiqueta === 'INPUT' ||
    etiqueta === 'TEXTAREA' ||
    etiqueta === 'SELECT' ||
    destino.isContentEditable
  )
}

/**
 * Las teclas de función y las combinaciones con modificador **sí** disparan aunque el
 * foco esté en un campo: ése es justamente el punto de que guardar sea F2, poder
 * hacerlo sin sacar las manos del formulario.
 *
 * Lo que no puede dispararse escribiendo es una tecla suelta imprimible. Hoy no hay
 * ninguna en el catálogo, pero si mañana alguien configura `G` para guardar, escribir
 * «Gómez» en un campo no puede guardar cinco veces.
 */
export function debeDisparar(evento: KeyboardEvent): boolean {
  const conModificador = evento.ctrlKey || evento.altKey || evento.metaKey
  const esFuncion = /^F([1-9]|1[0-2])$/.test(evento.key)
  const esEspecial = evento.key.length > 1 // Insert, Delete, Escape, ArrowDown…

  if (esFuncion || conModificador || esEspecial) return true

  return !estaEscribiendo(evento.target)
}

/**
 * Teclas que el navegador se queda pase lo que pase. Nunca hay que intentar
 * interceptarlas: el `preventDefault` no sirve y sólo genera la ilusión de que están
 * disponibles.
 */
const INTERCEPTABLES_NUNCA = new Set(['F11', 'F12'])

/** Si conviene cancelar el comportamiento propio del navegador para esta tecla. */
export function debePrevenir(tecla: string): boolean {
  return !INTERCEPTABLES_NUNCA.has(tecla)
}
