import { z } from 'zod'
import { conPermiso } from './acceso.ts'
import { paginado } from './comunes.ts'

const TAG = 'Auditoría'

const dispositivoResumen = z.object({
  id: z.uuid(),
  /** El que le puso la concesionaria: «PC del mostrador». */
  nombre: z.string().nullable(),
  /** El navegador tal como se informó, para cuando no tiene nombre. */
  agente: z.string().nullable(),
})

export const ingreso = z.object({
  fecha: z.iso.datetime(),
  usuario: z.object({ id: z.uuid(), nombre: z.string(), email: z.string() }),
  /** Vacío si entró desde una app sin cookies. */
  dispositivo: dispositivoResumen.nullable(),
  /**
   * Primera vez que este usuario entra desde esta computadora. Es lo que hay que mirar: el
   * gerente entrando desde la PC de sistemas es exactamente esto.
   */
  computadoraNueva: z.boolean(),
  ip: z.string().nullable(),
  sucursal: z.string().nullable(),
})

export const cambio = z.object({
  fecha: z.iso.datetime(),
  /** Quién lo hizo. */
  autor: z.string().nullable(),
  /** Sobre qué: «el usuario taller@litoral.test». */
  sobre: z.string(),
  accion: z.enum(['alta', 'modificacion', 'baja']),
  /** Qué cambió, en palabras: «roles, sucursales». */
  detalle: z.string(),
  ip: z.string().nullable(),
})

export const dispositivoListado = dispositivoResumen.extend({
  creadoEn: z.iso.datetime(),
  ultimoUsoEn: z.iso.datetime(),
  /** Quiénes entraron desde esta computadora. */
  usuarios: z.array(z.string()),
})

export const contratoAuditoria = {
  ingresos: conPermiso('nucleo', 'ver', 'Auditoria')
    .route({
      method: 'GET',
      path: '/auditoria/ingresos',
      tags: [TAG],
      operationId: 'listarIngresos',
      summary: 'Quién entró, cuándo y desde qué computadora',
      description:
        'Un ingreso por inicio de sesión: las renovaciones automáticas no cuentan como ' +
        'ingresos nuevos.',
    })
    .input(paginado.extend({ usuarioId: z.uuid().optional() }))
    .output(z.object({ datos: z.array(ingreso), total: z.number().int() })),

  cambios: conPermiso('nucleo', 'ver', 'Auditoria')
    .route({
      method: 'GET',
      path: '/auditoria/cambios',
      tags: [TAG],
      operationId: 'listarCambios',
      summary: 'Quién cambió qué',
    })
    .input(paginado)
    .output(z.object({ datos: z.array(cambio), total: z.number().int() })),

  dispositivos: conPermiso('nucleo', 'ver', 'Auditoria')
    .route({
      method: 'GET',
      path: '/auditoria/dispositivos',
      tags: [TAG],
      operationId: 'listarDispositivos',
      summary: 'Las computadoras desde las que se entra',
    })
    .output(z.object({ datos: z.array(dispositivoListado) })),

  nombrarDispositivo: conPermiso('nucleo', 'editar', 'Auditoria')
    .route({
      method: 'PUT',
      path: '/auditoria/dispositivos/{id}',
      tags: [TAG],
      operationId: 'nombrarDispositivo',
      summary: 'Ponerle nombre a una computadora',
      description: 'Sin nombre (null) vuelve a mostrarse el navegador.',
    })
    .input(z.object({ id: z.uuid(), nombre: z.string().trim().min(1).max(60).nullable() }))
    .errors({ NO_ENCONTRADO: { status: 404, message: 'No existe esa computadora' } })
    .output(dispositivoListado),
}
