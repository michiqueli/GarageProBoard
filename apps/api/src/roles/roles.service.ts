import {
  administraUsuarios,
  armarReglas,
  describirEspecial,
  diferenciaDePermisos,
  faltaParaAsignar,
  type Habilidades,
  type Permiso,
  type ReglaPermiso,
  separarReglas,
} from '@gpb/core'
import { asc, count, type Db, eq, inArray } from '@gpb/db'
import { auditoria, aviso, rol, usuario, usuarioRol } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorRoles extends Error {
  constructor(
    readonly codigo: 'NO_ENCONTRADO' | 'NOMBRE_DUPLICADO' | 'PERMISO_NO_OTORGABLE' | 'NO_EDITABLE',
    readonly datos?: unknown,
  ) {
    super(codigo)
  }
}

interface DatosRol {
  nombre: string
  descripcion: string | null
  permisos: Permiso[]
}

const FECHA_AVISO = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Qué índice único saltó, o `null` si el error es otro. */
function indiceDuplicado(error: unknown): string | null {
  let actual = error as { cause?: unknown; code?: string; constraint?: string } | undefined
  while (actual) {
    if (actual.code === '23505') return actual.constraint ?? ''
    actual = actual.cause as typeof actual
  }
  return null
}

function enumerar(frases: string[]): string {
  return frases.length <= 1
    ? (frases[0] ?? '')
    : `${frases.slice(0, -1).join(', ')} y ${frases.at(-1)}`
}

/**
 * Los roles de la concesionaria: crear, clonar y modificar.
 *
 * Editar un rol es cambiarles los permisos a todos los que lo tienen, así que valen las
 * mismas reglas que al asignar uno, más dos propias:
 *
 * - **Nadie modifica un rol que tiene él mismo.** Sería darse permisos: la firma de dos que
 *   se pide para los propios roles vale también para lo que esos roles dan.
 * - **El rol que puede todo no se modifica desde la aplicación.** Sacarle un permiso al
 *   gerente puede dejar a la concesionaria sin nadie que lo arregle. Se clona.
 *
 * El cambio vale en el próximo pedido de cada usuario —los permisos se leen de la base en
 * cada uno— y a cada uno le llega un aviso con qué ganó y qué perdió.
 */
@Injectable()
export class ServicioRoles {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar() {
    return this.datos.transaccion(async (tx, sesion) => {
      const roles = await tx.select().from(rol).orderBy(asc(rol.nombre))
      return { datos: await this.completar(tx, roles, sesion, contextoDelPedido().habilidades) }
    })
  }

  crear(entrada: DatosRol & { basadoEn?: string | null | undefined }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()

      let especiales: ReglaPermiso[] = []
      let original: string | null = null
      if (entrada.basadoEn) {
        const [base] = await tx.select().from(rol).where(eq(rol.id, entrada.basadoEn))
        if (!base) throw new ErrorRoles('NO_ENCONTRADO')
        especiales = separarReglas(base.habilidades as ReglaPermiso[]).especiales
        original = base.nombre
      }

      const reglas = armarReglas(entrada.permisos, especiales)
      this.verificarOtorgables(habilidades, reglas)

      const [creado] = await tx
        .insert(rol)
        .values({
          tenantId: sesion.tenantId,
          nombre: entrada.nombre,
          descripcion: entrada.descripcion,
          habilidades: reglas,
        })
        .returning()
        .catch((error: unknown) => this.traducirDuplicado(error))
      if (!creado) throw new Error('No se pudo crear el rol.')

      await this.auditar(
        tx,
        sesion,
        creado.id,
        'alta',
        null,
        {
          ...this.foto(creado.nombre, creado.descripcion, reglas),
          basadoEn: original,
        },
        ip,
      )

      const [salida] = await this.completar(tx, [creado], sesion, habilidades)
      if (!salida) throw new ErrorRoles('NO_ENCONTRADO')
      return salida
    })
  }

  editar(id: string, entrada: DatosRol, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()
      const [antes] = await tx.select().from(rol).where(eq(rol.id, id)).for('update')
      if (!antes) throw new ErrorRoles('NO_ENCONTRADO')

      const reglasAntes = antes.habilidades as ReglaPermiso[]
      const motivo = await this.motivoNoEditable(tx, sesion, habilidades, antes.id, reglasAntes)
      if (motivo) throw new ErrorRoles('NO_EDITABLE', { motivo })

      // Las especiales no se tocan desde la grilla: se conservan tal cual estaban.
      const separado = separarReglas(reglasAntes)
      const reglas = armarReglas(entrada.permisos, separado.especiales)
      this.verificarOtorgables(habilidades, reglas)

      const [modificado] = await tx
        .update(rol)
        .set({ nombre: entrada.nombre, descripcion: entrada.descripcion, habilidades: reglas })
        .where(eq(rol.id, id))
        .returning()
        .catch((error: unknown) => this.traducirDuplicado(error))
      if (!modificado) throw new ErrorRoles('NO_ENCONTRADO')

      const { agregados, quitados } = diferenciaDePermisos(
        separado.permisos,
        separarReglas(reglas).permisos,
      )
      if (agregados.length || quitados.length) {
        await this.avisarATitulares(tx, sesion, id, modificado.nombre, agregados, quitados)
      }

      await this.auditar(
        tx,
        sesion,
        id,
        'modificacion',
        this.foto(antes.nombre, antes.descripcion, reglasAntes),
        this.foto(modificado.nombre, modificado.descripcion, reglas),
        ip,
      )

      const [salida] = await this.completar(tx, [modificado], sesion, habilidades)
      if (!salida) throw new ErrorRoles('NO_ENCONTRADO')
      return salida
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  /**
   * Por qué quien pide no puede modificar este rol, o `null`. Se usa para listar y para
   * modificar: la pantalla dice lo mismo que después diría la API.
   */
  private async motivoNoEditable(
    tx: Db,
    sesion: Sesion,
    habilidades: Habilidades,
    rolId: string,
    reglas: ReglaPermiso[],
    propios?: ReadonlySet<string>,
  ): Promise<string | null> {
    if (!administraUsuarios(habilidades)) {
      return 'Para modificar roles hace falta administrar usuarios.'
    }
    if (separarReglas(reglas).todo) {
      return 'Puede todo el sistema, y no se modifica desde acá: sacarle un permiso puede dejar a la concesionaria sin nadie que lo arregle. Si necesitás uno parecido, clonalo.'
    }
    const suyos = propios ?? (await this.rolesDe(tx, sesion.usuarioId))
    if (suyos.has(rolId)) {
      return 'Lo tenés vos, y nadie modifica sus propios permisos. Pedíselo a otra persona que administre usuarios.'
    }
    return null
  }

  private verificarOtorgables(habilidades: Habilidades, reglas: ReglaPermiso[]) {
    const leFalta = faltaParaAsignar(habilidades, reglas)
    if (leFalta.length) throw new ErrorRoles('PERMISO_NO_OTORGABLE', { leFalta })
  }

  private async rolesDe(tx: Db, usuarioId: string): Promise<Set<string>> {
    const filas = await tx
      .select({ id: usuarioRol.rolId })
      .from(usuarioRol)
      .where(eq(usuarioRol.usuarioId, usuarioId))
    return new Set(filas.map((f) => f.id))
  }

  private async completar(
    tx: Db,
    roles: Array<typeof rol.$inferSelect>,
    sesion: Sesion,
    habilidades: Habilidades,
  ) {
    if (roles.length === 0) return []
    const cantidades = await tx
      .select({ rolId: usuarioRol.rolId, cantidad: count() })
      .from(usuarioRol)
      .innerJoin(usuario, eq(usuario.id, usuarioRol.usuarioId))
      .where(
        inArray(
          usuarioRol.rolId,
          roles.map((r) => r.id),
        ),
      )
      .groupBy(usuarioRol.rolId)
    const propios = await this.rolesDe(tx, sesion.usuarioId)

    return Promise.all(
      roles.map(async (r) => {
        const reglas = r.habilidades as ReglaPermiso[]
        const { todo, permisos, especiales } = separarReglas(reglas)
        return {
          id: r.id,
          nombre: r.nombre,
          descripcion: r.descripcion,
          todo,
          permisos,
          especiales: especiales.map(describirEspecial),
          usuarios: cantidades.find((c) => c.rolId === r.id)?.cantidad ?? 0,
          noEditable: await this.motivoNoEditable(tx, sesion, habilidades, r.id, reglas, propios),
        }
      }),
    )
  }

  private async avisarATitulares(
    tx: Db,
    sesion: Sesion,
    rolId: string,
    nombre: string,
    agregados: string[],
    quitados: string[],
  ) {
    const titulares = await tx
      .select({ id: usuarioRol.usuarioId })
      .from(usuarioRol)
      .where(eq(usuarioRol.rolId, rolId))
    if (titulares.length === 0) return

    const [autor] = await tx
      .select({ nombre: usuario.nombre, apellido: usuario.apellido })
      .from(usuario)
      .where(eq(usuario.id, sesion.usuarioId))
    const quien = autor ? `${autor.nombre} ${autor.apellido}` : 'Alguien'
    const cambios = [
      agregados.length ? `ahora podés ${enumerar(agregados)}` : '',
      quitados.length ? `ya no podés ${enumerar(quitados)}` : '',
    ].filter(Boolean)
    const texto = `${quien} cambió el rol ${nombre} el ${FECHA_AVISO.format(new Date())}: ${cambios.join('; ')}.`

    await tx
      .insert(aviso)
      .values(titulares.map((t) => ({ tenantId: sesion.tenantId, usuarioId: t.id, texto })))
  }

  /** Lo que se audita: los permisos de la grilla, y las especiales en palabras. */
  private foto(nombre: string, descripcion: string | null, reglas: ReglaPermiso[]) {
    const { todo, permisos, especiales } = separarReglas(reglas)
    return { nombre, descripcion, todo, permisos, especiales: especiales.map(describirEspecial) }
  }

  private traducirDuplicado(error: unknown): never {
    if (indiceDuplicado(error) === 'rol_nombre_uq') throw new ErrorRoles('NOMBRE_DUPLICADO')
    throw error
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    registroId: string,
    accion: 'alta' | 'modificacion',
    datosAntes: unknown,
    datosDespues: unknown,
    ip?: string,
  ) {
    await tx.insert(auditoria).values({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: 'rol',
      registroId,
      accion,
      datosAntes,
      datosDespues,
      ip: ip ?? null,
    })
  }
}
