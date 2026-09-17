import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorAtajos, ErrorConfiguracion, ServicioConfiguracion } from './configuracion.service.ts'

const c = contrato.configuracion

@Controller()
export class ControladorConfiguracion {
  constructor(@Inject(ServicioConfiguracion) private readonly config: ServicioConfiguracion) {}

  @Operacion(c.guardar)
  guardar() {
    return implement(c.guardar).handler(({ input, errors }) =>
      this.config.guardar(input).catch((error: unknown) => {
        if (error instanceof ErrorConfiguracion) throw errors.SUCURSAL_INVALIDA()
        throw error
      }),
    )
  }

  @Operacion(c.guardarAtajos)
  guardarAtajos() {
    return implement(c.guardarAtajos).handler(({ input, errors }) =>
      this.config.guardarAtajos(input.atajos).catch((error: unknown) => {
        if (error instanceof ErrorAtajos) {
          throw errors.ATAJOS_INVALIDOS({ data: { problemas: error.problemas } })
        }
        throw error
      }),
    )
  }
}
