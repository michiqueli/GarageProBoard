/**
 * Íconos de trazo, del mismo dibujo que los del menú: 16×16, línea de 1,5 y del color del
 * texto. Acompañan una palabra, nunca la reemplazan: «Modificar» con un lápiz se entiende;
 * un lápiz solo, no siempre.
 */

const trazo = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function IconoEditar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M10.5 2.5l3 3L6 13H3v-3z" />
      <path d="M9 4l3 3" />
    </svg>
  )
}

export function IconoAgregar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function IconoCertificado() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4C5.2 13.1 3 10.8 3 7.8v-4z" />
      <path d="M5.8 8l1.5 1.5 3-3" />
    </svg>
  )
}

export function IconoClonar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
    </svg>
  )
}

export function IconoTransferir() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
    </svg>
  )
}

export function IconoDescargar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7" />
      <path d="M3 13.5h10" />
    </svg>
  )
}
