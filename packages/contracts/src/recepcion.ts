import { ESTADOS_TURNO, MAXIMO_NOTA_VISITA, MOTIVOS_VISITA } from '@gpb/core'
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
  /**
   * El turno del que viene, con lo que hace falta para empezar a recibir el auto: la tablet
   * lo pone sin preguntar.
   */
  turno: z
    .object({
      id: z.uuid(),
      fechaHora: z.iso.datetime(),
      pedido: z.string(),
      vehiculoId: z.uuid().nullable(),
      dominio: z.string().nullable(),
    })
    .nullable(),
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

  soltar: conPermiso('nucleo', 'editar', 'Visita')
    .route({
      method: 'POST',
      path: '/recepcion/visitas/{id}/soltar',
      tags: [TAG],
      operationId: 'soltarVisita',
      summary: 'Devolverla a la cola: vuelve a esperar, con su hora de llegada de siempre',
      description:
        'Para la que se agarró por error, o la que quedó en una tablet que se apagó. La puede ' +
        'soltar cualquiera que atienda la puerta, no sólo quien la agarró: si no, una tablet ' +
        'sin batería deja al cliente colgado.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADA, ...YA_CERRADA })
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

const TAG_TURNOS = 'Turnos'

/** Un turno de servicio, como lo muestra la agenda. */
export const turno = z.object({
  id: z.uuid(),
  fechaHora: z.iso.datetime(),
  estado: z.enum(ESTADOS_TURNO),
  pedido: z.string(),
  entidadId: z.uuid().nullable(),
  nombre: z.string().nullable(),
  telefono: z.string().nullable(),
  /** El auto cargado, o sólo la patente que dijo por teléfono. */
  vehiculo: z
    .object({ id: z.uuid(), dominio: z.string().nullable(), descripcion: z.string() })
    .nullable(),
  dominio: z.string().nullable(),
  asesor: persona.nullable(),
  /** La visita en la que se convirtió al llegar. */
  visitaId: z.uuid().nullable(),
})

const baseTurno = z.object({
  fechaHora: z.iso.datetime({ offset: true }),
  vehiculoId: z.uuid().nullable().optional(),
  dominio: opcional(10, 'La patente tiene hasta 10 caracteres'),
  entidadId: z.uuid().nullable().optional(),
  nombre: opcional(120, 'El nombre es largo: hasta 120 letras'),
  telefono: opcional(40, 'El teléfono es largo: hasta 40 caracteres'),
  pedido: z
    .string()
    .trim()
    .min(3, 'Anotá qué le pasa o qué service es')
    .max(500, 'Es largo: hasta 500 letras'),
  asesorId: z.uuid().nullable().optional(),
})

/**
 * Lo mínimo para agendar por teléfono: el auto —o sólo su patente— y a nombre de quién. Si el
 * auto está cargado, su titular alcanza como «quién».
 */
function reglasTurno(t: z.infer<typeof baseTurno>, ctx: z.RefinementCtx) {
  if (!t.vehiculoId && !t.dominio) {
    ctx.addIssue({
      code: 'custom',
      message: 'Elegí el auto o escribí la patente',
      path: ['dominio'],
    })
  }
  if (!t.vehiculoId && !t.entidadId && !t.nombre) {
    ctx.addIssue({ code: 'custom', message: 'Anotá a nombre de quién', path: ['nombre'] })
  }
}

const datosTurno = baseTurno.superRefine(reglasTurno)

const NO_ENCONTRADO_TURNO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese turno, auto o persona no existe' },
} as const

const TURNO_CERRADO = {
  TURNO_CERRADO: {
    status: 409,
    message: 'Ese turno ya no está agendado: llegó, no vino o se canceló',
  },
} as const

/**
 * La agenda del taller. Los turnos los carga el taller —por teléfono, por WhatsApp—; el
 * pedido del cliente desde la web vendrá después, sobre lo mismo.
 */
export const contratoTurnos = {
  listar: conPermiso('servicios', 'ver', 'Turno')
    .route({
      method: 'GET',
      path: '/turnos',
      tags: [TAG_TURNOS],
      operationId: 'listarTurnos',
      summary: 'Los turnos de la sucursal entre dos días, en orden',
      description:
        'Los de días pasados que nadie marcó como llegados pasan a «no vino» al pedirlos: no ' +
        'hay un proceso nocturno que recorra todas las concesionarias.',
    })
    .input(z.object({ desde: z.iso.date(), hasta: z.iso.date() }))
    .errors({
      RANGO_INVALIDO: { status: 422, message: 'Pedí hasta 42 días, y que el primero sea antes' },
    })
    .output(z.object({ datos: z.array(turno) })),

  crear: conPermiso('servicios', 'crear', 'Turno')
    .route({
      method: 'POST',
      path: '/turnos',
      tags: [TAG_TURNOS],
      operationId: 'crearTurno',
      summary: 'Agendar un turno',
      successStatus: 201,
    })
    .input(datosTurno)
    .errors({ ...NO_ENCONTRADO_TURNO, ...NO_ES_RECEPTOR })
    .output(turno),

  editar: conPermiso('servicios', 'editar', 'Turno')
    .route({
      method: 'PUT',
      path: '/turnos/{id}',
      tags: [TAG_TURNOS],
      operationId: 'editarTurno',
      summary: 'Cambiar un turno agendado: otro día, otra hora, otro pedido',
    })
    .input(baseTurno.extend({ id: z.uuid() }).superRefine(reglasTurno))
    .errors({ ...NO_ENCONTRADO_TURNO, ...TURNO_CERRADO, ...NO_ES_RECEPTOR })
    .output(turno),

  cancelar: conPermiso('servicios', 'editar', 'Turno')
    .route({
      method: 'POST',
      path: '/turnos/{id}/cancelar',
      tags: [TAG_TURNOS],
      operationId: 'cancelarTurno',
      summary: 'Cancelarlo: avisó que no viene',
      description: 'No se borra: queda en la agenda como cancelado, con quién lo canceló.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADO_TURNO, ...TURNO_CERRADO })
    .output(turno),

  noVino: conPermiso('servicios', 'editar', 'Turno')
    .route({
      method: 'POST',
      path: '/turnos/{id}/ausente',
      tags: [TAG_TURNOS],
      operationId: 'turnoAusente',
      summary: 'Marcar que no vino, sin esperar a que termine el día',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADO_TURNO, ...TURNO_CERRADO })
    .output(turno),

  llego: conPermiso('servicios', 'editar', 'Turno')
    .route({
      method: 'POST',
      path: '/turnos/{id}/llego',
      tags: [TAG_TURNOS],
      operationId: 'turnoLlego',
      summary: 'Llegó: se anota como visita de servicio, con su número del día',
      description:
        'La visita sale con el nombre, el teléfono y el asesor del turno, y entra a la cola de ' +
        'las tablets con el auto y el pedido para empezar a recibirlo.',
    })
    .input(z.object({ id: z.uuid() }))
    .errors({ ...NO_ENCONTRADO_TURNO, ...TURNO_CERRADO })
    .output(visita),
}
