import { createMongoAbility, type MongoAbility, subject } from '@casl/ability'

/**
 * Permisos, compartidos entre la API y el front.
 *
 * La misma definición se evalúa en los dos lados: en el front para decidir si un botón
 * se muestra, y en la API para decidir si la operación se ejecuta. Que sea la misma no
 * es una comodidad — es lo que evita que la interfaz ofrezca algo que el servidor
 * después rechaza, que es la forma más rápida de que un usuario pierda la confianza en
 * un sistema.
 *
 * Ojo con la asimetría: el front oculta, la API decide. Ocultar un botón nunca es una
 * medida de seguridad.
 */

export const ACCIONES_PERMISO = [
  'ver',
  'crear',
  'editar',
  'anular',
  'facturar',
  /**
   * Tocar la configuración del módulo al que pertenece el sujeto: `configurar Comprobante`
   * es el engranaje de contable, `configurar Orden` el de servicios.
   *
   * Es una acción aparte y no parte de `editar` porque ahí viven **credenciales**: la
   * cuenta de Mercado Pago, los certificados de AFIP. Quien las toca puede facturar con
   * el CUIT de la empresa o mandar la cobranza a otra cuenta. Poder trabajar en un módulo
   * no es poder configurarlo, y ningún rol predefinido la trae salvo el gerente, que la
   * tiene por `administrar all`.
   */
  'configurar',
  'administrar',
] as const

export type AccionPermiso = (typeof ACCIONES_PERMISO)[number]

export const SUJETOS = [
  'Orden',
  'Vehiculo',
  'Cliente',
  'Proveedor',
  'Repuesto',
  'Comprobante',
  'Empleado',
  'Empresa',
  'Usuario',
  'Configuracion',
  'Auditoria',
  'all',
] as const

export type Sujeto = (typeof SUJETOS)[number]

export type Habilidades = MongoAbility<[AccionPermiso, Sujeto]>

/**
 * Cómo se dice cada permiso en una frase: «No tenés permiso para dar de alta vehículos».
 *
 * Son `Record` completos a propósito: agregar una acción o un sujeto sin su etiqueta no
 * compila. Un aviso de permiso que dice «crear Vehiculo» le habla al programador, no a
 * quien está parado en el mostrador.
 */
const VERBOS: Record<AccionPermiso, string> = {
  ver: 'ver',
  crear: 'dar de alta',
  editar: 'modificar',
  anular: 'anular',
  facturar: 'facturar',
  configurar: 'configurar',
  administrar: 'administrar',
}

const SUSTANTIVOS: Record<Sujeto, string> = {
  Orden: 'órdenes de trabajo',
  Vehiculo: 'vehículos',
  Cliente: 'clientes',
  Proveedor: 'proveedores',
  Repuesto: 'repuestos',
  Comprobante: 'comprobantes',
  Empleado: 'legajos de empleados',
  Empresa: 'empresas',
  Usuario: 'usuarios',
  Configuracion: 'la configuración',
  Auditoria: 'el registro de ingresos y cambios',
  all: 'todo el sistema',
}

/** «dar de alta», para la casilla de una acción. */
export function nombreAccion(accion: AccionPermiso): string {
  return VERBOS[accion]
}

/** «órdenes de trabajo», para la fila de un sujeto. */
export function nombreSujeto(sujeto: Sujeto): string {
  return SUSTANTIVOS[sujeto]
}

export function describirPermiso(accion: AccionPermiso, sujeto: Sujeto): string {
  return `${VERBOS[accion]} ${SUSTANTIVOS[sujeto]}`
}

/**
 * Si estas habilidades alcanzan para hacer **siempre** esta acción sobre este sujeto: sin
 * condiciones y sin campos que la recorten.
 *
 * CASL devuelve primero la regla que manda. Si esa regla es una prohibición, no alcanza;
 * si tiene condiciones —«edita las órdenes que tiene asignadas»—, tampoco, porque no
 * cubre a quien las edita todas.
 */
function cubreSiempre(habilidades: Habilidades, accion: AccionPermiso, sujeto: Sujeto): boolean {
  const [manda] = habilidades.rulesFor(accion, sujeto)
  if (!manda || manda.conditions || manda.fields) return false
  return !manda.inverted
}

/**
 * Si quien tiene estas habilidades administra usuarios sin límite: asigna cualquier rol y
 * modifica a cualquiera. Lo tienen el gerente, por `administrar all`, y el administrador
 * de sistema.
 *
 * Es una decisión del producto, no un descuido: la concesionaria confía en quien tiene
 * este rol, y lo que lo controla no es un bloqueo sino que **todo queda registrado** —
 * desde qué computadora entró cada uno, quién cambió qué— y que el afectado se entera.
 */
export function administraUsuarios(habilidades: Habilidades): boolean {
  return cubreSiempre(habilidades, 'administrar', 'Usuario')
}

/**
 * Qué le falta a quien tiene estas habilidades para asignar estas reglas, o para modificar
 * a alguien que las tiene. Vacío para quien administra usuarios; para el resto, la regla
 * de siempre: nadie da lo que no tiene.
 */
export function faltaParaAsignar(
  habilidades: Habilidades,
  reglas: readonly ReglaPermiso[],
): string[] {
  return administraUsuarios(habilidades) ? [] : permisosQueNoTiene(habilidades, reglas)
}

/**
 * Lo que estas reglas dan y quien tiene estas habilidades **no** tiene: la respuesta a
 * «¿puede asignar este rol?».
 *
 * La regla es que **nadie da lo que no tiene**. Quien reparte roles y genera contraseñas
 * puede entrar como el usuario que acaba de crear: asignar un permiso es, en la práctica,
 * tenerlo. Sin esto, el administrador de usuarios se crearía un gerente.
 *
 * Las prohibiciones del rol (`inverted`) no dan nada y no se cuentan. Devuelve las
 * frases ya escritas —«ver legajos de empleados»— para decirle a quien intenta qué le
 * falta.
 */
export function permisosQueNoTiene(
  habilidades: Habilidades,
  reglas: readonly ReglaPermiso[],
): string[] {
  const faltan = new Set<string>()

  for (const regla of reglas) {
    if (regla.inverted) continue
    const acciones = Array.isArray(regla.action) ? regla.action : [regla.action]
    const sujetos = Array.isArray(regla.subject) ? regla.subject : [regla.subject]

    for (const accion of acciones) {
      for (const sujeto of sujetos) {
        if (!cubreSiempre(habilidades, accion, sujeto)) faltan.add(describirPermiso(accion, sujeto))
      }
    }
  }

  return [...faltan]
}

/**
 * Lo que se guarda en `rol.habilidades`: el formato crudo que CASL entiende.
 *
 * Los opcionales dicen `| undefined` a propósito. Con `exactOptionalPropertyTypes`, un
 * `conditions?: Record<...>` promete que si la clave está, tiene valor — y una regla
 * que llega de la base, o de zod, puede traerla en `undefined`.
 */
export interface ReglaPermiso {
  action: AccionPermiso | AccionPermiso[]
  subject: Sujeto | Sujeto[]
  conditions?: Record<string, unknown> | undefined
  fields?: string[] | undefined
  inverted?: boolean | undefined
  reason?: string | undefined
}

export function construirHabilidades(reglas: readonly ReglaPermiso[]): Habilidades {
  return createMongoAbility<[AccionPermiso, Sujeto]>(reglas as never, {
    // Para CASL el comodín de acciones se llama `manage`, y `all` el de sujetos.
    // Nuestra acción se llama `administrar`: sin esto, CASL la trata como una acción
    // más, y el gerente — `administrar all` — no podía ni ver un vehículo. Pasó
    // inadvertido hasta que la API empezó a aplicar los permisos.
    anyAction: 'administrar',
    anySubjectType: 'all',
  })
}

/**
 * El permiso sobre un objeto concreto, no sobre el sujeto en general: el mecánico puede
 * editar órdenes, pero sólo las suyas. La guardia de la API evalúa sin objeto —y deja pasar
 * una regla con condición—; el servicio vuelve a preguntar con la orden en la mano.
 */
export function puedeSobre(
  habilidades: Habilidades,
  accion: AccionPermiso,
  sujeto: Sujeto,
  datos: Record<string, unknown>,
): boolean {
  return habilidades.can(accion, subject(sujeto, { ...datos }) as never)
}

/**
 * Roles que trae el sistema al crear una concesionaria.
 *
 * Son un punto de partida editable, no una jaula: cada concesionaria organiza su
 * trabajo distinto y va a querer mover permisos. Lo que no se toca es que existan
 * desde el día uno, porque un sistema donde todos pueden todo hasta que alguien
 * configure algo termina con todos pudiendo todo para siempre.
 */
export interface RolPredefinido {
  nombre: string
  descripcion: string
  habilidades: ReglaPermiso[]
}

export const ROLES_PREDEFINIDOS: RolPredefinido[] = [
  {
    nombre: 'Gerente',
    descripcion: 'Acceso total a la concesionaria.',
    habilidades: [{ action: 'administrar', subject: 'all' }],
  },
  {
    nombre: 'Asesor de servicios',
    descripcion: 'Recibe vehículos, abre y cierra órdenes, atiende al cliente.',
    habilidades: [
      { action: ['ver', 'crear', 'editar'], subject: ['Orden', 'Vehiculo', 'Cliente'] },
      { action: 'ver', subject: ['Repuesto', 'Comprobante'] },
      // El legajo lleva sueldos y categoría: no lo ve quien atiende el mostrador.
      { action: 'ver', subject: 'Empleado', inverted: true, reason: 'Contiene datos de sueldo.' },
    ],
  },
  {
    nombre: 'Mecánico',
    descripcion: 'Ve su trabajo asignado y ficha tiempos.',
    habilidades: [
      { action: 'ver', subject: ['Orden', 'Vehiculo', 'Repuesto'] },
      // Sólo edita las órdenes que tiene asignadas: la condición se evalúa contra el
      // objeto, así que no puede tocar el trabajo de otro aunque conozca el número.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: marcador que resuelve resolverCondiciones() al iniciar sesión, no una interpolación olvidada
      { action: 'editar', subject: 'Orden', conditions: { mecanicoId: '${usuarioId}' } },
    ],
  },
  {
    nombre: 'Cajero',
    descripcion: 'Factura y cobra.',
    habilidades: [
      { action: ['ver', 'crear', 'facturar'], subject: 'Comprobante' },
      { action: 'ver', subject: ['Orden', 'Cliente', 'Vehiculo'] },
      { action: ['ver', 'crear', 'editar'], subject: 'Cliente' },
      // Anular un comprobante emitido no es un permiso de caja: es una nota de
      // crédito con consecuencias fiscales y la autoriza alguien más.
      { action: 'anular', subject: 'Comprobante', inverted: true },
    ],
  },
  {
    nombre: 'Repuestero',
    descripcion: 'Mostrador y depósito de repuestos.',
    habilidades: [
      { action: ['ver', 'crear', 'editar'], subject: ['Repuesto', 'Proveedor'] },
      { action: 'ver', subject: ['Orden', 'Cliente'] },
    ],
  },
  {
    nombre: 'Administrativo',
    descripcion: 'Cuenta corriente, comprobantes y proveedores.',
    habilidades: [
      { action: ['ver', 'crear', 'editar'], subject: ['Comprobante', 'Cliente', 'Proveedor'] },
      { action: 'anular', subject: 'Comprobante' },
      { action: 'ver', subject: ['Orden', 'Vehiculo', 'Empresa'] },
    ],
  },
  {
    nombre: 'Administrador de sistema',
    descripcion:
      'Da de alta usuarios, les asigna cualquier rol y los modifica. No cambia sus propios ' +
      'roles, y todo lo que hace queda registrado.',
    habilidades: [
      { action: 'administrar', subject: 'Usuario' },
      { action: 'ver', subject: ['Empresa', 'Auditoria'] },
    ],
  },
]

/**
 * Reemplaza los marcadores de las condiciones con los datos de quien está usando el
 * sistema. `{ mecanicoId: '${usuarioId}' }` sólo sirve una vez que sabemos quién es.
 */
export function resolverCondiciones(
  reglas: readonly ReglaPermiso[],
  contexto: Readonly<Record<string, string>>,
): ReglaPermiso[] {
  return reglas.map((regla) => {
    if (!regla.conditions) return regla

    const resueltas: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(regla.conditions)) {
      resueltas[clave] =
        typeof valor === 'string' && valor.startsWith('${') && valor.endsWith('}')
          ? (contexto[valor.slice(2, -1)] ?? null)
          : valor
    }

    return { ...regla, conditions: resueltas }
  })
}
