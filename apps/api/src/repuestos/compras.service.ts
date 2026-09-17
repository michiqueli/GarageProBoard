import { plata } from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, inArray, or, sql } from '@gpb/db'
import {
  compra,
  compraRenglon,
  entidadComercial,
  proveedor,
  repuesto,
  usuario,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { ErrorRepuestos } from './errores.ts'
import { cantidadLinda } from './repuestos.service.ts'
import { moverStock, repuestosExisten, siguienteNumero } from './stock.ts'

type EstadoCompra = 'pedida' | 'recibida' | 'anulada'

interface RenglonEntrada {
  repuestoId: string
  cantidad: string
  costoUnitario: string
}

interface Recepcion {
  comprobanteProveedor: string
  fechaComprobante?: string | null | undefined
}

type Compra = typeof compra.$inferSelect

/**
 * Compras a proveedores: lo que se pide y lo que llega. El stock entra recién al recibir,
 * con lo que llegó de verdad y a qué costo; ese costo pasa a ser el del repuesto.
 */
@Injectable()
export class ServicioCompras {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: EstadoCompra | 'todas'
  }) {
    return this.datos.transaccion(async (tx, sesion) => {
      const texto = filtro.buscar?.trim()
      const donde = and(
        eq(compra.sucursalId, sesion.sucursalId),
        filtro.estado === 'todas' ? undefined : eq(compra.estado, filtro.estado),
        texto
          ? or(
              sql`${compra.numero}::text = ${texto.replace(/^0+/, '')}`,
              ilike(entidadComercial.razonSocial, `%${texto}%`),
              ilike(compra.comprobanteProveedor, `%${texto}%`),
            )
          : undefined,
      )
      const [total] = await tx
        .select({ n: count() })
        .from(compra)
        .innerJoin(entidadComercial, eq(entidadComercial.id, compra.proveedorId))
        .where(donde)
      const filas = await tx
        .select({ id: compra.id })
        .from(compra)
        .innerJoin(entidadComercial, eq(entidadComercial.id, compra.proveedorId))
        .where(donde)
        .orderBy(desc(compra.creadoEn))
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

  crear(
    entrada: {
      proveedorId: string
      nota?: string | null | undefined
      renglones: RenglonEntrada[]
      recepcion?: Recepcion | null | undefined
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [p] = await tx
        .select({ id: proveedor.id })
        .from(proveedor)
        .where(and(eq(proveedor.id, entrada.proveedorId), eq(proveedor.activo, true)))
      if (!p) throw new ErrorRepuestos('REFERENCIA_INVALIDA')
      await this.verificarRepuestos(tx, entrada.renglones)

      const numero = await siguienteNumero(tx, sesion, 'compra')
      const [creada] = await tx
        .insert(compra)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: sesion.sucursalId,
          numero,
          proveedorId: entrada.proveedorId,
          nota: entrada.nota ?? null,
          creadoPor: sesion.usuarioId,
        })
        .returning()
      if (!creada) throw new Error('No se pudo cargar la compra.')
      await this.guardarRenglones(tx, sesion, creada.id, entrada.renglones)
      await this.auditar(
        tx,
        sesion,
        creada.id,
        'alta',
        {
          numero,
          texto: entrada.recepcion
            ? `La cargó ya recibida, con ${entrada.renglones.length} repuestos`
            : `Le pidió ${entrada.renglones.length} repuestos al proveedor`,
        },
        ip,
      )

      if (entrada.recepcion) {
        const renglones = await this.renglones(tx, creada.id)
        await this.recibirEn(
          tx,
          sesion,
          creada,
          entrada.recepcion,
          renglones.map((r) => ({
            id: r.id,
            cantidadRecibida: r.cantidad,
            costoUnitario: r.costoUnitario,
          })),
          ip,
        )
      }
      return this.detalle(tx, sesion, creada.id)
    })
  }

  editar(
    id: string,
    entrada: { nota?: string | null | undefined; renglones: RenglonEntrada[] },
    ip?: string,
  ) {
    return this.conCompra(
      id,
      ['pedida'],
      'Sólo se modifica una compra que no llegó.',
      async (tx, sesion, c) => {
        await this.verificarRepuestos(tx, entrada.renglones)
        await tx
          .update(compra)
          .set({ nota: entrada.nota ?? null, actualizadoEn: new Date() })
          .where(eq(compra.id, id))
        await tx.delete(compraRenglon).where(eq(compraRenglon.compraId, id))
        await this.guardarRenglones(tx, sesion, id, entrada.renglones)
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: c.numero,
            texto: `La modificó: quedaron ${entrada.renglones.length} repuestos`,
          },
          ip,
        )
      },
    )
  }

  recibir(
    id: string,
    entrada: Recepcion & {
      renglones: Array<{ id: string; cantidadRecibida: string; costoUnitario: string }>
    },
    ip?: string,
  ) {
    return this.conCompra(
      id,
      ['pedida'],
      'Esa compra ya se recibió o está anulada.',
      (tx, sesion, c) => this.recibirEn(tx, sesion, c, entrada, entrada.renglones, ip),
    )
  }

  anular(id: string, ip?: string) {
    return this.conCompra(
      id,
      ['pedida'],
      'Una compra recibida no se anula: lo que entró se corrige con un ajuste.',
      async (tx, sesion, c) => {
        await tx
          .update(compra)
          .set({ estado: 'anulada', actualizadoEn: new Date() })
          .where(eq(compra.id, id))
        await this.auditar(tx, sesion, id, 'baja', { numero: c.numero, texto: 'La anuló' }, ip)
      },
    )
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private async recibirEn(
    tx: Db,
    sesion: Sesion,
    c: Compra,
    recepcion: Recepcion,
    recibidos: Array<{ id: string; cantidadRecibida: string; costoUnitario: string }>,
    ip?: string,
  ) {
    const renglones = await this.renglones(tx, c.id)
    // Un renglón que no vino en la recepción no llegó.
    const deCada = new Map(recibidos.map((r) => [r.id, r]))
    if (recibidos.some((r) => !renglones.find((x) => x.id === r.id))) {
      throw new ErrorRepuestos('ESTADO_INVALIDO', {
        motivo: 'La recepción trae renglones que no son de esta compra.',
      })
    }
    if (
      !recibidos.some(
        (r) => plata(r.cantidadRecibida).isPositive() && !plata(r.cantidadRecibida).isZero(),
      )
    ) {
      throw new ErrorRepuestos('NADA_RECIBIDO')
    }

    let llegaron = 0
    for (const r of renglones) {
      const recibido = deCada.get(r.id)
      const cantidad = recibido?.cantidadRecibida ?? '0'
      const costo = recibido?.costoUnitario ?? r.costoUnitario
      await tx
        .update(compraRenglon)
        .set({ cantidadRecibida: cantidad, costoUnitario: costo })
        .where(eq(compraRenglon.id, r.id))
      if (plata(cantidad).isZero()) continue
      llegaron++
      await moverStock(tx, sesion, {
        repuestoId: r.repuestoId,
        sucursalId: c.sucursalId,
        cantidad,
        tipo: 'compra',
        costoUnitario: costo,
        compraId: c.id,
      })
      // El costo de reposición es el último que se pagó. Y si la pieza no tenía proveedor
      // habitual, ahora lo tiene.
      await tx
        .update(repuesto)
        .set({
          costo,
          proveedorId: sql`coalesce(${repuesto.proveedorId}, ${c.proveedorId}::uuid)`,
          actualizadoEn: new Date(),
        })
        .where(eq(repuesto.id, r.repuestoId))
    }

    await tx
      .update(compra)
      .set({
        estado: 'recibida',
        comprobanteProveedor: recepcion.comprobanteProveedor,
        fechaComprobante: recepcion.fechaComprobante ?? null,
        recibidaPor: sesion.usuarioId,
        recibidaEn: new Date(),
        actualizadoEn: new Date(),
      })
      .where(eq(compra.id, c.id))
    await this.auditar(
      tx,
      sesion,
      c.id,
      'modificacion',
      {
        numero: c.numero,
        texto: `La recibió con ${recepcion.comprobanteProveedor}: entraron ${llegaron} de ${renglones.length} repuestos`,
      },
      ip,
    )
  }

  private conCompra(
    id: string,
    permitidos: EstadoCompra[],
    motivo: string,
    hacer: (tx: Db, sesion: Sesion, c: Compra) => Promise<void>,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [c] = await tx.select().from(compra).where(eq(compra.id, id)).for('update')
      if (!c || c.sucursalId !== sesion.sucursalId) throw new ErrorRepuestos('NO_ENCONTRADA')
      if (!permitidos.includes(c.estado as EstadoCompra)) {
        throw new ErrorRepuestos('ESTADO_INVALIDO', { motivo })
      }
      await hacer(tx, sesion, c)
      return this.detalle(tx, sesion, id)
    })
  }

  private async verificarRepuestos(tx: Db, renglones: RenglonEntrada[]) {
    if (
      !(await repuestosExisten(
        tx,
        renglones.map((r) => r.repuestoId),
      ))
    ) {
      throw new ErrorRepuestos('REFERENCIA_INVALIDA')
    }
  }

  private renglones(tx: Db, id: string) {
    return tx
      .select()
      .from(compraRenglon)
      .where(eq(compraRenglon.compraId, id))
      .orderBy(asc(compraRenglon.orden))
  }

  private async guardarRenglones(
    tx: Db,
    sesion: Sesion,
    compraId: string,
    renglones: RenglonEntrada[],
  ) {
    await tx.insert(compraRenglon).values(
      renglones.map((r, n) => ({
        tenantId: sesion.tenantId,
        compraId,
        orden: n + 1,
        repuestoId: r.repuestoId,
        cantidad: r.cantidad,
        costoUnitario: r.costoUnitario,
      })),
    )
  }

  private async detalle(tx: Db, sesion: Sesion, id: string) {
    const [resumen] = await this.armar(tx, [id])
    const [c] = await tx.select().from(compra).where(eq(compra.id, id))
    if (!resumen || !c || c.sucursalId !== sesion.sucursalId)
      throw new ErrorRepuestos('NO_ENCONTRADA')
    const renglones = await tx
      .select({ r: compraRenglon, codigo: repuesto.codigo, descripcion: repuesto.descripcion })
      .from(compraRenglon)
      .innerJoin(repuesto, eq(repuesto.id, compraRenglon.repuestoId))
      .where(eq(compraRenglon.compraId, id))
      .orderBy(asc(compraRenglon.orden))
    const [recibio] = c.recibidaPor
      ? await tx
          .select({ nombre: sql<string>`${usuario.nombre} || ' ' || ${usuario.apellido}` })
          .from(usuario)
          .where(eq(usuario.id, c.recibidaPor))
      : []

    const { renglones: _n, ...base } = resumen
    return {
      ...base,
      fechaComprobante: c.fechaComprobante,
      nota: c.nota,
      recibidaPor: recibio?.nombre ?? null,
      renglones: renglones.map(({ r, codigo, descripcion }) => ({
        id: r.id,
        repuesto: { id: r.repuestoId, codigo, descripcion },
        cantidad: cantidadLinda(r.cantidad),
        costoUnitario: plata(r.costoUnitario).toFixed(2),
        cantidadRecibida: r.cantidadRecibida === null ? null : cantidadLinda(r.cantidadRecibida),
        total: plata(r.cantidadRecibida ?? r.cantidad)
          .times(plata(r.costoUnitario))
          .toDecimalPlaces(2)
          .toFixed(2),
      })),
    }
  }

  private async armar(tx: Db, ids: string[]) {
    if (!ids.length) return []
    const filas = await tx
      .select({
        c: compra,
        proveedor: entidadComercial.razonSocial,
        creadoPor: sql<string>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(compra)
      .innerJoin(entidadComercial, eq(entidadComercial.id, compra.proveedorId))
      .innerJoin(usuario, eq(usuario.id, compra.creadoPor))
      .where(inArray(compra.id, ids))
    const totales = await tx
      .select({
        id: compraRenglon.compraId,
        total: sql<string>`coalesce(sum(round(coalesce(${compraRenglon.cantidadRecibida}, ${compraRenglon.cantidad}) * ${compraRenglon.costoUnitario}, 2)), 0)`,
        n: count(),
      })
      .from(compraRenglon)
      .where(inArray(compraRenglon.compraId, ids))
      .groupBy(compraRenglon.compraId)

    return ids
      .map((id) => filas.find((f) => f.c.id === id))
      .filter((f): f is (typeof filas)[number] => Boolean(f))
      .map((f) => {
        const t = totales.find((x) => x.id === f.c.id)
        return {
          id: f.c.id,
          numero: f.c.numero,
          estado: f.c.estado as EstadoCompra,
          proveedor: { id: f.c.proveedorId, razonSocial: f.proveedor },
          comprobanteProveedor: f.c.comprobanteProveedor,
          creadoPor: f.creadoPor,
          creadoEn: f.c.creadoEn.toISOString(),
          recibidaEn: f.c.recibidaEn?.toISOString() ?? null,
          total: plata(t?.total ?? '0').toFixed(2),
          renglones: t?.n ?? 0,
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
      tabla: 'compra',
      registroId: id,
      accion,
      despues: datosDespues,
      ip,
    })
  }
}
