/**
 * La revisión de la hoja de recepción: los puntos que se miran con un semáforo.
 *
 * El dibujo dice **en qué estado vino** el auto; la revisión dice **qué le falta**. El dibujo
 * existe para no comerse un reclamo, la revisión para encontrar trabajo. El porqué entero, en
 * `docs/tecnicos/hoja-de-recepcion.md`.
 *
 * Los puntos no son una lista del código: son un catálogo de cada concesionaria, que arranca
 * con los de acá y después cada una apaga, ordena y agrega. Lo que vive acá es el vocabulario
 * —las secciones y los colores— y la semilla.
 */

/** Las secciones de la hoja de VW, en su orden. Un punto propio entra en alguna de éstas. */
export const SECCIONES_REVISION = [
  'exterior',
  'interior',
  'motor',
  'dinamica',
  'neumaticos',
] as const
export type SeccionRevision = (typeof SECCIONES_REVISION)[number]

export const SECCIONES_REVISION_NOMBRE: Record<SeccionRevision, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  motor: 'Motor',
  dinamica: 'Inspección dinámica',
  neumaticos: 'Neumáticos',
}

/**
 * La que pide prueba de ruta, y por eso **no se llena en el mostrador**: se completa después,
 * en el taller. La recepción la muestra, pero no la espera.
 */
export const SECCION_EN_TALLER: SeccionRevision = 'dinamica'

/**
 * Tres colores. **Sin revisar no es uno de ellos**: es la ausencia de respuesta, y es lo que
 * traen todos los puntos hasta que alguien los toca. Si la casilla vacía contara como verde,
 * una revisión que nadie hizo diría que el auto está impecable.
 */
export const ESTADOS_REVISION = ['verde', 'ambar', 'rojo'] as const
export type EstadoRevision = (typeof ESTADOS_REVISION)[number]

/**
 * Cómo se dice cada color, y con qué **forma**: la hoja se imprime en blanco y negro, y uno de
 * cada doce varones no distingue el rojo del verde. El color solo no alcanza nunca.
 */
export const ESTADOS_REVISION_INFO: Record<
  EstadoRevision,
  { nombre: string; corto: string; signo: string }
> = {
  verde: { nombre: 'Está bien', corto: 'Bien', signo: '✓' },
  ambar: { nombre: 'Necesita reparación', corto: 'Reparar', signo: '!' },
  rojo: { nombre: 'Reparación urgente', corto: 'Urgente', signo: '!!' },
}

/** Los dos que son trabajo para ofrecer. */
export const ESTADOS_CON_TRABAJO: readonly EstadoRevision[] = ['ambar', 'rojo']

export const MAXIMO_NOMBRE_PUNTO = 60
export const MAXIMO_NOTA_PUNTO = 120

export interface PuntoInicial {
  /**
   * Identifica al punto sembrado, para no sembrarlo dos veces. Los que agrega cada taller no
   * la tienen: ésos no vienen de ningún lado.
   */
  clave: string
  seccion: SeccionRevision
  nombre: string
}

/**
 * Los de la hoja de VW, agrupados como los agrupa ella, más los neumáticos de su pie de página.
 * Son la semilla de cada concesionaria, no una lista fija: los nombres los puede cambiar y los
 * puntos los puede apagar.
 */
export const PUNTOS_REVISION_INICIALES: readonly PuntoInicial[] = [
  { clave: 'opticas_delanteras', seccion: 'exterior', nombre: 'Ópticas y luces delanteras' },
  { clave: 'opticas_traseras', seccion: 'exterior', nombre: 'Ópticas y luces traseras' },
  { clave: 'limpieza_exterior', seccion: 'exterior', nombre: 'Limpieza exterior' },

  { clave: 'testigos', seccion: 'interior', nombre: 'Testigos e indicadores' },
  {
    clave: 'escobillas_delanteras',
    seccion: 'interior',
    nombre: 'Escobillas y eyectores delanteros',
  },
  {
    clave: 'escobillas_traseras',
    seccion: 'interior',
    nombre: 'Escobillas y eyectores traseros',
  },
  { clave: 'luces_interior', seccion: 'interior', nombre: 'Luces de interior, guantera y baúl' },
  { clave: 'freno_de_mano', seccion: 'interior', nombre: 'Freno de mano' },
  { clave: 'bocina', seccion: 'interior', nombre: 'Bocina' },
  { clave: 'alzacristales_delanteros', seccion: 'interior', nombre: 'Alzacristales delanteros' },
  { clave: 'alzacristales_traseros', seccion: 'interior', nombre: 'Alzacristales traseros' },
  { clave: 'cierre_centralizado', seccion: 'interior', nombre: 'Cierre centralizado' },
  { clave: 'butacas', seccion: 'interior', nombre: 'Estado de butacas' },
  { clave: 'limpieza_interior', seccion: 'interior', nombre: 'Limpieza interior' },

  { clave: 'refrigerante', seccion: 'motor', nombre: 'Nivel de refrigerante' },
  { clave: 'liquido_de_freno', seccion: 'motor', nombre: 'Nivel de líquido de freno' },
  { clave: 'bateria', seccion: 'motor', nombre: 'Estado de batería' },
  { clave: 'correas', seccion: 'motor', nombre: 'Correas' },

  { clave: 'perdida_fluidos', seccion: 'dinamica', nombre: 'Pérdida de fluidos' },
  { clave: 'escape', seccion: 'dinamica', nombre: 'Escape y fijaciones' },
  { clave: 'bajo_carroceria', seccion: 'dinamica', nombre: 'Daños de bajo carrocería' },
  { clave: 'frenos', seccion: 'dinamica', nombre: 'Pastillas y discos de freno' },
  { clave: 'otros_danios', seccion: 'dinamica', nombre: 'Otros daños' },

  { clave: 'neumatico_di', seccion: 'neumaticos', nombre: 'Delantero izquierdo' },
  { clave: 'neumatico_dd', seccion: 'neumaticos', nombre: 'Delantero derecho' },
  { clave: 'neumatico_ti', seccion: 'neumaticos', nombre: 'Trasero izquierdo' },
  { clave: 'neumatico_td', seccion: 'neumaticos', nombre: 'Trasero derecho' },
  { clave: 'auxilio', seccion: 'neumaticos', nombre: 'Auxilio' },
  { clave: 'llave_antirrobo', seccion: 'neumaticos', nombre: 'Llave antirrobo' },
]

/**
 * El renglón de trabajo que sale de un punto al pasarlo a presupuesto: el nombre del punto y,
 * si alguien escribió algo, lo que escribió. «Pastillas y discos de freno: disco trasero rayado».
 */
export function trabajoDePunto(nombre: string, nota: string | null | undefined): string {
  const detalle = nota?.trim()
  return detalle ? `${nombre}: ${detalle}` : nombre
}
