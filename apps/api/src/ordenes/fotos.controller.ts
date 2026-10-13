import { contrato } from '@gpb/contracts'
import { Controller, Inject } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Operacion } from '../comun/operacion.ts'
import { ErrorFotos, ServicioFotos } from './fotos.service.ts'

const c = contrato.ordenes

/** El servicio dice ESTADO_INVALIDO; el contrato de órdenes ya tiene uno, con otros datos. */
const EN_EL_CONTRATO: Record<ErrorFotos['codigo'], string> = {
  NO_ENCONTRADA: 'NO_ENCONTRADA',
  FORMATO_INVALIDO: 'FORMATO_INVALIDO',
  DEMASIADO_GRANDE: 'DEMASIADO_GRANDE',
  DEMASIADAS_FOTOS: 'DEMASIADAS_FOTOS',
  ESTADO_INVALIDO: 'ESTADO_INVALIDO_FOTO',
  SIN_ALMACEN: 'SIN_ALMACEN',
}

function traducir(error: unknown, errores: object): never {
  if (error instanceof ErrorFotos) {
    const fabricar = (errores as Record<string, unknown>)[EN_EL_CONTRATO[error.codigo]] as
      | ((opciones?: { data?: unknown }) => Error)
      | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

@Controller()
export class ControladorFotos {
  constructor(@Inject(ServicioFotos) private readonly servicio: ServicioFotos) {}

  @Operacion(c.subirFoto)
  subirFoto() {
    return implement(c.subirFoto).handler(async ({ input, errors }) => {
      try {
        const bytes = new Uint8Array(await input.imagen.arrayBuffer())
        return await this.servicio.subir(input.id, input.momento, input.nota ?? null, bytes)
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }

  @Operacion(c.foto)
  foto() {
    return implement(c.foto).handler(async ({ input, errors }) => {
      try {
        const { contenido, tipo } = await this.servicio.imagen(input.id, input.fotoId)
        const extension = tipo === 'image/png' ? 'png' : 'jpg'
        return new File([Buffer.from(contenido)], `foto.${extension}`, { type: tipo })
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }

  @Operacion(c.quitarFoto)
  quitarFoto() {
    return implement(c.quitarFoto).handler(async ({ input, errors }) => {
      try {
        return await this.servicio.quitar(input.id, input.fotoId)
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }
}
