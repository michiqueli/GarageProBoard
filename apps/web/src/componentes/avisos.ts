import { create } from 'zustand'

/**
 * Notificaciones y confirmaciones: el estado, sin React.
 *
 * Viven en un almacén y no en un contexto para poder llamarlas desde cualquier lado —un
 * `onSuccess`, la caché de consultas, una función suelta— sin pasar nada por props. Las
 * dibujan `<Notificaciones />` y `<DialogoConfirmacion />`, montados una sola vez en la raíz.
 *
 * Las reglas, en `docs/tecnicos/sistema-de-diseno.md`:
 * - Lo que se guardó, se avisa. Lo que falló al guardar, también, y dice qué hacer.
 * - Nada se da de baja, desactiva o descarta sin confirmación.
 */

export type TipoNotificacion = 'ok' | 'error' | 'info'

export interface Notificacion {
  id: number
  tipo: TipoNotificacion
  texto: string
  detalle?: string | undefined
  accion?: { texto: string; alHacer: () => void } | undefined
}

export interface OpcionesConfirmacion {
  titulo: string
  texto?: string | undefined
  /** El botón dice lo que va a pasar: «Dar de baja», no «Aceptar». */
  confirmar: string
  /** Baja, desactivación o descarte: se pinta crítico y el foco arranca en Cancelar. */
  peligro?: boolean | undefined
}

export interface CampoPregunta {
  etiqueta: string
  valor: string
  tipo?: 'text' | 'email' | undefined
  /** Qué está mal, o `null` si sirve. Mientras esté mal, no se confirma. */
  validar?: ((valor: string) => string | null) | undefined
}

interface Pendiente extends OpcionesConfirmacion {
  campo?: CampoPregunta | undefined
  responder: (si: boolean, valor?: string) => void
}

interface EstadoAvisos {
  notificaciones: Notificacion[]
  confirmacion: Pendiente | null
  cerrar: (id: number) => void
}

/** Cuántas se ven a la vez: más que eso tapa la pantalla y nadie las lee. */
const MAXIMO = 4

/** Lo que dura una que no es error. Los errores quedan hasta que alguien los cierra. */
export const DURACION_MS = 5_000

let siguiente = 1

export const usarAvisos = create<EstadoAvisos>()((set) => ({
  notificaciones: [],
  confirmacion: null,
  cerrar: (id) => set((e) => ({ notificaciones: e.notificaciones.filter((n) => n.id !== id) })),
}))

function agregar(tipo: TipoNotificacion, texto: string, extra: Partial<Notificacion> = {}) {
  const id = siguiente++
  usarAvisos.setState((e) => ({
    notificaciones: [...e.notificaciones, { ...extra, id, tipo, texto }].slice(-MAXIMO),
  }))
  return id
}

export const notificar = {
  ok: (texto: string, extra?: Omit<Partial<Notificacion>, 'id' | 'tipo'>) =>
    agregar('ok', texto, extra),
  error: (texto: string, extra?: Omit<Partial<Notificacion>, 'id' | 'tipo'>) =>
    agregar('error', texto, extra),
  info: (texto: string, extra?: Omit<Partial<Notificacion>, 'id' | 'tipo'>) =>
    agregar('info', texto, extra),
}

/**
 * Pregunta antes de hacer algo que no se deshace solo. Resuelve `true` si confirmó.
 *
 *     if (!(await confirmar({ titulo: 'Dar de baja a Juan', confirmar: 'Dar de baja', peligro: true }))) return
 *
 * Si ya había una abierta, la anterior se da por cancelada: nunca quedan dos preguntas
 * apiladas esperando.
 */
export function confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
  return new Promise((resolver) => {
    usarAvisos.getState().confirmacion?.responder(false)
    usarAvisos.setState({
      confirmacion: {
        ...opciones,
        responder: (si) => {
          usarAvisos.setState({ confirmacion: null })
          resolver(si)
        },
      },
    })
  })
}

/**
 * Lo mismo que confirmar, pero pidiendo un dato: «¿A qué correo la mando?». Resuelve el
 * valor escrito, o `null` si se canceló.
 */
export function preguntar(
  opciones: OpcionesConfirmacion & { campo: CampoPregunta },
): Promise<string | null> {
  return new Promise((resolver) => {
    usarAvisos.getState().confirmacion?.responder(false)
    usarAvisos.setState({
      confirmacion: {
        ...opciones,
        responder: (si, valor) => {
          usarAvisos.setState({ confirmacion: null })
          resolver(si ? (valor ?? '').trim() : null)
        },
      },
    })
  })
}

/** Para los tests y el cambio de sesión: no quedan avisos del usuario anterior. */
export function limpiarAvisos() {
  usarAvisos.getState().confirmacion?.responder(false)
  usarAvisos.setState({ notificaciones: [], confirmacion: null })
}
