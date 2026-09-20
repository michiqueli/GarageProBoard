import { z } from 'zod'
import { conEstacion, conPermiso } from './acceso.ts'

const TAG = 'Fichaje'

export const TIPOS_ESTACION = {
  taller: 'Taller: credencial y orden',
  reloj: 'Reloj: entrada y salida',
} as const

export type TipoEstacion = keyof typeof TIPOS_ESTACION

/**
 * Qué terminó pasando con un escaneo. Es lo que la pantalla convierte en verde o rojo.
 *
 * `esperandoOrden` es el único estado intermedio del kiosco de taller: se escaneó la
 * credencial y falta la orden. No es un modo que el mecánico tenga que recordar —la pantalla
 * hace siempre lo mismo— sino la mitad de una operación de dos escaneos.
 */
export const ACCIONES_ESCANEO = ['entrada', 'salida', 'abrio', 'cerro'] as const

export const respuestaEscaneo = z.object({
  resultado: z.enum(['ok', 'rechazado', 'error']),
  accion: z.enum(ACCIONES_ESCANEO).nullable(),
  /** Lo grande de la pantalla: el nombre, o qué salió mal. Se lee a dos metros. */
  titulo: z.string(),
  /** El renglón de abajo: «Entrada 08:12», «OT 000123 · Amarok ABC123». */
  detalle: z.string(),
  esperandoOrden: z.boolean(),
  /** Para que la pantalla siga mostrando de quién es la credencial mientras espera la orden. */
  empleado: z.object({ nombre: z.string(), legajo: z.string() }).nullable(),
  orden: z.object({ numero: z.number().int(), dominio: z.string().nullable() }).nullable(),
  /** Cuánto lleva abierta la sesión que se acaba de cerrar, ya en palabras: «2 h 14 min». */
  duracion: z.string().nullable(),
})

export const estacionSalida = z.object({
  id: z.uuid(),
  nombre: z.string(),
  tipo: z.enum(['taller', 'reloj']),
  sucursalId: z.uuid(),
  sucursal: z.string().nullable(),
  activa: z.boolean(),
  ultimoVistoEn: z.iso.datetime().nullable(),
  creadoEn: z.iso.datetime(),
})

export const jornadaSalida = z.object({
  id: z.uuid(),
  empleadoId: z.uuid(),
  nombre: z.string(),
  legajo: z.string(),
  puesto: z.string(),
  fecha: z.string(),
  entrada: z.iso.datetime().nullable(),
  salida: z.iso.datetime().nullable(),
  fuente: z.enum(['escaneo', 'manual', 'auto']),
  /** Minutos entre entrada y salida. Vacío mientras no cerró. */
  minutos: z.number().int().nullable(),
})

/**
 * El fichaje del taller.
 *
 * **Dos escaneos, tres segundos, sin login.** No compite en funcionalidad: compite en eso. La
 * concesionaria del relevamiento ya tenía el módulo de tiempos del competidor y no lo usaba
 * porque no era práctico. Las diez reglas que salieron de ahí están en
 * `docs/tecnicos/taller-control-de-tiempos.md`.
 */
export const contratoFichaje = {
  /**
   * Quién es esta pantalla. Lo primero que pide el kiosco al abrir, para saber si dibujar el
   * reloj o el de taller, y para mostrar en qué sucursal está.
   */
  estacion: conEstacion
    .route({
      method: 'GET',
      path: '/fichaje/estacion',
      tags: [TAG],
      operationId: 'estacionActual',
      summary: 'Qué estación es ésta, según su token',
    })
    .output(
      z.object({
        id: z.uuid(),
        nombre: z.string(),
        tipo: z.enum(['taller', 'reloj']),
        sucursal: z.string().nullable(),
        concesionaria: z.string(),
      }),
    ),

  escanear: conEstacion
    .route({
      method: 'POST',
      path: '/fichaje/escanear',
      tags: [TAG],
      operationId: 'escanear',
      summary: 'Un escaneo: credencial, orden, o lo que sea que haya leído el lector',
      description:
        'La pantalla es **orden-agnóstica e idempotente**: se escanea la credencial y después ' +
        'la orden, y si esa orden estaba abierta para esa persona se cierra, y si no se abre. ' +
        'No hay modos que recordar. Todo escaneo queda registrado, resuelva o falle.',
    })
    .input(
      z.object({
        /** Tal como llegó del lector. No se recorta ni se normaliza: se guarda como prueba. */
        codigo: z.string().min(1).max(200),
        /**
         * El escaneo anterior, cuando la pantalla está esperando el segundo. Lo lleva el
         * cliente y no el servidor a propósito: así el servidor no tiene estado por estación,
         * y una pantalla que se recarga no deja a nadie a medio fichar.
         */
        pendiente: z.string().max(200).optional(),
      }),
    )
    .output(respuestaEscaneo),

  // ── la administración, del lado del sistema ─────────────────────────────────

  estaciones: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'GET',
      path: '/fichaje/estaciones',
      tags: [TAG],
      operationId: 'listarEstaciones',
      summary: 'Las estaciones de fichaje registradas',
    })
    .output(z.object({ datos: z.array(estacionSalida) })),

  registrarEstacion: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/fichaje/estaciones',
      tags: [TAG],
      operationId: 'registrarEstacion',
      summary: 'Registrar una PC como estación de fichaje',
      successStatus: 201,
      description:
        'Devuelve el token **una sola vez**: de la base sale su hash y nada más. Si se pierde, ' +
        'se registra la estación de nuevo.',
    })
    .input(
      z.object({
        nombre: z.string().trim().min(1, 'Ponele un nombre: «Taller, al lado del elevador 2»'),
        tipo: z.enum(['taller', 'reloj']),
        sucursalId: z.uuid(),
      }),
    )
    .errors({
      REFERENCIA_INVALIDA: { status: 422, message: 'Esa sucursal no es de la concesionaria' },
    })
    .output(
      z.object({
        estacion: estacionSalida,
        /** El token en limpio. Se muestra una vez y no se vuelve a poder leer. */
        token: z.string(),
        /** La dirección a abrir en esa PC, con el token adentro. */
        url: z.string(),
      }),
    ),

  revocarEstacion: conPermiso('servicios', 'configurar', 'Orden')
    .route({
      method: 'POST',
      path: '/fichaje/estaciones/{id}/revocar',
      tags: [TAG],
      operationId: 'revocarEstacion',
      summary: 'Dar de baja una estación: su token deja de servir',
      description: 'No se borra. Lo que fichó queda, y con qué estación lo fichó también.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ NO_ENCONTRADA: { status: 404, message: 'Esa estación no existe' } })
    .output(estacionSalida),

  asistencia: conPermiso('nucleo', 'ver', 'Empleado')
    .route({
      method: 'GET',
      path: '/fichaje/asistencia',
      tags: [TAG],
      operationId: 'asistencia',
      summary: 'Quién entró y quién salió, por día',
    })
    .input(z.object({ fecha: z.iso.date().optional() }))
    .output(z.object({ fecha: z.string(), datos: z.array(jornadaSalida) })),
}
