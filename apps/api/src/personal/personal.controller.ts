import { contrato } from '@gpb/contracts'
import { TIPOS_QR } from '@gpb/core'
import { generarCredencialesPdf } from '@gpb/pdf'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { qrFirmado, SecretoQrFaltante } from '../comun/qr.ts'
import { ErrorPersonal, ServicioPersonal } from './personal.service.ts'

const c = contrato.personal

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorPersonal['codigo'] | 'SIN_SECRETO_QR', unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof SecretoQrFaltante) {
    const fabricar = errores.SIN_SECRETO_QR as (() => Error) | undefined
    if (fabricar) throw fabricar()
  }
  if (error instanceof ErrorPersonal) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorPersonal {
  constructor(@Inject(ServicioPersonal) private readonly servicio: ServicioPersonal) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.opciones)
  opciones() {
    return implement(c.opciones).handler(() => this.servicio.opciones())
  }

  @Operacion(c.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(c.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.emitirCredencial)
  emitirCredencial(@Req() pedido: FastifyRequest) {
    return implement(c.emitirCredencial).handler(({ input, errors }) =>
      this.servicio
        .emitirCredencial(input.id, input.motivo, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.revocarCredencial)
  revocarCredencial(@Req() pedido: FastifyRequest) {
    return implement(c.revocarCredencial).handler(({ input, errors }) =>
      this.servicio
        .revocarCredencial(input.id, input.motivo, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.pdfCredenciales)
  pdfCredenciales() {
    return implement(c.pdfCredenciales).handler(async ({ input, errors }) => {
      try {
        const { concesionaria, credenciales } = await this.servicio.paraImprimir(input.ids)
        const bytes = await generarCredencialesPdf({
          concesionaria,
          // La firma se calcula acá y no se guarda: el secreto no sale del servidor, y
          // rotarlo es volver a imprimir en vez de reescribir la tabla.
          credenciales: credenciales.map((c) => ({
            ...c,
            qr: qrFirmado(TIPOS_QR.credencial, c.codigo),
          })),
        })
        return new File([bytes], 'credenciales.pdf', { type: 'application/pdf' })
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }
}
