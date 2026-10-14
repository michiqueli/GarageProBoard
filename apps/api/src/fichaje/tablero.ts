import { and, asc, type Db, eq, inArray, isNull, sql } from '@gpb/db'
import {
  empleado,
  entidadComercial,
  marca,
  modelo,
  motivoEspera,
  orden,
  ordenEspera,
  sesionTrabajo,
  sucursal,
  vehiculo,
} from '@gpb/db/schema'

/**
 * El tablero de piso: qué autos están en el taller, quién los tiene y cuánto llevan.
 *
 * Vive en una función suelta y no en un servicio porque **lo piden dos pantallas por dos
 * caminos distintos**: la del jefe de taller, con sesión y permisos, y el televisor del piso,
 * que se autentica con el token de su estación y no tiene persona detrás. El dato es el mismo;
 * lo único que cambia es de dónde sale la sucursal.
 *
 * Los **dos relojes** son los que hacen que esto valga algo. La mano de obra es la suma de las
 * sesiones de trabajo —lo que costó—; el tiempo en taller es desde que entró el auto —lo que el
 * cliente percibió—. La diferencia es el tiempo muerto, y es normalmente lo que la
 * concesionaria más quiere ver: explica por qué un auto estuvo seis días.
 */

/** Los estados en los que el auto sigue adentro. Terminado o facturado ya no es del tablero. */
const EN_TALLER = ['recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion']

type EstadoEnTaller = 'recibida' | 'en_proceso' | 'esperando_repuesto' | 'esperando_autorizacion'

const minutos = (desde: Date, hasta: Date) =>
  Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60_000))

/** «Volkswagen Amarok», o lo que haya. Vacío si el vehículo no tiene marca ni modelo cargados. */
function nombreVehiculo(marca: string | null, modelo: string | null): string | null {
  return [marca, modelo].filter(Boolean).join(' ') || null
}

export async function armarTablero(tx: Db, sucursalId: string) {
  const ahora = new Date()

  const [donde] = await tx
    .select({ nombre: sucursal.nombre })
    .from(sucursal)
    .where(eq(sucursal.id, sucursalId))
    .limit(1)

  const autos = await tx
    .select({
      id: orden.id,
      numero: orden.numero,
      estado: orden.estado,
      pedido: orden.pedido,
      ingreso: orden.creadoEn,
      entregaEstimada: orden.entregaEstimada,
      dominio: vehiculo.dominio,
      marca: marca.nombre,
      modelo: modelo.nombre,
      asignadoNombre: entidadComercial.nombre,
      asignadoApellido: entidadComercial.apellido,
      asignadoRazonSocial: entidadComercial.razonSocial,
    })
    .from(orden)
    .leftJoin(vehiculo, eq(vehiculo.id, orden.vehiculoId))
    .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
    .leftJoin(marca, eq(marca.id, modelo.marcaId))
    .leftJoin(empleado, eq(empleado.id, orden.mecanicoId))
    .leftJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
    .where(and(eq(orden.sucursalId, sucursalId), inArray(orden.estado, EN_TALLER)))
    .orderBy(asc(orden.creadoEn))

  if (autos.length === 0) {
    return {
      sucursal: donde?.nombre ?? null,
      alMomento: ahora.toISOString(),
      autos: [],
      resumen: { enTaller: 0, conAlguien: 0, parados: 0 },
    }
  }

  const ids = autos.map((a) => a.id)

  // Quiénes están fichados ahora mismo. Pueden ser varios en el mismo auto: la concurrencia
  // única es por mecánico, no por orden.
  const abiertas = await tx
    .select({
      ordenId: sesionTrabajo.ordenId,
      inicio: sesionTrabajo.inicio,
      nombre: entidadComercial.nombre,
      apellido: entidadComercial.apellido,
      razonSocial: entidadComercial.razonSocial,
    })
    .from(sesionTrabajo)
    .innerJoin(empleado, eq(empleado.id, sesionTrabajo.empleadoId))
    .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
    .where(and(inArray(sesionTrabajo.ordenId, ids), isNull(sesionTrabajo.fin)))
    .orderBy(asc(sesionTrabajo.inicio))

  // La mano de obra acumulada. Las sesiones abiertas cuentan lo que llevan hasta ahora: si no,
  // un auto con alguien trabajando desde hace tres horas figura en cero y el tablero miente.
  const trabajado = await tx
    .select({
      ordenId: sesionTrabajo.ordenId,
      segundos: sql<string>`coalesce(sum(coalesce(${sesionTrabajo.duracionSeg}, extract(epoch from (now() - ${sesionTrabajo.inicio})))), 0)`,
    })
    .from(sesionTrabajo)
    .where(inArray(sesionTrabajo.ordenId, ids))
    .groupBy(sesionTrabajo.ordenId)

  // Por qué está parado y cuánto lleva esperado: la parte del tiempo muerto que tiene motivo.
  const esperas = await tx
    .select({
      ordenId: ordenEspera.ordenId,
      motivo: motivoEspera.nombre,
      desde: ordenEspera.desde,
      hasta: ordenEspera.hasta,
    })
    .from(ordenEspera)
    .innerJoin(motivoEspera, eq(motivoEspera.id, ordenEspera.motivoId))
    .where(inArray(ordenEspera.ordenId, ids))

  const tarjetas = autos.map((a) => {
    const suyas = abiertas.filter((s) => s.ordenId === a.id)
    const susEsperas = esperas.filter((e) => e.ordenId === a.id)
    const actual = susEsperas.find((e) => !e.hasta)
    const esperadoMin = Math.round(
      susEsperas.reduce(
        (total, e) => total + ((e.hasta ?? ahora).getTime() - e.desde.getTime()),
        0,
      ) / 60_000,
    )
    const segundos = Number(trabajado.find((t) => t.ordenId === a.id)?.segundos ?? 0)
    const manoDeObraMin = Math.round(segundos / 60)
    const enTallerMin = minutos(a.ingreso, ahora)

    return {
      id: a.id,
      numero: a.numero,
      estado: a.estado as EstadoEnTaller,
      dominio: a.dominio,
      vehiculo: nombreVehiculo(a.marca, a.modelo),
      pedido: a.pedido,
      ingreso: a.ingreso.toISOString(),
      entregaEstimada: a.entregaEstimada,
      asignado:
        `${a.asignadoNombre ?? ''} ${a.asignadoApellido ?? ''}`.trim() ||
        a.asignadoRazonSocial ||
        null,
      trabajando: suyas.map((s) => ({
        nombre: `${s.nombre ?? ''} ${s.apellido ?? ''}`.trim() || s.razonSocial,
        desde: s.inicio.toISOString(),
      })),
      manoDeObraMin,
      enTallerMin,
      // Nunca negativo: dos mecánicos en paralelo pueden sumar más mano de obra que el rato
      // que el auto lleva adentro, y un «tiempo muerto» en rojo de −40 no significa nada.
      muertoMin: Math.max(0, enTallerMin - manoDeObraMin),
      espera: actual ? { motivo: actual.motivo, desde: actual.desde.toISOString() } : null,
      esperadoMin,
    }
  })

  const conAlguien = tarjetas.filter((t) => t.trabajando.length > 0).length

  return {
    sucursal: donde?.nombre ?? null,
    alMomento: ahora.toISOString(),
    autos: tarjetas,
    resumen: {
      enTaller: tarjetas.length,
      conAlguien,
      parados: tarjetas.length - conAlguien,
    },
  }
}

/**
 * Cierra las sesiones de trabajo que quedaron abiertas en una orden.
 *
 * La llaman terminar y anular. Sin esto, el mecánico que se olvidó de pasar la credencial al
 * terminar queda fichado para siempre: su reloj sigue corriendo, la mano de obra de esa orden
 * crece sola toda la noche, y el tablero muestra un auto «terminado» con alguien adentro.
 *
 * Va como `jefe` y no como `mecanico`: no la cerró él, la cerró la persona que dio la orden
 * por terminada desde una pantalla. Es la misma distinción que hace `auto` con el cierre de
 * fin de turno, y existe para que después se pueda saber cuáles revisar.
 */
export async function cerrarSesionesDeLaOrden(tx: Db, ordenId: string): Promise<number> {
  const cerradas = await tx
    .update(sesionTrabajo)
    .set({ fin: new Date(), cerradaPor: 'jefe' })
    .where(and(eq(sesionTrabajo.ordenId, ordenId), isNull(sesionTrabajo.fin)))
    .returning({ id: sesionTrabajo.id })
  return cerradas.length
}
