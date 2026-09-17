import { plata } from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, or, sql } from '@gpb/db'
import {
  compra,
  entidadComercial,
  movimientoStock,
  orden,
  pedidoRepuestos,
  proveedor,
  repuesto,
  repuestoStock,
  sucursal,
  usuario,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { ErrorRepuestos } from './errores.ts'
import { moverStock, seis, type TipoMovimiento } from './stock.ts'

export interface DatosRepuesto {
  codigo: string
  descripcion: string
  marca?: string | null | undefined
  rubro?: string | null | undefined
  aplicacion?: string | null | undefined
  precioVenta: string
  costo?: string | null | undefined
  codigoAlicuota: number
  proveedorId?: string | null | undefined
  observaciones?: string | null | undefined
}

/** Cuántos movimientos trae la ficha. El resto es historia que se consulta con otra pantalla. */
const MOVIMIENTOS_EN_FICHA = 50

/**
 * El catálogo de repuestos y el stock de cada sucursal: alta, precios, dónde está cada pieza,
 * ajustes por recuento y transferencias. Lo que entra por compras y sale por órdenes y
 * mostrador lo mueven sus propios servicios, siempre con `moverStock`.
 */
@Injectable()
export class ServicioRepuestos {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: 'activos' | 'todos'
    stock: 'todos' | 'con_stock' | 'reponer'
  }) {
    return this.datos.transaccion(async (tx, sesion) => {
      const texto = filtro.buscar?.trim()
      const compacto = texto?.toUpperCase().replace(/[\s-]/g, '')
      const cantidad = sql`coalesce(${repuestoStock.cantidad}, 0)`
      const donde = and(
        filtro.estado === 'activos' ? eq(repuesto.activo, true) : undefined,
        texto
          ? or(
              ilike(repuesto.codigo, `%${compacto}%`),
              ilike(repuesto.descripcion, `%${texto}%`),
              ilike(repuesto.marca, `%${texto}%`),
              ilike(repuesto.aplicacion, `%${texto}%`),
            )
          : undefined,
        filtro.stock === 'con_stock' ? sql`${cantidad} > 0` : undefined,
        filtro.stock === 'reponer'
          ? sql`${repuestoStock.minimo} is not null and ${cantidad} <= ${repuestoStock.minimo}`
          : undefined,
      )
      const conStock = (q: ReturnType<typeof this.base>) => q.where(donde)

      const [total] = await tx
        .select({ n: count() })
        .from(repuesto)
        .leftJoin(
          repuestoStock,
          and(
            eq(repuestoStock.repuestoId, repuesto.id),
            eq(repuestoStock.sucursalId, sesion.sucursalId),
          ),
        )
        .where(donde)
      const filas = await conStock(this.base(tx, sesion))
        // El código exacto primero: es lo que se pega desde la base de la marca.
        .orderBy(
          sql`${repuesto.codigo} = ${compacto ?? ''} desc`,
          asc(repuesto.descripcion),
          asc(repuesto.codigo),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina)

      return { total: total?.n ?? 0, datos: filas.map(aResumen) }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx, sesion) => this.detalle(tx, sesion, id))
  }

  crear(
    entrada: DatosRepuesto & {
      stockInicial?: string | null | undefined
      ubicacion?: string | null | undefined
      minimo?: string | null | undefined
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.verificarProveedor(tx, entrada.proveedorId)
      await this.codigoLibre(tx, entrada.codigo)
      const { stockInicial, ubicacion, minimo, ...datos } = entrada
      const [creado] = await tx
        .insert(repuesto)
        .values({ tenantId: sesion.tenantId, ...limpiar(datos) })
        .onConflictDoNothing()
        .returning({ id: repuesto.id })
      if (!creado) {
        await this.codigoLibre(tx, entrada.codigo)
        throw new Error('No se pudo dar de alta el repuesto.')
      }

      if (ubicacion || minimo) {
        await tx.insert(repuestoStock).values({
          tenantId: sesion.tenantId,
          repuestoId: creado.id,
          sucursalId: sesion.sucursalId,
          ubicacion: ubicacion ?? null,
          minimo: minimo ?? null,
        })
      }
      if (stockInicial && !plata(stockInicial).isZero()) {
        await moverStock(tx, sesion, {
          repuestoId: creado.id,
          sucursalId: sesion.sucursalId,
          cantidad: stockInicial,
          tipo: 'inicial',
          costoUnitario: datos.costo ?? null,
        })
      }
      await this.auditar(
        tx,
        sesion,
        creado.id,
        'alta',
        {
          codigo: datos.codigo,
          texto: `Lo dio de alta: «${datos.descripcion}»`,
        },
        ip,
      )
      return this.detalle(tx, sesion, creado.id)
    })
  }

  editar(id: string, entrada: DatosRepuesto & { activo: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await tx.select().from(repuesto).where(eq(repuesto.id, id)).for('update')
      if (!antes) throw new ErrorRepuestos('NO_ENCONTRADO')
      await this.verificarProveedor(tx, entrada.proveedorId, antes.proveedorId)
      if (entrada.codigo !== antes.codigo) await this.codigoLibre(tx, entrada.codigo)

      await tx
        .update(repuesto)
        .set({ ...limpiar(entrada), actualizadoEn: new Date() })
        .where(eq(repuesto.id, id))

      const cambios: string[] = []
      if (antes.activo !== entrada.activo)
        cambios.push(entrada.activo ? 'lo volvió a activar' : 'lo desactivó')
      if (!plata(antes.precioVenta).eq(plata(entrada.precioVenta))) {
        cambios.push(
          `cambió el precio de $ ${plata(antes.precioVenta).toFixed(2)} a $ ${plata(entrada.precioVenta).toFixed(2)}`,
        )
      }
      if (antes.codigo !== entrada.codigo)
        cambios.push(`cambió el código de ${antes.codigo} a ${entrada.codigo}`)
      if (antes.descripcion !== entrada.descripcion) cambios.push('cambió la descripción')
      await this.auditar(
        tx,
        sesion,
        id,
        antes.activo && !entrada.activo ? 'baja' : 'modificacion',
        { codigo: entrada.codigo, texto: capitalizar(cambios.join(', ') || 'lo modificó') },
        ip,
      )
      return this.detalle(tx, sesion, id)
    })
  }

  ubicar(
    id: string,
    entrada: { ubicacion?: string | null | undefined; minimo?: string | null | undefined },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.existe(tx, id)
      const [antes] = await tx
        .select({ ubicacion: repuestoStock.ubicacion, minimo: repuestoStock.minimo })
        .from(repuestoStock)
        .where(
          and(eq(repuestoStock.repuestoId, id), eq(repuestoStock.sucursalId, sesion.sucursalId)),
        )
      await tx
        .insert(repuestoStock)
        .values({
          tenantId: sesion.tenantId,
          repuestoId: id,
          sucursalId: sesion.sucursalId,
          ubicacion: entrada.ubicacion ?? null,
          minimo: entrada.minimo ?? null,
        })
        .onConflictDoUpdate({
          target: [repuestoStock.sucursalId, repuestoStock.repuestoId],
          set: {
            ubicacion: entrada.ubicacion ?? null,
            minimo: entrada.minimo ?? null,
            actualizadoEn: new Date(),
          },
        })

      // El mínimo es lo que va a disparar el pedido a fábrica, y la ubicación es dónde el
      // repuestero lo busca: los dos son datos que después alguien pregunta quién cambió.
      const partes: string[] = []
      if ((antes?.ubicacion ?? null) !== (entrada.ubicacion ?? null)) {
        partes.push(
          `ubicación: «${antes?.ubicacion ?? 'sin ubicación'}» → «${entrada.ubicacion ?? 'sin ubicación'}»`,
        )
      }
      // Comparado como número: la base devuelve «5.0000» y el campo manda «5».
      const minimoIgual =
        antes?.minimo == null && entrada.minimo == null
          ? true
          : antes?.minimo != null &&
            entrada.minimo != null &&
            plata(antes.minimo).eq(plata(entrada.minimo))
      if (!minimoIgual) {
        const decir = (v: string | null | undefined) =>
          v == null ? 'sin mínimo' : cantidadLinda(v)
        partes.push(`mínimo: «${decir(antes?.minimo)}» → «${decir(entrada.minimo)}»`)
      }
      if (partes.length) {
        const texto = partes.join(' y ')
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { texto: texto.charAt(0).toUpperCase() + texto.slice(1) },
          ip,
        )
      }

      return this.detalle(tx, sesion, id)
    })
  }

  ajustar(id: string, entrada: { contado: string; motivo: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.existe(tx, id)
      const [fila] = await tx
        .select({ cantidad: repuestoStock.cantidad })
        .from(repuestoStock)
        .where(
          and(eq(repuestoStock.repuestoId, id), eq(repuestoStock.sucursalId, sesion.sucursalId)),
        )
        .for('update')
      const diferencia = plata(entrada.contado).minus(plata(fila?.cantidad ?? '0'))
      if (diferencia.isZero()) throw new ErrorRepuestos('SIN_DIFERENCIA')
      await moverStock(tx, sesion, {
        repuestoId: id,
        sucursalId: sesion.sucursalId,
        cantidad: diferencia,
        tipo: 'ajuste',
        motivo: entrada.motivo,
      })
      await this.auditar(
        tx,
        sesion,
        id,
        'modificacion',
        {
          texto: `Ajustó el stock a ${cantidadLinda(entrada.contado)} (${diferencia.isPositive() ? '+' : ''}${cantidadLinda(diferencia.toString())}): «${entrada.motivo}»`,
        },
        ip,
      )
      return this.detalle(tx, sesion, id)
    })
  }

  transferir(
    id: string,
    entrada: { sucursalId: string; cantidad: string; motivo?: string | null | undefined },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.existe(tx, id)
      if (entrada.sucursalId === sesion.sucursalId) throw new ErrorRepuestos('SUCURSAL_INVALIDA')
      const [destino] = await tx
        .select({ id: sucursal.id, nombre: sucursal.nombre })
        .from(sucursal)
        .where(and(eq(sucursal.id, entrada.sucursalId), eq(sucursal.activa, true)))
      if (!destino) throw new ErrorRepuestos('SUCURSAL_INVALIDA')

      const base = {
        repuestoId: id,
        tipo: 'transferencia' as const,
        motivo: entrada.motivo ?? null,
      }
      await moverStock(tx, sesion, {
        ...base,
        sucursalId: sesion.sucursalId,
        cantidad: plata(entrada.cantidad).negated(),
        otraSucursalId: destino.id,
      })
      await moverStock(tx, sesion, {
        ...base,
        sucursalId: destino.id,
        cantidad: entrada.cantidad,
        otraSucursalId: sesion.sucursalId,
      })
      await this.auditar(
        tx,
        sesion,
        id,
        'modificacion',
        {
          texto: `Mandó ${cantidadLinda(entrada.cantidad)} a ${destino.nombre}`,
        },
        ip,
      )
      return this.detalle(tx, sesion, id)
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private base(tx: Db, sesion: Sesion) {
    return tx
      .select({
        r: repuesto,
        stock: repuestoStock.cantidad,
        minimo: repuestoStock.minimo,
        ubicacion: repuestoStock.ubicacion,
      })
      .from(repuesto)
      .leftJoin(
        repuestoStock,
        and(
          eq(repuestoStock.repuestoId, repuesto.id),
          eq(repuestoStock.sucursalId, sesion.sucursalId),
        ),
      )
      .$dynamic()
  }

  private async detalle(tx: Db, sesion: Sesion, id: string) {
    const [fila] = await this.base(tx, sesion).where(eq(repuesto.id, id))
    if (!fila) throw new ErrorRepuestos('NO_ENCONTRADO')

    const [prov] = fila.r.proveedorId
      ? await tx
          .select({ id: entidadComercial.id, razonSocial: entidadComercial.razonSocial })
          .from(entidadComercial)
          .where(eq(entidadComercial.id, fila.r.proveedorId))
      : []

    const stocks = await tx
      .select({
        sucursalId: sucursal.id,
        sucursal: sucursal.nombre,
        cantidad: repuestoStock.cantidad,
        minimo: repuestoStock.minimo,
        ubicacion: repuestoStock.ubicacion,
      })
      .from(sucursal)
      .leftJoin(
        repuestoStock,
        and(eq(repuestoStock.sucursalId, sucursal.id), eq(repuestoStock.repuestoId, id)),
      )
      .where(eq(sucursal.activa, true))
      .orderBy(asc(sucursal.nombre))

    const otra = sql<
      string | null
    >`(select nombre from sucursal s where s.id = ${movimientoStock.otraSucursalId})`
    const movimientos = await tx
      .select({
        m: movimientoStock,
        usuario: sql<string>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
        ordenNumero: orden.numero,
        pedidoNumero: pedidoRepuestos.numero,
        compraNumero: compra.numero,
        proveedor: entidadComercial.razonSocial,
        otraSucursal: otra,
      })
      .from(movimientoStock)
      .innerJoin(usuario, eq(usuario.id, movimientoStock.usuarioId))
      .leftJoin(orden, eq(orden.id, movimientoStock.ordenId))
      .leftJoin(pedidoRepuestos, eq(pedidoRepuestos.id, movimientoStock.pedidoId))
      .leftJoin(compra, eq(compra.id, movimientoStock.compraId))
      .leftJoin(entidadComercial, eq(entidadComercial.id, compra.proveedorId))
      .where(
        and(eq(movimientoStock.repuestoId, id), eq(movimientoStock.sucursalId, sesion.sucursalId)),
      )
      .orderBy(desc(movimientoStock.creadoEn))
      .limit(MOVIMIENTOS_EN_FICHA)

    return {
      ...aResumen(fila),
      aplicacion: fila.r.aplicacion,
      costo: fila.r.costo === null ? null : plata(fila.r.costo).toFixed(2),
      proveedor: prov ?? null,
      observaciones: fila.r.observaciones,
      stocks: stocks.map((s) => ({
        sucursalId: s.sucursalId,
        sucursal: s.sucursal,
        cantidad: cantidadLinda(s.cantidad ?? '0'),
        minimo: s.minimo === null ? null : cantidadLinda(s.minimo),
        ubicacion: s.ubicacion,
      })),
      movimientos: movimientos.map((x) => {
        const m = x.m
        const tipo = m.tipo as TipoMovimiento
        const referencia = m.ordenId
          ? { tipo: 'orden' as const, id: m.ordenId }
          : m.pedidoId
            ? { tipo: 'pedido' as const, id: m.pedidoId }
            : m.compraId
              ? { tipo: 'compra' as const, id: m.compraId }
              : null
        return {
          id: m.id,
          fecha: m.creadoEn.toISOString(),
          tipo,
          cantidad: cantidadLinda(m.cantidad),
          saldo: cantidadLinda(m.saldo),
          detalle: detalleMovimiento(tipo, m.cantidad, x),
          motivo: m.motivo,
          usuario: x.usuario,
          referencia,
        }
      }),
    }
  }

  private async existe(tx: Db, id: string) {
    const [r] = await tx.select({ id: repuesto.id }).from(repuesto).where(eq(repuesto.id, id))
    if (!r) throw new ErrorRepuestos('NO_ENCONTRADO')
  }

  private async codigoLibre(tx: Db, codigo: string) {
    const [otro] = await tx
      .select({ id: repuesto.id, descripcion: repuesto.descripcion })
      .from(repuesto)
      .where(eq(repuesto.codigo, codigo))
    if (otro) throw new ErrorRepuestos('CODIGO_DUPLICADO', otro)
  }

  /** Un proveedor activo. El que ya tenía se acepta aunque esté desactivado: no se pierde el dato. */
  private async verificarProveedor(tx: Db, id: string | null | undefined, actual?: string | null) {
    if (!id || id === actual) return
    const [p] = await tx
      .select({ id: proveedor.id })
      .from(proveedor)
      .where(and(eq(proveedor.id, id), eq(proveedor.activo, true)))
    if (!p) throw new ErrorRepuestos('PROVEEDOR_INVALIDO')
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
      tabla: 'repuesto',
      registroId: id,
      accion,
      despues: datosDespues,
      ip,
    })
  }
}

function limpiar(d: DatosRepuesto) {
  return {
    codigo: d.codigo,
    descripcion: d.descripcion,
    marca: d.marca ?? null,
    rubro: d.rubro ?? null,
    aplicacion: d.aplicacion ?? null,
    precioVenta: d.precioVenta,
    costo: d.costo ?? null,
    codigoAlicuota: d.codigoAlicuota,
    proveedorId: d.proveedorId ?? null,
    observaciones: d.observaciones ?? null,
    ...('activo' in d ? { activo: (d as { activo: boolean }).activo } : {}),
  }
}

/** «4», «2.5»: sin los ceros de `numeric(18,4)`, que en un depósito nadie dice. */
export function cantidadLinda(valor: string) {
  return plata(valor).toDecimalPlaces(4).toString()
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function aResumen(fila: {
  r: typeof repuesto.$inferSelect
  stock: string | null
  minimo: string | null
  ubicacion: string | null
}) {
  const stock = plata(fila.stock ?? '0')
  return {
    id: fila.r.id,
    codigo: fila.r.codigo,
    descripcion: fila.r.descripcion,
    marca: fila.r.marca,
    rubro: fila.r.rubro,
    precioVenta: plata(fila.r.precioVenta).toFixed(2),
    codigoAlicuota: fila.r.codigoAlicuota,
    activo: fila.r.activo,
    stock: cantidadLinda(stock.toString()),
    minimo: fila.minimo === null ? null : cantidadLinda(fila.minimo),
    ubicacion: fila.ubicacion,
    reponer: fila.minimo !== null && stock.lte(plata(fila.minimo)),
  }
}

function detalleMovimiento(
  tipo: TipoMovimiento,
  cantidad: string,
  x: {
    ordenNumero: number | null
    pedidoNumero: number | null
    compraNumero: number | null
    proveedor: string | null
    otraSucursal: string | null
  },
) {
  switch (tipo) {
    case 'inicial':
      return 'Stock inicial'
    case 'ajuste':
      return 'Ajuste por recuento'
    case 'compra':
      return `Compra ${seis(x.compraNumero ?? 0)} · ${x.proveedor ?? ''}`.trim()
    case 'orden':
      return x.pedidoNumero
        ? `OT ${seis(x.ordenNumero ?? 0)} · pedido ${seis(x.pedidoNumero)}`
        : `OT ${seis(x.ordenNumero ?? 0)}`
    case 'mostrador':
      return `Pedido ${seis(x.pedidoNumero ?? 0)} · mostrador`
    case 'transferencia':
      return plata(cantidad).isNegative()
        ? `Enviado a ${x.otraSucursal ?? 'otra sucursal'}`
        : `Recibido de ${x.otraSucursal ?? 'otra sucursal'}`
  }
}
