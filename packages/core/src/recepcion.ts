/**
 * La recepción de la concesionaria: quién está en la puerta, a qué vino y quién lo atiende.
 *
 * Todo gira alrededor de **la visita**: alguien que está en la concesionaria. El turno dice
 * quién va a venir; el tótem es la visita anotándose sola. El porqué entero, en
 * `docs/tecnicos/recepcion-y-turnos.md`.
 */

/** A qué vino, en el orden en que se ofrece. */
export const MOTIVOS_VISITA = [
  'servicio',
  'retiro',
  'venta',
  'plan_ahorro',
  'usados',
  'repuestos',
  'administracion',
  'otro',
] as const
export type MotivoVisita = (typeof MOTIVOS_VISITA)[number]

export const MOTIVOS_VISITA_NOMBRE: Record<MotivoVisita, string> = {
  servicio: 'Servicio',
  retiro: 'Retirar el auto',
  venta: 'Venta 0km',
  plan_ahorro: 'Plan de ahorro',
  usados: 'Usados',
  repuestos: 'Repuestos',
  administracion: 'Administración',
  otro: 'Otro',
}

/**
 * La letra del número que se llama: `S-014`, `V-003`. Venta, plan de ahorro y usados
 * comparten la V porque los atiende el mismo salón, y una letra por motivo haría que el
 * cliente con la P no entienda por qué llaman a la U antes que a él.
 */
export const LETRA_VISITA: Record<MotivoVisita, string> = {
  servicio: 'S',
  // El que viene a buscar el auto va al mismo mostrador que el que lo trae.
  retiro: 'S',
  venta: 'V',
  plan_ahorro: 'V',
  usados: 'V',
  repuestos: 'R',
  administracion: 'A',
  otro: 'A',
}

/**
 * A quién se le ofrece derivarlo, por su puesto. Los demás se pueden elegir igual —el
 * gerente atiende a cualquiera—, pero van después.
 *
 * Los puestos se escriben acá como texto porque la lista vive en `@gpb/contracts`, que
 * depende de este paquete y no al revés.
 */
export const PUESTOS_POR_MOTIVO: Record<MotivoVisita, readonly string[]> = {
  servicio: ['asesor'],
  retiro: ['asesor'],
  venta: ['vendedor'],
  plan_ahorro: ['vendedor'],
  usados: ['vendedor'],
  repuestos: ['repuestero'],
  administracion: ['administrativo', 'cajero'],
  otro: [],
}

/**
 * La letra de los números que da el tótem. **Una serie propia**, separada de las del
 * mostrador: el tótem numera solo cuando se corta la red, y si compartiera la S con la
 * recepcionista, los dos darían el S-014 a dos personas distintas.
 */
export const LETRA_TOTEM = 'T'

/** El número como se llama y como se lee: `S-014`. */
export function numeroVisita(letra: string, numero: number): string {
  return `${letra}-${String(numero).padStart(3, '0')}`
}

/**
 * Cómo terminó. `orden` es que se le abrió una al recibir el auto; `entrega`, que vino a
 * buscarlo y se lo llevó. Las dos dicen qué orden.
 */
export const RESULTADOS_VISITA = ['atendida', 'se_fue', 'orden', 'entrega'] as const
export type ResultadoVisita = (typeof RESULTADOS_VISITA)[number]

/**
 * Cuánto se puede esperar antes de que se note. Pasados los primeros minutos la espera se
 * pinta en ámbar, pasados los segundos en rojo: es lo que la recepcionista tiene que ver sin
 * leer los números.
 */
export const ESPERA_AMBAR_MINUTOS = 15
export const ESPERA_ROJO_MINUTOS = 30

export type NivelEspera = 'bien' | 'ambar' | 'rojo'

export function nivelEspera(minutos: number): NivelEspera {
  if (minutos >= ESPERA_ROJO_MINUTOS) return 'rojo'
  if (minutos >= ESPERA_AMBAR_MINUTOS) return 'ambar'
  return 'bien'
}

/**
 * Lo que le pasa a un turno. «Llegó» es que se convirtió en una visita; un turno que nadie
 * marcó como llegado al terminar el día pasa a «ausente» solo.
 */
export const ESTADOS_TURNO = ['agendado', 'llego', 'ausente', 'cancelado'] as const
export type EstadoTurno = (typeof ESTADOS_TURNO)[number]

/** Lo que se le permite escribir en la línea de la visita. */
export const MAXIMO_NOTA_VISITA = 200
