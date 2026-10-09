import { MAXIMO_NOTA_VISITA, MOTIVOS_VISITA } from '@gpb/core'
import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { PUESTOS_ORDENADOS } from './personal.ts'

const TAG = 'Recepción'

/** Una persona con nombre: quién lo atiende o quién lo agarró. */
const persona = z.object({ id: z.uuid(), nombre: z.string() })

/**
 * Alguien que está en la concesionaria. **El estado sale de las horas**: sin `atendidaEn`
 * está esperando, sin `cerradaEn` lo están atendiendo, y con las dos ya se fue.
 */
export const visita = z.object({
  id: z.uuid(),
  /** Como se llama y como lo tiene el cliente en la mano: `S-014`. */
  numero: z.string(),
  motivo: z.enum(MOTIVOS_VISITA),
  origen: z.enum(['recepcion', 'totem']),
  entidadId: z.uuid().nullable(),
  nombre: z.string().nullable(),
  telefono: z.string().nullable(),
  derivadaA: persona.nullable(),
  atendidaPor: persona.nullable(),
  llegoEn: z.iso.datetime(),
  atendidaEn: z.iso.datetime().nullable(),
  cerradaEn: z.iso.datetime().nullable(),
  resultado: z.enum(['atendida', 'se_fue', 'orden']).nullable(),
  ordenId: z.uuid().nullable(),
  nota: z.string().nullable(),
})

/** Alguien a quien se le puede derivar una visita. */
export const receptor = z.object({
  id: z.uuid(),
  nombre: z.string(),
  puesto: z.enum(PUESTOS_ORDENADOS),
  /** Si entra al sistema. El que no, se entera por la recepcionista. */
  conUsuario: z.boolean(),
})

/** Un texto opcional: vacío es «no dijo», no una cadena vacía guardada. */
const opcional = (maximo: number, aviso: string) =>
  z
    .string()
    .trim()
    .max(maximo, aviso)
    .transform((v) => v || null)
    .nullable()
    .optional()

const nota = opcional(MAXIMO_NOTA_VISITA, `Una línea: hasta ${MAXIMO_NOTA_VISITA} letras`)

const NO_ENCONTRADA = {
  NO_ENCONTRADA: { status: 404, message: 'Esa visita no existe' },
} as const

const YA_CERRADA = {
  YA_CERRADA: { status: 409, message: 'Esa visita ya terminó' },
} as const

const NO_ES_RECEPTOR = {
  NO_ES_RECEPTOR: {
    status: 422,
    message: 'A esa persona no se le puede derivar: no está activa o no es de esta sucursal',
  },
} as const

/**
 * La puerta: quién llegó, a quién se lo derivó, quién lo atiende y cómo terminó. El porqué,
 * en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * Es del núcleo y no de un módulo: toda concesionaria tiene una puerta, venda autos o no.
 */
export const contratoRecepcion = {
  hoy: conPermiso('nucleo', 'ver', 'Visita')
    .route({
      method: 'GET',
      path: '/recepcion/visitas',
      tags: [TAG],
      operationId: 'visitasDeHoy',
      summary: 'Las visitas de hoy en la sucursal, en el orden en que llegaron',
      description:
        'Las que esperan, las que se están atendiendo y las que ya terminaron. La pantalla ' +
        'las separa por sus horas.',
    })
    .output(z.object({ datos: z.array(visita) })),

  receptores: conPermiso('nucleo', 'ver', 'Visita')
    .route({
      method: 'GET',
      path: '/recepcion/receptores',
      tags: [TAG],
      operationId: 'receptores',
      summary: 'A quién se le puede derivar una visita: el personal activo de la sucursal',
      description:
        'Nombre y puesto, nada más. No pasa por el legajo, que tiene los sueldos y no lo ve ' +
        'quien atiende la puerta.',
    })
    .output(z.object({ datos: z.array(receptor) })),

  anotar: conPermiso('nucleo', 'crear', 'Visita')
    .route({
      method: 'POST',
      path: '/recepcion/visitas',
      tags: [TAG],
      operationId: 'anotarVisita',
      summary: 'Anotar a alguien que llegó, con su número del día',
      successStatus: 201,
    })
    .input(
      z.object({
        motivo: z.enum(MOTIVOS_VISITA),
        entidadId: z.uuid().nullable().optional(),
        nombre: opcional(120, 'El nombre es largo: hasta 120 letras'),
        telefono: opcional(40, 'El teléfono es largo: hasta 40 caracteres'),
        derivadaA: z.uuid().nullable().optional(),
        nota,
      }),
    )
    .errors({
      ...NO_ES_RECEPTOR,
      NO_ENCONTRADO: { status: 404, message: 'Esa persona no existe' },
    })
    .output(visita),

  derivar: conPermiso('nucleo', 'editar', 'Visita')
    .route({
      method: 'POST',
      path: '/recepcion/visitas/{id}/derivar',
      tags: [TAG],
      operationId: 'derivarVisita',
      summary: 'Cambiar a quién se le deriva, o dejarla sin nadie',
    })
    .input(z.object({ id: z.uuid(), derivadaA: z.uuid().nullable() }))
    .errors({ ...NO_ENCONTRADA, ...YA_CERRADA, ...NO_ES_RECEPTOR })
    .output(visita),

  atender: conPermiso('nucleo', 'editar', 'Visita')
    .route({
      method: 'POST',
      path: '/recepcion/visitas/{id}/atender',
      tags: [TAG],
      operationId: 'atenderVisita',
      summary: 'Agarrarla: la espera termina y queda a nombre de quien la agarró',
      description:
        'Si otro la agarró antes, no se la saca: contesta quién la tiene. Dos tablets que ' +
        'tocan el mismo auto a la vez no lo reciben dos veces.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({
      ...NO_ENCONTRADA,
      ...YA_CERRADA,
      YA_LA_TIENE: {
        status: 409,
        message: 'Esa visita ya la está atendiendo otra persona',
        data: z.object({ nombre: z.string() }),
      },
    })
    .output(visita),

  cerrar: conPermiso('nucleo', 'editar', 'Visita')
    .route({
      method: 'POST',
      path: '/recepcion/visitas/{id}/cerrar',
      tags: [TAG],
      operationId: 'cerrarVisita',
      summary: 'Terminarla: atendida, o se fue sin que lo atiendan',
      description:
        '«Se fue» no es una baja: es el dato que la recepción viene a medir. Una visita no se ' +
        'borra nunca.',
    })
    .input(z.object({ id: z.uuid(), resultado: z.enum(['atendida', 'se_fue']), nota }))
    .errors({ ...NO_ENCONTRADA, ...YA_CERRADA })
    .output(visita),
}
