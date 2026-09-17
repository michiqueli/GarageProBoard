import type { Modulo, ReglaPermiso } from '@gpb/core'
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
  /** Falta elegir a qué sucursal entra. Lo recuerda el servidor: sobrevive a recargar. */
  sucursalPendiente: boolean
  /** Los módulos que la concesionaria tiene prendidos. Se miran antes que los permisos. */
  modulos: Modulo[]
  /** Lo que le pasó y todavía no leyó: «Tu contraseña la cambió Juan Pérez». */
  avisos: Array<{ id: string; texto: string; creadoEn: string }>
  /** Reglas de CASL ya resueltas contra este usuario, tal como las manda la API. */
  habilidades: ReglaPermiso[]
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
  /**
   * Si todavía falta que el usuario elija sucursal.
   *
   * Se pregunta sólo cuando hace falta: con una sola sucursal no hay nada que elegir, y
   * con una predeterminada guardada el usuario ya eligió una vez y no quiere volver a
   * hacerlo cada mañana.
   */
  eligiendoSucursal: boolean

  /** Recién autenticado con correo y contraseña: acá sí se decide si preguntar. */
  entrar(entrada: { access: string } & DatosSesion): void
  /**
   * Sesión renovada con la cookie: al recargar la página o cuando vence el acceso.
   *
   * **No vuelve a preguntar la sucursal.** El servidor la conserva en la familia de
   * tokens, así que la renovación trae la que ya se eligió. Recalcular acá hacía que un
   * usuario con varias sucursales rebotara a la pantalla de elección cada quince
   * minutos, que es lo que dura el acceso.
   *
   * La excepción es que la sesión renovada sea de **otra persona** — otra pestaña cerró
   * sesión y entró alguien más, y la cookie ahora es suya. Eso es un ingreso, no una
   * renovación, y se trata como tal.
   */
  establecer(entrada: { access: string } & DatosSesion): void
  sucursalElegida(): void
  /** Vuelve a preguntar a qué sucursal entrar, sin cerrar la sesión. */
  elegirSucursal(): void
  actualizarDatos(datos: DatosSesion): void
  limpiar(): void
}

/** Lo decide el servidor: así sobrevive a recargar la página en la pantalla de elección. */
function debeElegir(datos: DatosSesion): boolean {
  return datos.sucursalPendiente
}

export const usarSesion = create<EstadoSesion>((set) => ({
  datos: null,
  access: null,
  eligiendoSucursal: false,

  entrar: ({ access, ...datos }) => set({ access, datos, eligiendoSucursal: debeElegir(datos) }),

  establecer: ({ access, ...datos }) =>
    set((actual) => ({
      access,
      datos,
      // Si el servidor dice que falta elegir, falta —recargar no lo saltea—. Si no, se respeta
      // lo que ya pasaba en esta pestaña: alguien que apretó «Cambiar sucursal» sigue eligiendo.
      eligiendoSucursal:
        debeElegir(datos) ||
        (actual.datos?.usuario.id === datos.usuario.id && actual.eligiendoSucursal),
    })),

  sucursalElegida: () => set({ eligiendoSucursal: false }),
  elegirSucursal: () => set({ eligiendoSucursal: true }),
  actualizarDatos: (datos) => set({ datos }),
  limpiar: () => set({ datos: null, access: null, eligiendoSucursal: false }),
}))

/** Para leer el token fuera de React, desde el cliente HTTP. */
export const tokens = {
  access: () => usarSesion.getState().access,
}
