import { and, asc, count, type Db, desc, eq, ilike, isNull, or, sql } from '@gpb/db'
import {
  auditoria,
  cliente,
  entidadComercial,
  marca,
  modelo,
  titularidad,
  usuario,
  vehiculo,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { describirCambio, type Nombres } from '../auditoria/auditoria.service.ts'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorVehiculos extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADO'
      | 'CHASIS_DUPLICADO'
      | 'DOMINIO_DUPLICADO'
      | 'CLIENTE_INEXISTENTE'
      | 'MISMO_TITULAR'
      | 'FECHA_ANTERIOR'
      | 'FECHA_FUTURA',
    readonly datos?: unknown,
  ) {
    super(codigo)
  }
}

type Combustible = 'nafta' | 'diesel' | 'gnc' | 'electrico' | 'hibrido'

interface DatosVehiculo {
  dominio?: string | null | undefined
  anio?: number | null | undefined
  color?: string | null | undefined
  motor?: string | null | undefined
  marca?: string | null | undefined
  modelo?: string | null | undefined
  combustible?: Combustible | null | undefined
  kilometraje?: number | null | undefined
  observaciones?: string | null | undefined
}

/**
 * Hoy en la Argentina. El servidor puede correr en UTC, y a las nueve de la noche de acá
 * allá ya es mañana: una transferencia cargada a esa hora no puede rebotar por «futura».
 */
export function hoyEnArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    ahora,
  )
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

const SIN_NOMBRES: Nombres = {
  roles: new Map(),
  sucursales: new Map(),
  condicionesIva: new Map(),
  provincias: new Map(),
}

/**
 * Los vehículos de la concesionaria, sus titulares y su historia.
 *
 * El titular no es una columna del vehículo sino una relación con vigencia: cambiarlo
 * cierra la anterior y abre otra. Así, cuando existan las órdenes de trabajo, cada una
 * va a poder decir de quién era el auto el día que entró.
 */
@Injectable()
export class ServicioVehiculos {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(entrada: { pagina: number; porPagina: number; buscar?: string | undefined }) {
    return this.datos.transaccion(async (tx) => {
      const texto = entrada.buscar?.trim()
      // La patente se escribe como se lee —«AB 123 CD»— y se guarda sin espacios.
      const compacto = texto?.replace(/[\s-]/g, '').toUpperCase()
      const filtro = texto
        ? or(
            ilike(vehiculo.dominio, `%${compacto}%`),
            ilike(vehiculo.chasis, `%${compacto}%`),
            ilike(entidadComercial.razonSocial, `%${texto}%`),
          )
        : undefined

      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(vehiculo)
        .leftJoin(
          titularidad,
          and(eq(titularidad.vehiculoId, vehiculo.id), isNull(titularidad.hasta)),
        )
        .leftJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
        .where(filtro)

      const filas = await this.base(tx)
        .where(filtro)
        .orderBy(desc(vehiculo.creadoEn))
        .limit(entrada.porPagina)
        .offset((entrada.pagina - 1) * entrada.porPagina)

      return { datos: filas.map(aResumen), total }
    })
  }

  marcas() {
    return this.datos.transaccion(async (tx) => {
      const filas = await tx
        .select({ marca: marca.nombre, modelo: modelo.nombre })
        .from(marca)
        .leftJoin(modelo, eq(modelo.marcaId, marca.id))
        .orderBy(asc(marca.nombre), asc(modelo.nombre))

      const porMarca = new Map<string, Set<string>>()
      for (const f of filas) {
        const modelos = porMarca.get(f.marca) ?? new Set<string>()
        if (f.modelo) modelos.add(f.modelo)
        porMarca.set(f.marca, modelos)
      }
      return {
        datos: [...porMarca].map(([nombre, modelos]) => ({ marca: nombre, modelos: [...modelos] })),
      }
    })
  }

  /** Los que tiene y los que tuvo, los vigentes primero. */
  delCliente(clienteId: string) {
    return this.datos.transaccion(async (tx) => {
      const filas = await tx
        .select({
          v: vehiculo,
          marca: marca.nombre,
          modelo: modelo.nombre,
          desde: titularidad.desde,
          hasta: titularidad.hasta,
          titularId: entidadComercial.id,
          titular: entidadComercial.razonSocial,
        })
        .from(titularidad)
        .innerJoin(vehiculo, eq(vehiculo.id, titularidad.vehiculoId))
        .innerJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
        .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
        .leftJoin(marca, eq(marca.id, modelo.marcaId))
        .where(eq(titularidad.clienteId, clienteId))
        .orderBy(sql`${titularidad.hasta} is null desc`, desc(titularidad.desde))

      return {
        datos: filas.map((f) => ({
          ...aResumen(f),
          // En los que ya no tiene no se dice quién los tiene hoy: eso es de la ficha del
          // vehículo, y la de este cliente no tiene por qué contar la vida de otro.
          titular: f.hasta ? null : aResumen(f).titular,
          desde: f.desde,
          hasta: f.hasta,
        })),
      }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.armarFicha(tx, id))
  }

  crear(
    entrada: DatosVehiculo & {
      chasis: string
      titular?: { clienteId: string; desde: string } | null | undefined
    },
    ip?: string,
  ) {
    return this.datos.transaccion(async (tx, sesion) => {
      // El chasis repetido se pregunta antes para poder contestarlo con su nombre; igual lo
      // sostiene el índice único si dos recepciones cargan el mismo a la vez.
      const [yaEsta] = await tx
        .select({ id: vehiculo.id })
        .from(vehiculo)
        .where(eq(vehiculo.chasis, entrada.chasis))
        .limit(1)
      if (yaEsta) throw new ErrorVehiculos('CHASIS_DUPLICADO', { mensaje: entrada.chasis })
      await this.verificarDominio(tx, entrada.dominio)

      const titular = entrada.titular
        ? await this.clienteActivo(tx, entrada.titular.clienteId)
        : null
      if (entrada.titular && entrada.titular.desde > hoyEnArgentina()) {
        throw new ErrorVehiculos('FECHA_FUTURA')
      }

      const valores = await this.valores(tx, sesion, entrada)
      const [creado] = await tx
        .insert(vehiculo)
        .values({ tenantId: sesion.tenantId, chasis: entrada.chasis, ...valores })
        .returning({ id: vehiculo.id })
        .catch((error: unknown) => this.traducirDuplicado(error))
      if (!creado) throw new Error('No se pudo crear el vehículo.')

      const { modeloId: _, ...datos } = valores
      await this.auditar(
        tx,
        sesion,
        'vehiculo',
        creado.id,
        'alta',
        null,
        {
          chasis: entrada.chasis,
          ...datos,
          marca: entrada.marca ?? null,
          modelo: entrada.modelo ?? null,
        },
        ip,
      )

      if (entrada.titular && titular) {
        await this.abrirTitularidad(tx, sesion, creado.id, titular, entrada.titular.desde, null, ip)
      }

      const [fila] = await this.base(tx).where(eq(vehiculo.id, creado.id))
      if (!fila) throw new ErrorVehiculos('NO_ENCONTRADO')
      return aResumen(fila)
    })
  }

  editar(id: string, entrada: DatosVehiculo, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const antes = await this.armarFicha(tx, id)
      await this.verificarDominio(tx, entrada.dominio, id)

      const valores = await this.valores(tx, sesion, entrada)
      await tx
        .update(vehiculo)
        .set({ ...valores, actualizadoEn: new Date() })
        .where(eq(vehiculo.id, id))
        .catch((error: unknown) => this.traducirDuplicado(error))

      const { modeloId: _, ...datos } = valores
      await this.auditar(
        tx,
        sesion,
        'vehiculo',
        id,
        'modificacion',
        fotoVehiculo(antes),
        { ...datos, marca: entrada.marca ?? null, modelo: entrada.modelo ?? null },
        ip,
      )
      return this.armarFicha(tx, id)
    })
  }

  transferir(id: string, entrada: { clienteId: string; desde: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [existe] = await tx
        .select({ id: vehiculo.id })
        .from(vehiculo)
        .where(eq(vehiculo.id, id))
        // Dos transferencias del mismo auto a la vez esperan una a la otra: la segunda
        // lee el titular que dejó la primera, no el de antes.
        .for('update')
      if (!existe) throw new ErrorVehiculos('NO_ENCONTRADO')

      const nuevo = await this.clienteActivo(tx, entrada.clienteId)
      if (entrada.desde > hoyEnArgentina()) throw new ErrorVehiculos('FECHA_FUTURA')

      const [vigente] = await tx
        .select({
          id: titularidad.id,
          clienteId: titularidad.clienteId,
          desde: titularidad.desde,
          razonSocial: entidadComercial.razonSocial,
        })
        .from(titularidad)
        .innerJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
        .where(and(eq(titularidad.vehiculoId, id), isNull(titularidad.hasta)))

      if (vigente) {
        if (vigente.clienteId === entrada.clienteId) throw new ErrorVehiculos('MISMO_TITULAR')
        if (entrada.desde < vigente.desde) {
          throw new ErrorVehiculos('FECHA_ANTERIOR', { desde: vigente.desde })
        }
        await tx
          .update(titularidad)
          .set({ hasta: entrada.desde })
          .where(eq(titularidad.id, vigente.id))
      }

      await this.abrirTitularidad(
        tx,
        sesion,
        id,
        nuevo,
        entrada.desde,
        vigente?.razonSocial ?? null,
        ip,
      )
      return this.armarFicha(tx, id)
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /** Vehículo con marca, modelo y titular vigente. */
  private base(tx: Db) {
    return tx
      .select({
        v: vehiculo,
        marca: marca.nombre,
        modelo: modelo.nombre,
        titularId: entidadComercial.id,
        titular: entidadComercial.razonSocial,
      })
      .from(vehiculo)
      .leftJoin(modelo, eq(modelo.id, vehiculo.modeloId))
      .leftJoin(marca, eq(marca.id, modelo.marcaId))
      .leftJoin(
        titularidad,
        and(eq(titularidad.vehiculoId, vehiculo.id), isNull(titularidad.hasta)),
      )
      .leftJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
      .$dynamic()
  }

  private async armarFicha(tx: Db, id: string) {
    const [fila] = await this.base(tx).where(eq(vehiculo.id, id))
    if (!fila) throw new ErrorVehiculos('NO_ENCONTRADO')
    const v = fila.v

    const titulares = await tx
      .select({
        id: titularidad.id,
        desde: titularidad.desde,
        hasta: titularidad.hasta,
        clienteId: entidadComercial.id,
        razonSocial: entidadComercial.razonSocial,
        tipoDocumento: entidadComercial.tipoDocumento,
        numeroDocumento: entidadComercial.numeroDocumento,
      })
      .from(titularidad)
      .innerJoin(entidadComercial, eq(entidadComercial.id, titularidad.clienteId))
      .where(eq(titularidad.vehiculoId, id))
      // El vigente primero; después, del más reciente al primero.
      .orderBy(sql`${titularidad.hasta} is null desc`, desc(titularidad.desde))

    const cambios = await tx
      .select({
        fecha: auditoria.creadoEn,
        tabla: auditoria.tabla,
        accion: auditoria.accion,
        antes: auditoria.datosAntes,
        despues: auditoria.datosDespues,
        autor: sql<string | null>`${usuario.nombre} || ' ' || ${usuario.apellido}`,
      })
      .from(auditoria)
      .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
      .where(
        or(
          and(eq(auditoria.tabla, 'vehiculo'), eq(auditoria.registroId, id)),
          and(
            eq(auditoria.tabla, 'titularidad'),
            sql`${auditoria.datosDespues}->>'vehiculoId' = ${id}`,
          ),
        ),
      )
      // Lo que se hizo en la misma transacción comparte la hora —el alta con su primer
      // titular—, y el id es al azar: con la misma hora, el alta es lo primero que pasó.
      .orderBy(
        desc(auditoria.creadoEn),
        asc(sql`(${auditoria.tabla} = 'vehiculo' and ${auditoria.accion} = 'alta')`),
      )

    return {
      ...aResumen(fila),
      motor: v.motor,
      combustible: v.combustible as Combustible | null,
      kilometraje: v.kilometraje,
      observaciones: v.observaciones,
      creadoEn: v.creadoEn.toISOString(),
      titulares: titulares.map((t) => ({
        id: t.id,
        desde: t.desde,
        hasta: t.hasta,
        cliente: {
          id: t.clienteId,
          razonSocial: t.razonSocial,
          tipoDocumento: t.tipoDocumento,
          numeroDocumento: t.numeroDocumento,
        },
      })),
      historia: cambios.map((c) => ({
        fecha: c.fecha.toISOString(),
        autor: c.autor,
        detalle: describirCambio(
          c.tabla,
          c.accion,
          c.antes as Record<string, unknown> | null,
          c.despues as Record<string, unknown> | null,
          SIN_NOMBRES,
        ),
      })),
    }
  }

  /** Las columnas del vehículo, con la marca y el modelo resueltos a su id. */
  private async valores(tx: Db, sesion: Sesion, d: DatosVehiculo) {
    return {
      dominio: d.dominio ?? null,
      anio: d.anio ?? null,
      color: d.color ?? null,
      motor: d.motor ?? null,
      combustible: d.combustible ?? null,
      kilometraje: d.kilometraje ?? null,
      observaciones: d.observaciones ?? null,
      modeloId: await this.modeloId(tx, sesion, d.marca, d.modelo),
    }
  }

  /**
   * Busca la marca y el modelo por nombre, sin importar mayúsculas, y los crea si no están.
   * El contrato ya garantizó que vienen los dos o ninguno.
   */
  private async modeloId(
    tx: Db,
    sesion: Sesion,
    nombreMarca: string | null | undefined,
    nombreModelo: string | null | undefined,
  ): Promise<string | null> {
    if (!nombreMarca || !nombreModelo) return null

    const [marcaExistente] = await tx
      .select({ id: marca.id })
      .from(marca)
      .where(sql`lower(${marca.nombre}) = lower(${nombreMarca})`)
      .limit(1)
    const marcaId =
      marcaExistente?.id ??
      (
        await tx
          .insert(marca)
          .values({ tenantId: sesion.tenantId, nombre: nombreMarca })
          .returning({ id: marca.id })
      )[0]?.id
    if (!marcaId) throw new Error('No se pudo crear la marca.')

    const [modeloExistente] = await tx
      .select({ id: modelo.id })
      .from(modelo)
      .where(
        and(
          eq(modelo.marcaId, marcaId),
          sql`lower(${modelo.nombre}) = lower(${nombreModelo})`,
          isNull(modelo.version),
        ),
      )
      .limit(1)
    if (modeloExistente) return modeloExistente.id

    const [creado] = await tx
      .insert(modelo)
      .values({ tenantId: sesion.tenantId, marcaId, nombre: nombreModelo })
      .returning({ id: modelo.id })
    if (!creado) throw new Error('No se pudo crear el modelo.')
    return creado.id
  }

  private async verificarDominio(tx: Db, dominio: string | null | undefined, excepto?: string) {
    if (!dominio) return
    const [otro] = await tx
      .select({ id: vehiculo.id, chasis: vehiculo.chasis })
      .from(vehiculo)
      .where(eq(vehiculo.dominio, dominio))
      .limit(1)
    if (otro && otro.id !== excepto) throw new ErrorVehiculos('DOMINIO_DUPLICADO', otro)
  }

  private traducirDuplicado(error: unknown): never {
    const indice = indiceDuplicado(error)
    if (indice === 'vehiculo_chasis_uq') throw new ErrorVehiculos('CHASIS_DUPLICADO')
    if (indice === 'vehiculo_dominio_uq') throw new ErrorVehiculos('DOMINIO_DUPLICADO')
    throw error
  }

  private async clienteActivo(tx: Db, clienteId: string) {
    const [encontrado] = await tx
      .select({ id: cliente.id, razonSocial: entidadComercial.razonSocial })
      .from(cliente)
      .innerJoin(entidadComercial, eq(entidadComercial.id, cliente.id))
      .where(and(eq(cliente.id, clienteId), eq(cliente.activo, true)))
    if (!encontrado) throw new ErrorVehiculos('CLIENTE_INEXISTENTE')
    return encontrado
  }

  private async abrirTitularidad(
    tx: Db,
    sesion: Sesion,
    vehiculoId: string,
    titular: { id: string; razonSocial: string },
    desde: string,
    anterior: string | null,
    ip?: string,
  ) {
    const [abierta] = await tx
      .insert(titularidad)
      .values({ tenantId: sesion.tenantId, vehiculoId, clienteId: titular.id, desde })
      .returning({ id: titularidad.id })
    if (!abierta) throw new Error('No se pudo registrar el titular.')

    const [v] = await tx
      .select({ dominio: vehiculo.dominio, chasis: vehiculo.chasis })
      .from(vehiculo)
      .where(eq(vehiculo.id, vehiculoId))
    await this.auditar(
      tx,
      sesion,
      'titularidad',
      abierta.id,
      'alta',
      null,
      {
        vehiculoId,
        dominio: v?.dominio ?? null,
        chasis: v?.chasis ?? null,
        clienteId: titular.id,
        cliente: titular.razonSocial,
        anterior,
        desde,
      },
      ip,
    )
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    tabla: 'vehiculo' | 'titularidad',
    registroId: string,
    accion: 'alta' | 'modificacion',
    datosAntes: unknown,
    datosDespues: unknown,
    ip?: string,
  ) {
    await auditar(tx, sesion, {
      tabla,
      registroId,
      accion,
      antes: datosAntes,
      despues: datosDespues,
      ip,
    })
  }
}

function aResumen(fila: {
  v: typeof vehiculo.$inferSelect
  marca: string | null
  modelo: string | null
  titularId: string | null
  titular: string | null
}) {
  const v = fila.v
  return {
    id: v.id,
    chasis: v.chasis,
    dominio: v.dominio,
    anio: v.anio,
    color: v.color,
    marca: fila.marca,
    modelo: fila.modelo,
    titular:
      fila.titularId && fila.titular ? { id: fila.titularId, razonSocial: fila.titular } : null,
  }
}

/** Lo que se audita de un vehículo: sus datos, con marca y modelo por nombre. */
function fotoVehiculo(f: {
  dominio: string | null
  anio: number | null
  color: string | null
  motor: string | null
  marca: string | null
  modelo: string | null
  combustible: string | null
  kilometraje: number | null
  observaciones: string | null
}) {
  return {
    dominio: f.dominio,
    anio: f.anio,
    color: f.color,
    motor: f.motor,
    marca: f.marca,
    modelo: f.modelo,
    combustible: f.combustible,
    kilometraje: f.kilometraje,
    observaciones: f.observaciones,
  }
}
