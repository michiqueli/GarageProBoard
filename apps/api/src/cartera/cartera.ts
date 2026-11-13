import { contrato } from '@gpb/contracts'
import { CONFIG_CARTERA_POR_OMISION, type ConfigCartera } from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, inArray, or, sql } from '@gpb/db'
import {
  carteraConfig,
  cliente,
  empresa,
  entidadComercial,
  marca,
  modelo,
  sucursal,
  unidad,
  unidadMovimiento,
  unidadReserva,
  usuario,
  vehiculo,
} from '@gpb/db/schema'
import { Controller, Inject, Injectable, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { auditar } from '../comun/auditoria.ts'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'

type Moneda = 'ARS' | 'USD'
type Condicion = '0km' | 'usado'
type Tenencia = 'propia' | 'consignacion'
type Origen = 'fabrica' | 'compra' | 'parte_de_pago' | 'consignacion' | 'otro'
type Estado = 'disponible' | 'reservada' | 'vendida' | 'retirada'

class ErrorCartera extends Error {
  constructor(
    readonly codigo: string,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

/** La fecha de Argentina: la zona de Postgres es UTC, y a la noche ya sería mañana. */
const HOY = sql`(now() at time zone 'America/Argentina/Buenos_Aires')::date`
const EN_STOCK: Estado[] = ['disponible', 'reservada']

/**
 * El stock de unidades. Lo que cambia entre concesionarias sale de `cartera_config`. Ver
 * `docs/tecnicos/ventas-de-unidades.md`.
 */
@Injectable()
export class ServicioCartera {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  config() {
    return this.datos.transaccion((tx) => this.leerConfig(tx))
  }

  guardarConfig(c: ConfigCartera, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const valores = { ...c, actualizadoEn: new Date(), actualizadoPor: sesion.usuarioId }
      const [fila] = await tx
        .insert(carteraConfig)
        .values({ tenantId: sesion.tenantId, ...valores })
        .onConflictDoUpdate({ target: carteraConfig.tenantId, set: valores })
        .returning({ id: carteraConfig.id })
      await auditar(tx, sesion, {
        tabla: 'cartera_config',
        registroId: fila?.id as string,
        accion: 'modificacion',
        despues: { texto: 'Cambió cómo trabaja el stock' },
        ip,
      })
      return c
    })
  }

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: Estado | 'en_stock' | 'todas'
    condicion?: Condicion | undefined
    tenencia?: Tenencia | undefined
    sucursalId?: string | undefined
  }) {
    return this.datos.transaccion(async (tx) => {
      await this.vencerReservas(tx)
      const texto = filtro.buscar?.trim()
      const compacto = texto?.toUpperCase().replace(/[\s-]/g, '')
      const donde = and(
        filtro.estado === 'todas'
          ? undefined
          : filtro.estado === 'en_stock'
            ? inArray(unidad.estado, EN_STOCK)
            : eq(unidad.estado, filtro.estado),
        filtro.condicion ? eq(unidad.condicion, filtro.condicion) : undefined,
        filtro.tenencia ? eq(unidad.tenencia, filtro.tenencia) : undefined,
        filtro.sucursalId ? eq(unidad.sucursalId, filtro.sucursalId) : undefined,
        texto
          ? or(
              ilike(vehiculo.dominio, `%${compacto}%`),
              ilike(vehiculo.chasis, `%${compacto}%`),
              ilike(marca.nombre, `%${texto}%`),
              ilike(modelo.nombre, `%${texto}%`),
            )
          : undefined,
      )
      const desde = () =>
        tx
          .select({ id: unidad.id })
          .from(unidad)
          .innerJoin(vehiculo, eq(vehiculo.id, unidad.vehiculoId))
          .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
          .leftJoin(marca, eq(marca.id, modelo.marcaId))
          .where(donde)
      const [total] = await tx.select({ n: count() }).from(desde().as('filtradas'))
      const filas = await desde()
        .orderBy(desc(unidad.fechaIngreso), desc(unidad.creadoEn), asc(unidad.id))
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
    return this.datos.transaccion(async (tx) => {
      await this.vencerReservas(tx)
      return this.detalle(tx, id)
    })
  }

  ingresar(
    d: {
      vehiculoId: string
      condicion: Condicion
      tenencia: Tenencia
      origen: Origen
      empresaId?: string | null | undefined
      consignanteId?: string | null | undefined
      sucursalId?: string | null | undefined
      precio?: string | null | undefined
      moneda?: Moneda | undefined
      fechaIngreso?: string | null | undefined
      observaciones: string | null
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const sucursalId = d.sucursalId ?? sesion.sucursalId
      const [suc] = await tx.select().from(sucursal).where(eq(sucursal.id, sucursalId))
      const [auto] = await tx
        .select({ id: vehiculo.id, dominio: vehiculo.dominio, chasis: vehiculo.chasis })
        .from(vehiculo)
        .where(eq(vehiculo.id, d.vehiculoId))
      if (!suc || !auto) throw new ErrorCartera('DATO_INVALIDO')

      let empresaId: string | null = null
      let consignanteId: string | null = null
      if (d.tenencia === 'propia') {
        empresaId = d.empresaId ?? suc.empresaId
        const [e] = await tx
          .select({ id: empresa.id })
          .from(empresa)
          .where(eq(empresa.id, empresaId))
        if (!e) throw new ErrorCartera('DATO_INVALIDO')
      } else {
        consignanteId = d.consignanteId as string
        const [c] = await tx
          .select({ id: cliente.id })
          .from(cliente)
          .where(eq(cliente.id, consignanteId))
        if (!c) throw new ErrorCartera('DATO_INVALIDO')
      }

      const [yaEsta] = await tx
        .select({ id: unidad.id })
        .from(unidad)
        .where(and(eq(unidad.vehiculoId, d.vehiculoId), inArray(unidad.estado, EN_STOCK)))
      if (yaEsta) throw new ErrorCartera('YA_EN_STOCK')

      const config = await this.leerConfig(tx)
      const [creada] = await tx
        .insert(unidad)
        .values({
          tenantId: sesion.tenantId,
          vehiculoId: d.vehiculoId,
          condicion: d.condicion,
          tenencia: d.tenencia,
          origen: d.origen,
          empresaId,
          consignanteId,
          sucursalId,
          precio: d.precio ?? null,
          moneda: d.moneda ?? config.moneda,
          ...(d.fechaIngreso ? { fechaIngreso: d.fechaIngreso } : {}),
          observaciones: d.observaciones,
          creadoPor: sesion.usuarioId,
        })
        .returning({ id: unidad.id })
      const id = creada?.id as string
      const nombre = auto.dominio ?? auto.chasis
      await this.anotar(tx, sesion, id, 'ingreso', `Ingresó al stock en ${suc.nombre}`, null)
      await this.auditar(tx, sesion, id, 'alta', `Ingresó ${nombre} al stock`, ip)
      return this.detalle(tx, id)
    })
  }

  editar(
    id: string,
    d: { precio?: string | null | undefined; moneda: Moneda; observaciones: string | null },
    ip?: string,
  ) {
    return this.enStock(id, async (tx, sesion, u) => {
      const precio = d.precio ?? null
      await tx
        .update(unidad)
        .set({
          precio,
          moneda: d.moneda,
          observaciones: d.observaciones,
          actualizadoEn: new Date(),
        })
        .where(eq(unidad.id, id))
      const mismo =
        (u.precio === null ? null : Number(u.precio)) === (precio === null ? null : Number(precio))
      if (!mismo || u.moneda !== d.moneda) {
        await this.anotar(
          tx,
          sesion,
          id,
          'precio',
          precio === null ? 'Le sacó el precio' : `Puso el precio en ${d.moneda} ${precio}`,
          null,
        )
      }
      await this.auditar(tx, sesion, id, 'modificacion', 'Modificó la unidad', ip)
    })
  }

  trasladar(
    id: string,
    d: { sucursalId: string; comprobante: string | null; nota: string | null },
    ip?: string,
  ) {
    return this.enStock(id, async (tx, sesion, u) => {
      if (d.sucursalId === u.sucursalId) throw new ErrorCartera('SUCURSAL_INVALIDA')
      const [destino] = await tx.select().from(sucursal).where(eq(sucursal.id, d.sucursalId))
      const [origen] = await tx.select().from(sucursal).where(eq(sucursal.id, u.sucursalId))
      if (!destino || !origen) throw new ErrorCartera('SUCURSAL_INVALIDA')

      const config = await this.leerConfig(tx)
      const cambiaDuena =
        u.tenencia === 'propia' &&
        u.empresaId !== destino.empresaId &&
        config.trasladoEntreEmpresas === 'con_comprobante'
      if (cambiaDuena && !d.comprobante) throw new ErrorCartera('FALTA_COMPROBANTE')

      await tx
        .update(unidad)
        .set({
          sucursalId: d.sucursalId,
          ...(cambiaDuena ? { empresaId: destino.empresaId } : {}),
          actualizadoEn: new Date(),
        })
        .where(eq(unidad.id, id))
      const texto = `De ${origen.nombre} a ${destino.nombre}${cambiaDuena ? ', y cambió de razón social' : ''}${d.nota ? `: ${d.nota}` : ''}`
      await this.anotar(tx, sesion, id, 'traslado', texto, d.comprobante)
      await this.auditar(tx, sesion, id, 'modificacion', `Trasladó la unidad. ${texto}`, ip)
    })
  }

  reservar(
    id: string,
    d: {
      clienteId: string
      sena?: string | null | undefined
      moneda?: Moneda | undefined
      vence?: string | null | undefined
      nota: string | null
      pasarPorEncima?: string | null | undefined
    },
    ip?: string,
  ) {
    return this.enStock(id, async (tx, sesion, u) => {
      const [persona] = await tx
        .select({ id: cliente.id, nombre: entidadComercial.razonSocial })
        .from(cliente)
        .innerJoin(entidadComercial, eq(entidadComercial.id, cliente.id))
        .where(eq(cliente.id, d.clienteId))
      if (!persona) throw new ErrorCartera('CLIENTE_INVALIDO')

      const config = await this.leerConfig(tx)
      if (config.reservaExigeSena && !(Number(d.sena ?? 0) > 0)) {
        throw new ErrorCartera('FALTA_SENA')
      }

      const activas = await this.reservasActivas(tx, [id])
      const anterior = activas[0]
      if (config.reservaModo === 'bloquea' && anterior) {
        if (!d.pasarPorEncima) {
          throw new ErrorCartera('YA_RESERVADA', {
            cliente: anterior.nombre,
            vence: anterior.vence,
          })
        }
        if (!contextoDelPedido().habilidades.can('autorizar', 'Unidad')) {
          throw new ErrorCartera('SIN_AUTORIZACION')
        }
        await tx
          .update(unidadReserva)
          .set({
            estado: 'desplazada',
            cierreMotivo: d.pasarPorEncima,
            cerradaEn: new Date(),
            cerradaPor: sesion.usuarioId,
          })
          .where(
            inArray(
              unidadReserva.id,
              activas.map((a) => a.id),
            ),
          )
      }

      await tx.insert(unidadReserva).values({
        tenantId: sesion.tenantId,
        unidadId: id,
        clienteId: d.clienteId,
        sena: d.sena ?? null,
        moneda: d.moneda ?? u.moneda,
        vence: d.vence ?? (await this.vencimiento(tx, config)),
        nota: d.nota,
        creadoPor: sesion.usuarioId,
      })
      await tx
        .update(unidad)
        .set({ estado: 'reservada', actualizadoEn: new Date() })
        .where(eq(unidad.id, id))
      const texto = d.pasarPorEncima
        ? `Reservada para ${persona.nombre}, por encima de ${anterior?.nombre}: ${d.pasarPorEncima}`
        : `Reservada para ${persona.nombre}`
      await this.anotar(tx, sesion, id, 'reserva', texto, null)
      await this.auditar(tx, sesion, id, 'modificacion', texto, ip)
    })
  }

  liberar(id: string, reservaId: string, motivo: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.vencerReservas(tx)
      await this.bloquear(tx, id)
      const cerradas = await tx
        .update(unidadReserva)
        .set({
          estado: 'liberada',
          cierreMotivo: motivo,
          cerradaEn: new Date(),
          cerradaPor: sesion.usuarioId,
        })
        .where(
          and(
            eq(unidadReserva.id, reservaId),
            eq(unidadReserva.unidadId, id),
            eq(unidadReserva.estado, 'activa'),
          ),
        )
        .returning({ id: unidadReserva.id })
      if (!cerradas.length) throw new ErrorCartera('RESERVA_CERRADA')
      await this.acomodarEstado(tx, id)
      await this.anotar(tx, sesion, id, 'liberacion', `Liberó una reserva: ${motivo}`, null)
      await this.auditar(tx, sesion, id, 'modificacion', `Liberó una reserva: ${motivo}`, ip)
      return this.detalle(tx, id)
    })
  }

  retirar(id: string, motivo: string, ip?: string) {
    return this.enStock(id, async (tx, sesion) => {
      if ((await this.reservasActivas(tx, [id])).length) throw new ErrorCartera('TIENE_RESERVA')
      await tx
        .update(unidad)
        .set({ estado: 'retirada', retiroMotivo: motivo, actualizadoEn: new Date() })
        .where(eq(unidad.id, id))
      await this.anotar(tx, sesion, id, 'retiro', `Salió del stock: ${motivo}`, null)
      await this.auditar(tx, sesion, id, 'baja', `Sacó la unidad del stock: ${motivo}`, ip)
    })
  }

  private enStock(
    id: string,
    hacer: (tx: Db, sesion: Sesion, u: typeof unidad.$inferSelect) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.vencerReservas(tx)
      const u = await this.bloquear(tx, id)
      if (!EN_STOCK.includes(u.estado as Estado)) throw new ErrorCartera('ESTADO_INVALIDO')
      await hacer(tx, sesion, u)
      return this.detalle(tx, id)
    })
  }

  /** Con la fila trabada: dos vendedores reservando a la vez se ordenan acá. */
  private async bloquear(tx: Db, id: string) {
    const [u] = await tx.select().from(unidad).where(eq(unidad.id, id)).for('update')
    if (!u) throw new ErrorCartera('NO_ENCONTRADA')
    return u
  }

  private async leerConfig(tx: Db): Promise<ConfigCartera> {
    const [c] = await tx.select().from(carteraConfig)
    return c
      ? {
          trasladoEntreEmpresas: c.trasladoEntreEmpresas as ConfigCartera['trasladoEntreEmpresas'],
          reservaModo: c.reservaModo as ConfigCartera['reservaModo'],
          reservaDias: c.reservaDias,
          reservaExigeSena: c.reservaExigeSena,
          tenenciaUsado: c.tenenciaUsado as ConfigCartera['tenenciaUsado'],
          moneda: c.moneda as ConfigCartera['moneda'],
        }
      : { ...CONFIG_CARTERA_POR_OMISION }
  }

  private async vencimiento(tx: Db, config: ConfigCartera): Promise<string | null> {
    if (config.reservaDias === null) return null
    const dias = config.reservaDias
    const { rows } = await tx.execute<{ vence: string }>(
      sql`select (${HOY} + ${dias}::int)::text as vence`,
    )
    return rows[0]?.vence as string
  }

  /**
   * Vencen al consultarlas: un trabajo programado tendría que recorrer todas las concesionarias,
   * que es lo que RLS le impide al rol de la aplicación.
   */
  private async vencerReservas(tx: Db) {
    const vencidas = await tx
      .update(unidadReserva)
      .set({ estado: 'vencida', cerradaEn: new Date() })
      .where(and(eq(unidadReserva.estado, 'activa'), sql`${unidadReserva.vence} < ${HOY}`))
      .returning({ unidadId: unidadReserva.unidadId })
    for (const id of new Set(vencidas.map((v) => v.unidadId))) await this.acomodarEstado(tx, id)
  }

  private async acomodarEstado(tx: Db, id: string) {
    if ((await this.reservasActivas(tx, [id])).length) return
    await tx
      .update(unidad)
      .set({ estado: 'disponible', actualizadoEn: new Date() })
      .where(and(eq(unidad.id, id), eq(unidad.estado, 'reservada')))
  }

  private reservasActivas(tx: Db, ids: string[]) {
    return tx
      .select({
        id: unidadReserva.id,
        unidadId: unidadReserva.unidadId,
        clienteId: unidadReserva.clienteId,
        nombre: entidadComercial.razonSocial,
        sena: unidadReserva.sena,
        moneda: unidadReserva.moneda,
        vence: unidadReserva.vence,
      })
      .from(unidadReserva)
      .innerJoin(entidadComercial, eq(entidadComercial.id, unidadReserva.clienteId))
      .where(and(inArray(unidadReserva.unidadId, ids), eq(unidadReserva.estado, 'activa')))
      .orderBy(asc(unidadReserva.creadoEn))
  }

  private async anotar(
    tx: Db,
    sesion: Sesion,
    unidadId: string,
    tipo: 'ingreso' | 'traslado' | 'reserva' | 'liberacion' | 'precio' | 'retiro',
    detalle: string,
    comprobante: string | null,
  ) {
    await tx.insert(unidadMovimiento).values({
      tenantId: sesion.tenantId,
      unidadId,
      tipo,
      detalle,
      comprobante,
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
    return auditar(tx, sesion, { tabla: 'unidad', registroId: id, accion, despues: { texto }, ip })
  }

  private async armar(tx: Db, ids: string[]) {
    if (!ids.length) return []
    const filas = await tx
      .select({
        u: unidad,
        dominio: vehiculo.dominio,
        chasis: vehiculo.chasis,
        anio: vehiculo.anio,
        color: vehiculo.color,
        marca: marca.nombre,
        modelo: modelo.nombre,
        empresa: empresa.razonSocial,
        consignante: entidadComercial.razonSocial,
        sucursal: sucursal.nombre,
        dias: sql<number>`(${HOY} - ${unidad.fechaIngreso})::int`,
      })
      .from(unidad)
      .innerJoin(vehiculo, eq(vehiculo.id, unidad.vehiculoId))
      .innerJoin(sucursal, eq(sucursal.id, unidad.sucursalId))
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .leftJoin(empresa, eq(empresa.id, unidad.empresaId))
      .leftJoin(entidadComercial, eq(entidadComercial.id, unidad.consignanteId))
      .where(inArray(unidad.id, ids))
    const reservas = await this.reservasActivas(tx, ids)

    return ids
      .map((id) => filas.find((f) => f.u.id === id))
      .filter((f): f is (typeof filas)[number] => Boolean(f))
      .map((f) => ({
        id: f.u.id,
        condicion: f.u.condicion as Condicion,
        tenencia: f.u.tenencia as Tenencia,
        origen: f.u.origen as Origen,
        estado: f.u.estado as Estado,
        vehiculo: {
          id: f.u.vehiculoId,
          dominio: f.dominio,
          chasis: f.chasis,
          marca: f.marca,
          modelo: f.modelo,
          anio: f.anio,
          color: f.color,
        },
        empresa: f.u.empresaId && f.empresa ? { id: f.u.empresaId, nombre: f.empresa } : null,
        consignante:
          f.u.consignanteId && f.consignante
            ? { id: f.u.consignanteId, nombre: f.consignante }
            : null,
        sucursal: { id: f.u.sucursalId, nombre: f.sucursal },
        precio: f.u.precio,
        moneda: f.u.moneda as Moneda,
        fechaIngreso: f.u.fechaIngreso,
        diasEnStock: Math.max(0, f.dias),
        reservas: reservas
          .filter((r) => r.unidadId === f.u.id)
          .map((r) => ({
            id: r.id,
            cliente: { id: r.clienteId, nombre: r.nombre },
            sena: r.sena,
            moneda: r.moneda as Moneda,
            vence: r.vence,
          })),
      }))
  }

  private async detalle(tx: Db, id: string) {
    const [resumen] = await this.armar(tx, [id])
    if (!resumen) throw new ErrorCartera('NO_ENCONTRADA')
    const [u] = await tx.select().from(unidad).where(eq(unidad.id, id))
    const historial = await tx
      .select({ r: unidadReserva, nombre: entidadComercial.razonSocial })
      .from(unidadReserva)
      .innerJoin(entidadComercial, eq(entidadComercial.id, unidadReserva.clienteId))
      .where(eq(unidadReserva.unidadId, id))
      .orderBy(desc(unidadReserva.creadoEn))
    const movimientos = await tx
      .select({
        m: unidadMovimiento,
        autor: sql<string | null>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(unidadMovimiento)
      .leftJoin(usuario, eq(usuario.id, unidadMovimiento.creadoPor))
      .where(eq(unidadMovimiento.unidadId, id))
      .orderBy(desc(unidadMovimiento.creadoEn), desc(unidadMovimiento.id))
    return {
      ...resumen,
      observaciones: u?.observaciones ?? null,
      retiroMotivo: u?.retiroMotivo ?? null,
      historialReservas: historial.map(({ r, nombre }) => ({
        id: r.id,
        cliente: { id: r.clienteId, nombre },
        estado: r.estado as 'activa' | 'vencida' | 'liberada' | 'desplazada' | 'convertida',
        sena: r.sena,
        moneda: r.moneda as Moneda,
        vence: r.vence,
        nota: r.nota,
        cierreMotivo: r.cierreMotivo,
        creadoEn: r.creadoEn.toISOString(),
      })),
      movimientos: movimientos.map(({ m, autor }) => ({
        id: m.id,
        tipo: m.tipo,
        detalle: m.detalle,
        comprobante: m.comprobante,
        creadoEn: m.creadoEn.toISOString(),
        autor,
      })),
    }
  }
}

const c = contrato.cartera

function traducir(e: unknown, errors: object): never {
  if (e instanceof ErrorCartera) {
    const crear = (errors as Record<string, ((o?: object) => Error) | undefined>)[e.codigo]
    if (crear) throw crear(e.datos ? { data: e.datos } : undefined)
  }
  throw e
}

@Controller()
export class ControladorCartera {
  constructor(@Inject(ServicioCartera) private readonly servicio: ServicioCartera) {}

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

  @Operacion(c.ingresar)
  ingresar(@Req() pedido: FastifyRequest) {
    return implement(c.ingresar).handler(({ input, errors }) =>
      this.servicio.ingresar(input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editar)
  editar(@Req() pedido: FastifyRequest) {
    return implement(c.editar).handler(({ input, errors }) =>
      this.servicio.editar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.trasladar)
  trasladar(@Req() pedido: FastifyRequest) {
    return implement(c.trasladar).handler(({ input, errors }) =>
      this.servicio.trasladar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.reservar)
  reservar(@Req() pedido: FastifyRequest) {
    return implement(c.reservar).handler(({ input, errors }) =>
      this.servicio.reservar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.liberar)
  liberar(@Req() pedido: FastifyRequest) {
    return implement(c.liberar).handler(({ input, errors }) =>
      this.servicio
        .liberar(input.id, input.reservaId, input.motivo, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.retirar)
  retirar(@Req() pedido: FastifyRequest) {
    return implement(c.retirar).handler(({ input, errors }) =>
      this.servicio.retirar(input.id, input.motivo, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }
}
