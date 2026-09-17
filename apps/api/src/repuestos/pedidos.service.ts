import { plata } from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, inArray, isNull, or, sql } from '@gpb/db'
import {
  cliente,
  comprobante,
  entidadComercial,
  marca,
  modelo,
  orden,
  ordenItem,
  pedidoRepuestos,
  pedidoRepuestosItem,
  tipoComprobante,
  usuario,
  vehiculo,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { EN_TALLER } from '../ordenes/ordenes.service.ts'
import { ErrorRepuestos } from './errores.ts'
import { cantidadLinda } from './repuestos.service.ts'
import { moverStock, repuestosExisten, seis, siguienteNumero, stockEn } from './stock.ts'

export type EstadoPedido = 'abierto' | 'en_caja' | 'facturado' | 'entregado' | 'anulado'

export interface ItemPedidoEntrada {
  repuestoId?: string | null | undefined
  codigo?: string | null | undefined
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: number
}

type Pedido = typeof pedidoRepuestos.$inferSelect

const totalItem = (i: { cantidad: string; precioUnitario: string }) =>
  plata(i.cantidad).times(plata(i.precioUnitario)).toDecimalPlaces(2)

/**
 * Pedidos de repuestos: alguien necesita piezas, con el chasis en la mano, y el repuestero
 * las arma.
 *
 * El stock se mueve cuando la pieza sale del mostrador, no cuando se anota: al **entregar**
 * al taller (pasan a la orden) o al **mandar a caja** (venta de mostrador). Hasta ahí el
 * pedido es una lista que se puede cambiar sin dejar rastro en el depósito.
 */
@Injectable()
export class ServicioPedidosRepuestos {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: EstadoPedido | 'pendientes' | 'todos'
    ordenId?: string | undefined
  }) {
    return this.datos.transaccion(async (tx, sesion) => {
      const texto = filtro.buscar?.trim()
      const compacto = texto?.toUpperCase().replace(/[\s-]/g, '')
      const donde = and(
        eq(pedidoRepuestos.sucursalId, sesion.sucursalId),
        filtro.estado === 'todos'
          ? undefined
          : filtro.estado === 'pendientes'
            ? inArray(pedidoRepuestos.estado, ['abierto', 'en_caja'])
            : eq(pedidoRepuestos.estado, filtro.estado),
        filtro.ordenId ? eq(pedidoRepuestos.ordenId, filtro.ordenId) : undefined,
        texto
          ? or(
              sql`${pedidoRepuestos.numero}::text = ${texto.replace(/^0+/, '')}`,
              ilike(pedidoRepuestos.chasis, `%${compacto}%`),
              ilike(vehiculo.dominio, `%${compacto}%`),
              ilike(entidadComercial.razonSocial, `%${texto}%`),
              ilike(pedidoRepuestos.solicitante, `%${texto}%`),
            )
          : undefined,
      )
      const [total] = await tx
        .select({ n: count() })
        .from(pedidoRepuestos)
        .leftJoin(vehiculo, eq(vehiculo.id, pedidoRepuestos.vehiculoId))
        .leftJoin(entidadComercial, eq(entidadComercial.id, pedidoRepuestos.clienteId))
        .where(donde)
      const filas = await tx
        .select({ id: pedidoRepuestos.id })
        .from(pedidoRepuestos)
        .leftJoin(vehiculo, eq(vehiculo.id, pedidoRepuestos.vehiculoId))
        .leftJoin(entidadComercial, eq(entidadComercial.id, pedidoRepuestos.clienteId))
        .where(donde)
        .orderBy(desc(pedidoRepuestos.creadoEn))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina)
      return {
        total: total?.n ?? 0,
        datos: await this.armar(
          tx,
          filas.map((f) => f.id),
        ),
      }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx, sesion) => this.detalle(tx, sesion, id))
  }

  abrir(
    entrada: {
      chasis?: string | null | undefined
      ordenId?: string | null | undefined
      clienteId?: string | null | undefined
      solicitante?: string | null | undefined
      nota?: string | null | undefined
      items: ItemPedidoEntrada[]
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      let chasis = entrada.chasis ?? null
      let vehiculoId: string | null = null

      if (entrada.ordenId) {
        // El chasis de un pedido para el taller es el del auto de la orden: no se tipea dos veces.
        const [o] = await tx
          .select({
            estado: orden.estado,
            sucursalId: orden.sucursalId,
            vehiculoId: orden.vehiculoId,
            chasis: vehiculo.chasis,
          })
          .from(orden)
          .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
          .where(eq(orden.id, entrada.ordenId))
        if (!o || o.sucursalId !== sesion.sucursalId) throw new ErrorRepuestos('NO_ENCONTRADO')
        if (!EN_TALLER.includes(o.estado as never)) throw new ErrorRepuestos('ORDEN_CERRADA')
        chasis = o.chasis
        vehiculoId = o.vehiculoId
      } else if (chasis) {
        const [v] = await tx
          .select({ id: vehiculo.id })
          .from(vehiculo)
          .where(eq(vehiculo.chasis, chasis))
        vehiculoId = v?.id ?? null
      }
      if (!chasis) throw new Error('Un pedido sin chasis no pasa la validación del contrato.')

      if (entrada.clienteId) await this.verificarCliente(tx, entrada.clienteId, 'NO_ENCONTRADO')
      if (!(await repuestosExisten(tx, idsDe(entrada.items))))
        throw new ErrorRepuestos('NO_ENCONTRADO')

      const numero = await siguienteNumero(tx, sesion, 'pedido')
      const [creado] = await tx
        .insert(pedidoRepuestos)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          numero,
          chasis,
          vehiculoId,
          ordenId: entrada.ordenId ?? null,
          clienteId: entrada.clienteId ?? null,
          solicitante: entrada.solicitante ?? null,
          nota: entrada.nota ?? null,
          creadoPor: sesion.usuarioId,
        })
        .returning({ id: pedidoRepuestos.id })
      if (!creado) throw new Error('No se pudo abrir el pedido.')
      await this.guardarItems(tx, sesion, creado.id, entrada.items)
      await this.auditar(
        tx,
        sesion,
        creado.id,
        'alta',
        {
          numero,
          texto: `Lo abrió con ${entrada.items.length} repuestos, para el chasis ${chasis}`,
        },
        ip,
      )
      return this.detalle(tx, sesion, creado.id)
    })
  }

  editar(
    id: string,
    entrada: {
      clienteId?: string | null | undefined
      solicitante?: string | null | undefined
      nota?: string | null | undefined
      items: ItemPedidoEntrada[]
    },
    ip?: string,
  ) {
    return this.conPedido(
      id,
      ['abierto'],
      'Sólo se modifica un pedido abierto.',
      async (tx, sesion, p) => {
        if (p.ordenId && entrada.clienteId) {
          throw new ErrorRepuestos('ESTADO_INVALIDO', {
            motivo: 'El pedido va a una orden: lo paga quien paga la orden.',
          })
        }
        if (entrada.clienteId)
          await this.verificarCliente(tx, entrada.clienteId, 'REFERENCIA_INVALIDA')
        if (!(await repuestosExisten(tx, idsDe(entrada.items)))) {
          throw new ErrorRepuestos('REFERENCIA_INVALIDA')
        }
        await tx
          .update(pedidoRepuestos)
          .set({
            clienteId: p.ordenId ? null : (entrada.clienteId ?? null),
            solicitante: entrada.solicitante ?? null,
            nota: entrada.nota ?? null,
            actualizadoEn: new Date(),
          })
          .where(eq(pedidoRepuestos.id, id))
        await tx.delete(pedidoRepuestosItem).where(eq(pedidoRepuestosItem.pedidoId, id))
        await this.guardarItems(tx, sesion, id, entrada.items)
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: p.numero,
            texto: `Lo modificó: quedaron ${entrada.items.length} repuestos`,
          },
          ip,
        )
      },
    )
  }

  entregar(id: string, ip?: string) {
    return this.conPedido(
      id,
      ['abierto'],
      'Sólo se entrega un pedido abierto.',
      async (tx, sesion, p) => {
        if (!p.ordenId) {
          throw new ErrorRepuestos('ESTADO_INVALIDO', {
            motivo: 'Es de mostrador: se manda a caja, no se entrega al taller.',
          })
        }
        const items = await this.items(tx, id)
        if (!items.length) throw new ErrorRepuestos('SIN_ITEMS')
        const [o] = await tx
          .select({ estado: orden.estado, numero: orden.numero })
          .from(orden)
          .where(eq(orden.id, p.ordenId))
          .for('update')
        if (!o || !EN_TALLER.includes(o.estado as never)) throw new ErrorRepuestos('ORDEN_CERRADA')

        // Las piezas pasan a la orden como renglones de repuesto, después de lo que ya tenía.
        const [ultimo] = await tx
          .select({ n: sql<number>`coalesce(max(${ordenItem.orden}), 0)::int` })
          .from(ordenItem)
          .where(eq(ordenItem.ordenId, p.ordenId))
        await tx.insert(ordenItem).values(
          items.map((i, n) => ({
            tenantId: sesion.tenantId,
            ordenId: p.ordenId as string,
            tipo: 'repuesto',
            orden: (ultimo?.n ?? 0) + n + 1,
            repuestoId: i.repuestoId,
            codigo: i.codigo,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            codigoAlicuota: i.codigoAlicuota,
          })),
        )
        for (const i of items) {
          if (!i.repuestoId) continue
          await moverStock(tx, sesion, {
            repuestoId: i.repuestoId,
            sucursalId: p.sucursalId,
            cantidad: plata(i.cantidad).negated(),
            tipo: 'orden',
            ordenId: p.ordenId,
            pedidoId: id,
          })
        }
        await tx
          .update(pedidoRepuestos)
          .set({ estado: 'entregado', entregadoEn: new Date(), actualizadoEn: new Date() })
          .where(eq(pedidoRepuestos.id, id))
        await tx.update(orden).set({ actualizadoEn: new Date() }).where(eq(orden.id, p.ordenId))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: p.numero,
            texto: `Lo entregó al taller: pasó a la OT ${seis(o.numero)}`,
          },
          ip,
        )
      },
    )
  }

  aCaja(id: string, ip?: string) {
    return this.conPedido(
      id,
      ['abierto'],
      'Sólo se manda a caja un pedido abierto.',
      async (tx, sesion, p) => {
        if (p.ordenId) {
          throw new ErrorRepuestos('ESTADO_INVALIDO', {
            motivo: 'Va a una orden: se entrega al taller y se cobra con la orden.',
          })
        }
        const items = await this.items(tx, id)
        if (!items.length) throw new ErrorRepuestos('SIN_ITEMS')
        await this.moverTodo(tx, sesion, p, items, -1)
        await tx
          .update(pedidoRepuestos)
          .set({ estado: 'en_caja', enCajaEn: new Date(), actualizadoEn: new Date() })
          .where(eq(pedidoRepuestos.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: p.numero, texto: 'Lo mandó a caja' },
          ip,
        )
      },
    )
  }

  reabrir(id: string, ip?: string) {
    return this.conPedido(
      id,
      ['en_caja'],
      'Sólo se saca de caja un pedido que no se facturó.',
      async (tx, sesion, p) => {
        await this.sinFacturaEnCurso(tx, id)
        await this.moverTodo(tx, sesion, p, await this.items(tx, id), 1)
        await tx
          .update(pedidoRepuestos)
          .set({ estado: 'abierto', enCajaEn: null, actualizadoEn: new Date() })
          .where(eq(pedidoRepuestos.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: p.numero,
            texto: 'Lo sacó de caja: los repuestos volvieron al stock',
          },
          ip,
        )
      },
    )
  }

  anular(id: string, ip?: string) {
    return this.conPedido(
      id,
      ['abierto', 'en_caja'],
      'Un pedido entregado o facturado no se anula.',
      async (tx, sesion, p) => {
        if (p.estado === 'en_caja') {
          await this.sinFacturaEnCurso(tx, id)
          await this.moverTodo(tx, sesion, p, await this.items(tx, id), 1)
        }
        await tx
          .update(pedidoRepuestos)
          .set({ estado: 'anulado', actualizadoEn: new Date() })
          .where(eq(pedidoRepuestos.id, id))
        await this.auditar(tx, sesion, id, 'baja', { numero: p.numero, texto: 'Lo anuló' }, ip)
      },
    )
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private conPedido(
    id: string,
    permitidos: EstadoPedido[],
    motivo: string,
    hacer: (tx: Db, sesion: Sesion, p: Pedido) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [p] = await tx
        .select()
        .from(pedidoRepuestos)
        .where(eq(pedidoRepuestos.id, id))
        .for('update')
      if (!p || p.sucursalId !== sesion.sucursalId) throw new ErrorRepuestos('NO_ENCONTRADO')
      if (!permitidos.includes(p.estado as EstadoPedido)) {
        throw new ErrorRepuestos('ESTADO_INVALIDO', { motivo })
      }
      await hacer(tx, sesion, p)
      return this.detalle(tx, sesion, id)
    })
  }

  /** Saca (signo -1) o devuelve (+1) todas las piezas del catálogo de un pedido de mostrador. */
  private async moverTodo(
    tx: Db,
    sesion: Sesion,
    p: Pedido,
    items: Array<typeof pedidoRepuestosItem.$inferSelect>,
    signo: 1 | -1,
  ) {
    for (const i of items) {
      if (!i.repuestoId) continue
      await moverStock(tx, sesion, {
        repuestoId: i.repuestoId,
        sucursalId: p.sucursalId,
        cantidad: signo === 1 ? i.cantidad : plata(i.cantidad).negated(),
        tipo: 'mostrador',
        pedidoId: p.id,
      })
    }
  }

  private items(tx: Db, id: string) {
    return tx
      .select()
      .from(pedidoRepuestosItem)
      .where(eq(pedidoRepuestosItem.pedidoId, id))
      .orderBy(asc(pedidoRepuestosItem.orden))
  }

  private async guardarItems(tx: Db, sesion: Sesion, pedidoId: string, items: ItemPedidoEntrada[]) {
    if (!items.length) return
    await tx.insert(pedidoRepuestosItem).values(
      items.map((i, n) => ({
        tenantId: sesion.tenantId,
        pedidoId,
        orden: n + 1,
        repuestoId: i.repuestoId ?? null,
        codigo: i.codigo ?? null,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        codigoAlicuota: i.codigoAlicuota,
      })),
    )
  }

  private async verificarCliente(tx: Db, id: string, codigo: string) {
    const [c] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, id))
    if (!c) throw new ErrorRepuestos(codigo)
  }

  private async sinFacturaEnCurso(tx: Db, id: string) {
    const [enCurso] = await tx
      .select({ id: comprobante.id })
      .from(comprobante)
      .where(
        and(
          eq(comprobante.pedidoRepuestosId, id),
          inArray(comprobante.estado, ['emitiendo', 'incierto']),
        ),
      )
    if (enCurso) {
      throw new ErrorRepuestos('ESTADO_INVALIDO', {
        motivo: 'El pedido tiene una factura sin confirmar por AFIP: verificala en caja primero.',
      })
    }
  }

  private async detalle(tx: Db, sesion: Sesion, id: string) {
    const [resumen] = await this.armar(tx, [id])
    const [p] = await tx.select().from(pedidoRepuestos).where(eq(pedidoRepuestos.id, id))
    if (!resumen || !p || p.sucursalId !== sesion.sucursalId)
      throw new ErrorRepuestos('NO_ENCONTRADO')
    const items = await this.items(tx, id)
    const stock = await stockEn(
      tx,
      p.sucursalId,
      items.map((i) => i.repuestoId).filter((x): x is string => Boolean(x)),
    )
    const [factura] = await tx
      .select({
        id: comprobante.id,
        nombre: tipoComprobante.descripcion,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
      })
      .from(comprobante)
      .innerJoin(tipoComprobante, eq(tipoComprobante.codigo, comprobante.tipoComprobante))
      .where(
        and(
          eq(comprobante.pedidoRepuestosId, id),
          eq(comprobante.estado, 'autorizado'),
          isNull(comprobante.comprobanteAsociadoId),
        ),
      )
      .orderBy(desc(comprobante.creadoEn))
      .limit(1)

    const { items: _cuantos, ...base } = resumen
    return {
      ...base,
      nota: p.nota,
      enCajaEn: p.enCajaEn?.toISOString() ?? null,
      entregadoEn: p.entregadoEn?.toISOString() ?? null,
      items: items.map((i) => ({
        id: i.id,
        repuestoId: i.repuestoId,
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: cantidadLinda(i.cantidad),
        precioUnitario: plata(i.precioUnitario).toFixed(2),
        codigoAlicuota: i.codigoAlicuota,
        total: totalItem(i).toFixed(2),
        stock: i.repuestoId ? cantidadLinda(stock.get(i.repuestoId) ?? '0') : null,
      })),
      factura: factura ?? null,
    }
  }

  private async armar(tx: Db, ids: string[]) {
    if (!ids.length) return []
    const filas = await tx
      .select({
        p: pedidoRepuestos,
        dominio: vehiculo.dominio,
        marca: marca.nombre,
        modelo: modelo.nombre,
        ordenNumero: orden.numero,
        cliente: entidadComercial.razonSocial,
        creadoPor: sql<string>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(pedidoRepuestos)
      .leftJoin(vehiculo, eq(vehiculo.id, pedidoRepuestos.vehiculoId))
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .leftJoin(orden, eq(orden.id, pedidoRepuestos.ordenId))
      .leftJoin(entidadComercial, eq(entidadComercial.id, pedidoRepuestos.clienteId))
      .innerJoin(usuario, eq(usuario.id, pedidoRepuestos.creadoPor))
      .where(inArray(pedidoRepuestos.id, ids))
    const totales = await tx
      .select({
        id: pedidoRepuestosItem.pedidoId,
        total: sql<string>`coalesce(sum(round(${pedidoRepuestosItem.cantidad} * ${pedidoRepuestosItem.precioUnitario}, 2)), 0)`,
        n: count(),
      })
      .from(pedidoRepuestosItem)
      .where(inArray(pedidoRepuestosItem.pedidoId, ids))
      .groupBy(pedidoRepuestosItem.pedidoId)

    return ids
      .map((id) => filas.find((f) => f.p.id === id))
      .filter((f): f is (typeof filas)[number] => Boolean(f))
      .map((f) => {
        const t = totales.find((x) => x.id === f.p.id)
        return {
          id: f.p.id,
          numero: f.p.numero,
          estado: f.p.estado as EstadoPedido,
          chasis: f.p.chasis,
          vehiculo: f.p.vehiculoId
            ? { id: f.p.vehiculoId, dominio: f.dominio, marca: f.marca, modelo: f.modelo }
            : null,
          orden: f.p.ordenId ? { id: f.p.ordenId, numero: f.ordenNumero ?? 0 } : null,
          cliente: f.p.clienteId ? { id: f.p.clienteId, razonSocial: f.cliente ?? '' } : null,
          solicitante: f.p.solicitante,
          creadoPor: f.creadoPor,
          creadoEn: f.p.creadoEn.toISOString(),
          total: plata(t?.total ?? '0').toFixed(2),
          items: t?.n ?? 0,
        }
      })
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    id: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosDespues: Record<string, unknown>,
    ip?: string,
  ) {
    await auditar(tx, sesion, {
      tabla: 'pedido_repuestos',
      registroId: id,
      accion,
      despues: datosDespues,
      ip,
    })
  }
}

const idsDe = (items: ItemPedidoEntrada[]) =>
  items.map((i) => i.repuestoId).filter((x): x is string => Boolean(x))
