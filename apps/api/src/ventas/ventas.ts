import { contrato, type ventaFicha, type ventaResumen } from '@gpb/contracts'
import {
  CONFIG_VENTAS_POR_OMISION,
  type ConfigVentas,
  importeDePorcentaje,
  type MedioPagoVenta,
  type MonedaUnidad,
  type TipoConceptoVenta,
  totalesDeUnidad,
  totalesDeVenta,
} from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, inArray, isNull, ne, or, sql } from '@gpb/db'
import {
  cliente,
  entidadComercial,
  marca,
  modelo,
  sucursal,
  unidad,
  unidadConcepto,
  unidadMovimiento,
  unidadReserva,
  usuario,
  vehiculo,
  venta,
  ventaConcepto,
  ventaPago,
  ventaSecuencia,
  ventasConfig,
} from '@gpb/db/schema'
import { Controller, Inject, Injectable, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import type { z } from 'zod'
import { auditar } from '../comun/auditoria.ts'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'

type Estado = 'borrador' | 'confirmada' | 'anulada'
type FichaVenta = z.infer<typeof ventaFicha>
type ResumenVenta = z.infer<typeof ventaResumen>

class ErrorVentas extends Error {
  constructor(
    readonly codigo: string,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

interface ConceptoEntrada {
  tipo: TipoConceptoVenta
  descripcion: string
  importe?: string | null | undefined
  porcentaje?: string | null | undefined
  moneda: MonedaUnidad
  cotizacion?: string | null | undefined
}

interface PagoEntrada {
  medio: MedioPagoVenta
  importe: string
  moneda: MonedaUnidad
  cotizacion?: string | null | undefined
  detalle: string | null
  entidad: string | null
  cuotas?: number | null | undefined
  unidadUsadaId?: string | null | undefined
  reservaId?: string | null | undefined
}

const nombreDe = (v: { marca: string | null; modelo: string | null; anio: number | null }) =>
  [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Sin marca cargada'

/**
 * La venta de una unidad. El borrador se guarda entero; confirmarla deja la unidad vendida y
 * cierra sus reservas. Ver `docs/tecnicos/ventas-de-unidades.md`, paso 3.
 */
@Injectable()
export class ServicioVentas {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  config() {
    return this.datos.transaccion((tx) => this.leerConfig(tx))
  }

  guardarConfig(c: ConfigVentas, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const valores = {
        descuentoMaximo: c.descuentoMaximo === null ? null : String(c.descuentoMaximo),
        exigeSaldoCero: c.exigeSaldoCero,
        actualizadoEn: new Date(),
        actualizadoPor: sesion.usuarioId,
      }
      const [fila] = await tx
        .insert(ventasConfig)
        .values({ tenantId: sesion.tenantId, ...valores })
        .onConflictDoUpdate({ target: ventasConfig.tenantId, set: valores })
        .returning({ id: ventasConfig.id })
      await auditar(tx, sesion, {
        tabla: 'ventas_config',
        registroId: fila?.id as string,
        accion: 'modificacion',
        despues: { texto: 'Cambió cómo trabaja las ventas' },
        ip,
      })
      return c
    })
  }

  listar(filtro: {
    pagina: number
    porPagina: number
    estado: Estado | 'vivas' | 'todas'
    buscar?: string | undefined
  }) {
    return this.datos.transaccion(async (tx) => {
      const texto = filtro.buscar?.trim()
      const compacto = texto?.toUpperCase().replace(/[\s-]/g, '')
      const donde = and(
        filtro.estado === 'todas'
          ? undefined
          : filtro.estado === 'vivas'
            ? ne(venta.estado, 'anulada')
            : eq(venta.estado, filtro.estado),
        texto
          ? or(
              sql`${venta.numero}::text = ${texto.replace(/^0+/, '')}`,
              ilike(vehiculo.dominio, `%${compacto}%`),
              ilike(vehiculo.chasis, `%${compacto}%`),
              ilike(entidadComercial.razonSocial, `%${texto}%`),
            )
          : undefined,
      )
      const base = () =>
        tx
          .select({ id: venta.id })
          .from(venta)
          .innerJoin(unidad, eq(unidad.id, venta.unidadId))
          .innerJoin(vehiculo, eq(vehiculo.id, unidad.vehiculoId))
          .innerJoin(entidadComercial, eq(entidadComercial.id, venta.clienteId))
          .where(donde)
      const [total] = await tx.select({ n: count() }).from(base().as('filtradas'))
      const filas = await base()
        .orderBy(desc(venta.numero))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina)
      const datos = []
      for (const f of filas) datos.push(await this.resumen(tx, f.id))
      return { total: total?.n ?? 0, datos }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.armar(tx, id))
  }

  crear(d: { unidadId: string; clienteId: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [u] = await tx.select().from(unidad).where(eq(unidad.id, d.unidadId)).for('update')
      if (!u || !['disponible', 'reservada'].includes(u.estado)) {
        throw new ErrorVentas('UNIDAD_NO_DISPONIBLE')
      }
      const [viva] = await tx
        .select({ id: venta.id })
        .from(venta)
        .where(and(eq(venta.unidadId, d.unidadId), ne(venta.estado, 'anulada')))
      if (viva) throw new ErrorVentas('UNIDAD_NO_DISPONIBLE')
      await this.controlarCliente(tx, d.clienteId)

      const [sec] = await tx
        .insert(ventaSecuencia)
        .values({ tenantId: sesion.tenantId, ultimo: 1 })
        .onConflictDoUpdate({
          target: ventaSecuencia.tenantId,
          set: { ultimo: sql`${ventaSecuencia.ultimo} + 1` },
        })
        .returning({ numero: ventaSecuencia.ultimo })

      const [creada] = await tx
        .insert(venta)
        .values({
          tenantId: sesion.tenantId,
          numero: sec?.numero as number,
          unidadId: d.unidadId,
          clienteId: d.clienteId,
          vendedorId: sesion.usuarioId,
          sucursalId: sesion.sucursalId,
          precio: u.precio ?? '0',
          moneda: u.moneda,
        })
        .returning({ id: venta.id, numero: venta.numero })
      const id = creada?.id as string

      // La seña de su propia reserva ya está pagada: entra como primer pago.
      const [suReserva] = await tx
        .select()
        .from(unidadReserva)
        .where(
          and(
            eq(unidadReserva.unidadId, d.unidadId),
            eq(unidadReserva.clienteId, d.clienteId),
            eq(unidadReserva.estado, 'activa'),
          ),
        )
      if (suReserva?.sena && Number(suReserva.sena) > 0) {
        await tx.insert(ventaPago).values({
          tenantId: sesion.tenantId,
          ventaId: id,
          orden: 1,
          medio: 'sena',
          importe: suReserva.sena,
          moneda: suReserva.moneda,
          detalle: 'Seña de la reserva',
          reservaId: suReserva.id,
        })
      }
      await this.auditar(tx, sesion, id, 'alta', `Empezó la venta ${creada?.numero}`, ip)
      return this.armar(tx, id)
    })
  }

  guardar(
    id: string,
    d: {
      clienteId: string
      precio: string
      moneda: MonedaUnidad
      observaciones: string | null
      conceptos: ConceptoEntrada[]
      pagos: PagoEntrada[]
    },
    ip?: string,
  ) {
    return this.enBorrador(id, async (tx, sesion, v) => {
      await this.controlarCliente(tx, d.clienteId)
      const usados = d.pagos.flatMap((p) => (p.unidadUsadaId ? [p.unidadUsadaId] : []))
      if (usados.length) {
        const hallados = await tx
          .select({ id: unidad.id })
          .from(unidad)
          .where(
            and(inArray(unidad.id, usados), inArray(unidad.estado, ['disponible', 'reservada'])),
          )
        if (hallados.length !== new Set(usados).size || usados.includes(v.unidadId)) {
          throw new ErrorVentas('DATO_INVALIDO')
        }
      }
      const reservas = d.pagos.flatMap((p) => (p.reservaId ? [p.reservaId] : []))
      if (reservas.length) {
        const halladas = await tx
          .select({ id: unidadReserva.id })
          .from(unidadReserva)
          .where(and(inArray(unidadReserva.id, reservas), eq(unidadReserva.unidadId, v.unidadId)))
        if (halladas.length !== new Set(reservas).size) throw new ErrorVentas('DATO_INVALIDO')
      }

      await tx
        .update(venta)
        .set({
          clienteId: d.clienteId,
          precio: d.precio,
          moneda: d.moneda,
          observaciones: d.observaciones,
          actualizadoEn: new Date(),
        })
        .where(eq(venta.id, id))
      await tx.delete(ventaConcepto).where(eq(ventaConcepto.ventaId, id))
      await tx.delete(ventaPago).where(eq(ventaPago.ventaId, id))
      if (d.conceptos.length) {
        await tx.insert(ventaConcepto).values(
          d.conceptos.map((c, n) => ({
            tenantId: sesion.tenantId,
            ventaId: id,
            orden: n + 1,
            tipo: c.tipo,
            descripcion: c.descripcion,
            // El porcentaje es del precio, y en su moneda.
            ...(c.porcentaje
              ? {
                  importe: importeDePorcentaje(d.precio, c.porcentaje),
                  moneda: d.moneda,
                  cotizacion: null,
                  porcentaje: c.porcentaje,
                }
              : {
                  importe: c.importe as string,
                  moneda: c.moneda,
                  cotizacion: c.cotizacion ?? null,
                }),
          })),
        )
      }
      if (d.pagos.length) {
        await tx.insert(ventaPago).values(
          d.pagos.map((p, n) => ({
            tenantId: sesion.tenantId,
            ventaId: id,
            orden: n + 1,
            medio: p.medio,
            importe: p.importe,
            moneda: p.moneda,
            cotizacion: p.cotizacion ?? null,
            detalle: p.detalle,
            entidad: p.entidad,
            cuotas: p.cuotas ?? null,
            unidadUsadaId: p.unidadUsadaId ?? null,
            reservaId: p.reservaId ?? null,
          })),
        )
      }
      await this.auditar(tx, sesion, id, 'modificacion', `Guardó la venta ${v.numero}`, ip)
    })
  }

  confirmar(id: string, autorizacion: string | null | undefined, ip?: string) {
    return this.enBorrador(id, async (tx, sesion, v) => {
      const [u] = await tx.select().from(unidad).where(eq(unidad.id, v.unidadId)).for('update')
      if (!u || !['disponible', 'reservada'].includes(u.estado)) {
        throw new ErrorVentas('UNIDAD_NO_DISPONIBLE')
      }
      const ajenas = await tx
        .select({ nombre: entidadComercial.razonSocial })
        .from(unidadReserva)
        .innerJoin(entidadComercial, eq(entidadComercial.id, unidadReserva.clienteId))
        .where(
          and(
            eq(unidadReserva.unidadId, v.unidadId),
            eq(unidadReserva.estado, 'activa'),
            ne(unidadReserva.clienteId, v.clienteId),
          ),
        )

      const config = await this.leerConfig(tx)
      const t = await this.totales(tx, v, false)
      if (config.exigeSaldoCero && Number(t.saldo) > 0) {
        throw new ErrorVentas('SALDO_PENDIENTE', { saldo: t.saldo })
      }
      const pasa =
        config.descuentoMaximo !== null && Number(t.descuentoPorcentaje) > config.descuentoMaximo
      const puedeAutorizar = contextoDelPedido().habilidades.can('autorizar', 'Venta')
      if (pasa && !autorizacion) {
        throw new ErrorVentas('REQUIERE_AUTORIZACION', {
          descuento: t.descuentoPorcentaje,
          maximo: config.descuentoMaximo,
        })
      }
      if (pasa && !puedeAutorizar) throw new ErrorVentas('SIN_AUTORIZACION')
      // Vender una unidad reservada para otro es pasar esa reserva por encima: es lo mismo.
      if (ajenas.length && !autorizacion) {
        throw new ErrorVentas('RESERVADA_PARA_OTRO', { cliente: ajenas[0]?.nombre })
      }
      if (ajenas.length && !contextoDelPedido().habilidades.can('autorizar', 'Unidad')) {
        throw new ErrorVentas('SIN_AUTORIZACION')
      }

      const [comprador] = await tx
        .select({ nombre: entidadComercial.razonSocial })
        .from(entidadComercial)
        .where(eq(entidadComercial.id, v.clienteId))
      const ahora = new Date()
      await tx
        .update(unidadReserva)
        .set({ estado: 'convertida', cerradaEn: ahora, cerradaPor: sesion.usuarioId })
        .where(
          and(
            eq(unidadReserva.unidadId, v.unidadId),
            eq(unidadReserva.estado, 'activa'),
            eq(unidadReserva.clienteId, v.clienteId),
          ),
        )
      await tx
        .update(unidadReserva)
        .set({
          estado: 'liberada',
          cierreMotivo: `Se vendió a ${comprador?.nombre}${autorizacion ? `: ${autorizacion}` : ''}`,
          cerradaEn: ahora,
          cerradaPor: sesion.usuarioId,
        })
        .where(and(eq(unidadReserva.unidadId, v.unidadId), eq(unidadReserva.estado, 'activa')))
      await tx
        .update(unidad)
        .set({ estado: 'vendida', actualizadoEn: ahora })
        .where(eq(unidad.id, v.unidadId))
      await tx
        .update(venta)
        .set({
          estado: 'confirmada',
          confirmadaEn: ahora,
          ...(autorizacion
            ? { autorizacionMotivo: autorizacion, autorizadaPor: sesion.usuarioId }
            : {}),
          actualizadoEn: ahora,
        })
        .where(eq(venta.id, id))
      await this.movimiento(
        tx,
        sesion,
        v.unidadId,
        'venta',
        `Vendida a ${comprador?.nombre}, venta ${v.numero}`,
      )
      await this.auditar(tx, sesion, id, 'modificacion', `Confirmó la venta ${v.numero}`, ip)
    })
  }

  anular(id: string, motivo: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [v] = await tx.select().from(venta).where(eq(venta.id, id)).for('update')
      if (!v) throw new ErrorVentas('NO_ENCONTRADA')
      if (v.estado === 'anulada') throw new ErrorVentas('ESTADO_INVALIDO')
      const ahora = new Date()
      if (v.estado === 'confirmada') {
        await tx
          .update(unidad)
          .set({ estado: 'disponible', actualizadoEn: ahora })
          .where(and(eq(unidad.id, v.unidadId), eq(unidad.estado, 'vendida')))
        await this.movimiento(
          tx,
          sesion,
          v.unidadId,
          'venta',
          `Se anuló la venta ${v.numero}: vuelve al stock. ${motivo}`,
        )
      }
      await tx
        .update(venta)
        .set({
          estado: 'anulada',
          anulacionMotivo: motivo,
          anuladaEn: ahora,
          anuladaPor: sesion.usuarioId,
          actualizadoEn: ahora,
        })
        .where(eq(venta.id, id))
      await this.auditar(tx, sesion, id, 'baja', `Anuló la venta ${v.numero}: ${motivo}`, ip)
      return this.armar(tx, id)
    })
  }

  private enBorrador(
    id: string,
    hacer: (tx: Db, sesion: Sesion, v: typeof venta.$inferSelect) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [v] = await tx.select().from(venta).where(eq(venta.id, id)).for('update')
      if (!v) throw new ErrorVentas('NO_ENCONTRADA')
      if (v.estado !== 'borrador') throw new ErrorVentas('ESTADO_INVALIDO')
      await hacer(tx, sesion, v)
      return this.armar(tx, id)
    })
  }

  private async controlarCliente(tx: Db, id: string) {
    const [c] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, id))
    if (!c) throw new ErrorVentas('DATO_INVALIDO')
  }

  private async leerConfig(tx: Db): Promise<ConfigVentas> {
    const [c] = await tx.select().from(ventasConfig)
    return c
      ? {
          descuentoMaximo: c.descuentoMaximo === null ? null : Number(c.descuentoMaximo),
          exigeSaldoCero: c.exigeSaldoCero,
        }
      : { ...CONFIG_VENTAS_POR_OMISION }
  }

  private async movimiento(
    tx: Db,
    sesion: Sesion,
    unidadId: string,
    tipo: 'venta',
    detalle: string,
  ) {
    await tx.insert(unidadMovimiento).values({
      tenantId: sesion.tenantId,
      unidadId,
      tipo,
      detalle,
      creadoPor: sesion.usuarioId,
    })
  }

  private auditar(
    tx: Db,
    sesion: Sesion,
    id: string,
    accion: 'alta' | 'modificacion' | 'baja',
    texto: string,
    ip?: string,
  ) {
    return auditar(tx, sesion, { tabla: 'venta', registroId: id, accion, despues: { texto }, ip })
  }

  /** Lo que costó la unidad, para quien puede verlo y si está en la misma moneda. */
  private async costoUnidad(tx: Db, v: typeof venta.$inferSelect): Promise<string | null> {
    if (!contextoDelPedido().habilidades.can('ver', 'CostoUnidad')) return null
    const [u] = await tx
      .select({ moneda: unidad.moneda })
      .from(unidad)
      .where(eq(unidad.id, v.unidadId))
    if (!u || u.moneda !== v.moneda) return null
    const conceptos = await tx
      .select()
      .from(unidadConcepto)
      .where(and(eq(unidadConcepto.unidadId, v.unidadId), isNull(unidadConcepto.anuladoEn)))
    return totalesDeUnidad(
      conceptos.map((c) => ({
        tipo: c.tipo as 'compra' | 'gasto' | 'bonificacion',
        importe: c.importe,
        moneda: c.moneda as MonedaUnidad,
        cotizacion: c.cotizacion,
      })),
      u.moneda as MonedaUnidad,
      null,
    ).costo
  }

  private async totales(tx: Db, v: typeof venta.$inferSelect, conRentabilidad: boolean) {
    const conceptos = await tx
      .select()
      .from(ventaConcepto)
      .where(eq(ventaConcepto.ventaId, v.id))
      .orderBy(asc(ventaConcepto.orden))
    const pagos = await tx
      .select()
      .from(ventaPago)
      .where(eq(ventaPago.ventaId, v.id))
      .orderBy(asc(ventaPago.orden))
    return {
      conceptos,
      pagos,
      ...totalesDeVenta({
        precio: v.precio,
        moneda: v.moneda as MonedaUnidad,
        conceptos: conceptos.map((c) => ({
          tipo: c.tipo as TipoConceptoVenta,
          importe: c.importe,
          moneda: c.moneda as MonedaUnidad,
          cotizacion: c.cotizacion,
        })),
        pagos: pagos.map((p) => ({
          importe: p.importe,
          moneda: p.moneda as MonedaUnidad,
          cotizacion: p.cotizacion,
        })),
        costoUnidad: conRentabilidad ? await this.costoUnidad(tx, v) : null,
      }),
    }
  }

  private async resumen(tx: Db, id: string): Promise<ResumenVenta> {
    return (await this.armar(tx, id, false)).resumen
  }

  private async armar(tx: Db, id: string): Promise<FichaVenta>
  private async armar(tx: Db, id: string, completa: false): Promise<{ resumen: ResumenVenta }>
  private async armar(
    tx: Db,
    id: string,
    completa = true,
  ): Promise<FichaVenta | { resumen: ResumenVenta }> {
    const [f] = await tx
      .select({
        v: venta,
        dominio: vehiculo.dominio,
        chasis: vehiculo.chasis,
        anio: vehiculo.anio,
        marca: marca.nombre,
        modelo: modelo.nombre,
        cliente: entidadComercial.razonSocial,
        sucursal: sucursal.nombre,
        vendedor: sql<string | null>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(venta)
      .innerJoin(unidad, eq(unidad.id, venta.unidadId))
      .innerJoin(vehiculo, eq(vehiculo.id, unidad.vehiculoId))
      .innerJoin(entidadComercial, eq(entidadComercial.id, venta.clienteId))
      .innerJoin(sucursal, eq(sucursal.id, venta.sucursalId))
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .leftJoin(usuario, eq(usuario.id, venta.vendedorId))
      .where(eq(venta.id, id))
    if (!f) throw new ErrorVentas('NO_ENCONTRADA')
    const { v } = f
    const t = await this.totales(tx, v, completa)
    const resumen: ResumenVenta = {
      id: v.id,
      numero: v.numero,
      estado: v.estado as Estado,
      unidad: {
        id: v.unidadId,
        nombre: nombreDe(f),
        dominio: f.dominio,
        chasis: f.chasis,
      },
      cliente: { id: v.clienteId, nombre: f.cliente },
      vendedor: f.vendedor,
      sucursal: f.sucursal,
      fecha: v.fecha,
      moneda: v.moneda as MonedaUnidad,
      total: t.total,
      saldo: t.saldo,
    }
    if (!completa) return { resumen }

    const usadosIds = t.pagos.flatMap((p) => (p.unidadUsadaId ? [p.unidadUsadaId] : []))
    const usados = usadosIds.length
      ? await tx
          .select({
            id: unidad.id,
            anio: vehiculo.anio,
            marca: marca.nombre,
            modelo: modelo.nombre,
            dominio: vehiculo.dominio,
          })
          .from(unidad)
          .innerJoin(vehiculo, eq(vehiculo.id, unidad.vehiculoId))
          .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
          .leftJoin(marca, eq(marca.id, modelo.marcaId))
          .where(inArray(unidad.id, usadosIds))
      : []
    const config = await this.leerConfig(tx)

    return {
      ...resumen,
      precio: v.precio,
      observaciones: v.observaciones,
      conceptos: t.conceptos.map((c) => ({
        tipo: c.tipo as TipoConceptoVenta,
        descripcion: c.descripcion,
        importe: c.importe,
        moneda: c.moneda as MonedaUnidad,
        cotizacion: c.cotizacion,
        porcentaje: c.porcentaje,
      })),
      pagos: t.pagos.map((p) => {
        const usado = usados.find((x) => x.id === p.unidadUsadaId)
        return {
          medio: p.medio as MedioPagoVenta,
          importe: p.importe,
          moneda: p.moneda as MonedaUnidad,
          cotizacion: p.cotizacion,
          detalle: p.detalle,
          entidad: p.entidad,
          cuotas: p.cuotas,
          unidadUsada: usado
            ? {
                id: usado.id,
                nombre: `${nombreDe(usado)}${usado.dominio ? ` · ${usado.dominio}` : ''}`,
              }
            : null,
          reservaId: p.reservaId,
        }
      }),
      totales: {
        precio: t.precio,
        gastosCliente: t.gastosCliente,
        descuentos: t.descuentos,
        total: t.total,
        pagado: t.pagado,
        saldo: t.saldo,
        descuentoPorcentaje: t.descuentoPorcentaje,
        sinConvertir: t.sinConvertir,
        rentabilidad: t.rentabilidad,
      },
      requiereAutorizacion:
        v.estado === 'borrador' &&
        config.descuentoMaximo !== null &&
        Number(t.descuentoPorcentaje) > config.descuentoMaximo,
      autorizacionMotivo: v.autorizacionMotivo,
      anulacionMotivo: v.anulacionMotivo,
    }
  }
}

const c = contrato.ventas

function traducir(e: unknown, errors: object): never {
  if (e instanceof ErrorVentas) {
    const crear = (errors as Record<string, ((o?: object) => Error) | undefined>)[e.codigo]
    if (crear) throw crear(e.datos ? { data: e.datos } : undefined)
  }
  throw e
}

@Controller()
export class ControladorVentas {
  constructor(@Inject(ServicioVentas) private readonly servicio: ServicioVentas) {}

  @Operacion(c.config)
  config() {
    return implement(c.config).handler(() => this.servicio.config())
  }

  @Operacion(c.guardarConfig)
  guardarConfig(@Req() pedido: FastifyRequest) {
    return implement(c.guardarConfig).handler(({ input }) =>
      this.servicio.guardarConfig(input, pedido.ip),
    )
  }

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

  @Operacion(c.guardar)
  guardar(@Req() pedido: FastifyRequest) {
    return implement(c.guardar).handler(({ input, errors }) =>
      this.servicio.guardar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.confirmar)
  confirmar(@Req() pedido: FastifyRequest) {
    return implement(c.confirmar).handler(({ input, errors }) =>
      this.servicio
        .confirmar(input.id, input.autorizacion, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(c.anular).handler(({ input, errors }) =>
      this.servicio.anular(input.id, input.motivo, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
