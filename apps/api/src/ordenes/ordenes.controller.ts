import { contrato } from '@gpb/contracts'
import { TIPOS_QR } from '@gpb/core'
import { generarOrdenPdf } from '@gpb/pdf'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { qrFirmado, SecretoQrFaltante } from '../comun/qr.ts'
import { ErrorOrdenes, ServicioOrdenes } from './ordenes.service.ts'

const c = contrato.ordenes

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorOrdenes['codigo'] | 'SIN_SECRETO_QR', unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof SecretoQrFaltante) {
    const fabricar = errores.SIN_SECRETO_QR as (() => Error) | undefined
    if (fabricar) throw fabricar()
  }
  if (error instanceof ErrorOrdenes) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar) throw error.datos ? fabricar({ data: error.datos }) : fabricar()
  }
  throw error
}

/** «2026-09-16T09:42», en la hora de Argentina. */
function horaArgentina(iso: string) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`
}

@Controller()
export class ControladorOrdenes {
  constructor(@Inject(ServicioOrdenes) private readonly servicio: ServicioOrdenes) {}

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.ficha)
  ficha() {
    return implement(c.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.abrir)
  abrir(@Req() pedido: FastifyRequest) {
    return implement(c.abrir).handler(({ input, errors }) =>
      this.servicio.abrir(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.items)
  items(@Req() pedido: FastifyRequest) {
    return implement(c.items).handler(({ input, errors }) =>
      this.servicio.items(input.id, input.items, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.cambiarEstado)
  cambiarEstado(@Req() pedido: FastifyRequest) {
    return implement(c.cambiarEstado).handler(({ input, errors }) =>
      this.servicio
        .cambiarEstado(input.id, input.estado, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.terminar)
  terminar(@Req() pedido: FastifyRequest) {
    return implement(c.terminar).handler(({ input, errors }) =>
      this.servicio.terminar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.reabrir)
  reabrir(@Req() pedido: FastifyRequest) {
    return implement(c.reabrir).handler(({ input, errors }) =>
      this.servicio.reabrir(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.entregar)
  entregar(@Req() pedido: FastifyRequest) {
    return implement(c.entregar).handler(({ input, errors }) =>
      this.servicio.entregar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(c.anular).handler(({ input, errors }) =>
      this.servicio.anular(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.pdf)
  pdf() {
    return implement(c.pdf).handler(async ({ input, errors }) => {
      try {
        const { orden: o, extra, titularTelefono } = await this.servicio.paraImprimir(input.id)
        const bytes = await generarOrdenPdf({
          concesionaria: extra.nombreFantasia ?? extra.razonSocial,
          sucursal: {
            nombre: extra.sucursal,
            domicilio: extra.domicilio,
            telefono: extra.telefono,
          },
          numero: o.numero,
          qr: qrFirmado(TIPOS_QR.orden, extra.codigoQr),
          ingreso: horaArgentina(o.creadoEn),
          prometidaPara: o.prometidaPara,
          vehiculo: {
            dominio: o.vehiculo.dominio,
            marcaModelo: [o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' ') || null,
            anio: extra.anio,
            color: extra.color,
            chasis: o.vehiculo.chasis,
            kilometraje: o.kilometraje,
            combustible: o.combustible,
          },
          titular: o.titular ? { nombre: o.titular.razonSocial, telefono: titularTelefono } : null,
          trae: { nombre: o.traeNombre, telefono: o.traeTelefono },
          paga: o.paga?.razonSocial ?? null,
          pedido: o.pedido,
          observaciones: o.observaciones,
          asesor: o.asesor,
          mecanico: o.mecanico?.nombre ?? null,
          items: o.items.map((i) => ({
            tipo: i.tipo,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            total: i.total,
          })),
          total: o.total,
        })
        return new File([bytes], `Orden-${String(o.numero).padStart(6, '0')}.pdf`, {
          type: 'application/pdf',
        })
      } catch (error) {
        return traducir(error, errors)
      }
    })
  }
}
