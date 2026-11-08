import { contrato } from '@gpb/contracts'
import { Controller, Inject, Injectable, Logger, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import type { ServicioCorreo } from '../comun/correo.ts'
import { Operacion } from '../comun/operacion.ts'
import { CORREO } from '../comun/simbolos.ts'

const MAXIMO_POR_HORA = 5
const UNA_HORA = 60 * 60 * 1000

class DemasiadosPedidos extends Error {}

interface Pedido {
  nombre: string
  concesionaria: string
  email: string
  telefono: string
  mensaje: string
  sitio: string
}

/**
 * El formulario de la landing, que es público: va con un campo trampa para los robots y un tope
 * por dirección. El tope es del proceso, y alcanza para que nadie use esto de cañón de spam.
 */
@Injectable()
export class ServicioContacto {
  private readonly pedidos = new Map<string, number[]>()

  constructor(@Inject(CORREO) private readonly correo: ServicioCorreo) {}

  async enviar(p: Pedido, ip: string) {
    // Al robot se le contesta que salió bien: si supiera que lo frenamos, cambiaría.
    if (p.sitio) return { ok: true as const }

    const ahora = Date.now()
    const recientes = (this.pedidos.get(ip) ?? []).filter((t) => ahora - t < UNA_HORA)
    if (recientes.length >= MAXIMO_POR_HORA) throw new DemasiadosPedidos()
    this.pedidos.set(ip, [...recientes, ahora])

    await this.correo.enviar({
      para: process.env.CONTACTO_DESTINO ?? 'hola@garageproboard.com',
      responderA: p.email,
      asunto: `Pedido de demo: ${p.concesionaria || p.nombre}`,
      texto: [
        `Nombre: ${p.nombre}`,
        `Concesionaria: ${p.concesionaria || '—'}`,
        `Correo: ${p.email}`,
        `Teléfono: ${p.telefono || '—'}`,
        '',
        p.mensaje || '(sin mensaje)',
      ].join('\n'),
    })
    return { ok: true as const }
  }
}

const c = contrato.contacto

@Controller()
export class ControladorContacto {
  private readonly log = new Logger('Contacto')

  constructor(@Inject(ServicioContacto) private readonly servicio: ServicioContacto) {}

  @Operacion(c.enviar)
  enviar(@Req() pedido: FastifyRequest) {
    return implement(c.enviar).handler(({ input, errors }) =>
      this.servicio.enviar(input, pedido.ip).catch((e: unknown) => {
        if (e instanceof DemasiadosPedidos) throw errors.DEMASIADOS()
        this.log.warn(`No se pudo mandar un contacto: ${String(e)}`)
        throw errors.NO_ENVIADO()
      }),
    )
  }
}
