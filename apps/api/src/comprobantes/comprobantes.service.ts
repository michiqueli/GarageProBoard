import {
  armarComprobante,
  ComprobanteRechazado,
  type Contribuyente,
  type Credenciales,
  type Entorno,
  FacturacionNoDisponible,
  PadronNoDisponible,
  type ServicioFiscal,
  type SolicitudComprobante,
} from '@gpb/afip'
import { plata } from '@gpb/core'
import { and, asc, count, type Db, desc, eq, ilike, inArray, or, sql } from '@gpb/db'
import {
  auditoria,
  certificadoAfip,
  cliente,
  comprobante,
  comprobanteRenglon,
  condicionIva,
  empresa,
  entidadComercial,
  provincia,
  puntoVenta,
  reglaComprobante,
  tipoComprobante,
  usuario,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { contextoClave } from '../certificados/certificados.service.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { CajaFuerte } from '../comun/secretos.ts'
import { FISCAL } from '../comun/simbolos.ts'
import { ServicioConsultaPadron } from '../padron/padron.service.ts'

type Codigo =
  | 'NO_ENCONTRADO'
  | 'SIN_REGLA'
  | 'CUIT_INEXISTENTE'
  | 'CUIT_INACTIVO'
  | 'CONDICION_DESCONOCIDA'
  | 'PADRON_NO_DISPONIBLE'
  | 'PUNTO_VENTA_INVALIDO'
  | 'SIN_CERTIFICADO'
  | 'CERTIFICADO_VENCIDO'
  | 'SERIE_OCUPADA'
  | 'RECHAZADO'
  | 'AFIP_NO_RESPONDE'
  | 'SIN_CAE'
  | 'NUMERACION_DESFASADA'

export class ErrorComprobantes extends Error {
  constructor(
    readonly codigo: Codigo,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo)
  }
}

/**
 * Qué condiciones del receptor admite cada clase de comprobante (RG 5.616): la A sólo a
 * quien computa crédito fiscal. Es un segundo control sobre la tabla de reglas: si alguien
 * la toca mal, AFIP no llega a rechazar, lo frena esto. Tomado de ecoparrilla.
 */
const ADMITE: Record<string, readonly number[]> = {
  A: [1, 6, 13, 16],
  B: [4, 5, 6, 7, 8, 9, 10, 13, 15, 16],
  C: [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16],
}

const CONSUMIDOR_FINAL = 5
const DOC_CUIT = 80
const DOC_CUIL = 86
const DOC_DNI = 96
const DOC_SIN_IDENTIFICAR = 99
/** Lo que se tarda, como mucho, en saber de AFIP. Más que esto, un «emitiendo» es incierto. */
const EN_VUELO_MAXIMO_MS = 2 * 60 * 1000

export type ReceptorPedido =
  | { clienteId: string }
  | { cuit: string }
  | { consumidorFinal: { nombre?: string | null | undefined; dni?: string | null | undefined } }

export interface RenglonPedido {
  codigo?: string | null | undefined
  descripcion: string
  cantidad: string
  unidad: string
  precioUnitario: string
  bonificacionPorcentaje: string
  codigoAlicuota: number
}

export interface PedidoEmision {
  puntoVentaId: string
  receptor: ReceptorPedido
  concepto: 1 | 2 | 3
  servicio?: { desde: string; hasta: string; vencimientoPago: string } | null | undefined
  condicionVenta: string
  renglones: RenglonPedido[]
}

export function hoyEnArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    ahora,
  )
}

/** Cantidad × precio, menos la bonificación, a dos decimales. Con IVA. */
export function totalRenglon(
  r: Pick<RenglonPedido, 'cantidad' | 'precioUnitario' | 'bonificacionPorcentaje'>,
) {
  return plata(r.cantidad)
    .times(plata(r.precioUnitario))
    .times(plata('1').minus(plata(r.bonificacionPorcentaje).dividedBy(100)))
    .toDecimalPlaces(2)
    .toFixed(2)
}

function nombreCompleto(n: string, a: string) {
  return `${n} ${a}`.trim()
}

/** Qué índice único saltó, o `null` si el error es otro. */
function indiceDuplicado(error: unknown): string | null {
  let actual = error as { cause?: unknown; code?: string; constraint?: string } | undefined
  while (actual) {
    if (actual.code === '23505') return actual.constraint ?? ''
    actual = actual.cause as typeof actual
  }
  return null
}

interface Emisor {
  puntoVentaId: string
  puntoVenta: number
  sucursalId: string
  empresaId: string
  cuit: string
  condicionIva: number
  credenciales: Credenciales
  entorno: Entorno
}

/**
 * Facturación electrónica: emitir, verificar y consultar comprobantes.
 *
 * **Ninguna transacción queda abierta mientras AFIP contesta.** Se lee y valida en una,
 * se habla con AFIP, se reserva el número en otra, se pide el CAE, y se guarda el
 * resultado en una tercera. Lo que evita dos comprobantes en vuelo con el mismo punto de
 * venta no es un bloqueo: es un índice único sobre los que están `emitiendo` o
 * `incierto`. Ver `comprobante` en `packages/db`.
 *
 * El número se le pide a AFIP (el último autorizado más uno), no a una secuencia local:
 * un punto de venta puede estar compartido con otro sistema, y la única numeración que
 * vale es la de AFIP.
 */
@Injectable()
export class ServicioComprobantes {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(CajaFuerte) private readonly caja: CajaFuerte,
    @Inject(FISCAL) private readonly fiscal: (entorno: Entorno) => ServicioFiscal,
    @Inject(ServicioConsultaPadron) private readonly padron: ServicioConsultaPadron,
  ) {}

  // ── opciones y receptor ─────────────────────────────────────────────────────

  /** Los puntos de venta de facturación de la sucursal activa, con el estado del certificado. */
  opciones() {
    return this.datos.transaccion(async (tx, sesion) => {
      const filas = await tx
        .select({
          id: puntoVenta.id,
          numero: puntoVenta.numero,
          predeterminado: puntoVenta.predeterminado,
          empresaId: empresa.id,
          razonSocial: empresa.razonSocial,
          condicionIva: empresa.condicionIva,
        })
        .from(puntoVenta)
        .innerJoin(empresa, eq(empresa.id, puntoVenta.empresaId))
        .where(
          and(
            eq(puntoVenta.sucursalId, sesion.sucursalId),
            eq(puntoVenta.uso, 'facturacion'),
            eq(puntoVenta.activo, true),
          ),
        )
        .orderBy(desc(puntoVenta.predeterminado), asc(puntoVenta.numero))

      const certificados = filas.length
        ? await tx
            .select({
              empresaId: certificadoAfip.empresaId,
              vigenteHasta: certificadoAfip.vigenteHasta,
              entorno: certificadoAfip.entorno,
            })
            .from(certificadoAfip)
            .where(
              and(
                inArray(certificadoAfip.empresaId, [...new Set(filas.map((f) => f.empresaId))]),
                eq(certificadoAfip.estado, 'activo'),
              ),
            )
        : []

      return {
        puntosVenta: filas.map((f) => {
          const c = certificados.find((x) => x.empresaId === f.empresaId)
          return {
            id: f.id,
            numero: f.numero,
            predeterminado: f.predeterminado,
            empresa: { id: f.empresaId, razonSocial: f.razonSocial, condicionIva: f.condicionIva },
            certificado: !c
              ? ('falta' as const)
              : c.vigenteHasta && c.vigenteHasta > new Date()
                ? ('vigente' as const)
                : ('vencido' as const),
            entorno: (c?.entorno as Entorno | undefined) ?? null,
          }
        }),
      }
    })
  }

  /** La vista previa: lo mismo que resuelve la emisión, sin emitir. */
  async receptor(
    puntoVentaId: string,
    pedido: { clienteId?: string | undefined; cuit?: string | undefined },
  ) {
    const receptor: ReceptorPedido = pedido.clienteId
      ? { clienteId: pedido.clienteId }
      : pedido.cuit
        ? { cuit: pedido.cuit }
        : { consumidorFinal: {} }
    const {
      pv,
      cliente: guardado,
      reglas,
    } = await this.datos.transaccion(async (tx, sesion) => ({
      pv: await this.puntoDeVenta(tx, sesion, puntoVentaId),
      cliente: 'clienteId' in receptor ? await this.cliente(tx, receptor.clienteId) : null,
      reglas: await this.reglas(tx),
    }))
    return this.resolverReceptor(receptor, pv, guardado, reglas)
  }

  // ── emitir ──────────────────────────────────────────────────────────────────

  async emitir(pedido: PedidoEmision, ip?: string) {
    // 1. Validar y juntar lo necesario, en una transacción corta.
    const previo = await this.datos.transaccion(async (tx, sesion) => {
      const pv = await this.puntoDeVenta(tx, sesion, pedido.puntoVentaId)
      const emisor = await this.emisor(tx, pv)
      return {
        emisor,
        pv,
        cliente:
          'clienteId' in pedido.receptor ? await this.cliente(tx, pedido.receptor.clienteId) : null,
        reglas: await this.reglas(tx),
      }
    })

    // 2. A quién y qué letra: con CUIT, el padrón de hoy.
    const receptor = await this.resolverReceptor(
      pedido.receptor,
      previo.pv,
      previo.cliente,
      previo.reglas,
    )
    const { emisor } = previo

    // 3. Si hay uno en vuelo de esta serie, no se sigue: primero hay que saber qué pasó.
    await this.datos.transaccion(async (tx) => {
      const [enVuelo] = await tx
        .select({ id: comprobante.id })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.puntoVentaId, emisor.puntoVentaId),
            eq(comprobante.tipoComprobante, receptor.tipoComprobante),
            inArray(comprobante.estado, ['emitiendo', 'incierto']),
          ),
        )
      if (enVuelo) throw new ErrorComprobantes('SERIE_OCUPADA', { comprobanteId: enVuelo.id })
    })

    const afip = this.fiscal(emisor.entorno)
    const fecha = hoyEnArgentina()
    const renglones = pedido.renglones.map((r) => ({ ...r, total: totalRenglon(r) }))
    const armar = (numero: number): SolicitudComprobante =>
      armarComprobante({
        puntoVenta: emisor.puntoVenta,
        tipoComprobante: receptor.tipoComprobante,
        numero,
        fecha,
        concepto: pedido.concepto,
        tipoDocReceptor: receptor.tipoDocReceptor,
        numeroDocReceptor: receptor.numeroDocReceptor,
        condicionIvaReceptor: receptor.condicionIva,
        renglones: renglones.map((r) => ({ total: r.total, codigoAlicuota: r.codigoAlicuota })),
        servicio: pedido.concepto === 1 ? undefined : (pedido.servicio ?? undefined),
      })
    // Se arma una vez antes de pedir el número: un error de armado no gasta una consulta a AFIP.
    armar(1)

    // 4. El número, de AFIP.
    let numero: number
    try {
      numero =
        (await afip.ultimoAutorizado(
          emisor.credenciales,
          emisor.puntoVenta,
          receptor.tipoComprobante,
        )) + 1
    } catch (error) {
      if (error instanceof FacturacionNoDisponible)
        throw new ErrorComprobantes('AFIP_NO_RESPONDE', {})
      throw error
    }
    const solicitud = armar(numero)

    // 5. Reservarlo: desde acá, hasta saber qué pasó, nadie más emite en esta serie.
    const comprobanteId = await this.datos
      .transaccion(async (tx, sesion) => {
        const [creado] = await tx
          .insert(comprobante)
          .values({
            tenantId: sesion.tenantId,
            empresaId: emisor.empresaId,
            sucursalId: emisor.sucursalId,
            puntoVentaId: emisor.puntoVentaId,
            puntoVenta: emisor.puntoVenta,
            tipoComprobante: receptor.tipoComprobante,
            numero,
            fecha,
            concepto: pedido.concepto,
            servicioDesde: pedido.concepto === 1 ? null : (pedido.servicio?.desde ?? null),
            servicioHasta: pedido.concepto === 1 ? null : (pedido.servicio?.hasta ?? null),
            vencimientoPago:
              pedido.concepto === 1 ? null : (pedido.servicio?.vencimientoPago ?? null),
            clienteId: receptor.clienteId,
            tipoDocReceptor: receptor.tipoDocReceptor,
            numeroDocReceptor: receptor.numeroDocReceptor,
            receptorNombre: receptor.nombre,
            receptorCondicionIva: receptor.condicionIva,
            receptorDomicilio: receptor.domicilio,
            condicionVenta: pedido.condicionVenta,
            importeNeto: solicitud.importeNeto,
            importeIva: solicitud.importeIva,
            importeExento: solicitud.importeExento,
            importeTotal: solicitud.importeTotal,
            alicuotas: solicitud.alicuotas,
            estado: 'emitiendo',
            entorno: emisor.entorno,
            emitidoPor: sesion.usuarioId,
          })
          .returning({ id: comprobante.id })
          .catch((error: unknown) => {
            const indice = indiceDuplicado(error)
            // Otro puesto reservó en esta serie en el medio: se dice cuál, afuera de esta
            // transacción, que ya quedó abortada.
            if (indice === 'comprobante_en_vuelo_uq') throw new ErrorComprobantes('SERIE_OCUPADA')
            // AFIP informa como último un número que acá ya está autorizado: la numeración de
            // AFIP y la nuestra no coinciden, y emitir sería duplicar.
            if (indice === 'comprobante_numero_uq')
              throw new ErrorComprobantes('NUMERACION_DESFASADA', { numero })
            throw error
          })
        if (!creado) throw new Error('No se pudo reservar el comprobante.')
        await tx.insert(comprobanteRenglon).values(
          renglones.map((r, i) => ({
            tenantId: sesion.tenantId,
            comprobanteId: creado.id,
            orden: i + 1,
            codigo: r.codigo ?? null,
            descripcion: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            precioUnitario: r.precioUnitario,
            bonificacionPorcentaje: r.bonificacionPorcentaje,
            total: r.total,
            codigoAlicuota: r.codigoAlicuota,
          })),
        )
        return creado.id
      })
      .catch(async (error: unknown) => {
        if (error instanceof ErrorComprobantes && error.codigo === 'SERIE_OCUPADA') {
          const [enVuelo] = await this.datos.transaccion((tx) =>
            tx
              .select({ id: comprobante.id })
              .from(comprobante)
              .where(
                and(
                  eq(comprobante.puntoVentaId, emisor.puntoVentaId),
                  eq(comprobante.tipoComprobante, receptor.tipoComprobante),
                  inArray(comprobante.estado, ['emitiendo', 'incierto']),
                ),
              ),
          )
          if (enVuelo) throw new ErrorComprobantes('SERIE_OCUPADA', { comprobanteId: enVuelo.id })
          throw new ErrorComprobantes('AFIP_NO_RESPONDE', {})
        }
        throw error
      })

    // 6. El CAE.
    try {
      const autorizado = await afip.autorizar(emisor.credenciales, solicitud)
      return await this.datos.transaccion(async (tx, sesion) => {
        await tx
          .update(comprobante)
          .set({
            estado: 'autorizado',
            cae: autorizado.cae,
            vencimientoCae: autorizado.vencimientoCae,
            observaciones: autorizado.observaciones,
            respuestaAfip: autorizado.respuestaCruda,
            actualizadoEn: new Date(),
          })
          .where(eq(comprobante.id, comprobanteId))
        await this.auditar(tx, sesion, comprobanteId, receptor, solicitud, ip)
        return this.detalle(tx, comprobanteId)
      })
    } catch (error) {
      if (error instanceof ComprobanteRechazado) {
        await this.datos.transaccion((tx) =>
          tx
            .update(comprobante)
            .set({
              estado: 'rechazado',
              errores: error.errores,
              observaciones: error.observaciones,
              respuestaAfip: error.respuestaCruda,
              actualizadoEn: new Date(),
            })
            .where(eq(comprobante.id, comprobanteId)),
        )
        throw new ErrorComprobantes('RECHAZADO', {
          comprobanteId,
          errores: error.errores,
          observaciones: error.observaciones,
        })
      }
      // No contestó, o contestó algo que no se entiende: no se sabe si quedó emitido.
      await this.datos.transaccion((tx) =>
        tx
          .update(comprobante)
          .set({ estado: 'incierto', actualizadoEn: new Date() })
          .where(eq(comprobante.id, comprobanteId)),
      )
      throw new ErrorComprobantes('AFIP_NO_RESPONDE', { comprobanteId })
    }
  }

  /**
   * Resuelve un incierto preguntándole a AFIP. Si AFIP lo tiene, queda autorizado con su
   * CAE; si no, rechazado, y el número vuelve a estar libre. Un «emitiendo» viejo —el
   * proceso se cayó en el medio— se trata igual.
   */
  async verificar(id: string, ip?: string) {
    const previo = await this.datos.transaccion(async (tx, sesion) => {
      const [c] = await tx.select().from(comprobante).where(eq(comprobante.id, id))
      if (!c) throw new ErrorComprobantes('NO_ENCONTRADO')
      const pv = await this.puntoDeVenta(tx, sesion, c.puntoVentaId, false)
      return { c, emisor: await this.emisor(tx, pv, c.entorno as Entorno) }
    })
    const { c, emisor } = previo
    const pendiente =
      c.estado === 'incierto' ||
      (c.estado === 'emitiendo' && Date.now() - c.actualizadoEn.getTime() > EN_VUELO_MAXIMO_MS)
    if (!pendiente) return this.datos.transaccion((tx) => this.detalle(tx, id))

    let enAfip: Awaited<ReturnType<ServicioFiscal['consultarComprobante']>>
    try {
      enAfip = await this.fiscal(emisor.entorno).consultarComprobante(
        emisor.credenciales,
        c.puntoVenta,
        c.tipoComprobante,
        c.numero,
      )
    } catch {
      throw new ErrorComprobantes('AFIP_NO_RESPONDE', { comprobanteId: id })
    }

    return this.datos.transaccion(async (tx, sesion) => {
      if (enAfip && enAfip.importeTotal === Number(c.importeTotal).toFixed(2)) {
        await tx
          .update(comprobante)
          .set({
            estado: 'autorizado',
            cae: enAfip.cae,
            vencimientoCae: enAfip.vencimientoCae,
            actualizadoEn: new Date(),
          })
          .where(eq(comprobante.id, id))
        await tx.insert(auditoria).values({
          tenantId: sesion.tenantId,
          usuarioId: sesion.usuarioId,
          tabla: 'comprobante',
          registroId: id,
          accion: 'modificacion',
          datosAntes: { estado: c.estado },
          datosDespues: { estado: 'autorizado', verificado: true },
          ip: ip ?? null,
        })
      } else {
        // AFIP no lo tiene (o tiene otro con ese número, de otro sistema): éste no se emitió.
        await tx
          .update(comprobante)
          .set({
            estado: 'rechazado',
            errores: [
              {
                codigo: 0,
                mensaje: enAfip
                  ? 'AFIP tiene ese número con otro importe: lo emitió otro sistema.'
                  : 'AFIP no lo tiene: no quedó emitido.',
              },
            ],
            actualizadoEn: new Date(),
          })
          .where(eq(comprobante.id, id))
      }
      return this.detalle(tx, id)
    })
  }

  // ── consultar ───────────────────────────────────────────────────────────────

  listar(filtro: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado?: string | undefined
  }) {
    return this.datos.transaccion(async (tx) => {
      const condiciones = [
        filtro.estado ? eq(comprobante.estado, filtro.estado) : undefined,
        filtro.buscar
          ? or(
              ilike(comprobante.receptorNombre, `%${filtro.buscar}%`),
              ilike(
                comprobante.numeroDocReceptor,
                `%${filtro.buscar.replace(/\D/g, '') || filtro.buscar}%`,
              ),
              sql`${comprobante.numero}::text = ${filtro.buscar.replace(/^0+/, '')}`,
            )
          : undefined,
      ].filter(Boolean)
      const donde = condiciones.length ? and(...condiciones) : undefined

      const [total] = await tx.select({ n: count() }).from(comprobante).where(donde)
      const filas = await tx
        .select({
          id: comprobante.id,
          estado: comprobante.estado,
          tipoComprobante: comprobante.tipoComprobante,
          nombre: tipoComprobante.descripcion,
          letra: tipoComprobante.letra,
          puntoVenta: comprobante.puntoVenta,
          numero: comprobante.numero,
          fecha: comprobante.fecha,
          receptorNombre: comprobante.receptorNombre,
          importeTotal: comprobante.importeTotal,
          cae: comprobante.cae,
          entorno: comprobante.entorno,
        })
        .from(comprobante)
        .innerJoin(tipoComprobante, eq(tipoComprobante.codigo, comprobante.tipoComprobante))
        .where(donde)
        .orderBy(desc(comprobante.creadoEn))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina)

      return {
        total: total?.n ?? 0,
        datos: filas.map((f) => ({
          ...f,
          letra: f.letra ?? '',
          estado: f.estado as 'autorizado',
          entorno: f.entorno as Entorno,
        })),
      }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.detalle(tx, id))
  }

  /** Todo lo que hace falta para dibujar el PDF, sólo de un comprobante autorizado. */
  paraImprimir(id: string) {
    return this.datos.transaccion(async (tx) => {
      const d = await this.detalle(tx, id)
      if (d.estado !== 'autorizado' || !d.cae || !d.vencimientoCae) {
        throw new ErrorComprobantes('SIN_CAE')
      }
      const [e] = await tx
        .select({
          razonSocial: empresa.razonSocial,
          nombreFantasia: empresa.nombreFantasia,
          cuit: empresa.cuit,
          domicilio: empresa.domicilioFiscal,
          provincia: provincia.nombre,
          condicionIva: condicionIva.descripcion,
          numeroIibb: empresa.numeroIibb,
          inicioActividades: empresa.inicioActividades,
        })
        .from(empresa)
        .innerJoin(condicionIva, eq(condicionIva.codigo, empresa.condicionIva))
        .leftJoin(provincia, eq(provincia.codigo, empresa.provinciaCodigo))
        .where(eq(empresa.id, d.empresa.id))
      const [receptorCondicion] = await tx
        .select({ descripcion: condicionIva.descripcion })
        .from(condicionIva)
        .where(eq(condicionIva.codigo, d.receptorCondicionIva))
      if (!e) throw new ErrorComprobantes('NO_ENCONTRADO')
      return { comprobante: d, emisor: e, condicionReceptor: receptorCondicion?.descripcion ?? '' }
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private async puntoDeVenta(tx: Db, sesion: Sesion, id: string, deEstaSucursal = true) {
    const [pv] = await tx
      .select({
        id: puntoVenta.id,
        numero: puntoVenta.numero,
        uso: puntoVenta.uso,
        activo: puntoVenta.activo,
        sucursalId: puntoVenta.sucursalId,
        empresaId: empresa.id,
        cuit: empresa.cuit,
        condicionIva: empresa.condicionIva,
      })
      .from(puntoVenta)
      .innerJoin(empresa, eq(empresa.id, puntoVenta.empresaId))
      .where(eq(puntoVenta.id, id))
    if (!pv) throw new ErrorComprobantes('NO_ENCONTRADO')
    // Se factura desde la sucursal en la que se está: un puesto de Rafaela no emite con el
    // punto de venta de Casa Central.
    if (
      deEstaSucursal &&
      (pv.uso !== 'facturacion' || !pv.activo || pv.sucursalId !== sesion.sucursalId)
    ) {
      throw new ErrorComprobantes('PUNTO_VENTA_INVALIDO')
    }
    return pv
  }

  private async emisor(
    tx: Db,
    pv: Awaited<ReturnType<ServicioComprobantes['puntoDeVenta']>>,
    entornoDelComprobante?: Entorno,
  ): Promise<Emisor> {
    const [cert] = await tx
      .select()
      .from(certificadoAfip)
      .where(and(eq(certificadoAfip.empresaId, pv.empresaId), eq(certificadoAfip.estado, 'activo')))
    if (!cert?.certificado || !cert.entorno) throw new ErrorComprobantes('SIN_CERTIFICADO')
    // Al emitir se exige vigente. Al verificar uno viejo no: la consulta a AFIP igual sirve
    // mientras el certificado no esté vencido, y si lo está, falla ahí con su motivo.
    if (!entornoDelComprobante && cert.vigenteHasta && cert.vigenteHasta <= new Date()) {
      throw new ErrorComprobantes('CERTIFICADO_VENCIDO')
    }
    return {
      puntoVentaId: pv.id,
      puntoVenta: pv.numero,
      sucursalId: pv.sucursalId,
      empresaId: pv.empresaId,
      cuit: pv.cuit,
      condicionIva: pv.condicionIva,
      entorno: entornoDelComprobante ?? (cert.entorno as Entorno),
      credenciales: {
        cuit: pv.cuit,
        certificadoPem: cert.certificado,
        clavePrivadaPem: this.caja.descifrar(cert.clavePrivadaCifrada, contextoClave(pv.empresaId)),
      },
    }
  }

  private async cliente(tx: Db, id: string) {
    const [c] = await tx
      .select({
        id: entidadComercial.id,
        tipoDocumento: entidadComercial.tipoDocumento,
        numeroDocumento: entidadComercial.numeroDocumento,
        razonSocial: entidadComercial.razonSocial,
        condicionIva: entidadComercial.condicionIva,
        domicilio: entidadComercial.domicilio,
        localidad: entidadComercial.localidad,
        activo: cliente.activo,
      })
      .from(cliente)
      .innerJoin(entidadComercial, eq(entidadComercial.id, cliente.id))
      .where(eq(cliente.id, id))
    if (!c) throw new ErrorComprobantes('NO_ENCONTRADO')
    return c
  }

  private async reglas(tx: Db) {
    return tx
      .select({
        emisor: reglaComprobante.condicionEmisor,
        receptor: reglaComprobante.condicionReceptor,
        tipo: reglaComprobante.tipoComprobante,
        nombre: tipoComprobante.descripcion,
        letra: tipoComprobante.letra,
      })
      .from(reglaComprobante)
      .innerJoin(tipoComprobante, eq(tipoComprobante.codigo, reglaComprobante.tipoComprobante))
  }

  /**
   * A quién se le factura y con qué letra.
   *
   * - Consumidor final: sin consulta. Identificado con DNI si lo dio.
   * - Con CUIT, sea un cliente cargado o uno escrito en el momento: **el padrón de hoy**. Un
   *   CUIT inactivo no recibe factura con CUIT. Si el padrón no contesta, al cliente cargado
   *   se le usa la condición guardada, con aviso; a un CUIT suelto no se le puede facturar,
   *   porque no hay de dónde sacar la letra.
   */
  private async resolverReceptor(
    pedido: ReceptorPedido,
    pv: { empresaId: string; cuit: string; condicionIva: number },
    guardado: Awaited<ReturnType<ServicioComprobantes['cliente']>> | null,
    reglas: Awaited<ReturnType<ServicioComprobantes['reglas']>>,
  ) {
    const avisos: string[] = []
    let base: {
      clienteId: string | null
      tipoDocReceptor: number
      numeroDocReceptor: string
      nombre: string
      condicionIva: number
      domicilio: string | null
    }

    if ('consumidorFinal' in pedido) {
      const dni = pedido.consumidorFinal.dni?.trim()
      base = {
        clienteId: null,
        tipoDocReceptor: dni ? DOC_DNI : DOC_SIN_IDENTIFICAR,
        numeroDocReceptor: dni ?? '0',
        nombre: pedido.consumidorFinal.nombre?.trim() || 'Consumidor Final',
        condicionIva: CONSUMIDOR_FINAL,
        domicilio: null,
      }
    } else {
      const cuit = guardado ? guardado.numeroDocumento : (pedido as { cuit: string }).cuit
      const conCuit =
        !guardado || guardado.tipoDocumento === DOC_CUIT || guardado.tipoDocumento === DOC_CUIL

      if (cuit === pv.cuit) {
        throw new ErrorComprobantes('SIN_REGLA', {
          motivo: 'Una empresa no se factura a sí misma.',
        })
      }

      let contribuyente: Contribuyente | null | undefined
      if (conCuit) {
        try {
          contribuyente = await this.padron.consultar(cuit)
        } catch (error) {
          if (!(error instanceof PadronNoDisponible)) throw error
          if (!guardado) throw new ErrorComprobantes('PADRON_NO_DISPONIBLE')
          avisos.push(
            'El padrón de AFIP no contestó: se usa la condición frente al IVA guardada en la ficha del cliente.',
          )
        }
      }

      if (contribuyente === null) {
        if (!guardado) throw new ErrorComprobantes('CUIT_INEXISTENTE')
        avisos.push('AFIP no encuentra el documento del cliente: se usan los datos de su ficha.')
      }
      if (contribuyente && !contribuyente.activo) throw new ErrorComprobantes('CUIT_INACTIVO')

      let condicion = guardado?.condicionIva ?? null
      if (contribuyente) {
        if (contribuyente.tipoClave === 'CUIL') {
          // Una persona sin CUIT es consumidor final, identificado con su CUIL.
          condicion = CONSUMIDOR_FINAL
        } else if (contribuyente.condicionIva.codigo !== null) {
          condicion = contribuyente.condicionIva.codigo
          if (contribuyente.condicionIva.fuente === 'inferida')
            avisos.push(contribuyente.condicionIva.motivo)
          if (guardado && guardado.condicionIva !== condicion) {
            avisos.push(
              'La condición frente al IVA que informa AFIP no es la de la ficha del cliente: se factura con la de AFIP.',
            )
          }
        } else if (!guardado) {
          throw new ErrorComprobantes('CONDICION_DESCONOCIDA')
        }
      }
      if (condicion === null) throw new ErrorComprobantes('CONDICION_DESCONOCIDA')

      const domicilioPadron = contribuyente?.domicilio
        ? [contribuyente.domicilio.direccion, contribuyente.domicilio.localidad]
            .filter(Boolean)
            .join(', ')
        : null
      base = {
        clienteId: guardado?.id ?? null,
        tipoDocReceptor:
          guardado && !conCuit
            ? guardado.tipoDocumento
            : contribuyente?.tipoClave === 'CUIL'
              ? DOC_CUIL
              : DOC_CUIT,
        numeroDocReceptor: cuit,
        nombre: contribuyente?.razonSocial ?? guardado?.razonSocial ?? cuit,
        condicionIva: condicion,
        domicilio:
          domicilioPadron ||
          (guardado
            ? [guardado.domicilio, guardado.localidad].filter(Boolean).join(', ') || null
            : null),
      }
    }

    const regla = reglas.find(
      (r) => r.emisor === pv.condicionIva && r.receptor === base.condicionIva,
    )
    const letra = regla?.letra ?? ''
    if (!regla || !ADMITE[letra]?.includes(base.condicionIva))
      throw new ErrorComprobantes('SIN_REGLA')

    return {
      ...base,
      tipoComprobante: regla.tipo,
      letra,
      nombreComprobante: regla.nombre,
      avisos,
    }
  }

  private async detalle(tx: Db, id: string) {
    const [c] = await tx
      .select({
        c: comprobante,
        nombre: tipoComprobante.descripcion,
        letra: tipoComprobante.letra,
        razonSocial: empresa.razonSocial,
        cuit: empresa.cuit,
        autorNombre: usuario.nombre,
        autorApellido: usuario.apellido,
      })
      .from(comprobante)
      .innerJoin(tipoComprobante, eq(tipoComprobante.codigo, comprobante.tipoComprobante))
      .innerJoin(empresa, eq(empresa.id, comprobante.empresaId))
      .innerJoin(usuario, eq(usuario.id, comprobante.emitidoPor))
      .where(eq(comprobante.id, id))
    if (!c) throw new ErrorComprobantes('NO_ENCONTRADO')
    const renglones = await tx
      .select()
      .from(comprobanteRenglon)
      .where(eq(comprobanteRenglon.comprobanteId, id))
      .orderBy(asc(comprobanteRenglon.orden))

    const x = c.c
    return {
      id: x.id,
      estado: x.estado as 'autorizado' | 'emitiendo' | 'rechazado' | 'incierto',
      tipoComprobante: x.tipoComprobante,
      nombre: c.nombre,
      letra: c.letra ?? '',
      puntoVenta: x.puntoVenta,
      numero: x.numero,
      fecha: x.fecha,
      receptorNombre: x.receptorNombre,
      importeTotal: x.importeTotal,
      cae: x.cae,
      entorno: x.entorno as Entorno,
      empresa: { id: x.empresaId, razonSocial: c.razonSocial, cuit: c.cuit },
      concepto: x.concepto,
      servicio:
        x.servicioDesde && x.servicioHasta && x.vencimientoPago
          ? { desde: x.servicioDesde, hasta: x.servicioHasta, vencimientoPago: x.vencimientoPago }
          : null,
      clienteId: x.clienteId,
      tipoDocReceptor: x.tipoDocReceptor,
      numeroDocReceptor: x.numeroDocReceptor,
      receptorCondicionIva: x.receptorCondicionIva,
      receptorDomicilio: x.receptorDomicilio,
      condicionVenta: x.condicionVenta,
      importeNeto: x.importeNeto,
      importeIva: x.importeIva,
      importeExento: x.importeExento,
      alicuotas: x.alicuotas as Array<{
        codigoAlicuota: number
        baseImponible: string
        importe: string
      }>,
      vencimientoCae: x.vencimientoCae,
      observaciones: x.observaciones as Array<{ codigo: number; mensaje: string }>,
      errores: x.errores as Array<{ codigo: number; mensaje: string }>,
      renglones: renglones.map((r) => ({
        codigo: r.codigo,
        descripcion: r.descripcion,
        cantidad: r.cantidad,
        unidad: r.unidad,
        precioUnitario: r.precioUnitario,
        bonificacionPorcentaje: r.bonificacionPorcentaje,
        codigoAlicuota: r.codigoAlicuota as 3 | 4 | 5 | 6 | 8 | 9,
        total: r.total,
      })),
      emitidoPor: nombreCompleto(c.autorNombre, c.autorApellido),
      creadoEn: x.creadoEn.toISOString(),
    }
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    id: string,
    receptor: { nombre: string; nombreComprobante: string },
    solicitud: SolicitudComprobante,
    ip?: string,
  ) {
    await tx.insert(auditoria).values({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: 'comprobante',
      registroId: id,
      accion: 'alta',
      datosAntes: null,
      datosDespues: {
        comprobante: `${receptor.nombreComprobante} ${String(solicitud.puntoVenta).padStart(5, '0')}-${String(solicitud.numero).padStart(8, '0')}`,
        receptor: receptor.nombre,
        total: solicitud.importeTotal,
      },
      ip: ip ?? null,
    })
  }
}
