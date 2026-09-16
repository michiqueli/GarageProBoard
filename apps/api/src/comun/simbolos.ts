/**
 * Los tokens de inyección de la base, en un archivo sin dependencias.
 *
 * Están separados del módulo porque los decoradores los leen al definir la clase: si
 * `DatosDelTenant` los importara desde `base.module.ts`, que a su vez importa
 * `DatosDelTenant`, el ciclo los dejaría sin inicializar justo en ese momento.
 */
export const POOL = Symbol('POOL')
export const DB = Symbol('DB')
/** `(entorno) => ServicioFiscal`: la facturación de AFIP, una por entorno. */
export const FISCAL = Symbol('FISCAL')
