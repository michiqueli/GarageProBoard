import { contrato } from '@gpb/contracts'
import {
  CATEGORIAS_GASTO_POR_OMISION,
  type MonedaUnidad,
  type TipoConceptoUnidad,
  totalesDeUnidad,
} from '@gpb/core'
import { and, asc, type Db, desc, eq, isNull, ne, sql } from '@gpb/db'
import {
  entidadComercial,
  proveedor,
  unidad,
  unidadCategoria,
  unidadConcepto,
} from '@gpb/db/schema'
import { Controller, Inject, Injectable, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import type { FastifyRequest } from 'fastify'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { Operacion } from '../comun/operacion.ts'

class ErrorCostos extends Error {
  constructor(readonly codigo: string) {
    super(codigo)
  }
}

/** Lo que costó una unidad. Un concepto no se modifica ni se borra: se anula, con motivo. */
@Injectable()
export class ServicioCostosUnidad {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  ver(id: string) {
    return this.datos.transaccion((tx) => this.armar(tx, id))
  }

  agregar(
    id: string,
    d: {
      tipo: TipoConceptoUnidad
      categoriaId?: string | null | undefined
      descripcion: string
      proveedorId?: string | null | undefined
      comprobante: string | null
      fecha?: string | null | undefined
      importe: string
      moneda: MonedaUnidad
      cotizacion?: string | null | undefined
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.existe(tx, id)
      if (d.categoriaId) {
        const [c] = await tx
          .select({ id: unidadCategoria.id })
          .from(unidadCategoria)
          .where(eq(unidadCategoria.id, d.categoriaId))
        if (!c) throw new ErrorCostos('DATO_INVALIDO')
      }
      if (d.proveedorId) {
        const [p] = await tx
          .select({ id: proveedor.id })
          .from(proveedor)
          .where(eq(proveedor.id, d.proveedorId))
        if (!p) throw new ErrorCostos('DATO_INVALIDO')
      }
      await tx.insert(unidadConcepto).values({
        tenantId: sesion.tenantId,
        unidadId: id,
        tipo: d.tipo,
        categoriaId: d.categoriaId ?? null,
        descripcion: d.descripcion,
        proveedorId: d.proveedorId ?? null,
        comprobante: d.comprobante,
        ...(d.fecha ? { fecha: d.fecha } : {}),
        importe: d.importe,
        moneda: d.moneda,
        cotizacion: d.cotizacion ?? null,
        creadoPor: sesion.usuarioId,
      })
      await this.anotar(
        tx,
        sesion,
        id,
        `Sumó ${d.tipo}: ${d.descripcion}, ${d.moneda} ${d.importe}`,
        ip,
      )
      return this.armar(tx, id)
    })
  }

  anular(id: string, conceptoId: string, motivo: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.existe(tx, id)
      const cerrados = await tx
        .update(unidadConcepto)
        .set({ anuladoEn: new Date(), anuladoPor: sesion.usuarioId, anulacionMotivo: motivo })
        .where(
          and(
            eq(unidadConcepto.id, conceptoId),
            eq(unidadConcepto.unidadId, id),
            isNull(unidadConcepto.anuladoEn),
          ),
        )
        .returning({ descripcion: unidadConcepto.descripcion })
      if (!cerrados.length) throw new ErrorCostos('YA_ANULADO')
      await this.anotar(tx, sesion, id, `Anuló ${cerrados[0]?.descripcion}: ${motivo}`, ip)
      return this.armar(tx, id)
    })
  }

  categorias() {
    return this.datos.transaccion(async (tx, sesion) => ({
      datos: await this.listarCategorias(tx, sesion),
    }))
  }

  crearCategoria(nombre: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.listarCategorias(tx, sesion)
      await this.sinRepetir(tx, nombre, null)
      await tx.insert(unidadCategoria).values({ tenantId: sesion.tenantId, nombre })
      return { datos: await this.listarCategorias(tx, sesion) }
    })
  }

  editarCategoria(id: string, nombre: string, activo: boolean) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.sinRepetir(tx, nombre, id)
      const cambiadas = await tx
        .update(unidadCategoria)
        .set({ nombre, activo, actualizadoEn: new Date() })
        .where(eq(unidadCategoria.id, id))
        .returning({ id: unidadCategoria.id })
      if (!cambiadas.length) throw new ErrorCostos('NO_ENCONTRADA')
      return { datos: await this.listarCategorias(tx, sesion) }
    })
  }

  private async listarCategorias(tx: Db, sesion: Sesion) {
    const consulta = () =>
      tx
        .select({
          id: unidadCategoria.id,
          nombre: unidadCategoria.nombre,
          activo: unidadCategoria.activo,
        })
        .from(unidadCategoria)
        .orderBy(asc(unidadCategoria.creadoEn), asc(unidadCategoria.nombre))
    const hay = await consulta()
    if (hay.length) return hay
    await tx
      .insert(unidadCategoria)
      .values(CATEGORIAS_GASTO_POR_OMISION.map((nombre) => ({ tenantId: sesion.tenantId, nombre })))
      .onConflictDoNothing()
    return consulta()
  }

  private async sinRepetir(tx: Db, nombre: string, propia: string | null) {
    const [otra] = await tx
      .select({ id: unidadCategoria.id })
      .from(unidadCategoria)
      .where(
        and(
          propia ? ne(unidadCategoria.id, propia) : undefined,
          sql`lower(${unidadCategoria.nombre}) = lower(${nombre})`,
        ),
      )
    if (otra) throw new ErrorCostos('REPETIDA')
  }

  private async existe(tx: Db, id: string) {
    const [u] = await tx.select({ id: unidad.id }).from(unidad).where(eq(unidad.id, id))
    if (!u) throw new ErrorCostos('NO_ENCONTRADA')
  }

  private anotar(tx: Db, sesion: Sesion, id: string, texto: string, ip?: string) {
    return auditar(tx, sesion, {
      tabla: 'unidad',
      registroId: id,
      accion: 'modificacion',
      despues: { texto },
      ip,
    })
  }

  private async armar(tx: Db, id: string) {
    const [u] = await tx
      .select({ precio: unidad.precio, moneda: unidad.moneda })
      .from(unidad)
      .where(eq(unidad.id, id))
    if (!u) throw new ErrorCostos('NO_ENCONTRADA')
    const moneda = u.moneda as MonedaUnidad
    const filas = await tx
      .select({
        c: unidadConcepto,
        categoria: unidadCategoria.nombre,
        proveedor: entidadComercial.razonSocial,
      })
      .from(unidadConcepto)
      .leftJoin(unidadCategoria, eq(unidadCategoria.id, unidadConcepto.categoriaId))
      .leftJoin(entidadComercial, eq(entidadComercial.id, unidadConcepto.proveedorId))
      .where(eq(unidadConcepto.unidadId, id))
      .orderBy(desc(unidadConcepto.fecha), desc(unidadConcepto.creadoEn))

    const conceptos = filas.map(({ c, categoria, proveedor: nombre }) => ({
      id: c.id,
      tipo: c.tipo as TipoConceptoUnidad,
      categoria,
      descripcion: c.descripcion,
      proveedor: nombre,
      comprobante: c.comprobante,
      fecha: c.fecha,
      importe: c.importe,
      moneda: c.moneda as MonedaUnidad,
      cotizacion: c.cotizacion,
      anulacionMotivo: c.anulacionMotivo,
    }))
    return {
      moneda,
      precio: u.precio,
      conceptos,
      totales: totalesDeUnidad(
        conceptos.filter((c) => !c.anulacionMotivo),
        moneda,
        u.precio,
      ),
    }
  }
}

const c = contrato.costosUnidad

function traducir(e: unknown, errors: object): never {
  if (e instanceof ErrorCostos) {
    const crear = (errors as Record<string, (() => Error) | undefined>)[e.codigo]
    if (crear) throw crear()
  }
  throw e
}

@Controller()
export class ControladorCostosUnidad {
  constructor(@Inject(ServicioCostosUnidad) private readonly servicio: ServicioCostosUnidad) {}

  @Operacion(c.ver)
  ver() {
    return implement(c.ver).handler(({ input, errors }) =>
      this.servicio.ver(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.agregar)
  agregar(@Req() pedido: FastifyRequest) {
    return implement(c.agregar).handler(({ input, errors }) =>
      this.servicio.agregar(input.id, input, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.anular)
  anular(@Req() pedido: FastifyRequest) {
    return implement(c.anular).handler(({ input, errors }) =>
      this.servicio
        .anular(input.id, input.conceptoId, input.motivo, pedido.ip)
        .catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.categorias)
  categorias() {
    return implement(c.categorias).handler(() => this.servicio.categorias())
  }

  @Operacion(c.crearCategoria)
  crearCategoria() {
    return implement(c.crearCategoria).handler(({ input, errors }) =>
      this.servicio.crearCategoria(input.nombre).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.editarCategoria)
  editarCategoria() {
    return implement(c.editarCategoria).handler(({ input, errors }) =>
      this.servicio
        .editarCategoria(input.id, input.nombre, input.activo)
        .catch((e) => traducir(e, errors)),
    )
  }
}
