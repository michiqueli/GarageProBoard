import { z } from 'zod'

/** Un CUIT son once dígitos. El guion es presentación, no dato. */
export const cuit = z.string().regex(/^[0-9]{11}$/, 'El CUIT son 11 dígitos sin guiones')

/**
 * Los dos formatos de patente que conviven en la calle. No hace falta más:
 * en la Argentina de hoy la patente no se recambia.
 */
export const dominio = z
  .string()
  .regex(
    /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/,
    'Formato de patente inválido: ABC123 o AB123CD',
  )

/**
 * De 6 a 17 caracteres, sin I, O ni Q. La norma ISO son 17, pero los vehículos
 * nacionales anteriores a los noventa traen números de chasis más cortos y un
 * taller multimarca los recibe igual.
 */
export const chasis = z.string().regex(/^[A-HJ-NPR-Z0-9]{6,17}$/, 'Número de chasis inválido')

/** Plata como string decimal: nunca number, que redondea donde no debe. */
export const importe = z.string().regex(/^-?[0-9]+(\.[0-9]{1,4})?$/, 'Importe inválido')

export const paginado = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
})

export const problema = z.object({
  mensaje: z.string(),
  detalle: z.unknown().optional(),
})
