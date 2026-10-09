import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorRecepcion, ServicioRecepcion } from './recepcion.service.ts'

const c = contrato.recepcion

function traducir<E extends Partial<Record<ErrorRecepcion['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorRecepcion) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorRecepcion {
  constructor(@Inject(ServicioRecepcion) private readonly servicio: ServicioRecepcion) {}

  @Operacion(c.hoy)
  hoy() {
    return implement(c.hoy).handler(() => this.servicio.hoy())
  }

  @Operacion(c.mias)
  mias() {
    return implement(c.mias).handler(() => this.servicio.mias())
  }

  @Operacion(c.receptores)
  receptores() {
    return implement(c.receptores).handler(() => this.servicio.receptores())
  }

  @Operacion(c.anotar)
  anotar() {
    return implement(c.anotar).handler(({ input, errors }) =>
      this.servicio.anotar(input).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.derivar)
  derivar() {
    return implement(c.derivar).handler(({ input, errors }) =>
      this.servicio.derivar(input.id, input.derivadaA).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.atender)
  atender() {
    return implement(c.atender).handler(({ input, errors }) =>
      this.servicio.atender(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.soltar)
  soltar() {
    return implement(c.soltar).handler(({ input, errors }) =>
      this.servicio.soltar(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.cerrar)
  cerrar() {
    return implement(c.cerrar).handler(({ input, errors }) =>
      this.servicio.cerrar(input.id, input.resultado, input.nota).catch((e) => traducir(e, errors)),
    )
  }
}
