import { type Acceso, type Autorizacion, accesoDeRuta, contrato, permite } from '@gpb/contracts'
import type { LinkProps } from '@tanstack/react-router'
import type { ComponentType, ReactNode } from 'react'
import { ContadorPuerta } from './modulos/recepcion/ContadorPuerta.tsx'

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
  /**
   * Un número al lado de la etiqueta, cuando hay algo esperando a quien usa el sistema. Es un
   * componente y no un número porque cada uno pregunta lo suyo, y sólo lo pregunta si se ve.
   */
  Contador?: ComponentType
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
    // Después de Órdenes y no antes, a propósito: el orden decide la primera pantalla de
    // cada uno, y el gerente y el asesor entran a las órdenes. La recepcionista no las ve, y
    // cae acá.
    id: 'puerta',
    etiqueta: 'Recepción',
    to: '/puerta',
    requiere: accesoDeRuta(contrato.recepcion.hoy),
    Contador: ContadorPuerta,
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M3 14V2.5h7V14" />
        <path d="M10 4h3v10M1.5 14h13" />
        <circle cx="8" cy="8.5" r="0.6" />
      </svg>
    ),
  },
  {
    id: 'agenda',
    etiqueta: 'Agenda',
    to: '/agenda',
    requiere: accesoDeRuta(contrato.turnos.listar),
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="1" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        <path d="M5 9h1.5M9.5 9H11M5 11.5h1.5" />
      </svg>
    ),
  },
  {
    // Con entrada propia y no sólo el botón «Vista tablet» de la recepción: en la tablet el
    // menú es lo único a mano, y nadie va a pasar por la vista de escritorio para llegar.
    // «Tablet de recepción» y no «Recepción en tablet»: dos entradas que arrancan igual se
    // pisan cuando uno lee el menú de un vistazo.
    id: 'recepcion',
    etiqueta: 'Tablet de recepción',
    to: '/recepcion',
    requiere: accesoDeRuta(contrato.ordenes.abrir),
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
        <path d="M7 12.2h2" />
      </svg>
    ),
  },
  {
    id: 'taller',
    // «Taller» a secas, y no «Tablero de piso»: el menú ya tiene una sección «Tablero» —el de
    // inicio, todavía sin construir— y dos entradas que arrancan igual se pisan. Además es la
    // palabra que usa la gente: nadie dice «voy a ver el tablero de piso».
    etiqueta: 'Taller',
    to: '/taller',
    requiere: { modulo: 'servicios', accion: 'ver', sujeto: 'Orden' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1" />
        <path d="M2 6h12M6 6v7.5" />
        <path d="M8 8.5h4M8 11h2.5" />
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
    to: '/clientes',
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
    to: '/repuestos',
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
    to: '/caja',
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
    id: 'empresas',
    etiqueta: 'Empresas',
    to: '/empresas',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Empresa' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M2 14V5l5-3v12M7 14h7V7l-7-2" />
        <path d="M4 7h1M4 10h1M10 9h1M10 12h1" />
      </svg>
    ),
  },
  {
    // Se llama RRHH y no «Personal» porque es donde va a crecer: asistencia, liquidación de
    // sueldos, recibos. Lo que hay hoy —el legajo y la credencial para fichar— pide permiso
    // sobre Empleado, que es el que esconde los sueldos del asesor de servicios.
    id: 'rrhh',
    etiqueta: 'RRHH',
    to: '/rrhh',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Empleado' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2.5" y="4" width="11" height="9" rx="1" />
        <path d="M6 4V2.8h4V4" />
        <circle cx="8" cy="7.6" r="1.4" />
        <path d="M5.8 11.4c0-1.2 1-1.9 2.2-1.9s2.2.7 2.2 1.9" />
      </svg>
    ),
  },
  {
    // Las PC que fichan. Va acá y no en RRHH porque es equipamiento del taller: quien lo
    // configura es el que configura el módulo de servicios, no el que lleva los legajos.
    id: 'estaciones',
    etiqueta: 'Estaciones de fichaje',
    to: '/estaciones',
    requiere: { modulo: 'servicios', accion: 'configurar', sujeto: 'Orden' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <rect x="2" y="3" width="12" height="8" rx="1" />
        <path d="M5.5 13.5h5M8 11v2.5" />
        <path d="M5.5 6h1.2M9.3 6h1.2M5.5 8.2h5" />
      </svg>
    ),
  },
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
    id: 'roles',
    etiqueta: 'Roles',
    to: '/roles',
    requiere: { modulo: 'nucleo', accion: 'ver', sujeto: 'Usuario' },
    icono: (
      <svg viewBox="0 0 16 16" {...trazo} aria-hidden="true">
        <path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4-2.8-1.1-5-3.4-5-6.4v-4z" />
        <path d="M5.8 8l1.6 1.6 3-3.2" />
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
    // Sin `requiere`: es lo propio de cada uno. Pedir un permiso para cambiarse el tema o las
    // teclas significaría que alguien se las elige al de al lado.
    id: 'configuracion',
    etiqueta: 'Configuración',
    to: '/configuracion',
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
