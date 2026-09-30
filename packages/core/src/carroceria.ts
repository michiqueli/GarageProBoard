/**
 * Lo que trae el vehículo cuando lo dejan: los rayones, los golpes, lo roto, lo que falta, y lo
 * que vino adentro.
 *
 * Acá vive el vocabulario; el dibujo sobre el que se marca está en `hoja.ts` y lo carga cada
 * concesionaria. El porqué de esa separación, en `docs/tecnicos/hoja-de-recepcion.md`.
 */

export const TIPOS_DANIO = ['rayon', 'golpe', 'roto', 'falta'] as const
export type TipoDanio = (typeof TIPOS_DANIO)[number]

/**
 * La letra es la que va adentro de la marca, y es la que se usa en las hojas de papel de
 * siempre: el que recibe la reconoce sin leer nada. También es la tecla con que se marca.
 */
export const DANIOS: Record<TipoDanio, { nombre: string; letra: string }> = {
  rayon: { nombre: 'Rayón', letra: 'R' },
  golpe: { nombre: 'Golpe', letra: 'G' },
  roto: { nombre: 'Roto o rajado', letra: 'X' },
  falta: { nombre: 'Falta', letra: 'F' },
}

/**
 * La carrocería es del modelo, no del vehículo: una Amarok es pickup por ser Amarok. No sale
 * del dominio, que es secuencial y no dice nada, ni del chasis, cuyas posiciones de carrocería
 * las define cada terminal sin norma común —y que acá además puede ser un chasis nacional viejo
 * de seis caracteres—.
 */
export const CARROCERIAS = [
  'sedan',
  'hatchback',
  'coupe',
  'familiar',
  'suv',
  'pickup',
  'furgon',
] as const
export type Carroceria = (typeof CARROCERIAS)[number]

export const CARROCERIAS_NOMBRE: Record<Carroceria, string> = {
  sedan: 'Sedán',
  hatchback: 'Hatchback',
  coupe: 'Coupé',
  familiar: 'Familiar',
  suv: 'SUV',
  pickup: 'Pickup',
  furgon: 'Furgón',
}

/**
 * Lo que tiene que venir con el auto, y que el cliente reclama si no está: el auxilio, el
 * gato, la llave de la tuerca antirrobo —la que más se pierde en un taller—. Se revisa uno por
 * uno delante del cliente.
 */
export const ELEMENTOS_INVENTARIO = [
  'auxilio',
  'gato',
  'llave_rueda',
  'llave_antirrobo',
  'matafuego',
  'balizas',
  'alfombras',
  'estereo',
  'cedula',
  'manual',
] as const
export type ElementoInventario = (typeof ELEMENTOS_INVENTARIO)[number]

export const INVENTARIO: Record<ElementoInventario, string> = {
  auxilio: 'Rueda de auxilio',
  gato: 'Gato',
  llave_rueda: 'Llave de rueda',
  llave_antirrobo: 'Llave de tuerca antirrobo',
  matafuego: 'Matafuego',
  balizas: 'Balizas',
  alfombras: 'Alfombras',
  estereo: 'Estéreo',
  cedula: 'Cédula',
  manual: 'Manual y libreta de service',
}

/**
 * Tres valores y no dos: **sin revisar no es lo mismo que está**. Si la casilla vacía
 * significara «está», un inventario que nadie hizo diría que el auto vino completo.
 */
export const CONTROLES_INVENTARIO = ['esta', 'falta'] as const
export type ControlInventario = (typeof CONTROLES_INVENTARIO)[number]
