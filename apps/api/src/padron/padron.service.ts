import type { Contribuyente, ServicioPadron } from '@gpb/afip'
import { Inject, Injectable } from '@nestjs/common'

export const PADRON = Symbol('PADRON')

/** Doce horas: lo que un contribuyente tarda en cambiar de condición es mucho más. */
const DURACION_MS = 12 * 60 * 60 * 1000
const MAXIMO = 2000

/**
 * La consulta al padrón, con memoria.
 *
 * AFIP limita los pedidos y tarda segundos. El mismo CUIT se consulta seguido —se abre el
 * alta, se cierra, se vuelve a abrir—, así que se recuerda lo que contestó durante doce
 * horas. Lo que se recuerda es también el «no existe»: un CUIT mal tipeado no tiene por
 * qué preguntarse dos veces.
 *
 * La memoria es del proceso y no se comparte entre concesionarias por error: lo que se
 * guarda es un dato público de AFIP, igual para todos.
 */
@Injectable()
export class ServicioConsultaPadron {
  private readonly memoria = new Map<string, { valor: Contribuyente | null; vence: number }>()

  constructor(@Inject(PADRON) private readonly padron: ServicioPadron) {}

  async consultar(cuit: string): Promise<Contribuyente | null> {
    const guardado = this.memoria.get(cuit)
    if (guardado && guardado.vence > Date.now()) return guardado.valor

    // Un error no se recuerda: AFIP caída ahora puede andar en un minuto.
    const valor = await this.padron.consultar(cuit)

    if (this.memoria.size >= MAXIMO) {
      const masViejo = this.memoria.keys().next().value
      if (masViejo !== undefined) this.memoria.delete(masViejo)
    }
    this.memoria.set(cuit, { valor, vence: Date.now() + DURACION_MS })
    return valor
  }
}
