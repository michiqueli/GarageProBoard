import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { paginado } from './comunes.ts'

const TAG = 'Personal'

/**
 * Qué hace cada uno en la concesionaria. **No es el rol del sistema**: el rol dice qué
 * pantallas abre, el puesto dice a qué entra todos los días. El jefe de taller es mecánico
 * de puesto y gerente de rol; el lavador tiene puesto y no tiene rol, porque no entra.
 *
 * De acá sale a quién se le ofrece una orden de trabajo, así que la lista es cerrada: con
 * texto libre, el día que alguien escriba «mecanico » con un espacio, ese mecánico
 * desaparece del selector y nadie entiende por qué.
 */
export const PUESTOS = {
  mecanico: 'Mecánico',
  asesor: 'Asesor de servicios',
  repuestero: 'Repuestero',
  cajero: 'Cajero',
  administrativo: 'Administrativo',
  lavador: 'Preparador',
  chofer: 'Chofer',
  vendedor: 'Vendedor',
  gerente: 'Gerente',
  otro: 'Otro',
} as const

export type Puesto = keyof typeof PUESTOS

export const PUESTOS_ORDENADOS = Object.keys(PUESTOS) as [Puesto, ...Puesto[]]

const puesto = z.enum(PUESTOS_ORDENADOS)

/** Un texto opcional: vacío es «no tiene», no una cadena vacía guardada. */
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()

export const credencialSalida = z.object({
  id: z.uuid(),
  /** Los ocho caracteres del QR. La firma la agrega el servidor recién al imprimir. */
  codigo: z.string(),
  emitidaEn: z.iso.datetime(),
})

export const empleadoSalida = z.object({
  id: z.uuid(),
  tipoDocumento: z.number().int(),
  numeroDocumento: z.string(),
  nombre: z.string(),
  apellido: z.string(),
  /** «Pérez, Jorge»: como lo escribe AFIP y como se ordena la lista. */
  razonSocial: z.string(),
  legajo: z.string(),
  puesto,
  sucursalId: z.uuid().nullable(),
  sucursal: z.string().nullable(),
  convenio: z.string().nullable(),
  categoria: z.string().nullable(),
  fechaIngreso: z.string().nullable(),
  fechaEgreso: z.string().nullable(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  activo: z.boolean(),
  /** La vigente, si tiene. Las revocadas quedan en la auditoría, no acá. */
  credencial: credencialSalida.nullable(),
  /** Si además entra al sistema: para no dar de alta dos veces a la misma persona. */
  usuario: z.object({ id: z.uuid(), email: z.string() }).nullable(),
})

const datosEmpleado = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre'),
  apellido: z.string().trim().min(1, 'Falta el apellido'),
  legajo: z.string().trim().min(1, 'Falta el legajo'),
  puesto,
  sucursalId: z.uuid().nullable(),
  convenio: opcional,
  categoria: opcional,
  fechaIngreso: z.iso.date().nullable(),
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email('Ese correo no parece bien escrito').nullable())
    .nullable(),
  telefono: opcional,
})

/**
 * El documento de un empleado: CUIL o DNI, siempre de una persona física.
 *
 * El CUIL es el que va a pedir la liquidación de sueldos —el F.931 se arma con eso— y además
 * es el que se puede consultar en el padrón para traer el nombre ya escrito como lo escribe
 * AFIP. El DNI se acepta igual, para poder dar de alta a alguien el mismo día que entra,
 * cuando todavía no tiene el CUIL a mano.
 */
const altaEmpleado = datosEmpleado
  .extend({
    tipoDocumento: z.union([z.literal(86), z.literal(96)]),
    numeroDocumento: z.string().regex(/^[0-9]+$/, 'Sólo números, sin puntos ni guiones'),
  })
  .superRefine((d, ctx) => {
    const largo = d.tipoDocumento === 96 ? /^[0-9]{7,8}$/ : /^[0-9]{11}$/
    if (!largo.test(d.numeroDocumento)) {
      ctx.addIssue({
        code: 'custom',
        path: ['numeroDocumento'],
        message: d.tipoDocumento === 96 ? 'El DNI son 7 u 8 dígitos' : 'El CUIL son 11 dígitos',
      })
    }
  })

const NO_ENCONTRADO = {
  NO_ENCONTRADO: { status: 404, message: 'Ese empleado no existe en la concesionaria' },
} as const

const REFERENCIA_INVALIDA = {
  REFERENCIA_INVALIDA: { status: 422, message: 'Esa sucursal no es de la concesionaria' },
} as const

const LEGAJO_DUPLICADO = {
  LEGAJO_DUPLICADO: {
    status: 409,
    message: 'Ese legajo ya lo tiene otro empleado',
    data: z.object({ razonSocial: z.string() }),
  },
} as const

/**
 * El personal de la concesionaria: quién trabaja acá, con qué legajo y con qué credencial.
 *
 * Va en **núcleo** aunque la pantalla viva en la sección de RRHH. Sin esta lista no se le
 * asigna una orden a un mecánico ni se imprime una credencial para fichar, que son cosas del
 * taller: dejarla detrás de un módulo que la concesionaria puede no haber contratado apagaría
 * el fichaje. RRHH va a pedir su módulo cuando llegue la liquidación de sueldos.
 */
export const contratoPersonal = {
  listar: conPermiso('nucleo', 'ver', 'Empleado')
    .route({
      method: 'GET',
      path: '/personal',
      tags: [TAG],
      operationId: 'listarPersonal',
      summary: 'El personal de la concesionaria',
      description: 'El buscador acepta nombre, apellido, legajo o documento.',
    })
    .input(
      paginado.extend({
        buscar: z.string().optional(),
        /** Por omisión los que trabajan hoy: al que se fue no se le asigna una orden. */
        estado: z.enum(['activos', 'todos']).default('activos'),
        puesto: puesto.optional(),
        /** `sin` son los que todavía no tienen credencial: es la cola de impresión. */
        credencial: z.enum(['todos', 'con', 'sin']).default('todos'),
      }),
    )
    .output(z.object({ datos: z.array(empleadoSalida), total: z.number().int() })),

  opciones: conPermiso('nucleo', 'ver', 'Empleado')
    .route({
      method: 'GET',
      path: '/personal/opciones',
      tags: [TAG],
      operationId: 'opcionesPersonal',
      summary: 'Lo que hace falta para armar el formulario de alta',
    })
    .output(z.object({ sucursales: z.array(z.object({ id: z.uuid(), nombre: z.string() })) })),

  crear: conPermiso('nucleo', 'crear', 'Empleado')
    .route({
      method: 'POST',
      path: '/personal',
      tags: [TAG],
      operationId: 'crearEmpleado',
      summary: 'Alta de un empleado',
      successStatus: 201,
      description:
        'Si el documento ya está cargado como cliente o proveedor, no se duplica: se le ' +
        'agrega el rol de empleado a la misma identidad fiscal.',
    })
    .input(altaEmpleado)
    .errors({
      ...REFERENCIA_INVALIDA,
      ...LEGAJO_DUPLICADO,
      EMPLEADO_DUPLICADO: {
        status: 409,
        message: 'Esa persona ya está cargada como empleado',
        data: z.object({ id: z.uuid(), razonSocial: z.string(), legajo: z.string() }),
      },
    })
    .output(empleadoSalida),

  editar: conPermiso('nucleo', 'editar', 'Empleado')
    .route({
      method: 'PUT',
      path: '/personal/{id}',
      tags: [TAG],
      operationId: 'editarEmpleado',
      summary: 'Modificar un empleado, o darlo de baja',
      description:
        'El documento no se cambia: otro documento es otra persona. Darlo de baja le revoca ' +
        'la credencial, porque el que se fue no tiene que poder fichar el lunes.',
    })
    .input(
      datosEmpleado.extend({
        id: z.uuid(),
        activo: z.boolean(),
        fechaEgreso: z.iso.date().nullable(),
      }),
    )
    .errors({ ...NO_ENCONTRADO, ...REFERENCIA_INVALIDA, ...LEGAJO_DUPLICADO })
    .output(empleadoSalida),

  emitirCredencial: conPermiso('nucleo', 'editar', 'Empleado')
    .route({
      method: 'POST',
      path: '/personal/{id}/credencial',
      tags: [TAG],
      operationId: 'emitirCredencial',
      summary: 'Emitir la credencial de un empleado',
      successStatus: 201,
      description:
        'Si ya tenía una vigente se revoca y se emite otra: el código viejo deja de fichar en ' +
        'el momento. Es lo que se hace cuando alguien pierde la tarjeta.',
    })
    .input(
      z.object({
        id: z.uuid(),
        /** Obligatorio sólo cuando se reemplaza una vigente: «la perdió», «se arruinó». */
        motivo: z.string().trim().max(200).optional(),
      }),
    )
    .errors({
      ...NO_ENCONTRADO,
      EMPLEADO_INACTIVO: {
        status: 422,
        message: 'No se le emite credencial a alguien que ya no trabaja acá',
      },
      FALTA_MOTIVO: {
        status: 422,
        message: 'Ya tiene una credencial vigente: decí por qué se reemplaza',
      },
    })
    .output(empleadoSalida),

  revocarCredencial: conPermiso('nucleo', 'editar', 'Empleado')
    .route({
      // POST y no DELETE: acá no se borra nada. La credencial queda, con su fecha y su
      // motivo, que es lo único que después explica por qué una tarjeta dejó de fichar.
      method: 'POST',
      path: '/personal/{id}/credencial/revocar',
      tags: [TAG],
      operationId: 'revocarCredencial',
      summary: 'Revocar la credencial vigente, sin emitir otra',
      description: 'Queda sin poder fichar hasta que se le emita una nueva.',
    })
    .input(z.object({ id: z.uuid(), motivo: z.string().trim().min(1, 'Falta el motivo').max(200) }))
    .errors({
      ...NO_ENCONTRADO,
      SIN_CREDENCIAL: { status: 422, message: 'Ese empleado no tiene una credencial vigente' },
    })
    .output(empleadoSalida),

  pdfCredenciales: conPermiso('nucleo', 'ver', 'Empleado')
    .route({
      method: 'POST',
      path: '/personal/credenciales/pdf',
      tags: [TAG],
      operationId: 'pdfCredenciales',
      summary: 'Las credenciales para imprimir y recortar, diez por hoja',
      description:
        'Sólo las vigentes. Al que no tiene credencial se lo saltea en vez de sacarlo en ' +
        'blanco: una tarjeta sin QR termina apoyada contra el lector hasta que alguien se cansa.',
    })
    .input(z.object({ ids: z.array(z.uuid()).min(1, 'Elegí a quién imprimirle').max(200) }))
    .errors({
      SIN_SECRETO_QR: {
        status: 503,
        message: 'El servidor no tiene configurada la firma de los QR. Avisale a soporte',
      },
      NINGUNA_VIGENTE: {
        status: 422,
        message: 'Ninguno de los elegidos tiene credencial vigente. Emitila primero',
      },
    })
    .output(z.file()),
}
