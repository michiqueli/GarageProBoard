import { plata, puedeSobre } from '@gpb/core'
import {
  and,
  asc,
  count,
  type Db,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from '@gpb/db'
import {
  auditoria,
  cliente,
  comprobante,
  empresa,
  entidadComercial,
  marca,
  modelo,
  orden,
  ordenItem,
  ordenSecuencia,
  sucursal,
  tipoComprobante,
  titularidad,
  usuario,
  usuarioSucursal,
  vehiculo,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { generarCodigoQr } from '../comun/qr.ts'

type Codigo =
  | 'NO_ENCONTRADA'
  | 'NO_ENCONTRADO'
  | 'ESTADO_INVALIDO'
  | 'VEHICULO_CON_ORDEN'
  | 'SIN_ITEMS'

export class ErrorOrdenes extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

export type EstadoOrden =
  | 'recibida'
  | 'en_proceso'
  | 'esperando_repuesto'
  | 'esperando_autorizacion'
  | 'terminada'
  | 'facturada'
  | 'entregada'
  | 'anulada'

/** Los estados en los que el auto está en el taller y la orden se puede trabajar. */
export const EN_TALLER: EstadoOrden[] = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
]
/** Una orden cerrada del todo: ya no se toca. */
const CERRADA: EstadoOrden[] = ['facturada', 'entregada', 'anulada']

export interface DatosRecepcion {
  pagaId?: string | null | undefined
  traeNombre?: string | null | undefined
  traeTelefono?: string | null | undefined
  kilometraje?: number | null | undefined
  combustible?: string | null | undefined
  pedido: string
  observaciones?: string | null | undefined
  prometidaPara?: string | null | undefined
  mecanicoId?: string | null | undefined
}

export interface ItemEntrada {
  tipo: 'trabajo' | 'repuesto'
  codigo?: string | null | undefined
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: number
}

const totalItem = (i: { cantidad: string; precioUnitario: string }) =>
  plata(i.cantidad).times(plata(i.precioUnitario)).toDecimalPlaces(2)

/**
 * Órdenes de trabajo: la recepción, lo que se le hace al auto, y el paso a caja.
 *
 * Todo en la sucursal activa: el número es de la sucursal, y un asesor de Rafaela no abre
 * órdenes en Casa Central. El mecánico edita sólo las órdenes que tiene asignadas: la regla
 * con condición se evalúa acá, contra la orden, porque la guardia de la API no la tiene.
 */
@Injectable()
export class ServicioOrdenes {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: EstadoOrden | 'en_taller' | 'todas'
  }) {
    return this.datos.transaccion(async (tx, sesion) => {
      const texto = filtro.buscar?.trim()
      const compacto = texto?.toUpperCase().replace(/[\s-]/g, '')
      const condiciones = [
        eq(orden.sucursalId, sesion.sucursalId),
        filtro.estado === 'todas'
          ? undefined
          : filtro.estado === 'en_taller'
            ? inArray(orden.estado, [...EN_TALLER, 'terminada', 'facturada'])
            : eq(orden.estado, filtro.estado),
        texto
          ? or(
              sql`${orden.numero}::text = ${texto.replace(/^0+/, '')}`,
              ilike(vehiculo.dominio, `%${compacto}%`),
              ilike(vehiculo.chasis, `%${compacto}%`),
              ilike(orden.pedido, `%${texto}%`),
            )
          : undefined,
      ].filter(Boolean)
      const donde = and(...condiciones)

      const [total] = await tx
        .select({ n: count() })
        .from(orden)
        .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
        .where(donde)
      const filas = await tx
        .select({ id: orden.id })
        .from(orden)
        .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
        .where(donde)
        .orderBy(desc(orden.creadoEn))
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

  /** Los usuarios activos que entran a la sucursal activa: a quién se le asigna una orden. */
  personal() {
    return this.datos.transaccion(async (tx, sesion) => {
      const filas = await tx
        .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
        .from(usuario)
        .innerJoin(usuarioSucursal, eq(usuarioSucursal.usuarioId, usuario.id))
        .where(and(eq(usuarioSucursal.sucursalId, sesion.sucursalId), eq(usuario.activo, true)))
        .orderBy(asc(usuario.apellido), asc(usuario.nombre))
      return { datos: filas.map((u) => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim() })) }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.detalle(tx, id))
  }

  // ── recepción ───────────────────────────────────────────────────────────────

  abrir(entrada: DatosRecepcion & { vehiculoId: string; items: ItemEntrada[] }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [auto] = await tx
        .select({ id: vehiculo.id, kilometraje: vehiculo.kilometraje })
        .from(vehiculo)
        .where(eq(vehiculo.id, entrada.vehiculoId))
      if (!auto) throw new ErrorOrdenes('NO_ENCONTRADO')

      // Un auto está una sola vez en el taller: dos órdenes abiertas del mismo auto son dos
      // números distintos para el mismo trabajo, y el mecánico ficha en la equivocada.
      const [abierta] = await tx
        .select({ id: orden.id, numero: orden.numero })
        .from(orden)
        .where(and(eq(orden.vehiculoId, auto.id), notInArray(orden.estado, CERRADA)))
      if (abierta) {
        throw new ErrorOrdenes('VEHICULO_CON_ORDEN', {
          ordenId: abierta.id,
          numero: abierta.numero,
        })
      }

      const [titular] = await tx
        .select({ id: titularidad.clienteId })
        .from(titularidad)
        .where(and(eq(titularidad.vehiculoId, auto.id), isNull(titularidad.hasta)))
      const pagaId = entrada.pagaId ?? titular?.id ?? null
      await this.verificarReferencias(tx, pagaId, entrada.mecanicoId ?? null)

      // El número siguiente de la sucursal, atómico: dos recepciones a la vez no comparten.
      const [secuencia] = await tx
        .insert(ordenSecuencia)
        .values({ tenantId: sesion.tenantId, sucursalId: sesion.sucursalId, ultimo: 1 })
        .onConflictDoUpdate({
          target: ordenSecuencia.sucursalId,
          set: { ultimo: sql`${ordenSecuencia.ultimo} + 1` },
        })
        .returning({ ultimo: ordenSecuencia.ultimo })
      if (!secuencia) throw new Error('No se pudo numerar la orden.')

      const [creada] = await tx
        .insert(orden)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          numero: secuencia.ultimo,
          codigoQr: generarCodigoQr(),
          vehiculoId: auto.id,
          titularId: titular?.id ?? null,
          pagaId,
          traeNombre: entrada.traeNombre ?? null,
          traeTelefono: entrada.traeTelefono ?? null,
          kilometraje: entrada.kilometraje ?? null,
          combustible: entrada.combustible ?? null,
          pedido: entrada.pedido,
          observaciones: entrada.observaciones ?? null,
          prometidaPara: entrada.prometidaPara ?? null,
          asesorId: sesion.usuarioId,
          mecanicoId: entrada.mecanicoId ?? null,
        })
        .returning({ id: orden.id })
      if (!creada) throw new Error('No se pudo abrir la orden.')

      if (entrada.items.length) await this.guardarItems(tx, sesion, creada.id, entrada.items)

      // Los kilómetros de la recepción son el dato más fresco del auto.
      if (entrada.kilometraje != null && (auto.kilometraje ?? 0) < entrada.kilometraje) {
        await tx
          .update(vehiculo)
          .set({ kilometraje: entrada.kilometraje, actualizadoEn: new Date() })
          .where(eq(vehiculo.id, auto.id))
      }

      await this.auditar(
        tx,
        sesion,
        creada.id,
        'alta',
        { numero: secuencia.ultimo, pedido: entrada.pedido },
        ip,
      )
      return this.detalle(tx, creada.id)
    })
  }

  editar(id: string, entrada: DatosRecepcion, ip?: string) {
    return this.conOrden(
      id,
      CERRADA,
      'Una orden facturada, entregada o anulada ya no se modifica.',
      async (tx, sesion, o) => {
        await this.verificarReferencias(tx, entrada.pagaId ?? null, entrada.mecanicoId ?? null)
        await tx
          .update(orden)
          .set({
            pagaId: entrada.pagaId ?? null,
            traeNombre: entrada.traeNombre ?? null,
            traeTelefono: entrada.traeTelefono ?? null,
            kilometraje: entrada.kilometraje ?? null,
            combustible: entrada.combustible ?? null,
            pedido: entrada.pedido,
            observaciones: entrada.observaciones ?? null,
            prometidaPara: entrada.prometidaPara ?? null,
            mecanicoId: entrada.mecanicoId ?? null,
            actualizadoEn: new Date(),
          })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, recepcion: true },
          ip,
        )
      },
    )
  }

  items(id: string, items: ItemEntrada[], ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Terminada ya es de caja: para cambiar qué se cobra, reabrila.',
      async (tx, sesion, o) => {
        await tx.delete(ordenItem).where(eq(ordenItem.ordenId, id))
        if (items.length) await this.guardarItems(tx, sesion, id, items)
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, items: items.length },
          ip,
        )
      },
    )
  }

  cambiarEstado(id: string, estado: EstadoOrden, ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Sólo se cambia el estado de una orden que está en el taller.',
      async (tx, sesion, o) => {
        await tx.update(orden).set({ estado, actualizadoEn: new Date() }).where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado, antes: o.estado },
          ip,
        )
      },
    )
  }

  terminar(id: string, ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Esa orden no está en el taller.',
      async (tx, sesion, o) => {
        const [n] = await tx.select({ n: count() }).from(ordenItem).where(eq(ordenItem.ordenId, id))
        if (!n?.n) throw new ErrorOrdenes('SIN_ITEMS')
        await tx
          .update(orden)
          .set({ estado: 'terminada', terminadaEn: new Date(), actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado: 'terminada', antes: o.estado },
          ip,
        )
      },
    )
  }

  reabrir(id: string, ip?: string) {
    return this.conOrdenEn(
      id,
      ['terminada'],
      'Sólo se reabre una orden terminada que no se facturó.',
      async (tx, sesion, o) => {
        await this.sinFacturaEnCurso(tx, id)
        await tx
          .update(orden)
          .set({ estado: 'en_proceso', terminadaEn: null, actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado: 'en_proceso', antes: 'terminada' },
          ip,
        )
      },
    )
  }

  entregar(id: string, ip?: string) {
    return this.conOrdenEn(
      id,
      ['facturada'],
      'Se entrega una orden facturada.',
      async (tx, sesion, o) => {
        await tx
          .update(orden)
          .set({ estado: 'entregada', entregadaEn: new Date(), actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado: 'entregada', antes: o.estado },
          ip,
        )
      },
    )
  }

  anular(id: string, ip?: string) {
    return this.conOrdenEn(
      id,
      [...EN_TALLER, 'terminada'],
      'Una orden facturada no se anula: primero se anula la factura.',
      async (tx, sesion, o) => {
        await this.sinFacturaEnCurso(tx, id)
        await tx
          .update(orden)
          .set({ estado: 'anulada', actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(tx, sesion, id, 'baja', { numero: o.numero, antes: o.estado }, ip)
      },
    )
  }

  /** Todo lo que hace falta para imprimir la orden. */
  paraImprimir(id: string) {
    return this.datos.transaccion(async (tx) => {
      const d = await this.detalle(tx, id)
      const [o] = await tx
        .select({
          codigoQr: orden.codigoQr,
          sucursal: sucursal.nombre,
          domicilio: sucursal.domicilio,
          telefono: sucursal.telefono,
          razonSocial: empresa.razonSocial,
          nombreFantasia: empresa.nombreFantasia,
          anio: vehiculo.anio,
          color: vehiculo.color,
        })
        .from(orden)
        .innerJoin(sucursal, eq(sucursal.id, orden.sucursalId))
        .innerJoin(empresa, eq(empresa.id, sucursal.empresaId))
        .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
        .where(eq(orden.id, id))
      if (!o) throw new ErrorOrdenes('NO_ENCONTRADA')
      const [t] = d.titular
        ? await tx
            .select({ telefono: entidadComercial.telefono })
            .from(entidadComercial)
            .where(eq(entidadComercial.id, d.titular.id))
        : []
      return { orden: d, extra: o, titularTelefono: t?.telefono ?? null }
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /** Abre la transacción, trae la orden, verifica el permiso sobre ella y el estado. */
  private conOrdenEn(
    id: string,
    permitidos: EstadoOrden[],
    motivo: string,
    hacer: (tx: Db, sesion: Sesion, o: typeof orden.$inferSelect) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const o = await this.cargar(tx, id)
      if (!permitidos.includes(o.estado as EstadoOrden)) {
        throw new ErrorOrdenes('ESTADO_INVALIDO', { motivo })
      }
      await hacer(tx, sesion, o)
      return this.detalle(tx, id)
    })
  }

  /** Igual, pero con los estados en los que **no** se puede. */
  private conOrden(
    id: string,
    prohibidos: EstadoOrden[],
    motivo: string,
    hacer: (tx: Db, sesion: Sesion, o: typeof orden.$inferSelect) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const o = await this.cargar(tx, id)
      if (prohibidos.includes(o.estado as EstadoOrden)) {
        throw new ErrorOrdenes('ESTADO_INVALIDO', { motivo })
      }
      await hacer(tx, sesion, o)
      return this.detalle(tx, id)
    })
  }

  private async cargar(tx: Db, id: string) {
    const [o] = await tx.select().from(orden).where(eq(orden.id, id)).for('update')
    if (!o) throw new ErrorOrdenes('NO_ENCONTRADA')
    // El mecánico edita sólo lo suyo: con la orden en la mano se evalúa la condición del rol.
    const { habilidades } = contextoDelPedido()
    if (!puedeSobre(habilidades, 'editar', 'Orden', { mecanicoId: o.mecanicoId })) {
      throw new ErrorOrdenes('NO_ENCONTRADA')
    }
    return o
  }

  private async sinFacturaEnCurso(tx: Db, id: string) {
    const [enCurso] = await tx
      .select({ id: comprobante.id })
      .from(comprobante)
      .where(
        and(eq(comprobante.ordenId, id), inArray(comprobante.estado, ['emitiendo', 'incierto'])),
      )
    if (enCurso) {
      throw new ErrorOrdenes('ESTADO_INVALIDO', {
        motivo: 'La orden tiene una factura sin confirmar por AFIP: verificala en caja primero.',
      })
    }
  }

  private async verificarReferencias(tx: Db, pagaId: string | null, mecanicoId: string | null) {
    if (pagaId) {
      const [c] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, pagaId))
      if (!c) throw new ErrorOrdenes('NO_ENCONTRADO')
    }
    if (mecanicoId) {
      const [u] = await tx
        .select({ id: usuario.id })
        .from(usuario)
        .where(and(eq(usuario.id, mecanicoId), eq(usuario.activo, true)))
      if (!u) throw new ErrorOrdenes('NO_ENCONTRADO')
    }
  }

  private async guardarItems(tx: Db, sesion: Sesion, ordenId: string, items: ItemEntrada[]) {
    await tx.insert(ordenItem).values(
      items.map((i, n) => ({
        tenantId: sesion.tenantId,
        ordenId,
        tipo: i.tipo,
        orden: n + 1,
        codigo: i.codigo ?? null,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        codigoAlicuota: i.codigoAlicuota,
      })),
    )
  }

  private async detalle(tx: Db, id: string) {
    const [resumen] = await this.armar(tx, [id])
    if (!resumen) throw new ErrorOrdenes('NO_ENCONTRADA')
    const [o] = await tx.select().from(orden).where(eq(orden.id, id))
    if (!o) throw new ErrorOrdenes('NO_ENCONTRADA')
    const items = await tx
      .select()
      .from(ordenItem)
      .where(eq(ordenItem.ordenId, id))
      .orderBy(asc(ordenItem.orden))
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
          eq(comprobante.ordenId, id),
          eq(comprobante.estado, 'autorizado'),
          isNull(comprobante.comprobanteAsociadoId),
        ),
      )
      .orderBy(desc(comprobante.creadoEn))
      .limit(1)

    return {
      ...resumen,
      traeNombre: o.traeNombre,
      traeTelefono: o.traeTelefono,
      kilometraje: o.kilometraje,
      combustible: o.combustible as 'vacio' | 'cuarto' | 'medio' | 'tres_cuartos' | 'lleno' | null,
      observaciones: o.observaciones,
      terminadaEn: o.terminadaEn?.toISOString() ?? null,
      entregadaEn: o.entregadaEn?.toISOString() ?? null,
      items: items.map((i) => ({
        id: i.id,
        tipo: i.tipo as 'trabajo' | 'repuesto',
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        codigoAlicuota: i.codigoAlicuota,
        total: totalItem(i).toFixed(2),
      })),
      factura: factura ?? null,
    }
  }

  /** Los resúmenes de varias órdenes, con sus nombres, en pocas consultas y en el orden pedido. */
  private async armar(tx: Db, ids: string[]) {
    if (!ids.length) return []
    const filas = await tx
      .select({
        o: orden,
        dominio: vehiculo.dominio,
        chasis: vehiculo.chasis,
        marca: marca.nombre,
        modelo: modelo.nombre,
      })
      .from(orden)
      .innerJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .where(inArray(orden.id, ids))

    const entidades = [
      ...new Set(filas.flatMap((f) => [f.o.titularId, f.o.pagaId]).filter(Boolean)),
    ] as string[]
    const personas = entidades.length
      ? await tx
          .select({ id: entidadComercial.id, razonSocial: entidadComercial.razonSocial })
          .from(entidadComercial)
          .where(inArray(entidadComercial.id, entidades))
      : []
    const usuarios = [
      ...new Set(filas.flatMap((f) => [f.o.asesorId, f.o.mecanicoId]).filter(Boolean)),
    ] as string[]
    const gente = usuarios.length
      ? await tx
          .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
          .from(usuario)
          .where(inArray(usuario.id, usuarios))
      : []
    const totales = await tx
      .select({
        ordenId: ordenItem.ordenId,
        total: sql<string>`coalesce(sum(round(${ordenItem.cantidad} * ${ordenItem.precioUnitario}, 2)), 0)`,
      })
      .from(ordenItem)
      .where(inArray(ordenItem.ordenId, ids))
      .groupBy(ordenItem.ordenId)

    const persona = (id: string | null) => {
      const p = id ? personas.find((x) => x.id === id) : undefined
      return p ? { id: p.id, razonSocial: p.razonSocial } : null
    }
    const nombre = (id: string | null) => {
      const u = id ? gente.find((x) => x.id === id) : undefined
      return u ? `${u.nombre} ${u.apellido}`.trim() : ''
    }

    return ids
      .map((id) => filas.find((f) => f.o.id === id))
      .filter((f): f is (typeof filas)[number] => Boolean(f))
      .map((f) => ({
        id: f.o.id,
        numero: f.o.numero,
        estado: f.o.estado as EstadoOrden,
        vehiculo: {
          id: f.o.vehiculoId,
          dominio: f.dominio,
          chasis: f.chasis,
          marca: f.marca,
          modelo: f.modelo,
        },
        titular: persona(f.o.titularId),
        paga: persona(f.o.pagaId),
        pedido: f.o.pedido,
        asesor: nombre(f.o.asesorId),
        mecanico: f.o.mecanicoId ? { id: f.o.mecanicoId, nombre: nombre(f.o.mecanicoId) } : null,
        prometidaPara: f.o.prometidaPara,
        creadoEn: f.o.creadoEn.toISOString(),
        total: plata(totales.find((t) => t.ordenId === f.o.id)?.total ?? '0').toFixed(2),
      }))
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    id: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosDespues: Record<string, unknown>,
    ip?: string,
  ) {
    await tx.insert(auditoria).values({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: 'orden',
      registroId: id,
      accion,
      datosAntes: null,
      datosDespues,
      ip: ip ?? null,
    })
  }
}
