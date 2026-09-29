import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorHojas, ServicioHojas } from './hojas.service.ts'

const c = contrato.hojas

function traducir<E extends Partial<Record<ErrorHojas['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorHojas) {
    const fabricar = errores[error.codigo] as (() => Error) | undefined
    if (fabricar) throw fabricar()
  }
  throw error
}

@Controller()
export class ControladorHojas {
  constructor(@Inject(ServicioHojas) private readonly servicio: ServicioHojas) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(() => this.servicio.listar())
  }

  @Operacion(c.subir)
  subir() {
    return implement(c.subir).handler(async ({ input, errors }) => {
      try {
        const bytes = new Uint8Array(await input.imagen.arrayBuffer())
        return await this.servicio.subir(input.tipo, input.vista, bytes)
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }

  @Operacion(c.imagen)
  imagen() {
    return implement(c.imagen).handler(async ({ input, errors }) => {
      try {
        const { contenido, formato, nombre } = await this.servicio.bytes(input.id)
        // Se copia a un Buffer propio: File no acepta un Uint8Array sobre un ArrayBuffer compartido.
        return new File([Buffer.from(contenido)], nombre, { type: formato })
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }

  @Operacion(c.quitar)
  quitar() {
    return implement(c.quitar).handler(({ input, errors }) =>
      this.servicio.quitar(input.tipo, input.vista).catch((e) => traducir(e, errors)),
    )
  }
}
