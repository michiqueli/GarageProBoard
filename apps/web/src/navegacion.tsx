import { type Acceso, type Autorizacion, permite } from '@gpb/contracts'
import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * Las secciones del sistema, con lo que hace falta para verlas.
 *
 * Viven acá y no adentro del menú porque hay dos que preguntan lo mismo: el menú, para
 * dibujar, y la ruta de inicio, para saber a dónde mandar a alguien que acaba de
 * entrar. Con la lista adentro del `Shell`, la segunda tendría que repetirla.
 *
 * **Tres estados, y se distinguen a propósito:**
 *
 * - *Con ruta y con permiso*: enlace normal.
 * - *Sin ruta*: atenuada. Todavía no está construida — para nadie. Se muestra igual
 *   para que el menú tenga desde ahora su forma definitiva.
 * - *Sin permiso*: **no se muestra**. No es que falte: es que no es para este usuario,
 *   y ofrecerla atenuada sería invitarlo a preguntar por algo que no le corresponde.
 * - *Módulo no contratado*: tampoco se muestra, y se mira antes que el permiso. No es de
 *   esta concesionaria, y ni siquiera el gerente la ve.
 */
export interface Seccion {
  id: string
  etiqueta: string
  icono: ReactNode
  /**
   * La ruta, tipada contra el árbol real: un destino que no existe no compila.
   * Las secciones sin ruta todavía no están construidas y se muestran atenuadas.
   */
  to?: LinkProps['to']
  /**
   * Qué módulo y qué permiso hacen falta para verla. Sin esto, la sección es de todos:
   * el tablero es el inicio de cualquiera, y Ayuda y Configuración tienen adentro cosas
   * personales —las teclas rápidas, el tema— que no dependen de ningún rol.
   */
  requiere?: Acceso
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const

export const PRINCIPALES: Seccion[] = [
  {
    id: 'tablero',
    etiqueta: 'Tablero',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" />
        <rect x="9" y="2" width="5" height="5" />
        <rect x="2" y="9" width="5" height="5" />
        <rect x="9" y="9" width="5" height="5" />
      </svg>
    ),
  },
  {
    id: 'ordenes',
    etiqueta: 'Órdenes de trabajo',
    to: '/ordenes',
    requiere: { modulo: 'servicios', accion: 'ver', sujeto: 'Orden' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M3 2h7l3 3v9H3z" />
        <path d="M5.5 8h5M5.5 11h3" />
      </svg>
    ),
  },
  {
    id: 'vehiculos',
    etiqueta: 'Vehículos',
    to: '/vehiculos',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Vehiculo' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M2 10h12M3.5 10V7l1.5-3h6l1.5 3v3" />
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="11" cy="12" r="1.2" />
      </svg>
    ),
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Cliente' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
      </svg>
    ),
  },
  {
    id: 'repuestos',
    etiqueta: 'Repuestos',
    requiere: { modulo: 'repuestos', accion: 'ver', sujeto: 'Repuesto' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M8 2l5 2.5v6L8 13 3 10.5v-6z" />
        <path d="M8 7.5L13 5M8 7.5v5.2M8 7.5L3 5" />
      </svg>
    ),
  },
  {
    id: 'caja',
    etiqueta: 'Caja',
    requiere: { modulo: 'contable', accion: 'ver', sujeto: 'Comprobante' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="4" width="12" height="8" rx="1" />
        <path d="M2 7h12" />
      </svg>
    ),
  },
  {
    id: 'entregas',
    etiqueta: 'Entregas',
    requiere: { modulo: 'servicios', accion: 'ver', sujeto: 'Orden' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M2 8l4 4 8-8" />
      </svg>
    ),
  },
]

export const SECUNDARIAS: Seccion[] = [
  {
    id: 'usuarios',
    etiqueta: 'Usuarios',
    to: '/usuarios',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Usuario' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="6" cy="5.5" r="2.2" />
        <path d="M2 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" />
        <circle cx="11.5" cy="6" r="1.7" />
        <path d="M11 9.6c1.8 0 3 1.1 3 2.9" />
      </svg>
    ),
  },
  {
    id: 'auditoria',
    etiqueta: 'Auditoría',
    to: '/auditoria',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Auditoria' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M4 2h8v12H4z" />
        <path d="M6 5h4M6 8h4M6 11h2" />
      </svg>
    ),
  },
  {
    id: 'ayuda',
    etiqueta: 'Ayuda',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M6.5 6.2a1.6 1.6 0 113 .8c-.5.5-1.5.7-1.5 1.7M8 11.5v.01" />
      </svg>
    ),
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" />
      </svg>
    ),
  },
]

/** Las que este usuario puede ver. Las demás no existen para él. */
export function visibles(secciones: Seccion[], autorizacion: Autorizacion): Seccion[] {
  return secciones.filter((s) => !s.requiere || permite(autorizacion, s.requiere))
}

/**
 * A dónde mandar a alguien que entra al inicio.
 *
 * El gerente cae en Vehículos y el repuestero caería en una pantalla que no puede ver:
 * el destino depende de quién entra. Es la primera sección construida que le toque, en
 * el orden del menú, que es el orden en que pensamos el trabajo del día.
 */
export function primeraPantalla(autorizacion: Autorizacion): LinkProps['to'] | undefined {
  return visibles(PRINCIPALES, autorizacion).find((s) => s.to)?.to
}
