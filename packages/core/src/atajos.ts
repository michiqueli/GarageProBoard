/**
 * Catálogo de acciones con atajo y la lógica para resolver el mapa de cada usuario.
 *
 * Las **acciones** viven acá, en código, porque cada una necesita un manejador: no
 * tiene sentido que existan en la base sin que haya nada que las ejecute. Las
 * **asignaciones** de cada usuario viven en la base, y sólo cuando difieren del valor
 * por omisión.
 *
 * La configuración se presenta agrupada por ámbito:
 *
 *     Configuración → Teclas rápidas → Generales
 *                                    → Órdenes de trabajo
 *                                    → Entregas
 *                                    → Repuestos
 *                                    → …
 */

/** Pantallas con acciones propias. Crece a medida que se construyen. */
export const PANTALLAS = [
  'ordenes',
  'entregas',
  'repuestos',
  'caja',
  'clientes',
  'vehiculos',
] as const

export type Pantalla = (typeof PANTALLAS)[number]

/** `global` son las que funcionan en todas las pantallas. */
export type Ambito = 'global' | Pantalla

export const ETIQUETA_AMBITO: Readonly<Record<Ambito, string>> = {
  global: 'Generales',
  ordenes: 'Órdenes de trabajo',
  entregas: 'Entregas',
  repuestos: 'Repuestos',
  caja: 'Caja y facturación',
  clientes: 'Clientes',
  vehiculos: 'Vehículos',
}

export interface DefinicionAccion {
  /** Único en todo el sistema. Se nombra `ambito.verbo`. */
  accion: string
  ambito: Ambito
  /** Lo que ve el usuario en la configuración y en la barra de estado. */
  etiqueta: string
  porOmision: string
  /**
   * Las estructurales no se pueden reasignar. `Esc` cancela en todos lados o los
   * modales se vuelven trampas: si un usuario se la saca de encima sin querer, queda
   * encerrado en un diálogo sin saber por qué.
   */
  reasignable: boolean
  descripcion?: string
}

/**
 * Las globales. Ojo con tocar los valores por omisión: cada cambio acá le mueve la
 * tecla a todos los que nunca configuraron nada.
 */
const GLOBALES: readonly DefinicionAccion[] = [
  {
    accion: 'global.ayuda',
    ambito: 'global',
    etiqueta: 'Ayuda',
    porOmision: 'F1',
    reasignable: true,
  },
  {
    accion: 'global.guardar',
    ambito: 'global',
    etiqueta: 'Guardar',
    porOmision: 'F2',
    reasignable: true,
  },
  {
    accion: 'global.buscar',
    ambito: 'global',
    etiqueta: 'Buscar',
    porOmision: 'F3',
    reasignable: true,
  },
  {
    accion: 'global.refrescar',
    ambito: 'global',
    etiqueta: 'Refrescar',
    porOmision: 'F5',
    reasignable: true,
  },
  {
    accion: 'global.cambiarSucursal',
    ambito: 'global',
    etiqueta: 'Cambiar sucursal',
    porOmision: 'F6',
    reasignable: true,
  },
  {
    accion: 'global.imprimir',
    ambito: 'global',
    etiqueta: 'Imprimir',
    porOmision: 'F7',
    reasignable: true,
  },
  {
    accion: 'global.totales',
    ambito: 'global',
    etiqueta: 'Totales',
    porOmision: 'F8',
    reasignable: true,
  },
  {
    accion: 'global.paletaComandos',
    ambito: 'global',
    etiqueta: 'Paleta de comandos',
    porOmision: 'F10',
    reasignable: true,
  },
  {
    accion: 'global.desplegarSelector',
    ambito: 'global',
    etiqueta: 'Desplegar selector del campo',
    porOmision: 'Alt+ArrowDown',
    reasignable: true,
  },
  {
    accion: 'global.nuevo',
    ambito: 'global',
    etiqueta: 'Nuevo',
    porOmision: 'Insert',
    reasignable: true,
  },
  {
    accion: 'global.baja',
    ambito: 'global',
    etiqueta: 'Dar de baja',
    porOmision: 'Delete',
    reasignable: true,
  },
  {
    accion: 'global.confirmar',
    ambito: 'global',
    etiqueta: 'Confirmar',
    porOmision: 'Ctrl+Enter',
    reasignable: true,
  },
  {
    accion: 'global.cancelar',
    ambito: 'global',
    etiqueta: 'Cancelar',
    porOmision: 'Escape',
    reasignable: false,
  },
]

/**
 * Las de cada pantalla. La primera de cada grupo es el **verbo de la pantalla** y por eso
 * todas arrancan en F4: nunca coexisten, porque o estás en taller o estás en entregas.
 */
const POR_PANTALLA: readonly DefinicionAccion[] = [
  {
    accion: 'ordenes.cerrar',
    ambito: 'ordenes',
    etiqueta: 'Cerrar la orden',
    porOmision: 'F4',
    reasignable: true,
    descripcion: 'Abre la confirmación con el resumen de mano de obra y repuestos.',
  },
  {
    accion: 'ordenes.fichar',
    ambito: 'ordenes',
    etiqueta: 'Fichar tiempo',
    porOmision: 'F9',
    reasignable: true,
  },
  {
    accion: 'ordenes.agregarRepuesto',
    ambito: 'ordenes',
    etiqueta: 'Agregar repuesto',
    porOmision: 'Alt+R',
    reasignable: true,
  },

  {
    accion: 'entregas.entregar',
    ambito: 'entregas',
    etiqueta: 'Entregar el vehículo',
    porOmision: 'F4',
    reasignable: true,
  },
  {
    accion: 'entregas.checklist',
    ambito: 'entregas',
    etiqueta: 'Checklist de entrega',
    porOmision: 'F9',
    reasignable: true,
  },

  {
    accion: 'repuestos.despachar',
    ambito: 'repuestos',
    etiqueta: 'Despachar',
    porOmision: 'F4',
    reasignable: true,
  },
  {
    accion: 'repuestos.verStock',
    ambito: 'repuestos',
    etiqueta: 'Ver stock en otras sucursales',
    porOmision: 'F9',
    reasignable: true,
  },

  {
    accion: 'caja.facturar',
    ambito: 'caja',
    etiqueta: 'Facturar',
    porOmision: 'F4',
    reasignable: true,
    descripcion: 'Abre la confirmación. Nunca emite directo.',
  },
  {
    accion: 'caja.cobrar',
    ambito: 'caja',
    etiqueta: 'Registrar cobro',
    porOmision: 'F9',
    reasignable: true,
  },

  {
    accion: 'clientes.consultarPadron',
    ambito: 'clientes',
    etiqueta: 'Consultar el padrón por CUIT',
    porOmision: 'F4',
    reasignable: true,
  },

  {
    accion: 'vehiculos.transferir',
    ambito: 'vehiculos',
    etiqueta: 'Transferir titularidad',
    porOmision: 'F4',
    reasignable: true,
  },
  {
    accion: 'vehiculos.historial',
    ambito: 'vehiculos',
    etiqueta: 'Historial completo',
    porOmision: 'F9',
    reasignable: true,
  },
  {
    accion: 'vehiculos.copiarChasis',
    ambito: 'vehiculos',
    etiqueta: 'Copiar chasis',
    porOmision: 'Alt+C',
    reasignable: true,
    descripcion: 'Para pegarlo en el buscador de repuestos o en el sistema de la terminal.',
  },
  {
    accion: 'vehiculos.copiarPatente',
    ambito: 'vehiculos',
    etiqueta: 'Copiar patente',
    porOmision: 'Alt+P',
    reasignable: true,
  },
]

export const CATALOGO: readonly DefinicionAccion[] = [...GLOBALES, ...POR_PANTALLA]

const POR_ACCION = new Map(CATALOGO.map((d) => [d.accion, d]))

/** Para armar la pantalla de configuración, ya agrupada. */
export function catalogoPorAmbito(): Array<{
  ambito: Ambito
  etiqueta: string
  acciones: readonly DefinicionAccion[]
}> {
  const ambitos: Ambito[] = ['global', ...PANTALLAS]

  return ambitos.map((ambito) => ({
    ambito,
    etiqueta: ETIQUETA_AMBITO[ambito],
    acciones: CATALOGO.filter((d) => d.ambito === ambito),
  }))
}

/**
 * Teclas que el navegador se queda para sí. Asignar una de éstas no falla con un
 * error: simplemente no pasa nada, y el usuario concluye que el sistema está roto.
 */
export const TECLAS_PROHIBIDAS: readonly string[] = [
  'F11', // pantalla completa
  'F12', // herramientas de desarrollo
  'Ctrl+W', // cierra la pestaña
  'Ctrl+T', // pestaña nueva
  'Ctrl+N', // ventana nueva
  'Ctrl+Shift+W',
  'Ctrl+Shift+T',
  'Ctrl+Shift+N',
]

/** Estructurales: se reservan aunque la acción que las usa no esté en juego. */
export const TECLAS_RESERVADAS: readonly string[] = ['Escape', 'Tab', 'Shift+Tab']

/** `Ctrl+Alt+Shift+Tecla`: modificadores en orden fijo para poder comparar por igualdad. */
const FORMATO_TECLA = /^(Ctrl\+)?(Alt\+)?(Shift\+)?(F[1-9]|F10|[A-Za-z0-9]+)$/

export type MapaAtajos = Readonly<Record<string, string>>

/** Lo que la base guarda: sólo aquello en lo que el usuario se apartó del valor por omisión. */
export type Diferencias = Readonly<Record<string, string>>

/**
 * Arma el mapa que rige en una pantalla: las globales más las de esa pantalla.
 *
 * Resolver en lugar de copiar el mapa al crear cada usuario es lo que hace que una
 * acción agregada en una pantalla futura le funcione a los usuarios que ya existen.
 */
export function resolverAtajos(diferencias: Diferencias = {}, pantalla?: Pantalla): MapaAtajos {
  const mapa: Record<string, string> = {}

  for (const definicion of CATALOGO) {
    if (definicion.ambito !== 'global' && definicion.ambito !== pantalla) continue

    const elegida = diferencias[definicion.accion]
    mapa[definicion.accion] = elegida && definicion.reasignable ? elegida : definicion.porOmision
  }

  return mapa
}

/**
 * Las filas con las que se siembra el mapa de un usuario recién creado.
 *
 * Se guarda el catálogo completo, no sólo las diferencias. Con eso, la pantalla de
 * configuración lee una tabla y ya tiene todo, y `restaurarPorOmision` es borrar y
 * volver a sembrar.
 *
 * `resolverAtajos()` igual sigue completando lo que falte: cubre gratis la ventana
 * entre agregar una acción nueva y correr la migración que la siembra en los usuarios
 * que ya existen.
 */
export function atajosParaSembrar(): Array<{ ambito: Ambito; accion: string; tecla: string }> {
  return CATALOGO.map((d) => ({ ambito: d.ambito, accion: d.accion, tecla: d.porOmision }))
}

export interface ProblemaAtajo {
  accion: string
  motivo: string
}

/**
 * Valida un conjunto de diferencias antes de guardarlo.
 *
 * Corre en la API y también en el front para avisar mientras el usuario elige. La base
 * repite por su cuenta la unicidad dentro de cada ámbito: la validación puede tener un
 * agujero, el índice único no.
 */
export function validarAtajos(diferencias: Diferencias): ProblemaAtajo[] {
  const problemas: ProblemaAtajo[] = []

  for (const [accion, tecla] of Object.entries(diferencias)) {
    const definicion = POR_ACCION.get(accion)

    if (!definicion) {
      problemas.push({ accion, motivo: `La acción "${accion}" no existe.` })
      continue
    }

    if (!definicion.reasignable) {
      problemas.push({
        accion,
        motivo: `"${definicion.etiqueta}" usa una tecla fija y no se puede cambiar.`,
      })
      continue
    }

    if (!FORMATO_TECLA.test(tecla)) {
      problemas.push({ accion, motivo: `"${tecla}" no es una combinación válida.` })
      continue
    }

    if (TECLAS_PROHIBIDAS.includes(tecla)) {
      problemas.push({
        accion,
        motivo: `El navegador se queda con ${mostrarTecla(tecla)} y el atajo nunca llegaría a la aplicación.`,
      })
      continue
    }

    if (TECLAS_RESERVADAS.includes(tecla)) {
      problemas.push({ accion, motivo: `${mostrarTecla(tecla)} está reservada por el sistema.` })
    }
  }

  // Los choques se buscan pantalla por pantalla sobre el mapa ya resuelto. Dos pantallas
  // pueden compartir una tecla porque nunca están abiertas a la vez, pero una de la
  // pantalla sí choca con una global — incluso con el valor por omisión de una global
  // que el usuario ni tocó.
  for (const pantalla of PANTALLAS) {
    const mapa = resolverAtajos(diferencias, pantalla)
    const usadaPor = new Map<string, string>()

    for (const [accion, tecla] of Object.entries(mapa)) {
      const previa = usadaPor.get(tecla)

      if (previa) {
        const etiqueta = POR_ACCION.get(previa)?.etiqueta ?? previa
        const donde = ETIQUETA_AMBITO[POR_ACCION.get(accion)?.ambito ?? 'global']
        problemas.push({
          accion,
          motivo: `En ${donde}, ${mostrarTecla(tecla)} ya está asignada a "${etiqueta}".`,
        })
      } else {
        usadaPor.set(tecla, accion)
      }
    }
  }

  return problemas
}

/** Cómo se escribe una tecla en un botón o en la barra de estado. */
export function mostrarTecla(tecla: string): string {
  return tecla
    .replace('ArrowDown', '↓')
    .replace('ArrowUp', '↑')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Insert', 'Ins')
    .replace('Delete', 'Supr')
    .replace('Escape', 'Esc')
    .replace(/\+/g, ' + ')
}

/**
 * Convierte un evento del teclado a la forma canónica, con los modificadores siempre en
 * el mismo orden. Sin esto, `Alt+Ctrl+K` y `Ctrl+Alt+K` serían dos teclas distintas y el
 * índice único de la base no serviría de nada.
 */
export function teclaDesdeEvento(evento: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}): string {
  const partes: string[] = []

  // metaKey (Windows o Command) se trata como Ctrl para que un mapa configurado en una
  // máquina no se rompa en otra.
  if (evento.ctrlKey || evento.metaKey) partes.push('Ctrl')
  if (evento.altKey) partes.push('Alt')
  if (evento.shiftKey) partes.push('Shift')

  partes.push(evento.key.length === 1 ? evento.key.toUpperCase() : evento.key)

  return partes.join('+')
}
