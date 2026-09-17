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
  cliente,
  comprobante,
  empresa,
  entidadComercial,
  marca,
  modelo,
  orden,
  ordenItem,
  ordenPresupuesto,
  ordenSecuencia,
  pedidoRepuestos,
  sucursal,
  tipoComprobante,
  titularidad,
  usuario,
  usuarioSucursal,
  vehiculo,
} from '@gpb/db/schema'
import { generarPresupuestoPdf } from '@gpb/pdf'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { CorreoNoConfigurado, type ServicioCorreo } from '../comun/correo.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { generarCodigoQr } from '../comun/qr.ts'
import { CORREO } from '../comun/simbolos.ts'
import { moverDiferencia, porRepuesto, repuestosExisten } from '../repuestos/stock.ts'

type Codigo =
  | 'NO_ENCONTRADA'
  | 'NO_ENCONTRADO'
  | 'ESTADO_INVALIDO'
  | 'VEHICULO_CON_ORDEN'
  | 'SIN_ITEMS'
  | 'REPUESTO_INVALIDO'
  | 'PRESUPUESTO_PENDIENTE'
  | 'ITEM_INVALIDO'
  | 'CORREO_NO_CONFIGURADO'
  | 'CORREO_NO_ENVIADO'

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
  autorizaNombre?: string | null | undefined
  autorizaTelefono?: string | null | undefined
  kilometraje?: number | null | undefined
  combustible?: string | null | undefined
  pedido: string
  observaciones?: string | null | undefined
  prometidaPara?: string | null | undefined
  mecanicoId?: string | null | undefined
}

export interface ItemEntrada {
  id?: string | null | undefined
  tipo: 'trabajo' | 'repuesto'
  repuestoId?: string | null | undefined
  codigo?: string | null | undefined
  descripcion: string
  cantidad: string
  precioUnitario: string
  codigoAlicuota: number
}

const totalItem = (i: { cantidad: string; precioUnitario: string }) =>
  plata(i.cantidad).times(plata(i.precioUnitario)).toDecimalPlaces(2)

type MedioAutorizacion = 'presencial' | 'telefono' | 'whatsapp' | 'mail'
type Autorizacion = 'pendiente' | 'autorizado' | 'rechazado'

/** Lo que el cliente rechazó no se cobra ni ocupa stock: para todo cálculo, no existe. */
const vigentes = <T extends { autorizacion?: string | null | undefined }>(items: T[]) =>
  items.filter((i) => i.autorizacion !== 'rechazado')

/** Un presupuesto vale una semana: después, los precios de los repuestos cambian. */
const DIAS_VALIDEZ = 7

/**
 * Órdenes de trabajo: la recepción, lo que se le hace al auto, y el paso a caja.
 *
 * Todo en la sucursal activa: el número es de la sucursal, y un asesor de Rafaela no abre
 * órdenes en Casa Central. El mecánico edita sólo las órdenes que tiene asignadas: la regla
 * con condición se evalúa acá, contra la orden, porque la guardia de la API no la tiene.
 */
@Injectable()
export class ServicioOrdenes {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(CORREO) private readonly correo: ServicioCorreo,
  ) {}

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
          autorizaNombre: entrada.autorizaNombre ?? null,
          autorizaTelefono: entrada.autorizaTelefono ?? null,
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

      if (entrada.items.length) {
        await this.guardarItems(tx, sesion, creada.id, entrada.items)
        await moverDiferencia(tx, sesion, new Map(), porRepuesto(entrada.items), {
          sucursalId: sesion.sucursalId,
          tipo: 'orden',
          ordenId: creada.id,
        })
      }

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
            autorizaNombre: entrada.autorizaNombre ?? null,
            autorizaTelefono: entrada.autorizaTelefono ?? null,
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
        const antes = await tx.select().from(ordenItem).where(eq(ordenItem.ordenId, id))
        const porId = new Map(antes.map((a) => [a.id, a]))
        // Lo que está en un presupuesto esperando respuesta es lo que se le dijo al cliente: no
        // cambia ni desaparece hasta que conteste.
        for (const a of antes.filter((x) => x.autorizacion === 'pendiente')) {
          const nuevo = items.find((i) => i.id === a.id)
          if (!nuevo || !mismoRenglon(a, nuevo)) throw new ErrorOrdenes('PRESUPUESTO_PENDIENTE')
        }
        const conEstado = items.map((i) => {
          const previo = i.id ? porId.get(i.id) : undefined
          return {
            ...i,
            id: previo?.id ?? null,
            autorizacion: (previo?.autorizacion ?? null) as Autorizacion | null,
            presupuestoId: previo?.presupuestoId ?? null,
          }
        })
        await tx.delete(ordenItem).where(eq(ordenItem.ordenId, id))
        if (conEstado.length) await this.guardarItems(tx, sesion, id, conEstado)
        // Sumar una pieza del catálogo la saca del depósito; sacarla la devuelve.
        await moverDiferencia(
          tx,
          sesion,
          porRepuesto(vigentes(antes)),
          porRepuesto(vigentes(conEstado)),
          {
            sucursalId: o.sucursalId,
            tipo: 'orden',
            ordenId: id,
          },
        )
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
        const [pendiente] = await tx
          .select({ id: ordenPresupuesto.id })
          .from(ordenPresupuesto)
          .where(and(eq(ordenPresupuesto.ordenId, id), eq(ordenPresupuesto.estado, 'pendiente')))
        if (pendiente) throw new ErrorOrdenes('PRESUPUESTO_PENDIENTE')
        const [n] = await tx
          .select({ n: count() })
          .from(ordenItem)
          .where(and(eq(ordenItem.ordenId, id), sinRechazar()))
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
        // Lo que no se va a cobrar vuelve al depósito.
        const cargados = await tx
          .select({ repuestoId: ordenItem.repuestoId, cantidad: ordenItem.cantidad })
          .from(ordenItem)
          .where(and(eq(ordenItem.ordenId, id), sinRechazar()))
        await moverDiferencia(tx, sesion, porRepuesto(cargados), new Map(), {
          sucursalId: o.sucursalId,
          tipo: 'orden',
          ordenId: id,
          motivo: 'Orden anulada',
        })
        // Lo que se le había pedido al mostrador para esta orden ya no hace falta. Los pedidos
        // abiertos no movieron stock; los entregados ya están en la orden y vuelven con ella.
        const abiertos = await tx
          .update(pedidoRepuestos)
          .set({ estado: 'anulado', actualizadoEn: new Date() })
          .where(and(eq(pedidoRepuestos.ordenId, id), eq(pedidoRepuestos.estado, 'abierto')))
          .returning({ id: pedidoRepuestos.id, numero: pedidoRepuestos.numero })
        if (abiertos.length) {
          await auditar(
            tx,
            sesion,
            abiertos.map((x) => ({
              tabla: 'pedido_repuestos' as const,
              registroId: x.id,
              accion: 'baja' as const,
              despues: {
                numero: x.numero,
                texto: `Lo anuló al anular la OT ${String(o.numero).padStart(6, '0')}`,
              },
              ip,
            })),
          )
        }
        await tx
          .update(orden)
          .set({ estado: 'anulada', actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(tx, sesion, id, 'baja', { numero: o.numero, antes: o.estado }, ip)
      },
    )
  }

  // ── presupuestos ────────────────────────────────────────────────────────────

  /**
   * Arma un presupuesto con renglones de la orden que no pasaron por uno. Quedan pendientes y
   * la orden espera autorización. Si hay a quién mandarlo, sale por mail después de guardarlo:
   * un mail que no sale no deshace el presupuesto.
   */
  async presupuestar(
    id: string,
    itemIds: string[],
    enviarA: string | null | undefined,
    ip?: string,
  ) {
    let presupuestoId = ''
    const detalle = await this.conOrdenEn(
      id,
      EN_TALLER,
      'Sólo se presupuesta una orden que está en el taller.',
      async (tx, sesion, o) => {
        const elegidos = await tx
          .select()
          .from(ordenItem)
          .where(and(eq(ordenItem.ordenId, id), inArray(ordenItem.id, [...new Set(itemIds)])))
        if (elegidos.length !== new Set(itemIds).size || elegidos.some((i) => i.autorizacion)) {
          throw new ErrorOrdenes('ITEM_INVALIDO')
        }
        const [ultimo] = await tx
          .select({ n: sql<number>`coalesce(max(${ordenPresupuesto.numero}), 0)::int` })
          .from(ordenPresupuesto)
          .where(eq(ordenPresupuesto.ordenId, id))
        const total = elegidos.reduce((a, i) => a.plus(totalItem(i)), plata('0'))
        const [creado] = await tx
          .insert(ordenPresupuesto)
          .values({
            tenantId: sesion.tenantId,
            ordenId: id,
            numero: (ultimo?.n ?? 0) + 1,
            total: total.toFixed(2),
            creadoPor: sesion.usuarioId,
          })
          .returning({ id: ordenPresupuesto.id, numero: ordenPresupuesto.numero })
        if (!creado) throw new Error('No se pudo armar el presupuesto.')
        presupuestoId = creado.id
        await tx
          .update(ordenItem)
          .set({ autorizacion: 'pendiente', presupuestoId: creado.id })
          .where(
            inArray(
              ordenItem.id,
              elegidos.map((i) => i.id),
            ),
          )
        await tx
          .update(orden)
          .set({ estado: 'esperando_autorizacion', actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: o.numero,
            presupuesto: creado.numero,
            total: total.toFixed(2),
            renglones: elegidos.length,
          },
          ip,
        )
      },
    )
    if (enviarA) return this.enviarPresupuesto(id, presupuestoId, enviarA, ip)
    return detalle
  }

  async enviarPresupuesto(id: string, presupuestoId: string, para: string, ip?: string) {
    const { bytes, nombre, datos } = await this.pdfPresupuesto(id, presupuestoId)
    try {
      await this.correo.enviar({
        para,
        asunto: `Presupuesto de la orden ${String(datos.ordenNumero).padStart(6, '0')} · ${datos.concesionaria}`,
        texto: [
          `Hola${datos.autoriza.nombre ? `, ${datos.autoriza.nombre}` : ''}:`,
          '',
          `Te mandamos el presupuesto para ${datos.vehiculo.marcaModelo ?? 'tu vehículo'}${datos.vehiculo.dominio ? ` ${datos.vehiculo.dominio}` : ''}, por $ ${Number(datos.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} con IVA.`,
          'Va adjunto en PDF, con el detalle de cada trabajo y repuesto.',
          'Contestanos qué autorizás y lo hacemos.',
          '',
          datos.concesionaria,
          [datos.sucursal.nombre, datos.sucursal.telefono].filter(Boolean).join(' · '),
        ].join('\n'),
        adjuntos: [{ nombre, contenido: bytes, tipo: 'application/pdf' }],
      })
    } catch (error) {
      if (error instanceof CorreoNoConfigurado) throw new ErrorOrdenes('CORREO_NO_CONFIGURADO')
      throw new ErrorOrdenes('CORREO_NO_ENVIADO')
    }
    return this.datos.transaccion(async (tx, sesion) => {
      await tx
        .update(ordenPresupuesto)
        .set({ enviadoA: para })
        .where(and(eq(ordenPresupuesto.id, presupuestoId), eq(ordenPresupuesto.ordenId, id)))
      await this.auditar(
        tx,
        sesion,
        id,
        'modificacion',
        { numero: datos.ordenNumero, presupuesto: datos.numero, enviadoA: para },
        ip,
      )
      return this.detalle(tx, id)
    })
  }

  /**
   * Lo que contestó el cliente. Lo autorizado se hace; el resto del presupuesto queda rechazado:
   * no se cobra y sus repuestos vuelven al depósito. Sin otro presupuesto pendiente, el auto
   * vuelve a trabajarse.
   */
  responderPresupuesto(
    id: string,
    presupuestoId: string,
    respuesta: {
      autorizados: string[]
      autorizaNombre: string
      medio: MedioAutorizacion
      nota?: string | null | undefined
    },
    ip?: string,
  ) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'La orden ya no está en el taller.',
      async (tx, sesion, o) => {
        const [presupuesto] = await tx
          .select()
          .from(ordenPresupuesto)
          .where(and(eq(ordenPresupuesto.id, presupuestoId), eq(ordenPresupuesto.ordenId, id)))
          .for('update')
        if (!presupuesto) throw new ErrorOrdenes('NO_ENCONTRADA')
        if (presupuesto.estado !== 'pendiente') {
          throw new ErrorOrdenes('ESTADO_INVALIDO', {
            motivo: 'Ese presupuesto ya tiene respuesta.',
          })
        }
        const renglones = await tx
          .select()
          .from(ordenItem)
          .where(eq(ordenItem.presupuestoId, presupuestoId))
        const si = new Set(respuesta.autorizados)
        if ([...si].some((x) => !renglones.some((r) => r.id === x))) {
          throw new ErrorOrdenes('ESTADO_INVALIDO', {
            motivo: 'Se autorizó un renglón que no es de ese presupuesto.',
          })
        }
        const rechazados = renglones.filter((r) => !si.has(r.id))
        if (si.size) {
          await tx
            .update(ordenItem)
            .set({ autorizacion: 'autorizado' })
            .where(inArray(ordenItem.id, [...si]))
        }
        if (rechazados.length) {
          await tx
            .update(ordenItem)
            .set({ autorizacion: 'rechazado' })
            .where(
              inArray(
                ordenItem.id,
                rechazados.map((r) => r.id),
              ),
            )
          await moverDiferencia(tx, sesion, porRepuesto(rechazados), new Map(), {
            sucursalId: o.sucursalId,
            tipo: 'orden',
            ordenId: id,
            motivo: `Rechazado en el presupuesto ${presupuesto.numero}`,
          })
        }
        await tx
          .update(ordenPresupuesto)
          .set({
            estado: 'respondido',
            autorizaNombre: respuesta.autorizaNombre,
            autorizaMedio: respuesta.medio,
            nota: respuesta.nota ?? null,
            respondidoPor: sesion.usuarioId,
            respondidoEn: new Date(),
          })
          .where(eq(ordenPresupuesto.id, presupuestoId))
        const [otro] = await tx
          .select({ id: ordenPresupuesto.id })
          .from(ordenPresupuesto)
          .where(and(eq(ordenPresupuesto.ordenId, id), eq(ordenPresupuesto.estado, 'pendiente')))
        if (!otro && o.estado === 'esperando_autorizacion') {
          await tx
            .update(orden)
            .set({ estado: 'en_proceso', actualizadoEn: new Date() })
            .where(eq(orden.id, id))
        }
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: o.numero,
            presupuesto: presupuesto.numero,
            autorizados: si.size,
            rechazados: rechazados.length,
            autoriza: respuesta.autorizaNombre,
            medio: respuesta.medio,
          },
          ip,
        )
      },
    )
  }

  /** El presupuesto en PDF, con lo que hace falta para mandarlo. */
  async pdfPresupuesto(id: string, presupuestoId: string) {
    const { orden: d, extra } = await this.paraImprimir(id)
    const p = d.presupuestos.find((x) => x.id === presupuestoId)
    if (!p) throw new ErrorOrdenes('NO_ENCONTRADA')
    const creado = new Date(p.creadoEn)
    const validoHasta = new Date(creado.getTime() + DIAS_VALIDEZ * 86_400_000)
    const datos = {
      concesionaria: extra.nombreFantasia ?? extra.razonSocial,
      sucursal: { nombre: extra.sucursal, domicilio: extra.domicilio, telefono: extra.telefono },
      ordenNumero: d.numero,
      numero: p.numero,
      fecha: horaArgentina(creado),
      vehiculo: {
        dominio: d.vehiculo.dominio,
        marcaModelo: [d.vehiculo.marca, d.vehiculo.modelo].filter(Boolean).join(' ') || null,
        chasis: d.vehiculo.chasis,
        kilometraje: d.kilometraje,
      },
      cliente: d.paga?.razonSocial ?? d.titular?.razonSocial ?? null,
      autoriza: {
        nombre: d.autorizaNombre ?? d.paga?.razonSocial ?? null,
        telefono: d.autorizaTelefono,
      },
      asesor: d.asesor,
      items: d.items
        .filter((i) => i.presupuestoId === p.id)
        .map((i) => ({
          tipo: i.tipo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          total: i.total,
        })),
      total: p.total,
      validoHasta: horaArgentina(validoHasta).slice(0, 10),
    }
    return {
      bytes: await generarPresupuestoPdf(datos),
      nombre: `Presupuesto-OT-${String(d.numero).padStart(6, '0')}-${p.numero}.pdf`,
      datos,
    }
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

  private async guardarItems(
    tx: Db,
    sesion: Sesion,
    ordenId: string,
    items: Array<
      ItemEntrada & { autorizacion?: Autorizacion | null; presupuestoId?: string | null }
    >,
  ) {
    const ids = items.map((i) => i.repuestoId).filter((x): x is string => Boolean(x))
    if (!(await repuestosExisten(tx, ids))) throw new ErrorOrdenes('REPUESTO_INVALIDO')
    await tx.insert(ordenItem).values(
      items.map((i, n) => ({
        // El renglón que ya existía conserva su id: el presupuesto lo sigue encontrando.
        ...(i.id ? { id: i.id } : {}),
        tenantId: sesion.tenantId,
        ordenId,
        autorizacion: i.autorizacion ?? null,
        presupuestoId: i.presupuestoId ?? null,
        tipo: i.tipo,
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
    const presupuestos = await tx
      .select({
        p: ordenPresupuesto,
        creadoPor: sql<string>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(ordenPresupuesto)
      .innerJoin(usuario, eq(usuario.id, ordenPresupuesto.creadoPor))
      .where(eq(ordenPresupuesto.ordenId, id))
      .orderBy(desc(ordenPresupuesto.numero))
    const [paga] = o.pagaId
      ? await tx
          .select({ email: entidadComercial.email })
          .from(entidadComercial)
          .where(eq(entidadComercial.id, o.pagaId))
      : []

    return {
      ...resumen,
      traeNombre: o.traeNombre,
      traeTelefono: o.traeTelefono,
      autorizaNombre: o.autorizaNombre,
      autorizaTelefono: o.autorizaTelefono,
      pagaEmail: paga?.email ?? null,
      kilometraje: o.kilometraje,
      combustible: o.combustible as 'vacio' | 'cuarto' | 'medio' | 'tres_cuartos' | 'lleno' | null,
      observaciones: o.observaciones,
      terminadaEn: o.terminadaEn?.toISOString() ?? null,
      entregadaEn: o.entregadaEn?.toISOString() ?? null,
      items: items.map((i) => ({
        id: i.id,
        tipo: i.tipo as 'trabajo' | 'repuesto',
        repuestoId: i.repuestoId,
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        codigoAlicuota: i.codigoAlicuota,
        total: totalItem(i).toFixed(2),
        autorizacion: i.autorizacion as Autorizacion | null,
        presupuestoId: i.presupuestoId,
      })),
      presupuestos: presupuestos.map(({ p, creadoPor }) => ({
        id: p.id,
        numero: p.numero,
        estado: p.estado as 'pendiente' | 'respondido',
        total: plata(p.total).toFixed(2),
        totalAutorizado:
          p.estado === 'respondido'
            ? items
                .filter((i) => i.presupuestoId === p.id && i.autorizacion === 'autorizado')
                .reduce((a, i) => a.plus(totalItem(i)), plata('0'))
                .toFixed(2)
            : null,
        enviadoA: p.enviadoA,
        creadoPor,
        creadoEn: p.creadoEn.toISOString(),
        autorizaNombre: p.autorizaNombre,
        autorizaMedio: p.autorizaMedio as MedioAutorizacion | null,
        nota: p.nota,
        respondidoEn: p.respondidoEn?.toISOString() ?? null,
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
      .where(and(inArray(ordenItem.ordenId, ids), sinRechazar()))
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
    await auditar(tx, sesion, { tabla: 'orden', registroId: id, accion, despues: datosDespues, ip })
  }
}

/** Los renglones que cuentan: todos menos los que el cliente rechazó. */
function sinRechazar() {
  return sql`${ordenItem.autorizacion} is distinct from 'rechazado'`
}

/** Si un renglón pendiente llegó igual: lo que se presupuestó no se cambia. */
function mismoRenglon(a: typeof ordenItem.$inferSelect, b: ItemEntrada) {
  return (
    a.tipo === b.tipo &&
    a.descripcion === b.descripcion &&
    (a.repuestoId ?? null) === (b.repuestoId ?? null) &&
    a.codigoAlicuota === b.codigoAlicuota &&
    plata(a.cantidad).eq(plata(b.cantidad)) &&
    plata(a.precioUnitario).eq(plata(b.precioUnitario))
  )
}

/** «2026-09-16T09:42», en la hora de Argentina. */
export function horaArgentina(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`
}
