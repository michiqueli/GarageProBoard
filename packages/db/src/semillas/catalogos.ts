/**
 * Catálogos que no dependen de ningún cliente.
 *
 * A futuro, las tablas de AFIP se sincronizan desde los web services — condiciones de
 * IVA con `FEParamGetCondicionIvaReceptor` y comprobantes con `FEParamGetTiposCbte` —
 * y estas constantes quedan sólo como semilla inicial para poder trabajar sin
 * certificados cargados.
 *
 * Hasta que esa sincronización exista, **verificar contra el web service antes de
 * emitir en producción**: estos valores salen de documentación, no de una llamada.
 */

export interface Provincia {
  codigo: number
  nombre: string
}

/** Códigos del padrón de AFIP. */
export const PROVINCIAS: Provincia[] = [
  { codigo: 0, nombre: 'Ciudad Autónoma de Buenos Aires' },
  { codigo: 1, nombre: 'Buenos Aires' },
  { codigo: 2, nombre: 'Catamarca' },
  { codigo: 3, nombre: 'Córdoba' },
  { codigo: 4, nombre: 'Corrientes' },
  { codigo: 5, nombre: 'Entre Ríos' },
  { codigo: 6, nombre: 'Jujuy' },
  { codigo: 7, nombre: 'Mendoza' },
  { codigo: 8, nombre: 'La Rioja' },
  { codigo: 9, nombre: 'Salta' },
  { codigo: 10, nombre: 'San Juan' },
  { codigo: 11, nombre: 'San Luis' },
  { codigo: 12, nombre: 'Santa Fe' },
  { codigo: 13, nombre: 'Santiago del Estero' },
  { codigo: 14, nombre: 'Tucumán' },
  { codigo: 16, nombre: 'Chaco' },
  { codigo: 17, nombre: 'Chubut' },
  { codigo: 18, nombre: 'Formosa' },
  { codigo: 19, nombre: 'Misiones' },
  { codigo: 20, nombre: 'Neuquén' },
  { codigo: 21, nombre: 'La Pampa' },
  { codigo: 22, nombre: 'Río Negro' },
  { codigo: 23, nombre: 'Santa Cruz' },
  { codigo: 24, nombre: 'Tierra del Fuego' },
]

export interface CondicionIva {
  codigo: number
  descripcion: string
  discriminaIva: boolean
}

/**
 * Condición frente al IVA. Desde la RG 5.616 la del receptor viaja obligatoriamente en
 * el comprobante, así que este campo del cliente dejó de ser informativo.
 */
export const CONDICIONES_IVA: CondicionIva[] = [
  { codigo: 1, descripcion: 'IVA Responsable Inscripto', discriminaIva: true },
  { codigo: 4, descripcion: 'IVA Sujeto Exento', discriminaIva: false },
  { codigo: 5, descripcion: 'Consumidor Final', discriminaIva: false },
  { codigo: 6, descripcion: 'Responsable Monotributo', discriminaIva: false },
  { codigo: 7, descripcion: 'Sujeto No Categorizado', discriminaIva: false },
  { codigo: 8, descripcion: 'Proveedor del Exterior', discriminaIva: false },
  { codigo: 9, descripcion: 'Cliente del Exterior', discriminaIva: false },
  { codigo: 10, descripcion: 'IVA Liberado — Ley 19.640', discriminaIva: false },
  { codigo: 13, descripcion: 'Monotributista Social', discriminaIva: false },
]

export interface TipoComprobante {
  codigo: number
  descripcion: string
  letra: string | null
  /** +1 factura y nota de débito, −1 nota de crédito: simplifica todo cálculo de saldo. */
  signo: number
}

export const TIPOS_COMPROBANTE: TipoComprobante[] = [
  { codigo: 1, descripcion: 'Factura A', letra: 'A', signo: 1 },
  { codigo: 2, descripcion: 'Nota de Débito A', letra: 'A', signo: 1 },
  { codigo: 3, descripcion: 'Nota de Crédito A', letra: 'A', signo: -1 },
  { codigo: 6, descripcion: 'Factura B', letra: 'B', signo: 1 },
  { codigo: 7, descripcion: 'Nota de Débito B', letra: 'B', signo: 1 },
  { codigo: 8, descripcion: 'Nota de Crédito B', letra: 'B', signo: -1 },
  { codigo: 11, descripcion: 'Factura C', letra: 'C', signo: 1 },
  { codigo: 12, descripcion: 'Nota de Débito C', letra: 'C', signo: 1 },
  { codigo: 13, descripcion: 'Nota de Crédito C', letra: 'C', signo: -1 },
  { codigo: 19, descripcion: 'Factura E', letra: 'E', signo: 1 },
  { codigo: 51, descripcion: 'Factura M', letra: 'M', signo: 1 },
  { codigo: 52, descripcion: 'Nota de Débito M', letra: 'M', signo: 1 },
  { codigo: 53, descripcion: 'Nota de Crédito M', letra: 'M', signo: -1 },
]

export interface ReglaComprobante {
  condicionEmisor: number
  condicionReceptor: number
  tipoComprobante: number
}

/**
 * Qué comprobante corresponde según quién emite y quién recibe.
 *
 * Vive en la base y no como condicionales en el código porque cambia por normativa, y
 * no queremos desplegar la aplicación para adaptarnos a una resolución general.
 *
 * Falta la Factura M (código 51), que aplica cuando AFIP observa al receptor: eso no
 * sale de la condición frente al IVA sino de una consulta al padrón, así que se
 * resuelve en el momento de facturar y no con esta tabla.
 */
export const REGLAS_COMPROBANTE: ReglaComprobante[] = [
  // Responsable Inscripto emite…
  { condicionEmisor: 1, condicionReceptor: 1, tipoComprobante: 1 }, // a RI → A
  { condicionEmisor: 1, condicionReceptor: 4, tipoComprobante: 6 }, // a Exento → B
  { condicionEmisor: 1, condicionReceptor: 5, tipoComprobante: 6 }, // a Consumidor Final → B
  // A monotributistas, A desde la RG 5.003 (abril de 2021). La RG 5.616 lo confirma: la
  // Factura A admite como receptor a Monotributo y Monotributista Social.
  { condicionEmisor: 1, condicionReceptor: 6, tipoComprobante: 1 }, // a Monotributo → A
  { condicionEmisor: 1, condicionReceptor: 7, tipoComprobante: 6 }, // a No Categorizado → B
  { condicionEmisor: 1, condicionReceptor: 9, tipoComprobante: 19 }, // a Exterior → E
  { condicionEmisor: 1, condicionReceptor: 10, tipoComprobante: 6 }, // a Ley 19.640 → B
  { condicionEmisor: 1, condicionReceptor: 13, tipoComprobante: 1 }, // a Monotributo Social → A

  // Monotributo emite C a cualquiera.
  { condicionEmisor: 6, condicionReceptor: 1, tipoComprobante: 11 },
  { condicionEmisor: 6, condicionReceptor: 4, tipoComprobante: 11 },
  { condicionEmisor: 6, condicionReceptor: 5, tipoComprobante: 11 },
  { condicionEmisor: 6, condicionReceptor: 6, tipoComprobante: 11 },
  { condicionEmisor: 6, condicionReceptor: 7, tipoComprobante: 11 },
  { condicionEmisor: 6, condicionReceptor: 9, tipoComprobante: 19 },
  { condicionEmisor: 6, condicionReceptor: 13, tipoComprobante: 11 },

  // Exento emite C.
  { condicionEmisor: 4, condicionReceptor: 1, tipoComprobante: 11 },
  { condicionEmisor: 4, condicionReceptor: 5, tipoComprobante: 11 },
  { condicionEmisor: 4, condicionReceptor: 6, tipoComprobante: 11 },
]
