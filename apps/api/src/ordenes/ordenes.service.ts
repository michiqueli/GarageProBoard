import {
  type Carroceria,
  ESPERA_DEL_ESTADO,
  ESTADOS_CON_TRABAJO,
  type EstadoRevision,
  HOJA_DE,
  HOJA_POR_OMISION,
  MAXIMO_HORAS_SESION,
  plata,
  puedeSobre,
  type SeccionRevision,
  type TipoDanio,
  type TipoHoja,
  trabajoDePunto,
} from '@gpb/core'
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
  ajusteSesion,
  cliente,
  comprobante,
  type DanioRecepcion,
  empleado,
  empresa,
  entidadComercial,
  hojaImagen,
  type InventarioRecepcion,
  marca,
  modelo,
  orden,
  ordenItem,
  ordenPresupuesto,
  ordenSecuencia,
  pedidoRepuestos,
  type RevisionOrden,
  revisionPunto,
  sesionTrabajo,
  sucursal,
  tipoComprobante,
  titularidad,
  turno,
  usuario,
  vehiculo,
  vehiculoPendiente,
  visita,
} from '@gpb/db/schema'
import { generarPresupuestoPdf } from '@gpb/pdf'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { CorreoNoConfigurado, type ServicioCorreo } from '../comun/correo.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { generarCodigoQr } from '../comun/qr.ts'
import { CORREO } from '../comun/simbolos.ts'
import { cerrarSesionesDeLaOrden } from '../fichaje/tablero.ts'
import { moverDiferencia, porRepuesto, repuestosExisten } from '../repuestos/stock.ts'
import { enOrdenDeHoja, puntosDelTaller } from '../revision/revision.service.ts'
import {
  abrirEspera,
  cerrarEspera,
  esperaSegunEstado,
  esperasDe,
  estadoDelMotivo,
  motivosDelTaller,
} from './esperas.ts'
import { firmasDe } from './firmas.service.ts'
import { fotosDe } from './fotos.service.ts'

type Codigo =
  | 'NO_ENCONTRADA'
  | 'NO_ENCONTRADO'
  | 'ESTADO_INVALIDO'
  | 'VEHICULO_CON_ORDEN'
  | 'SIN_ITEMS'
  | 'REPUESTO_INVALIDO'
  | 'PRESUPUESTO_PENDIENTE'
  | 'ITEM_INVALIDO'
  | 'PUNTO_INVALIDO'
  | 'VISITA_INVALIDA'
  | 'MOTIVO_INVALIDO'
  | 'TIEMPO_INVALIDO'
  | 'CORREO_NO_CONFIGURADO'
  | 'CORREO_NO_ENVIADO'
  | 'SIN_AUTORIZACION'
  | 'KILOMETRAJE_MENOR'

/** Cómo sale el auto. Todo es opcional: un taller que no lo anota igual entrega. */
export interface EntradaEgreso {
  kilometraje?: number | null | undefined
  combustible?: string | null | undefined
  inventario?: InventarioRecepcion | undefined
  danios?: DanioEntrada[] | undefined
  sinFactura?: { motivo: string } | null | undefined
  /** La visita de quien vino a buscarlo, si se anotó: entregar la cierra. */
  visitaId?: string | null | undefined
}

/**
 * Traba la visita de la puerta antes de atarle una orden: si otra persona la agarró mientras
 * tanto, o ya terminó, no se ata. Una que nadie agarró, sí: se la atendió desde el escritorio.
 */
async function trabarVisita(
  tx: Db,
  sesion: Sesion,
  id: string,
): Promise<'libre' | 'no_existe' | 'invalida'> {
  const [v] = await tx
    .select({ cerradaEn: visita.cerradaEn, atendidaPor: visita.atendidaPor })
    .from(visita)
    .where(eq(visita.id, id))
    .for('update')
  if (!v) return 'no_existe'
  if (v.cerradaEn || (v.atendidaPor && v.atendidaPor !== sesion.usuarioId)) return 'invalida'
  return 'libre'
}

/** La cierra con su orden: `orden` al recibir el auto, `entrega` al llevárselo. */
async function cerrarVisita(
  tx: Db,
  sesion: Sesion,
  id: string,
  resultado: 'orden' | 'entrega',
  ordenId: string,
) {
  const ahora = new Date()
  const [cerrada] = await tx
    .update(visita)
    .set({
      resultado,
      ordenId,
      cerradaEn: ahora,
      // Si nadie la había agarrado —se atendió desde el escritorio—, la atendió quien la cierra.
      atendidaPor: sql`coalesce(${visita.atendidaPor}, ${sesion.usuarioId}::uuid)`,
      atendidaEn: sql`coalesce(${visita.atendidaEn}, now())`,
      actualizadoEn: ahora,
    })
    .where(eq(visita.id, id))
    .returning({ turnoId: visita.turnoId })
  return cerrada
}

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

/** «08:12», en la hora del taller: el servidor corre en UTC. */
const HORA_TALLER = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

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
  entregaEstimada?: string | null | undefined
  danios?: DanioEntrada[] | undefined
  inventario?: InventarioRecepcion | undefined
  carroceria?: Carroceria | null | undefined
}

interface DanioEntrada {
  tipo: TipoDanio
  x: number
  y: number
  nota?: string | null | undefined
}

/**
 * Las marcas como se guardan: en fracción del dibujo, con cuatro decimales.
 *
 * Cuatro alcanzan de sobra —sobre una imagen de mil píxeles son décimas de píxel— y evitan que
 * la posición de un dedo quede escrita con dieciséis dígitos que no significan nada.
 */
function marcas(danios: DanioEntrada[]): DanioRecepcion[] {
  const cortar = (n: number) => Math.round(n * 10_000) / 10_000
  return danios.map((d) => ({
    tipo: d.tipo,
    x: cortar(d.x),
    y: cortar(d.y),
    nota: d.nota || null,
  }))
}

/** Lo que se contesta de un punto. Sin `nota`, queda la que tenía; con `null`, se borra. */
export interface RespuestaEntrada {
  puntoId: string
  estado: EstadoRevision | null
  nota?: string | null | undefined
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
    estado: EstadoOrden | 'en_taller' | 'para_entregar' | 'todas'
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
            : filtro.estado === 'para_entregar'
              ? inArray(orden.estado, ['terminada', 'facturada'])
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
        .orderBy(desc(orden.creadoEn), desc(orden.numero))
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
    return this.datos.transaccion((tx) => this.detalle(tx, id))
  }

  // ── recepción ───────────────────────────────────────────────────────────────

  abrir(
    entrada: DatosRecepcion & {
      vehiculoId: string
      items: ItemEntrada[]
      revision?: RespuestaEntrada[] | undefined
      visitaId?: string | null | undefined
      pendienteIds?: string[] | undefined
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      // La visita se traba antes que nada: si otra tablet la agarró mientras ésta recibía el
      // auto, no se abre una orden que después no se puede atar a nadie.
      if (entrada.visitaId) {
        const traba = await trabarVisita(tx, sesion, entrada.visitaId)
        if (traba === 'no_existe') throw new ErrorOrdenes('NO_ENCONTRADO')
        if (traba === 'invalida') throw new ErrorOrdenes('VISITA_INVALIDA')
      }

      const [auto] = await tx
        .select({
          id: vehiculo.id,
          kilometraje: vehiculo.kilometraje,
          modeloId: vehiculo.modeloId,
        })
        .from(vehiculo)
        .where(eq(vehiculo.id, entrada.vehiculoId))
      if (!auto) throw new ErrorOrdenes('NO_ENCONTRADO')
      const hoja = await this.hojaDe(tx, auto.modeloId, entrada.carroceria)

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
      // Lo que quedó pendiente de la vez anterior y se suma a ésta: va como trabajo sin precio,
      // como lo que sale de la revisión, para presupuestarlo con el circuito de siempre.
      const idsPendientes = [...new Set(entrada.pendienteIds ?? [])]
      const pendientes = idsPendientes.length
        ? await tx
            .select()
            .from(vehiculoPendiente)
            .where(
              and(
                inArray(vehiculoPendiente.id, idsPendientes),
                eq(vehiculoPendiente.vehiculoId, auto.id),
                isNull(vehiculoPendiente.resueltoEn),
              ),
            )
            .for('update')
        : []
      if (pendientes.length !== idsPendientes.length) throw new ErrorOrdenes('NO_ENCONTRADO')
      const items: ItemEntrada[] = [
        ...entrada.items,
        ...pendientes.map((p) => ({
          tipo: 'trabajo' as const,
          descripcion: p.descripcion,
          cantidad: '1',
          precioUnitario: '0',
          codigoAlicuota: 5,
        })),
      ]

      const pagaId = entrada.pagaId ?? titular?.id ?? null
      await this.verificarReferencias(tx, pagaId)
      const { revision } = await this.contestar(tx, sesion, {}, entrada.revision ?? [])

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
          hojaTipo: hoja.hojaTipo,
          hojaImagenId: hoja.hojaImagenId,
          danios: marcas(entrada.danios ?? []),
          inventario: entrada.inventario ?? {},
          revision,
          entregaEstimada: entrada.entregaEstimada ?? null,
          asesorId: sesion.usuarioId,
        })
        .returning({ id: orden.id })
      if (!creada) throw new Error('No se pudo abrir la orden.')

      if (items.length) {
        await this.guardarItems(tx, sesion, creada.id, items)
        await moverDiferencia(tx, sesion, new Map(), porRepuesto(items), {
          sucursalId: sesion.sucursalId,
          tipo: 'orden',
          ordenId: creada.id,
        })
      }

      if (pendientes.length) {
        await tx
          .update(vehiculoPendiente)
          .set({
            resueltoEn: new Date(),
            resolucion: 'en_orden',
            resueltoOrdenId: creada.id,
            resueltoPor: sesion.usuarioId,
          })
          .where(inArray(vehiculoPendiente.id, idsPendientes))
      }

      // Los kilómetros de la recepción son el dato más fresco del auto.
      if (entrada.kilometraje != null && (auto.kilometraje ?? 0) < entrada.kilometraje) {
        await tx
          .update(vehiculo)
          .set({ kilometraje: entrada.kilometraje, actualizadoEn: new Date() })
          .where(eq(vehiculo.id, auto.id))
      }

      if (entrada.visitaId) {
        const ahora = new Date()
        const cerrada = await cerrarVisita(tx, sesion, entrada.visitaId, 'orden', creada.id)
        // El turno que se agendó con la patente sola queda con el auto que se recibió: si se
        // dio de alta recién, la agenda ya lo muestra con su marca y su modelo.
        if (cerrada?.turnoId) {
          await tx
            .update(turno)
            .set({ vehiculoId: auto.id, actualizadoEn: ahora })
            .where(and(eq(turno.id, cerrada.turnoId), isNull(turno.vehiculoId)))
        }
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
        await this.verificarReferencias(tx, entrada.pagaId ?? null)
        /**
         * El dibujo cambia sólo si alguien lo dice **y** manda las marcas de nuevo: las que ya
         * están son puntos del dibujo con el que se recibió, y cambiarlo solo las movería de
         * lugar. Ni siquiera alcanza con que el modelo haya aprendido su carrocería después, o
         * con que el taller haya subido una imagen nueva: la orden sigue como se firmó.
         */
        let hoja = { hojaTipo: o.hojaTipo as TipoHoja, hojaImagenId: o.hojaImagenId }
        if (entrada.danios && entrada.carroceria) {
          const [auto] = await tx
            .select({ modeloId: vehiculo.modeloId })
            .from(vehiculo)
            .where(eq(vehiculo.id, o.vehiculoId))
          hoja = await this.hojaDe(tx, auto?.modeloId ?? null, entrada.carroceria)
        }
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
            // Sin mandar, quedan como estaban: editar los datos de contacto no borra el dibujo.
            ...(entrada.danios ? { ...hoja, danios: marcas(entrada.danios) } : {}),
            ...(entrada.inventario ? { inventario: entrada.inventario } : {}),
            entregaEstimada: entrada.entregaEstimada ?? null,
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

  // ── revisión ────────────────────────────────────────────────────────────────

  /**
   * Contesta puntos de la revisión. Se puede mientras la orden no esté cerrada: la inspección
   * dinámica se completa después de la prueba de ruta, y a veces la orden ya está en caja.
   */
  revisar(id: string, respuestas: RespuestaEntrada[], ip?: string) {
    return this.conOrden(
      id,
      CERRADA,
      'Una orden facturada, entregada o anulada ya no se revisa.',
      async (tx, sesion, o) => {
        const { revision, cambiados } = await this.contestar(tx, sesion, o.revision, respuestas)
        if (!cambiados) return
        await tx.update(orden).set({ revision, actualizadoEn: new Date() }).where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, revision: cambiados },
          ip,
        )
      },
    )
  }

  /**
   * Lo que quedó en ámbar o en rojo, a la orden como trabajos **sin precio**: se completan y se
   * presupuestan con el circuito de siempre. Que un color agregue solo algo que se cobra es la
   * clase de automatismo que termina en una discusión en el mostrador; por eso es un botón, y
   * por eso se elige qué puntos.
   */
  pasarAPresupuesto(id: string, puntoIds: string[], ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Sólo se suman trabajos a una orden que está en el taller.',
      async (tx, sesion, o) => {
        const renglones = await tx
          .select({ id: ordenItem.id, orden: ordenItem.orden })
          .from(ordenItem)
          .where(eq(ordenItem.ordenId, id))
        const vivos = new Set(renglones.map((r) => r.id))
        const elegidos = [...new Set(puntoIds)].map((p) => [p, o.revision[p]] as const)
        const valen = elegidos.every(
          ([, r]) =>
            r && ESTADOS_CON_TRABAJO.includes(r.estado) && !(r.itemId && vivos.has(r.itemId)),
        )
        if (!valen) throw new ErrorOrdenes('PUNTO_INVALIDO')

        // Van al final, en el orden en que se eligieron.
        const ultimo = renglones.reduce((a, r) => Math.max(a, r.orden), 0)
        const revision: RevisionOrden = { ...o.revision }
        for (const [n, [puntoId, r]] of elegidos.entries()) {
          if (!r) continue
          const [creado] = await tx
            .insert(ordenItem)
            .values({
              tenantId: sesion.tenantId,
              ordenId: id,
              tipo: 'trabajo',
              orden: ultimo + n + 1,
              descripcion: trabajoDePunto(r.nombre, r.nota),
              cantidad: '1',
              precioUnitario: '0',
            })
            .returning({ id: ordenItem.id })
          if (!creado) throw new Error('No se pudo sumar el trabajo a la orden.')
          revision[puntoId] = { ...r, itemId: creado.id }
        }
        await tx.update(orden).set({ revision, actualizadoEn: new Date() }).where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, desdeRevision: elegidos.length },
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
            // Los códigos de las cajas vienen del depósito: la orden no los edita, los conserva.
            codigosBarras: (previo?.codigosBarras ?? []) as string[],
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
        await esperaSegunEstado(tx, sesion, id, estado)
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

  /**
   * Por qué está parado el auto. Si ya esperaba otra cosa, esa se cierra: un auto espera una cosa
   * por vez. Los motivos que tienen estado —repuestos, autorización del cliente— pasan la orden a
   * ese estado; los demás, si estaba en uno de ésos, la devuelven a en proceso.
   */
  ponerEnEspera(id: string, motivoId: string, nota: string | null, ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Sólo se pone en espera una orden que está en el taller.',
      async (tx, sesion, o) => {
        const motivos = await motivosDelTaller(tx, sesion)
        const motivo = motivos.find((m) => m.id === motivoId && m.activo)
        if (!motivo) throw new ErrorOrdenes('MOTIVO_INVALIDO')
        await abrirEspera(tx, sesion, id, motivo.id, nota)

        const estado =
          estadoDelMotivo(motivo.clave) ?? (o.estado in ESPERA_DEL_ESTADO ? 'en_proceso' : o.estado)
        if (estado !== o.estado) {
          await tx.update(orden).set({ estado, actualizadoEn: new Date() }).where(eq(orden.id, id))
        }
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: o.numero,
            estado,
            antes: o.estado,
            texto: `La puso en espera: ${motivo.nombre}${nota ? `, ${nota}` : ''}`,
          },
          ip,
        )
      },
    )
  }

  /** Lo que esperaba llegó: se cierra la espera, y si estaba esperando repuesto o autorización, vuelve a trabajo. */
  terminarEspera(id: string, ip?: string) {
    return this.conOrdenEn(
      id,
      EN_TALLER,
      'Sólo se termina la espera de una orden que está en el taller.',
      async (tx, sesion, o) => {
        if (!(await cerrarEspera(tx, sesion, id))) {
          throw new ErrorOrdenes('ESTADO_INVALIDO', { motivo: 'El auto no estaba esperando nada.' })
        }
        const estado = o.estado in ESPERA_DEL_ESTADO ? 'en_proceso' : o.estado
        if (estado !== o.estado) {
          await tx.update(orden).set({ estado, actualizadoEn: new Date() }).where(eq(orden.id, id))
        }
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado, antes: o.estado, texto: 'Terminó la espera' },
          ip,
        )
      },
    )
  }

  /**
   * Corrige una sesión de trabajo: la que se cerró sola a las 20:00, el mecánico que se olvidó
   * de fichar. Regla 3 del control de tiempos: **ninguna corrección sin auditoría, con motivo**.
   * La sesión se corrige en su lugar —es la que suman el tablero y la orden— y el antes y el
   * después quedan en `ajuste_sesion`. Una abierta se cierra acá.
   */
  corregirSesion(
    id: string,
    sesionId: string,
    entrada: { inicio: string; fin: string; motivo: string },
    ip?: string,
  ) {
    return this.conOrdenEn(
      id,
      [...EN_TALLER, 'terminada', 'facturada'],
      'Una orden entregada o anulada ya no se corrige: sus tiempos quedan como están.',
      async (tx, sesion, o) => {
        const [s] = await tx
          .select()
          .from(sesionTrabajo)
          .where(and(eq(sesionTrabajo.id, sesionId), eq(sesionTrabajo.ordenId, id)))
          .for('update')
        if (!s) throw new ErrorOrdenes('NO_ENCONTRADA')

        const inicio = new Date(entrada.inicio)
        const fin = new Date(entrada.fin)
        const invalido = (motivo: string) => new ErrorOrdenes('TIEMPO_INVALIDO', { motivo })
        if (fin <= inicio) throw invalido('El fin tiene que ser después del inicio.')
        // Un minuto de gracia: el reloj de la PC del jefe no es el del servidor.
        if (fin.getTime() > Date.now() + 60_000) {
          throw invalido('El fin no puede ser más tarde que ahora.')
        }
        if (inicio < o.creadoEn) {
          throw invalido(
            `El auto entró a las ${HORA_TALLER.format(o.creadoEn)}: no se pudo trabajar antes.`,
          )
        }
        if (fin.getTime() - inicio.getTime() > MAXIMO_HORAS_SESION * 3_600_000) {
          throw invalido(
            `Son más de ${MAXIMO_HORAS_SESION} horas seguidas. Si trabajó en dos turnos, que fiche dos veces.`,
          )
        }

        await tx
          .update(sesionTrabajo)
          .set({ inicio, fin, cerradaPor: 'jefe', nota: entrada.motivo })
          .where(eq(sesionTrabajo.id, sesionId))
        await tx.insert(ajusteSesion).values({
          tenantId: sesion.tenantId,
          sesionId,
          inicioAntes: s.inicio,
          finAntes: s.fin,
          inicioDespues: inicio,
          finDespues: fin,
          motivo: entrada.motivo,
          creadoPor: sesion.usuarioId,
        })

        const rango = (a: Date, b: Date | null) =>
          `${HORA_TALLER.format(a)}–${b ? HORA_TALLER.format(b) : 'abierta'}`
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: o.numero,
            texto: `Corrigió un tiempo: ${rango(s.inicio, s.fin)} pasó a ${rango(inicio, fin)}, porque ${entrada.motivo}`,
          },
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
        // Terminada ya no espera nada: lo que estuviera abierto se cierra acá.
        await esperaSegunEstado(tx, sesion, id, 'terminada')
        // El que se olvidó de pasar la credencial al terminar no puede quedar fichado toda la
        // noche: su reloj seguiría corriendo y la mano de obra de esta orden crecería sola.
        await cerrarSesionesDeLaOrden(tx, id)
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
        // Vuelve a **recibida** y no a en proceso: al reabrirla nadie empezó nada todavía, y
        // «en proceso» con nadie fichado adentro es lo que hace que el tablero deje de
        // creerse. La que la pasa a en proceso es la primera credencial que la escanee, igual
        // que con una orden nueva — así el ciclo cierra por el mismo lado.
        await tx
          .update(orden)
          .set({ estado: 'recibida', terminadaEn: null, actualizadoEn: new Date() })
          .where(eq(orden.id, id))
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          { numero: o.numero, estado: 'recibida', antes: 'terminada', reabierta: true },
          ip,
        )
      },
    )
  }

  /**
   * El egreso: el auto vuelve al cliente. Se anota cómo sale contra cómo entró, y lo que no se
   * hizo queda con el vehículo. Ver `docs/tecnicos/egreso.md`.
   *
   * Se entrega facturada. Terminada y sin factura, sólo si quien entrega puede autorizar
   * órdenes y dice por qué: una garantía que se factura después, un cliente de confianza.
   */
  entregar(id: string, entrada: EntradaEgreso = {}, ip?: string) {
    const { habilidades } = contextoDelPedido()
    return this.conOrdenEn(
      id,
      ['terminada', 'facturada'],
      'Se entrega una orden terminada: facturada, o con la autorización para entregarla sin factura.',
      async (tx, sesion, o) => {
        const sinFactura = o.estado === 'terminada' ? (entrada.sinFactura ?? null) : null
        if (o.estado === 'terminada') {
          if (!sinFactura) {
            throw new ErrorOrdenes('ESTADO_INVALIDO', {
              motivo:
                'Falta facturarla en caja. Si se entrega sin factura, tiene que autorizarlo alguien.',
            })
          }
          if (!habilidades.can('autorizar', 'Orden')) throw new ErrorOrdenes('SIN_AUTORIZACION')
        }
        if (
          entrada.kilometraje != null &&
          o.kilometraje != null &&
          entrada.kilometraje < o.kilometraje
        ) {
          throw new ErrorOrdenes('KILOMETRAJE_MENOR')
        }
        // Antes de tocar nada: una visita que tiene otro no se cierra, y la entrega no queda a
        // medias por eso.
        if (entrada.visitaId && (await trabarVisita(tx, sesion, entrada.visitaId)) !== 'libre') {
          throw new ErrorOrdenes('VISITA_INVALIDA')
        }

        // Lo que no se hizo queda con el vehículo: la próxima recepción lo ofrece de nuevo.
        const items = await tx.select().from(ordenItem).where(eq(ordenItem.ordenId, id))
        const noSeHizo = loQueNoSeHizo(o.revision, items)
        if (noSeHizo.length) {
          await tx.insert(vehiculoPendiente).values(
            noSeHizo.map((p) => ({
              tenantId: sesion.tenantId,
              vehiculoId: o.vehiculoId,
              ordenId: id,
              ...p,
            })),
          )
        }
        await tx
          .update(orden)
          .set({
            estado: 'entregada',
            entregadaEn: new Date(),
            entregadaPor: sesion.usuarioId,
            kilometrajeSalida: entrada.kilometraje ?? null,
            combustibleSalida: entrada.combustible ?? null,
            inventarioSalida: entrada.inventario ?? {},
            daniosEgreso: marcas(entrada.danios ?? []),
            sinFacturaAutorizadoPor: sinFactura ? sesion.usuarioId : null,
            sinFacturaMotivo: sinFactura?.motivo ?? null,
            actualizadoEn: new Date(),
          })
          .where(eq(orden.id, id))

        // Los kilómetros de salida son el dato más fresco del auto.
        if (entrada.kilometraje != null) {
          await tx
            .update(vehiculo)
            .set({ kilometraje: entrada.kilometraje, actualizadoEn: new Date() })
            .where(
              and(
                eq(vehiculo.id, o.vehiculoId),
                sql`coalesce(${vehiculo.kilometraje}, 0) < ${entrada.kilometraje}`,
              ),
            )
        }

        // El que vino a buscarlo y se anotó en la puerta: su visita termina con la entrega.
        if (entrada.visitaId) await cerrarVisita(tx, sesion, entrada.visitaId, 'entrega', id)

        const nuevos = entrada.danios?.length ?? 0
        await this.auditar(
          tx,
          sesion,
          id,
          'modificacion',
          {
            numero: o.numero,
            estado: 'entregada',
            antes: o.estado,
            texto: [
              'Lo entregó',
              sinFactura ? `sin factura: ${sinFactura.motivo}` : null,
              nuevos ? `con ${nuevos === 1 ? 'un daño nuevo' : `${nuevos} daños nuevos`}` : null,
            ]
              .filter(Boolean)
              .join(', '),
          },
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
        // Por el mismo motivo que al terminarla: nadie puede quedar fichado en una orden
        // anulada, ni seguir sumándole mano de obra a algo que no se va a cobrar.
        await cerrarSesionesDeLaOrden(tx, id)
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
        await esperaSegunEstado(tx, sesion, id, 'anulada')
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
        // Mandar el presupuesto es empezar a esperar al cliente.
        await esperaSegunEstado(tx, sesion, id, 'esperando_autorizacion')
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
          await esperaSegunEstado(tx, sesion, id, 'en_proceso')
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

  /**
   * Con qué dibujo se marca este auto.
   *
   * La carrocería es del modelo, así que el primero que recibe un vehículo de un modelo que no
   * la tiene se la enseña al catálogo, y de ahí en más entra sola. Se escribe **sólo si estaba
   * vacía**: igual que el fichaje con el mecánico, no pisa lo que alguien ya decidió. Por eso
   * también, cuando el modelo ya dice qué es, gana el modelo: corregirlo es cosa del catálogo,
   * no de una recepción suelta.
   */
  private async hojaDe(
    tx: Db,
    modeloId: string | null,
    elegida: Carroceria | null | undefined,
  ): Promise<{ hojaTipo: TipoHoja; hojaImagenId: string | null }> {
    let carroceria = elegida ?? null

    if (modeloId) {
      const [m] = await tx
        .select({ carroceria: modelo.carroceria })
        .from(modelo)
        .where(eq(modelo.id, modeloId))
      const guardada = (m?.carroceria as Carroceria | null | undefined) ?? null
      if (!guardada && elegida) {
        await tx
          .update(modelo)
          .set({ carroceria: elegida })
          .where(and(eq(modelo.id, modeloId), isNull(modelo.carroceria)))
      }
      carroceria = guardada ?? elegida ?? null
    }

    const hojaTipo = carroceria ? HOJA_DE[carroceria] : HOJA_POR_OMISION

    // Y cuál es el dibujo de hoy. Se guarda el id, no el tipo solo: si el taller sube otro
    // mañana, esta orden se sigue viendo con el que el cliente firmó. Sin propio, queda en
    // null y se usa el del sistema.
    const [imagen] = await tx
      .select({ id: hojaImagen.id })
      .from(hojaImagen)
      .where(and(eq(hojaImagen.tipo, hojaTipo), isNull(hojaImagen.reemplazadaEn)))
    return { hojaTipo, hojaImagenId: imagen?.id ?? null }
  }

  /**
   * Aplica respuestas sobre la revisión que había, y devuelve la nueva y cuántos puntos
   * cambiaron de verdad.
   *
   * Un punto que se contesta igual que estaba no se vuelve a firmar: quién lo revisó es quien lo
   * miró, no quien apretó guardar después. Y uno apagado se puede corregir si ya estaba
   * contestado, pero no contestar de nuevo: el taller dejó de revisarlo.
   */
  private async contestar(
    tx: Db,
    sesion: Sesion,
    actual: RevisionOrden,
    respuestas: RespuestaEntrada[],
  ): Promise<{ revision: RevisionOrden; cambiados: number }> {
    if (!respuestas.length) return { revision: actual, cambiados: 0 }
    const puntos = new Map((await puntosDelTaller(tx, sesion)).map((p) => [p.id, p]))
    const revision: RevisionOrden = { ...actual }
    const en = new Date().toISOString()
    let cambiados = 0

    for (const r of respuestas) {
      const punto = puntos.get(r.puntoId)
      const previa = revision[r.puntoId]
      if (!punto || (!punto.activo && !previa)) throw new ErrorOrdenes('PUNTO_INVALIDO')

      if (r.estado === null) {
        if (previa) {
          delete revision[r.puntoId]
          cambiados++
        }
        continue
      }
      const nota = r.nota === undefined ? (previa?.nota ?? null) : r.nota || null
      if (previa && previa.estado === r.estado && previa.nota === nota) continue
      revision[r.puntoId] = {
        estado: r.estado,
        nota,
        nombre: punto.nombre,
        seccion: punto.seccion as SeccionRevision,
        por: sesion.usuarioId,
        en,
        itemId: previa?.itemId ?? null,
      }
      cambiados++
    }
    return { revision, cambiados }
  }

  /**
   * La revisión entera de la orden: lo contestado, con el nombre que tenía el punto, y lo que el
   * taller revisa hoy sin contestar. Un punto apagado que nadie contestó no aparece: en esta
   * orden, no se revisaba.
   */
  private async revisionDe(tx: Db, o: typeof orden.$inferSelect, items: string[]) {
    const catalogo = await tx.select().from(revisionPunto)
    const contestados = o.revision
    const quienes = [...new Set(Object.values(contestados).map((r) => r.por))]
    const gente = quienes.length
      ? await tx
          .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
          .from(usuario)
          .where(inArray(usuario.id, quienes))
      : []
    const nombre = (id: string) => {
      const u = gente.find((g) => g.id === id)
      return u ? `${u.nombre} ${u.apellido}`.trim() : null
    }
    const vivos = new Set(items)

    const filas = catalogo
      .filter((p) => contestados[p.id] || p.activo)
      .map((p) => {
        const r = contestados[p.id]
        return { seccion: r?.seccion ?? (p.seccion as SeccionRevision), orden: p.orden, p, r }
      })
    return enOrdenDeHoja(filas).map(({ seccion, p, r }) => ({
      puntoId: p.id,
      seccion,
      nombre: r?.nombre ?? p.nombre,
      estado: r?.estado ?? null,
      nota: r?.nota ?? null,
      por: r ? nombre(r.por) : null,
      en: r?.en ?? null,
      itemId: r?.itemId && vivos.has(r.itemId) ? r.itemId : null,
    }))
  }

  private async verificarReferencias(tx: Db, pagaId: string | null) {
    if (pagaId) {
      const [c] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, pagaId))
      if (!c) throw new ErrorOrdenes('NO_ENCONTRADO')
    }
  }

  private async guardarItems(
    tx: Db,
    sesion: Sesion,
    ordenId: string,
    items: Array<
      ItemEntrada & {
        autorizacion?: Autorizacion | null
        presupuestoId?: string | null
        codigosBarras?: string[]
      }
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
        codigosBarras: i.codigosBarras ?? [],
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

    // Lo que el fichaje registró. La abierta cuenta lo que lleva hasta ahora: si contara cero
    // hasta cerrarse, la orden con alguien adentro figuraría sin una hora de trabajo.
    const fichadas = await tx
      .select({
        id: sesionTrabajo.id,
        inicio: sesionTrabajo.inicio,
        fin: sesionTrabajo.fin,
        cerradaPor: sesionTrabajo.cerradaPor,
        nota: sesionTrabajo.nota,
        legajo: empleado.legajo,
        nombre: entidadComercial.nombre,
        apellido: entidadComercial.apellido,
        razonSocial: entidadComercial.razonSocial,
      })
      .from(sesionTrabajo)
      .innerJoin(empleado, eq(empleado.id, sesionTrabajo.empleadoId))
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .where(eq(sesionTrabajo.ordenId, id))
      .orderBy(desc(sesionTrabajo.inicio))

    const ahora = Date.now()
    const sesiones = fichadas.map((f) => ({
      id: f.id,
      nombre: `${f.nombre ?? ''} ${f.apellido ?? ''}`.trim() || f.razonSocial,
      legajo: f.legajo,
      inicio: f.inicio.toISOString(),
      fin: f.fin?.toISOString() ?? null,
      minutos: Math.max(0, Math.round(((f.fin?.getTime() ?? ahora) - f.inicio.getTime()) / 60_000)),
      cerradaPor: f.cerradaPor as 'mecanico' | 'auto' | 'jefe' | null,
      motivoCorreccion: f.nota,
    }))
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
      danios: o.danios,
      inventario: o.inventario,
      noSeHizo: loQueNoSeHizo(o.revision, items),
      egreso: o.entregadaEn ? await egresoDe(tx, o) : null,
      revision: await this.revisionDe(
        tx,
        o,
        items.map((i) => i.id),
      ),
      hojaTipo: o.hojaTipo as TipoHoja,
      hojaImagenId: o.hojaImagenId,
      terminadaEn: o.terminadaEn?.toISOString() ?? null,
      firmas: await firmasDe(tx, o.id),
      fotos: await fotosDe(tx, o.id),
      esperas: await esperasDe(tx, o.id),
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
        codigosBarras: i.codigosBarras,
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
      sesiones,
      manoDeObraMin: sesiones.reduce((a, x) => a + x.minutos, 0),
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

    // El mecánico entra acá y no entre los usuarios: un empleado comparte el id con su
    // identidad fiscal, así que se resuelve con la misma consulta que el titular.
    const entidades = [
      ...new Set(filas.flatMap((f) => [f.o.titularId, f.o.pagaId, f.o.mecanicoId]).filter(Boolean)),
    ] as string[]
    const personas = entidades.length
      ? await tx
          .select({
            id: entidadComercial.id,
            razonSocial: entidadComercial.razonSocial,
            nombre: entidadComercial.nombre,
            apellido: entidadComercial.apellido,
          })
          .from(entidadComercial)
          .where(inArray(entidadComercial.id, entidades))
      : []
    const usuarios = [...new Set(filas.map((f) => f.o.asesorId).filter(Boolean))] as string[]
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
    /** «Jorge Pérez» y no «Pérez, Jorge»: es alguien con quien se habla, no un renglón fiscal. */
    const nombrePersona = (id: string) => {
      const p = personas.find((x) => x.id === id)
      if (!p) return ''
      return `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.razonSocial
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
        mecanico: f.o.mecanicoId
          ? { id: f.o.mecanicoId, nombre: nombrePersona(f.o.mecanicoId) }
          : null,
        entregaEstimada: f.o.entregaEstimada,
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

/**
 * Lo que se le recomendó al auto y no se hizo, como queda anotado al entregarlo: los renglones
 * que el cliente rechazó —con su color, si salieron de la revisión— y lo que quedó en ámbar o en
 * rojo en la revisión sin llegar a la orden.
 */
export function loQueNoSeHizo(
  revision: RevisionOrden,
  items: Array<{ id: string; descripcion: string; autorizacion: string | null }>,
): Array<{
  origen: 'presupuesto' | 'revision'
  descripcion: string
  semaforo: 'ambar' | 'rojo' | null
}> {
  const colorDe = new Map(
    Object.values(revision).flatMap((r) =>
      r.itemId && ESTADOS_CON_TRABAJO.includes(r.estado)
        ? [[r.itemId, r.estado as 'ambar' | 'rojo'] as const]
        : [],
    ),
  )
  const vivos = new Set(items.map((i) => i.id))
  const rechazados = items
    .filter((i) => i.autorizacion === 'rechazado')
    .map((i) => ({
      origen: 'presupuesto' as const,
      descripcion: i.descripcion,
      semaforo: colorDe.get(i.id) ?? null,
    }))
  const sinPasar = Object.values(revision)
    .filter((r) => ESTADOS_CON_TRABAJO.includes(r.estado) && !(r.itemId && vivos.has(r.itemId)))
    .map((r) => ({
      origen: 'revision' as const,
      descripcion: trabajoDePunto(r.nombre, r.nota),
      semaforo: r.estado as 'ambar' | 'rojo',
    }))
  return [...rechazados, ...sinPasar]
}

type Combustible = 'vacio' | 'cuarto' | 'medio' | 'tres_cuartos' | 'lleno'

/** Cómo salió el auto, con los nombres de quien lo entregó y de quien autorizó sin factura. */
async function egresoDe(tx: Db, o: typeof orden.$inferSelect) {
  const ids = [o.entregadaPor, o.sinFacturaAutorizadoPor].filter((x): x is string => Boolean(x))
  const personas = new Map(
    ids.length
      ? (
          await tx
            .select({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido })
            .from(usuario)
            .where(inArray(usuario.id, ids))
        ).map((u) => [u.id, `${u.nombre} ${u.apellido}`])
      : [],
  )
  return {
    entregadaPor: (o.entregadaPor && personas.get(o.entregadaPor)) || null,
    kilometraje: o.kilometrajeSalida,
    combustible: o.combustibleSalida as Combustible | null,
    inventario: o.inventarioSalida,
    danios: o.daniosEgreso,
    sinFactura:
      o.sinFacturaMotivo && o.sinFacturaAutorizadoPor
        ? {
            motivo: o.sinFacturaMotivo,
            autorizadoPor: personas.get(o.sinFacturaAutorizadoPor) ?? 'Alguien',
          }
        : null,
  }
}
