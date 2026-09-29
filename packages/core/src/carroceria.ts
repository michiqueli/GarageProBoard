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

/**
 * Los tres dibujos. Las hojas impresas traen las siluetas todas juntas y el que recibe tacha
 * la que no va, porque el papel no sabe qué auto va a entrar. Nosotros sí sabemos, así que se
 * dibuja una sola: la que es.
 */
export const SILUETAS = ['auto', 'pickup', 'furgon'] as const
export type Silueta = (typeof SILUETAS)[number]

/**
 * La carrocería es del modelo, no del vehículo: una Amarok es pickup por ser Amarok. No sale
 * del dominio, que es secuencial y no dice nada, ni del chasis, cuyas posiciones 4 a 8 las
 * define cada terminal sin norma común —y que acá además puede ser un chasis nacional viejo
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
 * Siete carrocerías y tres dibujos. Un sedán, un SUV y un hatchback se marcan igual —capot,
 * techo, baúl, cuatro puertas—; lo que cambia de verdad es que la pickup tiene caja y el
 * furgón no tiene ni luneta ni baúl. Agregar una silueta por cada nombre sería dibujar tres
 * veces lo mismo para que después nadie sepa cuál le toca.
 */
export const SILUETA_DE: Record<Carroceria, Silueta> = {
  sedan: 'auto',
  hatchback: 'auto',
  coupe: 'auto',
  familiar: 'auto',
  suv: 'auto',
  pickup: 'pickup',
  furgon: 'furgon',
}

/** Con qué se dibuja mientras nadie dijo qué es. Es el caso de la enorme mayoría. */
export const SILUETA_POR_OMISION: Silueta = 'auto'

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
// Las columnas: rueda y espejo, costado, cuerpo, costado, rueda y espejo. Son las mismas en
// las tres siluetas, así el dibujo entra en el mismo lugar de la hoja sea un auto o un furgón.
const RUEDA_IZQ = 22
const COSTADO_IZQ = 38
const CUERPO = 70
const COSTADO_DER = 170
const RUEDA_DER = 202
// Y el largo también: 334 de carrocería, del paragolpes de adelante al de atrás.
const LARGO = 334

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
const AUTO: readonly Zona[] = [
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

/**
 * Doble cabina, que es la que entra a un taller de concesionaria. El capot y la cabina se
 * acortan para que entre la caja, y la caja se marca aparte del portón: el golpe en la caja es
 * el de cargar, y el del portón es el de estacionar.
 */
const PICKUP: readonly Zona[] = [
  z('paragolpes_delantero', 'Paragolpes delantero', CUERPO, 0, 100, 18, 8),
  z('capot', 'Capot', CUERPO, 18, 100, 58),
  z('optica_delantera_izquierda', 'Óptica delantera izquierda', CUERPO, 18, 24, 13),
  z('optica_delantera_derecha', 'Óptica delantera derecha', 146, 18, 24, 13),
  z('parabrisas', 'Parabrisas', CUERPO + 4, 76, 92, 26),
  z('techo', 'Techo', CUERPO + 4, 102, 92, 60),
  z('luneta', 'Ventanilla trasera', CUERPO + 4, 162, 92, 20),
  z('caja', 'Caja de carga', CUERPO, 182, 100, 118),
  z('porton_caja', 'Portón de caja', CUERPO, 300, 100, 16),
  z('optica_trasera_izquierda', 'Óptica trasera izquierda', CUERPO, 303, 24, 13),
  z('optica_trasera_derecha', 'Óptica trasera derecha', 146, 303, 24, 13),
  z('paragolpes_trasero', 'Paragolpes trasero', CUERPO, 316, 100, 18, 8),

  z(
    'guardabarros_delantero_izquierdo',
    'Guardabarros delantero izquierdo',
    COSTADO_IZQ,
    18,
    32,
    58,
  ),
  z('puerta_delantera_izquierda', 'Puerta delantera izquierda', COSTADO_IZQ, 76, 32, 56),
  z('puerta_trasera_izquierda', 'Puerta trasera izquierda', COSTADO_IZQ, 132, 32, 50),
  z('guardabarros_trasero_izquierdo', 'Guardabarros trasero izquierdo', COSTADO_IZQ, 182, 32, 58),
  z('lateral_caja_izquierdo', 'Lateral de caja izquierdo', COSTADO_IZQ, 240, 32, 76),
  z('guardabarros_delantero_derecho', 'Guardabarros delantero derecho', COSTADO_DER, 18, 32, 58),
  z('puerta_delantera_derecha', 'Puerta delantera derecha', COSTADO_DER, 76, 32, 56),
  z('puerta_trasera_derecha', 'Puerta trasera derecha', COSTADO_DER, 132, 32, 50),
  z('guardabarros_trasero_derecho', 'Guardabarros trasero derecho', COSTADO_DER, 182, 32, 58),
  z('lateral_caja_derecho', 'Lateral de caja derecho', COSTADO_DER, 240, 32, 76),

  z('rueda_delantera_izquierda', 'Rueda delantera izquierda', RUEDA_IZQ, 26, 16, 46, 6),
  z('espejo_izquierdo', 'Espejo izquierdo', RUEDA_IZQ, 86, 16, 18, 5),
  z('rueda_trasera_izquierda', 'Rueda trasera izquierda', RUEDA_IZQ, 190, 16, 46, 6),
  z('rueda_delantera_derecha', 'Rueda delantera derecha', RUEDA_DER, 26, 16, 46, 6),
  z('espejo_derecho', 'Espejo derecho', RUEDA_DER, 86, 16, 18, 5),
  z('rueda_trasera_derecha', 'Rueda trasera derecha', RUEDA_DER, 190, 16, 46, 6),
]

/**
 * El furgón no tiene luneta ni baúl: tiene portones. Y en el costado, donde el auto tiene la
 * puerta trasera, tiene la corrediza —que es la que más se raya, porque se abre contra el
 * cordón—. El panel lateral ciego va con el guardabarros trasero, que es una sola chapa.
 */
const FURGON: readonly Zona[] = [
  z('paragolpes_delantero', 'Paragolpes delantero', CUERPO, 0, 100, 18, 8),
  z('capot', 'Capot', CUERPO, 18, 100, 40),
  z('optica_delantera_izquierda', 'Óptica delantera izquierda', CUERPO, 18, 24, 13),
  z('optica_delantera_derecha', 'Óptica delantera derecha', 146, 18, 24, 13),
  z('parabrisas', 'Parabrisas', CUERPO + 4, 58, 92, 30),
  z('techo', 'Techo', CUERPO + 4, 88, 92, 212),
  z('porton_trasero', 'Portones traseros', CUERPO, 300, 100, 16),
  z('optica_trasera_izquierda', 'Óptica trasera izquierda', CUERPO, 303, 24, 13),
  z('optica_trasera_derecha', 'Óptica trasera derecha', 146, 303, 24, 13),
  z('paragolpes_trasero', 'Paragolpes trasero', CUERPO, 316, 100, 18, 8),

  z(
    'guardabarros_delantero_izquierdo',
    'Guardabarros delantero izquierdo',
    COSTADO_IZQ,
    18,
    32,
    70,
  ),
  z('puerta_delantera_izquierda', 'Puerta delantera izquierda', COSTADO_IZQ, 88, 32, 56),
  z('puerta_lateral_izquierda', 'Puerta lateral izquierda', COSTADO_IZQ, 144, 32, 96),
  z('guardabarros_trasero_izquierdo', 'Lateral trasero izquierdo', COSTADO_IZQ, 240, 32, 76),
  z('guardabarros_delantero_derecho', 'Guardabarros delantero derecho', COSTADO_DER, 18, 32, 70),
  z('puerta_delantera_derecha', 'Puerta delantera derecha', COSTADO_DER, 88, 32, 56),
  z('puerta_lateral_derecha', 'Puerta lateral derecha', COSTADO_DER, 144, 32, 96),
  z('guardabarros_trasero_derecho', 'Lateral trasero derecho', COSTADO_DER, 240, 32, 76),

  z('rueda_delantera_izquierda', 'Rueda delantera izquierda', RUEDA_IZQ, 26, 16, 46, 6),
  z('espejo_izquierdo', 'Espejo izquierdo', RUEDA_IZQ, 94, 16, 18, 5),
  z('rueda_trasera_izquierda', 'Rueda trasera izquierda', RUEDA_IZQ, 252, 16, 46, 6),
  z('rueda_delantera_derecha', 'Rueda delantera derecha', RUEDA_DER, 26, 16, 46, 6),
  z('espejo_derecho', 'Espejo derecho', RUEDA_DER, 94, 16, 18, 5),
  z('rueda_trasera_derecha', 'Rueda trasera derecha', RUEDA_DER, 252, 16, 46, 6),
]

const POR_SILUETA: Record<Silueta, readonly Zona[]> = {
  auto: AUTO,
  pickup: PICKUP,
  furgon: FURGON,
}

export function zonas(silueta: Silueta): readonly Zona[] {
  return POR_SILUETA[silueta]
}

/**
 * Todas las piezas que existen en algún dibujo. Es lo que acepta el contrato: una marca
 * guardada se sigue leyendo aunque el modelo cambie de carrocería después, y por eso la orden
 * guarda con qué silueta se dibujó.
 */
export const ZONAS_IDS = [...new Set(SILUETAS.flatMap((s) => POR_SILUETA[s].map((x) => x.id)))] as [
  string,
  ...string[],
]

/** Dónde van los rótulos de adelante y atrás. */
export const ROTULOS = {
  adelante: { x: VISTA.ancho / 2, y: 11 },
  atras: { x: VISTA.ancho / 2, y: Y + LARGO + 13 },
} as const

export function zona(silueta: Silueta, id: string): Zona | undefined {
  return POR_SILUETA[silueta].find((x) => x.id === id)
}

/**
 * El contorno del vehículo: la carrocería, el habitáculo y —en la pickup— la caja.
 *
 * Es **lo único que se dibuja**. Las piezas no se dibujan: son áreas de toque invisibles que se
 * encienden cuando el dedo o las flechas pasan por encima. Las hojas de papel llevan todas las
 * divisiones marcadas porque el papel no puede encender nada; copiárselas sería quedarse con
 * el dibujo cargado y sin la ventaja.
 *
 * Van en paths SVG, y no en una imagen, porque **la hoja impresa lleva el mismo dibujo**: un
 * trazado sacado de una foto sale como una mancha en la láser del mostrador.
 */
const CONTORNO: Record<Silueta, readonly string[]> = {
  /**
   * La trompa más angosta que la cola y el habitáculo que se abre hacia atrás: es lo que hace
   * que se lea como un auto visto de arriba y no como una pastilla. El capot y el baúl van
   * marcados porque son las dos chapas que cualquiera reconoce de un vistazo.
   */
  auto: [
    'M76 18 C54 21 38 42 38 76 L38 296 C38 330 52 352 76 352 L164 352 C188 352 202 330 202 296 L202 76 C202 42 186 21 164 18 Z',
    'M92 114 C82 116 74 128 74 144 L74 238 C74 252 80 262 90 264 L150 264 C160 262 166 252 166 238 L166 144 C166 128 158 116 148 114 Z',
    'M84 42 L156 42 C162 42 166 46 166 52 L166 100 C166 106 162 110 156 110 L84 110 C78 110 74 106 74 100 L74 52 C74 46 78 42 84 42 Z',
    'M80 272 L160 272 C164 272 168 276 168 281 L168 322 C168 327 164 330 160 330 L80 330 C76 330 72 327 72 322 L72 281 C72 276 76 272 80 272 Z',
  ],
  /** Cuadrada, con la cabina corta adelante y la caja abierta, que es la mitad del vehículo. */
  pickup: [
    'M66 18 C50 20 38 34 38 56 L38 316 C38 338 50 352 66 352 L174 352 C190 352 202 338 202 316 L202 56 C202 34 190 20 174 18 Z',
    'M90 94 C81 96 74 106 74 118 L74 178 C74 190 80 198 89 200 L151 200 C160 198 166 190 166 178 L166 118 C166 106 159 96 150 94 Z',
    'M52 206 L188 206 C191 206 194 209 194 212 L194 306 C194 309 191 312 188 312 L52 312 C49 312 46 309 46 306 L46 212 C46 209 49 206 52 206 Z',
    'M86 40 L154 40 C159 40 162 44 162 48 L162 82 C162 86 159 90 154 90 L86 90 C81 90 78 86 78 82 L78 48 C78 44 81 40 86 40 Z',
  ],
  /** Un cajón: el parabrisas apenas pasada la trompa, y la caja ocupando todo el resto. */
  furgon: [
    'M58 18 C46 20 38 30 38 46 L38 326 C38 342 46 352 58 352 L182 352 C194 352 202 342 202 326 L202 46 C202 30 194 20 182 18 Z',
    'M80 66 L160 66 C164 66 168 70 168 75 L168 100 C168 105 164 108 160 108 L80 108 C76 108 72 105 72 100 L72 75 C72 70 76 66 80 66 Z',
    'M50 118 L190 118 C193 118 196 121 196 124 L196 326 C196 329 193 332 190 332 L50 332 C47 332 44 329 44 326 L44 124 C44 121 47 118 50 118 Z',
  ],
}

/**
 * Las piezas que sí se dibujan, porque quedan afuera de la carrocería y sin dibujarlas no
 * habría dónde tocar. Salen de su propia zona, así que no se pueden desalinear.
 */
const AL_COSTADO = [
  'rueda_delantera_izquierda',
  'rueda_trasera_izquierda',
  'rueda_delantera_derecha',
  'rueda_trasera_derecha',
  'espejo_izquierdo',
  'espejo_derecho',
]

/** Los trazos del vehículo dibujado. Los mismos en la pantalla y en la hoja. */
export function dibujo(silueta: Silueta): string[] {
  const piezas = AL_COSTADO.map((id) => zona(silueta, id))
    .filter((x): x is Zona => Boolean(x))
    .map(trazo)
  return [...CONTORNO[silueta], ...piezas]
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
export function zonaEn(silueta: Silueta, px: number, py: number): Zona | undefined {
  const lista = POR_SILUETA[silueta]
  for (let i = lista.length - 1; i >= 0; i--) {
    const x = lista[i] as Zona
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
