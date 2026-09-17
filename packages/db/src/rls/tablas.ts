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
  'certificado_afip',
  'comprobante',
  'comprobante_renglon',
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
  'dispositivo',
  'aviso',
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
export const ROL_APP = 'gpb_app'

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

/** El rol con el que se conecta el back-office. Otro rol, otras credenciales, otro proceso. */
export const ROL_BACKOFFICE = 'gpb_backoffice'

/**
 * Las tablas del back-office. El rol de la API no tiene **ningún** permiso sobre ellas.
 */
export const TABLAS_BACKOFFICE = ['operador', 'sesion_operador', 'auditoria_backoffice'] as const

/**
 * Las tablas que el back-office ve **de todas las concesionarias** a la vez. Para listar
 * clientes y sus módulos no hay un tenant que fijar.
 *
 * En estas dos, la política de aislamiento se aplica sólo al rol de la API. Si se aplicara
 * a todos, el back-office evaluaría `app_tenant_id()` sin tenant en la sesión y la
 * consulta reventaría, aunque otra política lo dejara pasar.
 */
export const TABLAS_BACKOFFICE_GLOBALES = ['tenant', 'tenant_modulo'] as const

/**
 * Lo que el back-office puede hacer, tabla por tabla. Todo lo que no está acá no lo
 * puede ni leer: ni un vehículo, ni un comprobante, ni una sesión de usuario.
 *
 * Las del alta de una concesionaria llevan `insert` y no `update`: crear la empresa y el
 * primer gerente es nuestro trabajo; lo que la concesionaria haga después, no.
 */
export const PERMISOS_BACKOFFICE: Readonly<Record<string, readonly string[]>> = {
  provincia: ['select'],
  condicion_iva: ['select'],
  tipo_comprobante: ['select'],
  regla_comprobante: ['select'],
  tenant: ['select', 'insert', 'update'],
  // Sin delete: un módulo apagado se apaga, no se borra. La fila guarda desde cuándo
  // lo tuvo.
  tenant_modulo: ['select', 'insert', 'update'],
  empresa: ['select', 'insert'],
  sucursal: ['select', 'insert'],
  rol: ['select', 'insert'],
  usuario: ['select', 'insert'],
  usuario_rol: ['select', 'insert'],
  usuario_sucursal: ['select', 'insert'],
  usuario_config: ['select', 'insert'],
  usuario_atajo: ['select', 'insert'],
  operador: ['select', 'update'],
  sesion_operador: ['select', 'insert', 'update'],
  auditoria_backoffice: ['select', 'insert'],
}
