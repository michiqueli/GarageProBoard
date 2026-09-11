import { create } from 'zustand'

export interface Sucursal {
  id: string
  nombre: string
  empresaId: string
  razonSocial: string
}

export interface DatosSesion {
  usuario: { id: string; email: string; nombre: string; apellido: string }
  tenant: { id: string; nombre: string; slug: string }
  sucursalActiva: Sucursal
  sucursales: Sucursal[]
  habilidades: unknown[]
  atajos: Record<string, string>
  config: {
    tema: 'claro' | 'oscuro' | 'sistema'
    densidad: 'compacta' | 'comoda'
    filasPorPagina: number
    sucursalPredeterminadaId: string | null
  }
}

/**
 * El estado de la sesión en el navegador.
 *
 * **Acá no se guarda ningún token de larga duración, y es a propósito.** El de acceso
 * vive sólo en memoria — dura quince minutos y no tiene por qué sobrevivir a una
 * recarga. El de refresco no pasa nunca por JavaScript: viaja en una cookie `httpOnly`
 * que el navegador manda sola y que este código no puede leer.
 *
 * Guardarlo en `localStorage` sería más simple, pero significaría que cualquier script
 * que llegue a ejecutarse en la página se lleva treinta días de sesión. Ver
 * `apps/api/src/auth/cookie.ts`.
 */
interface EstadoSesion {
  datos: DatosSesion | null
  access: string | null
  /** `true` mientras se intenta recuperar la sesión con la cookie que haya. */
  cargando: boolean
  /**
   * Si todavía falta que el usuario elija sucursal.
   *
   * Se pregunta sólo cuando hace falta: con una sola sucursal no hay nada que elegir, y
   * con una predeterminada guardada el usuario ya eligió una vez y no quiere volver a
   * hacerlo cada mañana.
   */
  eligiendoSucursal: boolean

  establecer(entrada: { access: string } & DatosSesion): void
  sucursalElegida(): void
  /** Vuelve a preguntar a qué sucursal entrar, sin cerrar la sesión. */
  elegirSucursal(): void
  actualizarDatos(datos: DatosSesion): void
  limpiar(): void
  terminarCarga(): void
}

export const usarSesion = create<EstadoSesion>((set) => ({
  datos: null,
  access: null,
  cargando: true,
  eligiendoSucursal: false,

  establecer: ({ access, ...datos }) =>
    set({
      access,
      datos,
      cargando: false,
      eligiendoSucursal:
        datos.sucursales.length > 1 && datos.config.sucursalPredeterminadaId === null,
    }),

  sucursalElegida: () => set({ eligiendoSucursal: false }),
  elegirSucursal: () => set({ eligiendoSucursal: true }),
  actualizarDatos: (datos) => set({ datos }),
  limpiar: () => set({ datos: null, access: null, cargando: false, eligiendoSucursal: false }),
  terminarCarga: () => set({ cargando: false }),
}))

/** Para leer el token fuera de React, desde el cliente HTTP. */
export const tokens = {
  access: () => usarSesion.getState().access,
}
