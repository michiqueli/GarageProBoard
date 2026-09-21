import { asc, type Db, eq } from '@gpb/db'
import { empleado, entidadComercial, estacionFichaje, jornada, sucursal } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { generarToken, hashDeToken } from './estacion.ts'
import { diaArgentino } from './fichaje.service.ts'
import { armarTablero } from './tablero.ts'

export class ErrorEstaciones extends Error {
  constructor(readonly codigo: 'NO_ENCONTRADA' | 'REFERENCIA_INVALIDA') {
    super(codigo)
  }
}

/**
 * La administración de las estaciones de fichaje, del lado del sistema.
 *
 * Es lo único de todo el fichaje que pide sesión y permiso: dar de alta la PC del taller es
 * configurar el módulo, y ahí vive una credencial —el token abre la pantalla sin sesión—.
 * Por eso pide `configurar Orden` y no `editar`: es la misma distinción que con los
 * certificados de AFIP.
 */
@Injectable()
export class ServicioEstaciones {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar() {
    return this.datos.transaccion(async (tx) => {
      const filas = await this.consulta(tx).orderBy(asc(estacionFichaje.nombre))
      return { datos: filas.map(aSalida) }
    })
  }

  /**
   * Registrar una PC. Devuelve el token **una sola vez**: de la base sale su hash, así que ni
   * nosotros lo podemos volver a leer. Si se pierde, se registra la estación de nuevo.
   */
  registrar(
    entrada: { nombre: string; tipo: 'taller' | 'reloj' | 'tablero'; sucursalId: string },
    baseUrl: string,
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [donde] = await tx
        .select({ id: sucursal.id })
        .from(sucursal)
        .where(eq(sucursal.id, entrada.sucursalId))
        .limit(1)
      if (!donde) throw new ErrorEstaciones('REFERENCIA_INVALIDA')

      const token = generarToken()
      const [creada] = await tx
        .insert(estacionFichaje)
        .values({
          tenantId: sesion.tenantId,
          sucursalId: entrada.sucursalId,
          nombre: entrada.nombre,
          tipo: entrada.tipo,
          tokenHash: hashDeToken(token),
        })
        .returning({ id: estacionFichaje.id })
      if (!creada) throw new Error('No se pudo registrar la estación.')

      await auditar(tx, sesion, {
        tabla: 'estacion_fichaje',
        registroId: creada.id,
        accion: 'alta',
        despues: {
          texto: `Registró la estación «${entrada.nombre}» (${entrada.tipo})`,
          nombre: entrada.nombre,
          tipo: entrada.tipo,
        },
        ip,
      })

      return {
        estacion: await this.una(tx, creada.id),
        token,
        // La dirección que se abre en esa PC. El token viaja en la barra una sola vez: la
        // pantalla lo guarda y limpia la dirección, para que no quede en el historial.
        url: `${baseUrl.replace(/\/$/, '')}/fichaje#t=${token}`,
      }
    })
  }

  revocar(id: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const antes = await this.una(tx, id)
      await tx.update(estacionFichaje).set({ activa: false }).where(eq(estacionFichaje.id, id))

      await auditar(tx, sesion, {
        tabla: 'estacion_fichaje',
        registroId: id,
        accion: 'baja',
        antes: { nombre: antes.nombre, tipo: antes.tipo },
        despues: { texto: `Dio de baja la estación «${antes.nombre}»: su token dejó de servir` },
        ip,
      })

      return this.una(tx, id)
    })
  }

  /** El tablero de piso de la sucursal en la que está parado quien lo pide. */
  tablero() {
    return this.datos.transaccion((tx, sesion) => armarTablero(tx, sesion.sucursalId))
  }

  /** Quién entró y quién salió, un día. Por omisión, hoy. */
  asistencia(fecha?: string) {
    return this.datos.transaccion(async (tx) => {
      const dia = fecha ?? diaArgentino()
      const filas = await tx
        .select({
          id: jornada.id,
          empleadoId: jornada.empleadoId,
          nombre: entidadComercial.nombre,
          apellido: entidadComercial.apellido,
          razonSocial: entidadComercial.razonSocial,
          legajo: empleado.legajo,
          puesto: empleado.puesto,
          fecha: jornada.fecha,
          entrada: jornada.entrada,
          salida: jornada.salida,
          fuente: jornada.fuente,
        })
        .from(jornada)
        .innerJoin(empleado, eq(empleado.id, jornada.empleadoId))
        .innerJoin(entidadComercial, eq(entidadComercial.id, empleado.id))
        .where(eq(jornada.fecha, dia))
        .orderBy(asc(jornada.entrada))

      return {
        fecha: dia,
        datos: filas.map((f) => ({
          id: f.id,
          empleadoId: f.empleadoId,
          nombre: `${f.nombre ?? ''} ${f.apellido ?? ''}`.trim() || f.razonSocial,
          legajo: f.legajo,
          puesto: f.puesto,
          fecha: f.fecha,
          entrada: f.entrada?.toISOString() ?? null,
          salida: f.salida?.toISOString() ?? null,
          fuente: f.fuente as 'escaneo' | 'manual' | 'auto',
          minutos:
            f.entrada && f.salida
              ? Math.round((f.salida.getTime() - f.entrada.getTime()) / 60_000)
              : null,
        })),
      }
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private consulta(tx: Db) {
    return tx
      .select({
        id: estacionFichaje.id,
        nombre: estacionFichaje.nombre,
        tipo: estacionFichaje.tipo,
        sucursalId: estacionFichaje.sucursalId,
        sucursal: sucursal.nombre,
        activa: estacionFichaje.activa,
        ultimoVistoEn: estacionFichaje.ultimoVistoEn,
        creadoEn: estacionFichaje.creadoEn,
      })
      .from(estacionFichaje)
      .leftJoin(sucursal, eq(sucursal.id, estacionFichaje.sucursalId))
      .$dynamic()
  }

  private async una(tx: Db, id: string) {
    const [fila] = await this.consulta(tx).where(eq(estacionFichaje.id, id)).limit(1)
    if (!fila) throw new ErrorEstaciones('NO_ENCONTRADA')
    return aSalida(fila)
  }
}

function aSalida(f: {
  id: string
  nombre: string
  tipo: string
  sucursalId: string
  sucursal: string | null
  activa: boolean
  ultimoVistoEn: Date | null
  creadoEn: Date
}) {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo:
      f.tipo === 'reloj' || f.tipo === 'tablero'
        ? (f.tipo as 'reloj' | 'tablero')
        : ('taller' as const),
    sucursalId: f.sucursalId,
    sucursal: f.sucursal,
    activa: f.activa,
    ultimoVistoEn: f.ultimoVistoEn?.toISOString() ?? null,
    creadoEn: f.creadoEn.toISOString(),
  }
}
