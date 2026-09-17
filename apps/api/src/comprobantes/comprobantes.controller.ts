import { contrato } from '@gpb/contracts'
import { Controller, Inject, Logger, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorComprobantes, ServicioComprobantes } from './comprobantes.service.ts'

const c = contrato.comprobantes

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorComprobantes['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorComprobantes) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar)
      throw error.datos && Object.keys(error.datos).length
        ? fabricar({ data: error.datos })
        : fabricar()
  }
  throw error
}

@Controller()
export class ControladorComprobantes {
  private readonly log = new Logger('Comprobantes')

  constructor(@Inject(ServicioComprobantes) private readonly servicio: ServicioComprobantes) {}

  @Operacion(c.opciones)
  opciones() {
    return implement(c.opciones).handler(() => this.servicio.opciones())
  }

  @Operacion(c.receptor)
  receptor() {
    return implement(c.receptor).handler(({ input: { puntoVentaId, ...pedido }, errors }) =>
      this.servicio.receptor(puntoVentaId, pedido).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.emitir)
  emitir(@Req() pedido: FastifyRequest) {
    return implement(c.emitir).handler(({ input, errors }) =>
      this.servicio.emitir(input, pedido.ip).catch((e) => {
        if (e instanceof ErrorComprobantes && e.codigo === 'AFIP_NO_RESPONDE') {
          this.log.warn(`AFIP no contestó al emitir: ${JSON.stringify(e.datos)}`)
        }
        return traducir(e, errors)
      }),
    )
  }

  @Operacion(c.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(c.anular).handler(({ input, errors }) =>
      this.servicio.anular(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.enviar)
  enviar(@Req() pedido: FastifyRequest) {
    return implement(c.enviar).handler(({ input, errors }) =>
      this.servicio.enviar(input.id, input.email, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.verificar)
  verificar(@Req() pedido: FastifyRequest) {
    return implement(c.verificar).handler(({ input, errors }) =>
      this.servicio.verificar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.ficha)
  ficha() {
    return implement(c.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.pdf)
  pdf() {
    return implement(c.pdf).handler(async ({ input, errors }) => {
      const { bytes, nombre } = await this.servicio.pdf(input.id).catch((e) => traducir(e, errors))
      return new File([bytes], nombre, { type: 'application/pdf' })
    })
  }
}
