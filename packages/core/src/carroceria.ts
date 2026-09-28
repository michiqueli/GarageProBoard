/**
 * El auto dibujado de la recepción: dónde tiene un rayón, un golpe, algo roto o algo que
 * falta cuando lo dejan.
 *
 * Es la hoja que cualquier concesionaria tiene impresa en el mostrador —la silueta vista de
 * arriba, con los costados abiertos— y existe por el mismo motivo que la firma: cuando el
 * cliente vuelve y dice «este rayón me lo hicieron ustedes», la respuesta es esta hoja.
 *
 * Vive acá y no en la web porque **lo dibujan dos**: la pantalla y el PDF que firma el
 * cliente. Si cada uno tuviera su dibujo, una marca en la puerta de la pantalla podría caer en
 * el guardabarros de la hoja impresa, y la hoja impresa es la que vale.
 *
 * Las coordenadas son del dibujo (`VISTA`), no de la pantalla: una marca guardada desde una
 * tablet cae en el mismo lugar en el monitor del asesor y en la hoja A4.
 */

/** El lienzo: el auto visto de arriba, con el frente para arriba. */
export const VISTA = { ancho: 240, alto: 372 } as const

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

export interface Zona {
  id: string
  nombre: string
  x: number
  y: number
  ancho: number
  alto: number
  /** Radio de las esquinas. Las ruedas y los espejos son más redondos que una puerta. */
  radio: number
}

// El dibujo arranca más abajo para dejar lugar al «Adelante» de arriba.
const Y = 18
// Las columnas: rueda y espejo, costado, cuerpo, costado, rueda y espejo.
const RUEDA_IZQ = 22
const COSTADO_IZQ = 38
const CUERPO = 70
const COSTADO_DER = 170
const RUEDA_DER = 202

const z = (
  id: string,
  nombre: string,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radio = 3,
): Zona => ({ id, nombre, x, y: y + Y, ancho, alto, radio })

/**
 * En orden de dibujo: **lo que va después queda encima** y es lo que recibe el toque. Por eso
 * las ópticas van después del capot y del baúl, que las rodean.
 *
 * Izquierda es la del auto, no la de quien mira la hoja: visto de arriba con el frente para
 * arriba, coinciden. Es el lado del conductor.
 */
export const ZONAS: readonly Zona[] = [
  z('paragolpes_delantero', 'Paragolpes delantero', CUERPO, 0, 100, 18, 8),
  z('capot', 'Capot', CUERPO, 18, 100, 78),
  z('optica_delantera_izquierda', 'Óptica delantera izquierda', CUERPO, 18, 24, 13),
  z('optica_delantera_derecha', 'Óptica delantera derecha', 146, 18, 24, 13),
  z('parabrisas', 'Parabrisas', CUERPO + 4, 96, 92, 30),
  z('techo', 'Techo', CUERPO + 4, 126, 92, 96),
  z('luneta', 'Luneta', CUERPO + 4, 222, 92, 24),
  z('baul', 'Baúl o portón', CUERPO, 246, 100, 70),
  z('optica_trasera_izquierda', 'Óptica trasera izquierda', CUERPO, 303, 24, 13),
  z('optica_trasera_derecha', 'Óptica trasera derecha', 146, 303, 24, 13),
  z('paragolpes_trasero', 'Paragolpes trasero', CUERPO, 316, 100, 18, 8),

  z(
    'guardabarros_delantero_izquierdo',
    'Guardabarros delantero izquierdo',
    COSTADO_IZQ,
    18,
    32,
    78,
  ),
  z('puerta_delantera_izquierda', 'Puerta delantera izquierda', COSTADO_IZQ, 96, 32, 78),
  z('puerta_trasera_izquierda', 'Puerta trasera izquierda', COSTADO_IZQ, 174, 32, 72),
  z('guardabarros_trasero_izquierdo', 'Guardabarros trasero izquierdo', COSTADO_IZQ, 246, 32, 70),
  z('guardabarros_delantero_derecho', 'Guardabarros delantero derecho', COSTADO_DER, 18, 32, 78),
  z('puerta_delantera_derecha', 'Puerta delantera derecha', COSTADO_DER, 96, 32, 78),
  z('puerta_trasera_derecha', 'Puerta trasera derecha', COSTADO_DER, 174, 32, 72),
  z('guardabarros_trasero_derecho', 'Guardabarros trasero derecho', COSTADO_DER, 246, 32, 70),

  z('rueda_delantera_izquierda', 'Rueda delantera izquierda', RUEDA_IZQ, 32, 16, 50, 6),
  z('espejo_izquierdo', 'Espejo izquierdo', RUEDA_IZQ, 100, 16, 18, 5),
  z('rueda_trasera_izquierda', 'Rueda trasera izquierda', RUEDA_IZQ, 256, 16, 50, 6),
  z('rueda_delantera_derecha', 'Rueda delantera derecha', RUEDA_DER, 32, 16, 50, 6),
  z('espejo_derecho', 'Espejo derecho', RUEDA_DER, 100, 16, 18, 5),
  z('rueda_trasera_derecha', 'Rueda trasera derecha', RUEDA_DER, 256, 16, 50, 6),
]

export const ZONAS_IDS = ZONAS.map((x) => x.id) as [string, ...string[]]

/** Dónde van los rótulos de adelante y atrás. */
export const ROTULOS = {
  adelante: { x: VISTA.ancho / 2, y: 11 },
  atras: { x: VISTA.ancho / 2, y: Y + 334 + 13 },
} as const

export function zona(id: string): Zona | undefined {
  return ZONAS.find((x) => x.id === id)
}

/** El trazo SVG de una zona. Lo usan la pantalla y el PDF, que así dibujan lo mismo. */
export function trazo(x: Zona): string {
  const r = Math.min(x.radio, x.ancho / 2, x.alto / 2)
  const d = x.x + x.ancho
  const b = x.y + x.alto
  return [
    `M${x.x + r} ${x.y}`,
    `H${d - r}`,
    `Q${d} ${x.y} ${d} ${x.y + r}`,
    `V${b - r}`,
    `Q${d} ${b} ${d - r} ${b}`,
    `H${x.x + r}`,
    `Q${x.x} ${b} ${x.x} ${b - r}`,
    `V${x.y + r}`,
    `Q${x.x} ${x.y} ${x.x + r} ${x.y}`,
    'Z',
  ].join(' ')
}

export function centro(x: Zona): { x: number; y: number } {
  return { x: x.x + x.ancho / 2, y: x.y + x.alto / 2 }
}

/**
 * La zona que cae en un punto, la de más arriba si se pisan. Se recalcula en el servidor: la
 * zona que se guarda es la del punto, no la que mandó la pantalla, así una marca nunca dice
 * «capot» dibujada sobre el techo.
 */
export function zonaEn(px: number, py: number): Zona | undefined {
  for (let i = ZONAS.length - 1; i >= 0; i--) {
    const x = ZONAS[i] as Zona
    if (px >= x.x && px <= x.x + x.ancho && py >= x.y && py <= x.y + x.alto) return x
  }
  return undefined
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
