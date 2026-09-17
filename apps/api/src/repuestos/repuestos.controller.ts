import { contrato } from '@gpb/contracts'
import { Controller, Inject, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ServicioCompras } from './compras.service.ts'
import { traducir } from './errores.ts'
import { ServicioPedidosRepuestos } from './pedidos.service.ts'
import { ServicioProveedores } from './proveedores.service.ts'
import { ServicioRepuestos } from './repuestos.service.ts'

const r = contrato.repuestos
const p = contrato.pedidosRepuestos
const c = contrato.compras
const v = contrato.proveedores

@Controller()
export class ControladorRepuestos {
  constructor(@Inject(ServicioRepuestos) private readonly servicio: ServicioRepuestos) {}

  @Operacion(r.listar)
  listar() {
    return implement(r.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(r.ficha)
  ficha() {
    return implement(r.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(r.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(r.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(r.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(r.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(r.ubicar)
  ubicar(@Req() pedido: FastifyRequest) {
    return implement(r.ubicar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.ubicar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(r.ajustar)
  ajustar(@Req() pedido: FastifyRequest) {
    return implement(r.ajustar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.ajustar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(r.transferir)
  transferir(@Req() pedido: FastifyRequest) {
    return implement(r.transferir).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.transferir(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}

@Controller()
export class ControladorPedidosRepuestos {
  constructor(
    @Inject(ServicioPedidosRepuestos) private readonly servicio: ServicioPedidosRepuestos,
  ) {}

  @Operacion(p.listar)
  listar() {
    return implement(p.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(p.ficha)
  ficha() {
    return implement(p.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.abrir)
  abrir(@Req() pedido: FastifyRequest) {
    return implement(p.abrir).handler(({ input, errors }) =>
      this.servicio.abrir(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(p.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.entregar)
  entregar(@Req() pedido: FastifyRequest) {
    return implement(p.entregar).handler(({ input, errors }) =>
      this.servicio.entregar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.aCaja)
  aCaja(@Req() pedido: FastifyRequest) {
    return implement(p.aCaja).handler(({ input, errors }) =>
      this.servicio.aCaja(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.reabrir)
  reabrir(@Req() pedido: FastifyRequest) {
    return implement(p.reabrir).handler(({ input, errors }) =>
      this.servicio.reabrir(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(p.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(p.anular).handler(({ input, errors }) =>
      this.servicio.anular(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}

@Controller()
export class ControladorCompras {
  constructor(@Inject(ServicioCompras) private readonly servicio: ServicioCompras) {}

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

  @Operacion(c.recibir)
  recibir(@Req() pedido: FastifyRequest) {
    return implement(c.recibir).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.recibir(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(c.anular).handler(({ input, errors }) =>
      this.servicio.anular(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}

@Controller()
export class ControladorProveedores {
  constructor(@Inject(ServicioProveedores) private readonly servicio: ServicioProveedores) {}

  @Operacion(v.listar)
  listar() {
    return implement(v.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(v.ficha)
  ficha() {
    return implement(v.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(v.crear)
  crear(@Req() pedido: FastifyRequest) {
    return implement(v.crear).handler(({ input, errors }) =>
      this.servicio.crear(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(v.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(v.editar).handler(({ input: { id, ...datos }, errors }) =>
      this.servicio.editar(id, datos, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
