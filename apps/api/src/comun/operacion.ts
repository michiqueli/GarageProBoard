import { type Acceso, accesoDeRuta, type RutaDelContrato } from '@gpb/contracts'
import { Inject, Injectable, type OnModuleInit, SetMetadata, type Type } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryService } from '@nestjs/core'
import { Implement } from '@orpc/nest'

export const ACCESO = 'gpb:acceso'

type ContratoDeRuta = Parameters<typeof Implement>[0] & RutaDelContrato

/**
 * Implementa una ruta del contrato **con el acceso que el contrato declara**.
 *
 * Reemplaza a `@Implement` de oRPC en todos los controladores. La diferencia es que
 * lleva la declaración de acceso hasta la guardia: el permiso se escribe una sola vez,
 * en el contrato, y acá no hay forma de ponerle otro.
 *
 * Una ruta cuyo contrato no dice quién puede usarla revienta **al cargar el
 * controlador**, antes de que la API atienda un solo pedido.
 */
export function Operacion<T extends ContratoDeRuta>(contrato: T): ReturnType<typeof Implement<T>> {
  const acceso = accesoDeRuta(contrato)

  const implementar = Implement(contrato)
  const marcar = SetMetadata(ACCESO, acceso)

  // Con la misma firma que `Implement`, y no con `applyDecorators`: la de oRPC es
  // genérica y verifica que el método devuelva la implementación de *este* contrato.
  // Envolverla en un decorador genérico de Nest borraría ese chequeo sin avisar.
  const decorador: typeof implementar = (objetivo, propiedad, descriptor) => {
    marcar(objetivo, propiedad, descriptor)
    implementar(objetivo, propiedad, descriptor)
  }
  return decorador
}

export function accesoDe(manejador: object): Acceso | undefined {
  return Reflect.getMetadata(ACCESO, manejador)
}

/**
 * Las rutas HTTP que no declaran acceso: una por cada `@Get`, `@Post`… que no haya
 * pasado por `@Operacion`.
 */
export function rutasSinAcceso(controladores: readonly Type[]): string[] {
  const faltantes: string[] = []

  for (const controlador of controladores) {
    const prototipo = controlador.prototype as Record<string, unknown>

    for (const nombre of Object.getOwnPropertyNames(prototipo)) {
      const metodo = prototipo[nombre]
      if (nombre === 'constructor' || typeof metodo !== 'function') continue
      if (Reflect.getMetadata(PATH_METADATA, metodo) === undefined) continue
      if (accesoDe(metodo) === undefined) faltantes.push(`${controlador.name}.${nombre}`)
    }
  }

  return faltantes
}

/**
 * Se niega a arrancar si alguna ruta no declara quién puede usarla.
 *
 * `@Operacion` ya cubre el caso normal. Esto cubre al que escribe un `@Get()` a mano,
 * que de otro modo quedaría con la guardia rechazándolo en cada pedido — cerrado, pero
 * descubierto recién cuando alguien lo usa.
 */
@Injectable()
export class VerificadorAcceso implements OnModuleInit {
  constructor(@Inject(DiscoveryService) private readonly descubrimiento: DiscoveryService) {}

  onModuleInit(): void {
    const controladores = this.descubrimiento
      .getControllers()
      .map((c) => c.metatype)
      .filter((m): m is Type => typeof m === 'function')

    const faltantes = rutasSinAcceso(controladores)
    if (faltantes.length > 0) {
      throw new Error(
        `Rutas sin acceso declarado: ${faltantes.join(', ')}. ` +
          'Implementalas con @Operacion() y un contrato armado con publico, conSesion o conPermiso().',
      )
    }
  }
}
