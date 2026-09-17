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

export function IconoCopiar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8.5" rx="1" />
      <path d="M3.5 10.5h-.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5" />
    </svg>
  )
}

export function IconoListo() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  )
}

export function IconoVolver() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M13 8H3.5M7.5 4L3.5 8l4 4" />
    </svg>
  )
}

export function IconoBorrar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" />
    </svg>
  )
}

export function IconoImprimir() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2" />
      <rect x="4.5" y="9.5" width="7" height="4" />
    </svg>
  )
}

export function IconoVerificar() {
  return (
    <svg {...trazo} aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
    </svg>
  )
}

export function IconoAnular() {
  return (
    <svg {...trazo} aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.2 11.8l7.6-7.6" />
    </svg>
  )
}
