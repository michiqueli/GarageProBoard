import {
  type AccesoBackoffice,
  accesoDeRutaBackoffice,
  type RutaBackoffice,
} from '@garagepro/contracts/backoffice'
import { Inject, Injectable, type OnModuleInit, SetMetadata, type Type } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryService } from '@nestjs/core'
import { Implement } from '@orpc/nest'

const ACCESO = 'garagepro:backoffice:acceso'

type ContratoDeRuta = Parameters<typeof Implement>[0] & RutaBackoffice

/**
 * `@Implement` con el acceso que el contrato declara. Es la versión del back-office de
 * `apps/api/src/comun/operacion.ts`, y cierra igual: una ruta sin declarar revienta al
 * cargar el controlador.
 */
export function Operacion<T extends ContratoDeRuta>(contrato: T): ReturnType<typeof Implement<T>> {
  const acceso = accesoDeRutaBackoffice(contrato)
  const implementar = Implement(contrato)
  const marcar = SetMetadata(ACCESO, acceso)

  const decorador: typeof implementar = (objetivo, propiedad, descriptor) => {
    marcar(objetivo, propiedad, descriptor)
    implementar(objetivo, propiedad, descriptor)
  }
  return decorador
}

export function accesoDe(manejador: object): AccesoBackoffice | undefined {
  return Reflect.getMetadata(ACCESO, manejador)
}

/** Se niega a arrancar si algún `@Get`, `@Post`… no pasó por `@Operacion`. */
@Injectable()
export class VerificadorAcceso implements OnModuleInit {
  constructor(@Inject(DiscoveryService) private readonly descubrimiento: DiscoveryService) {}

  onModuleInit(): void {
    const faltantes: string[] = []

    for (const { metatype } of this.descubrimiento.getControllers()) {
      if (typeof metatype !== 'function') continue
      const controlador = metatype as Type
      const prototipo = controlador.prototype as Record<string, unknown>

      for (const nombre of Object.getOwnPropertyNames(prototipo)) {
        const metodo = prototipo[nombre]
        if (nombre === 'constructor' || typeof metodo !== 'function') continue
        if (Reflect.getMetadata(PATH_METADATA, metodo) === undefined) continue
        if (accesoDe(metodo) === undefined) faltantes.push(`${controlador.name}.${nombre}`)
      }
    }

    if (faltantes.length > 0) {
      throw new Error(`Rutas del back-office sin acceso declarado: ${faltantes.join(', ')}.`)
    }
  }
}
