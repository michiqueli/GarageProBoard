import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorEstaciones, ServicioEstaciones } from './estaciones.service.ts'
import { ServicioFichaje } from './fichaje.service.ts'

const c = contrato.fichaje

function traducir<E extends Partial<Record<ErrorEstaciones['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorEstaciones) {
    const fabricar = errores[error.codigo] as (() => Error) | undefined
    if (fabricar) throw fabricar()
  }
  throw error
}

/**
 * De dónde se sirve el front, para armar la dirección de la estación.
 *
 * Se lee del entorno y no del pedido: el `Host` lo manda el cliente, y armar con eso la URL
 * que después se pega en la PC del taller sería dejar que alguien la apunte a otro lado.
 */
function baseDelFront(): string {
  return process.env.URL_FRONT ?? 'http://localhost:5173'
}

@Controller()
export class ControladorFichaje {
  constructor(
    @Inject(ServicioFichaje) private readonly fichaje: ServicioFichaje,
    @Inject(ServicioEstaciones) private readonly estaciones: ServicioEstaciones,
  ) {}

  // ── la pantalla del taller, con el token de su estación ─────────────────────

  @Operacion(c.estacion)
  estacion() {
    return implement(c.estacion).handler(() => this.fichaje.estacion())
  }

  @Operacion(c.escanear)
  escanear() {
    return implement(c.escanear).handler(({ input }) => this.fichaje.escanear(input))
  }

  // ── la administración, del lado del sistema ─────────────────────────────────

  @Operacion(c.estaciones)
  listarEstaciones() {
    return implement(c.estaciones).handler(() => this.estaciones.listar())
  }

  @Operacion(c.registrarEstacion)
  registrarEstacion(@Req() pedido: FastifyRequest) {
    return implement(c.registrarEstacion).handler(({ input, errors }) =>
      this.estaciones.registrar(input, baseDelFront(), pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.revocarEstacion)
  revocarEstacion(@Req() pedido: FastifyRequest) {
    return implement(c.revocarEstacion).handler(({ input, errors }) =>
      this.estaciones.revocar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.asistencia)
  asistencia() {
    return implement(c.asistencia).handler(({ input }) => this.estaciones.asistencia(input.fecha))
  }
}
