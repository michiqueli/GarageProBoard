import { ORPCError } from '@orpc/client'
import { MutationCache, QueryClient } from '@tanstack/react-query'
import { type Notificacion, notificar } from '../componentes/avisos.ts'

export type MensajeError = Pick<Notificacion, 'texto' | 'detalle' | 'accion'>

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Lo que se avisa cuando sale bien: «Cliente guardado». Sin esto, no se avisa. */
      exito?: string | ((datos: unknown) => string)
      /**
       * Cómo se cuenta el error. Por omisión, el mensaje de la API. `false` cuando la
       * pantalla lo muestra en su lugar: el inicio de sesión, la consulta al padrón.
       */
      error?: false | ((error: unknown) => MensajeError | string)
    }
  }
}

/** Lo que dice la API, o qué hacer si ni siquiera se llegó a hablar con ella. */
export function mensajeGeneral(error: unknown): string {
  if (error instanceof ORPCError) return error.message
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * La caché de consultas de la aplicación, con los avisos enchufados en un solo lugar.
 *
 * **Todo lo que falla al guardar se avisa**, sin que cada pantalla tenga que acordarse: el
 * día que alguien escribe una operación nueva y se olvida del error, el usuario igual se
 * entera. Lo que sale bien se avisa si la operación dice cómo (`meta.exito`).
 *
 * Los errores al *cargar* no pasan por acá: esos van en la pantalla, en el lugar de lo que
 * no se pudo mostrar.
 */
export function crearConsultas(opciones: { reintentos?: number; frescura?: number } = {}) {
  return new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (datos, _variables, _contexto, mutacion) => {
        const exito = mutacion.meta?.exito
        if (exito) notificar.ok(typeof exito === 'function' ? exito(datos) : exito)
      },
      onError: (error, _variables, _contexto, mutacion) => {
        const propio = mutacion.meta?.error
        if (propio === false) return
        const mensaje = propio ? propio(error) : mensajeGeneral(error)
        if (typeof mensaje === 'string') notificar.error(mensaje)
        else notificar.error(mensaje.texto, { detalle: mensaje.detalle, accion: mensaje.accion })
      },
    }),
    defaultOptions: {
      queries: { staleTime: opciones.frescura ?? 0, retry: opciones.reintentos ?? 0 },
    },
  })
}
