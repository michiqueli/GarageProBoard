/**
 * Las tablas que llevan datos de un cliente y por lo tanto viven detrás de RLS.
 *
 * Esta lista es la fuente de verdad del aislamiento: agregar una tabla con
 * `tenant_id` y olvidarse de sumarla acá es la única forma de abrir un agujero,
 * y por eso hay un test que compara esta lista contra el catálogo de Postgres.
 */
export const TABLAS_CON_TENANT = [
  'empresa',
  'sucursal',
  'punto_venta',
  'comprobante_secuencia',
  'entidad_comercial',
  'cliente',
  'proveedor',
  'empleado',
  'marca',
  'modelo',
  'vehiculo',
  'titularidad',
  'usuario',
  'rol',
  'usuario_rol',
  'usuario_sucursal',
  'usuario_config',
  'usuario_atajo',
  'auditoria',
  'sesion',
  'tenant_modulo',
] as const

/**
 * Catálogos compartidos por todos los clientes: provincias y las tablas de AFIP.
 * No llevan `tenant_id` y se leen sin restricción.
 */
export const TABLAS_CATALOGO = [
  'provincia',
  'condicion_iva',
  'tipo_comprobante',
  'regla_comprobante',
] as const

/** El rol con el que se conecta la API: sin BYPASSRLS y sin ser dueño de nada. */
export const ROL_APP = 'garagepro_app'

/** Variable de sesión que las políticas comparan contra `tenant_id`. */
export const VAR_TENANT = 'app.tenant_id'

/**
 * Tablas con datos de un cliente que la aplicación **lee pero no escribe**.
 *
 * Lo que dice qué contrató la concesionaria no lo puede cambiar la concesionaria. Las
 * escribe el back-office, con otro rol.
 */
export const TABLAS_SOLO_LECTURA = ['tenant_modulo'] as const satisfies ReadonlyArray<
  (typeof TABLAS_CON_TENANT)[number]
>
