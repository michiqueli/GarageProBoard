import { esCargaManual, TIPOS_QR } from '@gpb/core'
import { and, asc, type Db, eq, isNull, sql } from '@gpb/db'
import {
  credencial,
  empleado,
  empresa,
  entidadComercial,
  estacionFichaje,
  eventoEscaneo,
  jornada,
  marca,
  modelo,
  orden,
  sesionTrabajo,
  sucursal,
  vehiculo,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { verificarQr } from '../comun/qr.ts'
import { DatosDeLaEstacion, type Estacion } from './estacion.ts'
import { armarTablero } from './tablero.ts'

/**
 * El fichaje: lo que pasa cuando alguien apoya algo contra el lector.
 *
 * **Dos escaneos, tres segundos, sin login.** Las reglas y el porqué de cada una están en
 * `docs/tecnicos/taller-control-de-tiempos.md`. Las que se ven acá:
 *
 * - Los *timestamps los pone el servidor*, siempre: los relojes de las PC del taller están mal.
 * - *Todo escaneo se registra*, resuelva o falle. Es la respuesta a «yo fiché».
 * - La pantalla es *orden-agnóstica e idempotente*: si la orden estaba abierta para vos la
 *   cierra, si no la abre. No hay modos que recordar.
 * - El *fallback numérico* no es un caso raro: en un taller los QR se arruinan.
 */

/**
 * Un mecánico a la vez en una sola orden. Empezar otra cierra la anterior, que es lo que
 * realmente pasa cuando alguien deja un auto y agarra el siguiente.
 *
 * GarageTick lo tenía configurable por concesionaria (`unica | multiple`) porque cada jefe de
 * taller lo define distinto. Acá está fijo hasta que exista la pantalla de configuración del
 * módulo; cuando exista, esta constante es lo único que cambia.
 */
const CONCURRENCIA: 'unica' | 'multiple' = 'unica'

export interface Abierta {
  numero: number
  dominio: string | null
  vehiculo: string | null
  desde: string
  hace: string
}

export interface Respuesta {
  resultado: 'ok' | 'rechazado' | 'error'
  accion: 'entrada' | 'salida' | 'abrio' | 'cerro' | null
  titulo: string
  detalle: string
  esperandoOrden: boolean
  empleado: { nombre: string; legajo: string } | null
  orden: { numero: number; dominio: string | null } | null
  duracion: string | null
  abiertas: Abierta[]
  otros: string[]
}

const RECHAZO = (titulo: string, detalle = ''): Respuesta => ({
  resultado: 'rechazado',
  accion: null,
  titulo,
  detalle,
  esperandoOrden: false,
  empleado: null,
  orden: null,
  duracion: null,
  abiertas: [],
  otros: [],
})

/** «2 h 14 min», «41 min», «recién». Se lee de un vistazo y a dos metros. */
export function enPalabras(segundos: number): string {
  const minutos = Math.round(segundos / 60)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}

/** «08:12», en la hora de Argentina, que es la del taller. */
export function hora(fecha: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha)
}

/** El día laboral en Argentina: el taller abre y cierra el mismo día, no en UTC. */
export function diaArgentino(fecha = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha)
}

/** Las órdenes que todavía están en el taller: a las demás no se les ficha tiempo. */
const EN_TALLER = ['recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion']

interface Persona {
  id: string
  nombre: string
  legajo: string
}

@Injectable()
export class ServicioFichaje {
  constructor(@Inject(DatosDeLaEstacion) private readonly datos: DatosDeLaEstacion) {}

  estacion() {
    return this.datos.transaccion(async (tx, e) => {
      // La sucursal y la concesionaria son dos cosas: la pantalla del taller dice en qué boca
      // está, y de quién es el sistema. Poner la sucursal en los dos lados sería repetir.
      const [donde] = await tx
        .select({
          sucursal: sucursal.nombre,
          razonSocial: empresa.razonSocial,
          fantasia: empresa.nombreFantasia,
        })
        .from(sucursal)
        .innerJoin(empresa, eq(empresa.id, sucursal.empresaId))
        .where(eq(sucursal.id, e.sucursalId))
        .limit(1)
      return {
        id: e.id,
        nombre: e.nombre,
        tipo: e.tipo,
        sucursal: donde?.sucursal ?? null,
        concesionaria: donde?.fantasia ?? donde?.razonSocial ?? '',
      }
    })
  }

  /** El tablero para la pantalla del piso. La sucursal es la de la estación, no la de nadie. */
  tablero() {
    return this.datos.transaccion((tx, estacion) => armarTablero(tx, estacion.sucursalId))
  }

  /**
   * Un escaneo.
   *
   * Pase lo que pase, antes de devolver deja una fila en `evento_escaneo` con el texto crudo.
   * Es la regla 2, y la que parece de más hasta el día que un mecánico dice «yo fiché».
   */
  escanear(entrada: { codigo: string; pendiente?: string | undefined }) {
    const arranque = Date.now()
    return this.datos.transaccion(async (tx, estacion) => {
      // El cierre de fin de turno, acá y no en un trabajo a las 20:00.
      //
      // La regla 4 pide las dos cosas —el horario y ponerse al día al arrancar— porque si el
      // proceso se reinició antes de la hora, el trabajo no corrió nunca y a la mañana
      // siguiente hay sesiones de catorce horas. Un trabajo programado además tendría que
      // recorrer todas las concesionarias, y el rol de la aplicación no las ve: RLS lo limita
      // a la suya, que es exactamente lo que queremos.
      //
      // Colgado del primer escaneo del día, el efecto es el mismo y el costo es una consulta
      // por el índice parcial de sesiones abiertas.
      await cerrarSesionesDeAyer(tx, estacion.tenantId)

      let respuesta: Respuesta
      let tipoDetectado: string | null = null
      let empleadoId: string | null = null
      let ordenId: string | null = null

      try {
        const leido = await this.interpretar(tx, estacion, entrada)
        tipoDetectado = leido.tipo
        empleadoId = leido.empleadoId
        ordenId = leido.ordenId
        respuesta = leido.respuesta
      } catch (error) {
        respuesta = {
          ...RECHAZO('Algo falló', 'Probá de nuevo. Si sigue, avisale al jefe de taller.'),
          resultado: 'error',
        }
        // El error se registra igual abajo; que el escaneo no quede sin rastro es el punto.
        if (process.env.NODE_ENV !== 'test') console.error('fichaje', error)
      }

      await tx.insert(eventoEscaneo).values({
        tenantId: estacion.tenantId,
        estacionId: estacion.id,
        codigoCrudo: entrada.codigo,
        tipoDetectado,
        empleadoId,
        ordenId,
        resultado: respuesta.resultado,
        accion: respuesta.accion,
        mensaje: `${respuesta.titulo}${respuesta.detalle ? ` · ${respuesta.detalle}` : ''}`,
        latenciaMs: Date.now() - arranque,
      })

      await tx
        .update(estacionFichaje)
        .set({ ultimoVistoEn: new Date() })
        .where(eq(estacionFichaje.id, estacion.id))

      return respuesta
    })
  }

  // ── lo que decide qué era ese código ────────────────────────────────────────

  private async interpretar(
    tx: Db,
    estacion: Estacion,
    entrada: { codigo: string; pendiente?: string | undefined },
  ): Promise<{
    tipo: string | null
    empleadoId: string | null
    ordenId: string | null
    respuesta: Respuesta
  }> {
    // Fichan el taller y el reloj. El tótem, el llamador, el tablero y la tablet de recepción
    // tienen su token en un aparato a la vista de todos: con él no se le marca la jornada a nadie.
    if (estacion.tipo !== 'taller' && estacion.tipo !== 'reloj') {
      return {
        tipo: null,
        empleadoId: null,
        ordenId: null,
        respuesta: RECHAZO('Esta pantalla no ficha', 'Fichá en el reloj o en la PC del taller.'),
      }
    }

    const crudo = entrada.codigo.trim()
    const qr = verificarQr(crudo)

    // Una credencial: es siempre el primer escaneo, y en el reloj es el único.
    if (qr.valido && qr.tipo === TIPOS_QR.credencial) {
      return this.conCredencial(tx, estacion, await this.porCodigoCredencial(tx, qr.codigo), 'qr')
    }

    // Una orden: no significa nada sin saber quién la está escaneando.
    if (qr.valido && qr.tipo === TIPOS_QR.orden) {
      const persona = await this.personaPendiente(tx, entrada.pendiente)
      if (!persona) {
        return {
          tipo: 'orden',
          empleadoId: null,
          ordenId: null,
          respuesta: RECHAZO('Primero tu credencial', 'Pasá tu tarjeta y después la orden.'),
        }
      }
      return this.conOrden(tx, estacion, persona, { codigoQr: qr.codigo })
    }

    if (!qr.valido && qr.motivo === 'firma') {
      return {
        tipo: 'invalido',
        empleadoId: null,
        ordenId: null,
        respuesta: RECHAZO(
          'Ese código no es de acá',
          'La firma no coincide. Pedí una tarjeta nueva.',
        ),
      }
    }

    // La carga a mano: el legajo, o el número de orden si ya sabemos de quién es.
    if (esCargaManual(crudo)) {
      const persona = await this.personaPendiente(tx, entrada.pendiente)
      if (persona && estacion.tipo === 'taller') {
        const numero = Number(crudo.replace(/\D/g, ''))
        if (!numero) {
          return {
            tipo: 'manual',
            empleadoId: persona.id,
            ordenId: null,
            respuesta: RECHAZO('Ese número de orden no existe'),
          }
        }
        return this.conOrden(tx, estacion, persona, { numero })
      }
      return this.conCredencial(tx, estacion, await this.porLegajo(tx, crudo), 'tipeado')
    }

    return {
      tipo: null,
      empleadoId: null,
      ordenId: null,
      respuesta: RECHAZO('No reconozco ese código', 'Probá con tu credencial.'),
    }
  }

  /**
   * La credencial: marca la jornada y, en el taller, queda esperando la orden.
   *
   * `origen` existe sólo para el mensaje, y el mensaje importa: al que pasó una tarjeta hay
   * que decirle que puede estar revocada, y al que tipeó un número —o apoyó el código de
   * barras de un repuesto— hay que decirle que ese legajo no existe. Contestarle lo mismo a
   * los dos manda a uno de los dos a buscar el problema donde no está.
   */
  private async conCredencial(
    tx: Db,
    estacion: Estacion,
    persona: Persona | null,
    origen: 'qr' | 'tipeado',
  ) {
    if (!persona) {
      return {
        tipo: 'credencial' as const,
        empleadoId: null,
        ordenId: null,
        respuesta:
          origen === 'qr'
            ? RECHAZO('Credencial desconocida', 'Puede estar revocada. Avisale a RRHH.')
            : RECHAZO('No encontré ese legajo', 'Pasá tu credencial, o fijate el número.'),
      }
    }

    const marca = await this.marcarJornada(tx, estacion, persona.id)

    if (estacion.tipo === 'reloj') {
      return {
        tipo: 'credencial' as const,
        empleadoId: persona.id,
        ordenId: null,
        respuesta: {
          resultado: 'ok' as const,
          accion: marca.accion,
          titulo: persona.nombre,
          detalle: `${marca.accion === 'entrada' ? 'Entrada' : 'Salida'} ${marca.hora}`,
          esperandoOrden: false,
          empleado: { nombre: persona.nombre, legajo: persona.legajo },
          orden: null,
          duracion: null,
          abiertas: [],
          otros: [],
        },
      }
    }

    // En el taller la credencial es la mitad de la operación: falta la orden. Y va con lo que
    // tiene abierto, que es lo que hace que la pantalla enseñe sola: el que ve «OT 000006
    // abierta hace 2 h» entiende sin que nadie le explique que escanearla la cierra.
    const abiertas = await this.abiertasDe(tx, persona.id)

    return {
      tipo: 'credencial' as const,
      empleadoId: persona.id,
      ordenId: null,
      respuesta: {
        resultado: 'ok' as const,
        accion: null,
        titulo: persona.nombre,
        detalle: 'Ahora escaneá la orden',
        esperandoOrden: true,
        empleado: { nombre: persona.nombre, legajo: persona.legajo },
        orden: null,
        duracion: null,
        abiertas,
        otros: [],
      },
    }
  }

  /**
   * Las órdenes que esta persona tiene abiertas ahora mismo, con hace cuánto.
   *
   * Es lo que la pantalla le muestra después del primer escaneo. Ojo con el texto que la
   * acompaña: escanear la OT **frena su reloj, no da la orden por terminada** — quién declara
   * terminada una orden es una decisión del taller, no del que dejó de trabajar en ella.
   */
  private async abiertasDe(tx: Db, empleadoId: string): Promise<Abierta[]> {
    const ahora = Date.now()
    const filas = await tx
      .select({
        numero: orden.numero,
        dominio: vehiculo.dominio,
        marca: marca.nombre,
        modelo: modelo.nombre,
        inicio: sesionTrabajo.inicio,
      })
      .from(sesionTrabajo)
      .innerJoin(orden, eq(orden.id, sesionTrabajo.ordenId))
      .leftJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .where(and(eq(sesionTrabajo.empleadoId, empleadoId), isNull(sesionTrabajo.fin)))
      .orderBy(asc(sesionTrabajo.inicio))

    return filas.map((f) => ({
      numero: f.numero,
      dominio: f.dominio,
      vehiculo: [f.marca, f.modelo].filter(Boolean).join(' ') || null,
      desde: f.inicio.toISOString(),
      hace: enPalabras((ahora - f.inicio.getTime()) / 1000),
    }))
  }

  /** La orden: abre o cierra la sesión de trabajo de esa persona en esa orden. */
  private async conOrden(
    tx: Db,
    estacion: Estacion,
    persona: Persona,
    busca: { codigoQr?: string; numero?: number },
  ) {
    const [ot] = await tx
      .select({
        id: orden.id,
        numero: orden.numero,
        estado: orden.estado,
        sucursalId: orden.sucursalId,
        mecanicoId: orden.mecanicoId,
        dominio: vehiculo.dominio,
      })
      .from(orden)
      .leftJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
      .where(
        busca.codigoQr
          ? eq(orden.codigoQr, busca.codigoQr)
          : and(eq(orden.numero, busca.numero ?? 0), eq(orden.sucursalId, estacion.sucursalId)),
      )
      .limit(1)

    if (!ot) {
      return {
        tipo: 'orden' as const,
        empleadoId: persona.id,
        ordenId: null,
        respuesta: RECHAZO('Esa orden no existe', `${persona.nombre}, fijate el número.`),
      }
    }
    if (!EN_TALLER.includes(ot.estado)) {
      return {
        tipo: 'orden' as const,
        empleadoId: persona.id,
        ordenId: ot.id,
        respuesta: RECHAZO(
          `La OT ${numeroDeOrden(ot.numero)} ya no está en el taller`,
          'No se le puede fichar tiempo.',
        ),
      }
    }

    const [abierta] = await tx
      .select({ id: sesionTrabajo.id, inicio: sesionTrabajo.inicio })
      .from(sesionTrabajo)
      .where(
        and(
          eq(sesionTrabajo.empleadoId, persona.id),
          eq(sesionTrabajo.ordenId, ot.id),
          isNull(sesionTrabajo.fin),
        ),
      )
      .limit(1)

    const ahora = new Date()
    const datosOrden = { numero: ot.numero, dominio: ot.dominio }

    // Estaba abierta para esta persona: se cierra. Es la mitad idempotente de la regla 7.
    if (abierta) {
      await tx
        .update(sesionTrabajo)
        .set({ fin: ahora, cerradaPor: 'mecanico', estacionFinId: estacion.id })
        .where(eq(sesionTrabajo.id, abierta.id))
      const duracion = enPalabras((ahora.getTime() - abierta.inicio.getTime()) / 1000)
      return {
        tipo: 'orden' as const,
        empleadoId: persona.id,
        ordenId: ot.id,
        respuesta: {
          resultado: 'ok' as const,
          accion: 'cerro' as const,
          // «Terminaste» y no el nombre: al que está parado ahí no hay que decirle quién es
          // —eso ya lo vio en el paso 1— sino qué acaba de pasar. Y «terminaste» es lo que
          // hizo él: frenó su reloj. Que la orden esté terminada lo decide el taller, no el
          // que dejó de trabajar en ella.
          titulo: 'Terminaste',
          detalle: `OT ${numeroDeOrden(ot.numero)} · ${duracion} trabajadas`,
          esperandoOrden: false,
          empleado: { nombre: persona.nombre, legajo: persona.legajo },
          orden: datosOrden,
          duracion,
          abiertas: [],
          otros: [],
        },
      }
    }

    // Con concurrencia única, empezar otra cierra la que tenía: es lo que pasa de verdad
    // cuando alguien deja un auto y agarra el siguiente. La cierra él, no el sistema, así
    // que va como `mecanico` y no como el cierre automático de fin de turno.
    let dejo: number | null = null
    if (CONCURRENCIA === 'unica') {
      const [otra] = await tx
        .select({ id: sesionTrabajo.id, numero: orden.numero })
        .from(sesionTrabajo)
        .innerJoin(orden, eq(orden.id, sesionTrabajo.ordenId))
        .where(and(eq(sesionTrabajo.empleadoId, persona.id), isNull(sesionTrabajo.fin)))
        .limit(1)
      if (otra) {
        await tx
          .update(sesionTrabajo)
          .set({ fin: ahora, cerradaPor: 'mecanico', estacionFinId: estacion.id })
          .where(eq(sesionTrabajo.id, otra.id))
        dejo = otra.numero
      }
    }

    // Quiénes más están en ese auto. Pasa poco —la concurrencia única es por mecánico, no por
    // orden— y justamente por eso hay que avisarlo: si dos están en el mismo auto sin saberlo,
    // los dos relojes corren y la mano de obra sale al doble.
    const otros = (
      await tx
        .select({
          nombre: entidadComercial.nombre,
          apellido: entidadComercial.apellido,
          razonSocial: entidadComercial.razonSocial,
        })
        .from(sesionTrabajo)
        .innerJoin(empleado, eq(empleado.id, sesionTrabajo.empleadoId))
        .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
        .where(and(eq(sesionTrabajo.ordenId, ot.id), isNull(sesionTrabajo.fin)))
    ).map((o) => `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim() || o.razonSocial)

    await tx.insert(sesionTrabajo).values({
      tenantId: estacion.tenantId,
      ordenId: ot.id,
      empleadoId: persona.id,
      inicio: ahora,
      estacionInicioId: estacion.id,
    })

    // Una orden recibida que alguien empieza a trabajar pasa a en proceso. El estado de la
    // orden y las sesiones son cosas distintas —y por eso no se tocan entre sí en general—
    // pero «recibida» con un mecánico fichado adentro sería mentira en el tablero.
    if (ot.estado === 'recibida') {
      await tx.update(orden).set({ estado: 'en_proceso' }).where(eq(orden.id, ot.id))
    }

    // Si no tenía mecánico asignado, queda el que la agarró. **Sólo si estaba vacío**: el
    // asignado es una decisión de recepción o del jefe de taller, y el fichaje no la pisa. Que
    // trabaje uno distinto del asignado es normal —y lo cuentan los tiempos—; lo que no tiene
    // sentido es una orden con horas trabajadas y nadie a cargo.
    if (!ot.mecanicoId) {
      await tx.update(orden).set({ mecanicoId: persona.id }).where(eq(orden.id, ot.id))
    }

    return {
      tipo: 'orden' as const,
      empleadoId: persona.id,
      ordenId: ot.id,
      respuesta: {
        resultado: 'ok' as const,
        accion: 'abrio' as const,
        titulo: 'Empezaste',
        detalle: dejo
          ? `OT ${numeroDeOrden(ot.numero)} · dejaste la ${numeroDeOrden(dejo)}`
          : `OT ${numeroDeOrden(ot.numero)}${ot.dominio ? ` · ${ot.dominio}` : ''}`,
        esperandoOrden: false,
        empleado: { nombre: persona.nombre, legajo: persona.legajo },
        orden: datosOrden,
        duracion: null,
        abiertas: [],
        otros,
      },
    }
  }

  /**
   * La entrada y la salida del día.
   *
   * Una fila por persona y por día. Si ya salió y vuelve a pasar la tarjeta, se corre la
   * salida: el modelo de una fila no guarda idas y vueltas del mediodía, y eso es una
   * decisión, no un olvido — lo que la concesionaria mira es a qué hora entró y a qué hora se
   * fue. Si algún día hacen falta los cortes, es una tabla de marcas y esta fila pasa a ser
   * un resumen.
   */
  private async marcarJornada(tx: Db, estacion: Estacion, empleadoId: string) {
    const fecha = diaArgentino()
    const ahora = new Date()

    const [hoy] = await tx
      .select()
      .from(jornada)
      .where(and(eq(jornada.empleadoId, empleadoId), eq(jornada.fecha, fecha)))
      .limit(1)

    if (!hoy) {
      await tx.insert(jornada).values({
        tenantId: estacion.tenantId,
        empleadoId,
        fecha,
        entrada: ahora,
        estacionEntradaId: estacion.id,
      })
      return { accion: 'entrada' as const, hora: hora(ahora) }
    }

    if (!hoy.entrada) {
      await tx
        .update(jornada)
        .set({ entrada: ahora, estacionEntradaId: estacion.id })
        .where(eq(jornada.id, hoy.id))
      return { accion: 'entrada' as const, hora: hora(ahora) }
    }

    await tx
      .update(jornada)
      .set({ salida: ahora, estacionSalidaId: estacion.id })
      .where(eq(jornada.id, hoy.id))
    return { accion: 'salida' as const, hora: hora(ahora) }
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /** Quién es el del escaneo anterior. Se vuelve a resolver: el cliente no manda ids. */
  private async personaPendiente(tx: Db, pendiente: string | undefined): Promise<Persona | null> {
    if (!pendiente?.trim()) return null
    const qr = verificarQr(pendiente.trim())
    if (qr.valido && qr.tipo === TIPOS_QR.credencial) return this.porCodigoCredencial(tx, qr.codigo)
    if (esCargaManual(pendiente.trim())) return this.porLegajo(tx, pendiente.trim())
    return null
  }

  private async porCodigoCredencial(tx: Db, codigo: string): Promise<Persona | null> {
    const [fila] = await tx
      .select({
        id: empleado.id,
        nombre: entidadComercial.nombre,
        apellido: entidadComercial.apellido,
        razonSocial: entidadComercial.razonSocial,
        legajo: empleado.legajo,
      })
      .from(credencial)
      .innerJoin(empleado, eq(empleado.id, credencial.empleadoId))
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .where(
        and(
          eq(credencial.codigo, codigo),
          isNull(credencial.revocadaEn),
          eq(empleado.activo, true),
        ),
      )
      .limit(1)
    return fila ? aPersona(fila) : null
  }

  /** El fallback de la regla 6: se tipea el legajo cuando el QR está arruinado. */
  private async porLegajo(tx: Db, legajo: string): Promise<Persona | null> {
    const [fila] = await tx
      .select({
        id: empleado.id,
        nombre: entidadComercial.nombre,
        apellido: entidadComercial.apellido,
        razonSocial: entidadComercial.razonSocial,
        legajo: empleado.legajo,
      })
      .from(empleado)
      .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
      .where(and(eq(empleado.legajo, legajo), eq(empleado.activo, true)))
      .limit(1)
    return fila ? aPersona(fila) : null
  }
}

function aPersona(f: {
  id: string
  nombre: string | null
  apellido: string | null
  razonSocial: string
  legajo: string
}): Persona {
  return {
    id: f.id,
    nombre: `${f.nombre ?? ''} ${f.apellido ?? ''}`.trim() || f.razonSocial,
    legajo: f.legajo,
  }
}

/** «000123», como se lee en la orden impresa. */
export function numeroDeOrden(numero: number): string {
  return String(numero).padStart(6, '0')
}

/**
 * El cierre de fin de turno.
 *
 * **Y no sólo a las 20:00**: también al arrancar el servidor, poniéndose al día con lo que
 * quedó abierto. Si el proceso se reinició antes de la hora, el trabajo no corrió nunca y a la
 * mañana siguiente hay sesiones de catorce horas.
 *
 * Nunca descarta: marca `cerrada_por = 'auto'` para que el jefe de taller lo vea y lo corrija.
 * Un mecánico que se olvidó de cerrar igual trabajó, y borrarle el rato sería peor que dejarlo
 * marcado.
 */
export async function cerrarSesionesDeAyer(tx: Db, tenantId: string): Promise<number> {
  const filas = await tx
    .update(sesionTrabajo)
    .set({
      fin: sql`greatest(date_trunc('day', ${sesionTrabajo.inicio}) + interval '20 hours', ${sesionTrabajo.inicio})`,
      cerradaPor: 'auto',
    })
    .where(
      and(
        eq(sesionTrabajo.tenantId, tenantId),
        isNull(sesionTrabajo.fin),
        sql`${sesionTrabajo.inicio} < date_trunc('day', now())`,
      ),
    )
    .returning({ id: sesionTrabajo.id })
  return filas.length
}
