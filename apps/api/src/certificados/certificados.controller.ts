import { contrato } from '@gpb/contracts'
import { Controller, Inject, Logger, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorCertificado, ServicioCertificados } from './certificados.service.ts'

const c = contrato.certificados

@Controller()
export class ControladorCertificados {
  private readonly log = new Logger('Certificados')

  constructor(@Inject(ServicioCertificados) private readonly servicio: ServicioCertificados) {}

  /** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
  private traducir<E extends Partial<Record<ErrorCertificado['codigo'], unknown>>>(
    error: unknown,
    errores: E,
  ): never {
    if (error instanceof ErrorCertificado) {
      if (error.codigo === 'SIN_CLAVE_MAESTRA') {
        this.log.error('Falta SECRETOS_MASTER_KEY: no se pueden guardar ni usar certificados.')
      }
      const fabricar = errores[error.codigo] as
        | ((opciones?: { data?: unknown }) => Error)
        | undefined
      if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
    }
    throw error
  }

  @Operacion(c.estado)
  estado() {
    return implement(c.estado).handler(({ input, errors }) =>
      this.servicio.estado(input.empresaId).catch((e) => this.traducir(e, errors)),
    )
  }

  @Operacion(c.pedir)
  pedir(@Req() pedido: FastifyRequest) {
    return implement(c.pedir).handler(({ input, errors }) =>
      this.servicio
        .pedir(input.empresaId, input.alias, pedido.ip)
        .catch((e) => this.traducir(e, errors)),
    )
  }

  @Operacion(c.importar)
  importar(@Req() pedido: FastifyRequest) {
    return implement(c.importar).handler(({ input, errors }) =>
      this.servicio
        .importar(input.empresaId, input.certificado, input.clavePrivada, pedido.ip)
        .catch((e) => this.traducir(e, errors)),
    )
  }

  @Operacion(c.cargar)
  cargar(@Req() pedido: FastifyRequest) {
    return implement(c.cargar).handler(({ input, errors }) =>
      this.servicio
        .cargar(input.empresaId, input.certificado, pedido.ip)
        .catch((e) => this.traducir(e, errors)),
    )
  }

  @Operacion(c.probar)
  probar(@Req() pedido: FastifyRequest) {
    return implement(c.probar).handler(({ input, errors }) =>
      this.servicio.probar(input.empresaId, pedido.ip).catch((e) => {
        if (e instanceof ErrorCertificado && e.codigo === 'AFIP_NO_ACEPTA') {
          this.log.warn(`AFIP no aceptó el certificado: ${JSON.stringify(e.datos)}`)
        }
        return this.traducir(e, errors)
      }),
    )
  }
}
