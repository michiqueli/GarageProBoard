import { randomBytes } from 'node:crypto'
import {
  atajosParaSembrar,
  type Habilidades,
  permisosQueNoTiene,
  type ReglaPermiso,
} from '@gpb/core'
import { and, asc, type Db, eq, inArray, isNull } from '@gpb/db'
import {
  auditoria,
  empresa,
  rol,
  sucursal,
  sesion as tablaSesion,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import argon2 from 'argon2'
import { contextoDelPedido, type Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorUsuarios extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADO'
      | 'ES_USTED'
      | 'USUARIO_CON_MAS_PERMISOS'
      | 'ROL_NO_OTORGABLE'
      | 'REFERENCIA_INVALIDA'
      | 'EMAIL_DUPLICADO',
    readonly datos?: { rol: string; leFalta: string[] },
  ) {
    super(codigo)
  }
}

interface DatosUsuario {
  nombre: string
  apellido: string
  rolIds: string[]
  sucursalIds: string[]
}

/** Doce bytes al azar: dieciséis caracteres que nadie va a adivinar ni recordar. */
function generarPassword(): string {
  return randomBytes(12).toString('base64url')
}

function esEmailDuplicado(error: unknown): boolean {
  let actual = error as { cause?: unknown; code?: string; constraint?: string } | undefined
  while (actual) {
    if (actual.code === '23505' && actual.constraint === 'usuario_email_uq') return true
    actual = actual.cause as typeof actual
  }
  return false
}

/**
 * Usuarios de la concesionaria.
 *
 * Dos reglas atraviesan todo lo que está acá, y las aplica la API y no la pantalla:
 *
 * 1. **Nadie da lo que no tiene.** Un rol se asigna sólo si quien lo asigna ya tiene cada
 *    uno de sus permisos. Quien reparte roles genera la contraseña del usuario nuevo y
 *    puede entrar con ella: asignar un permiso es tenerlo.
 * 2. **Nadie se toca a sí mismo, ni toca a quien tiene más.** Ni sus propios roles, ni a un
 *    usuario con permisos que él no tiene: cambiarle la contraseña a un gerente es
 *    quedarse con su cuenta.
 *
 * Ver `docs/tecnicos/usuarios-y-roles.md`.
 */
@Injectable()
export class ServicioUsuarios {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar() {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()
      const usuarios = await tx.select().from(usuario).orderBy(asc(usuario.apellido))
      return this.completar(tx, usuarios, sesion, habilidades)
    })
  }

  opciones() {
    return this.datos.transaccion(async (tx) => {
      const { habilidades } = contextoDelPedido()
      const roles = await tx.select().from(rol).orderBy(asc(rol.nombre))
      const sucursales = await tx
        .select({ id: sucursal.id, nombre: sucursal.nombre, razonSocial: empresa.razonSocial })
        .from(sucursal)
        .innerJoin(empresa, eq(empresa.id, sucursal.empresaId))
        .where(eq(sucursal.activa, true))
        .orderBy(asc(sucursal.nombre))

      return {
        roles: roles.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          descripcion: r.descripcion,
          leFalta: permisosQueNoTiene(habilidades, r.habilidades as ReglaPermiso[]),
        })),
        sucursales,
      }
    })
  }

  crear(entrada: DatosUsuario & { email: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()
      await this.verificarAsignables(tx, habilidades, entrada)

      const passwordInicial = generarPassword()
      const hashPassword = await argon2.hash(passwordInicial, { type: argon2.argon2id })

      const [creado] = await tx
        .insert(usuario)
        .values({
          tenantId: sesion.tenantId,
          email: entrada.email.toLowerCase(),
          hashPassword,
          nombre: entrada.nombre,
          apellido: entrada.apellido,
        })
        .returning()
        .catch((error: unknown) => {
          if (esEmailDuplicado(error)) throw new ErrorUsuarios('EMAIL_DUPLICADO')
          throw error
        })
      if (!creado) throw new Error('No se pudo crear el usuario.')

      await this.asignar(tx, sesion, creado.id, entrada)
      // Sus preferencias y su mapa de teclas, como los que trae la semilla: sin esto el
      // usuario nuevo entraría a una aplicación sin teclas rápidas.
      await tx.insert(usuarioConfig).values({ tenantId: sesion.tenantId, usuarioId: creado.id })
      await tx.insert(usuarioAtajo).values(
        atajosParaSembrar().map((a) => ({
          tenantId: sesion.tenantId,
          usuarioId: creado.id,
          ambito: a.ambito,
          accion: a.accion,
          tecla: a.tecla,
        })),
      )

      await this.auditar(tx, sesion, creado.id, 'alta', null, this.foto(creado, entrada), ip)

      const [listado] = await this.completar(tx, [creado], sesion, habilidades)
      if (!listado) throw new Error('El usuario no aparece después de crearlo.')
      return { usuario: listado, passwordInicial }
    })
  }

  editar(id: string, entrada: DatosUsuario & { activo: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()
      const actual = await this.buscar(tx, id)
      const antes = {
        ...this.foto(actual, {
          rolIds: await this.rolIdsDe(tx, id),
          sucursalIds: await this.sucursalIdsDe(tx, id),
        }),
      }

      if (id === sesion.usuarioId) {
        // Su nombre sí lo puede corregir; lo que le da o le saca acceso, no.
        const igual = (a: string[], b: string[]) =>
          a.length === b.length && [...a].sort().join() === [...b].sort().join()
        if (
          !igual(antes.rolIds, entrada.rolIds) ||
          !igual(antes.sucursalIds, entrada.sucursalIds) ||
          actual.activo !== entrada.activo
        ) {
          throw new ErrorUsuarios('ES_USTED')
        }
      } else {
        await this.verificarAlcanzable(tx, habilidades, id)
        await this.verificarAsignables(tx, habilidades, entrada)
      }

      const [modificado] = await tx
        .update(usuario)
        .set({
          nombre: entrada.nombre,
          apellido: entrada.apellido,
          activo: entrada.activo,
          actualizadoEn: new Date(),
        })
        .where(eq(usuario.id, id))
        .returning()
      if (!modificado) throw new ErrorUsuarios('NO_ENCONTRADO')

      if (id !== sesion.usuarioId) {
        await tx.delete(usuarioRol).where(eq(usuarioRol.usuarioId, id))
        await tx.delete(usuarioSucursal).where(eq(usuarioSucursal.usuarioId, id))
        await this.asignar(tx, sesion, id, entrada)
      }

      // La guardia ya lo deja afuera en el próximo pedido; esto además le corta la
      // renovación, para que no quede una sesión viva esperando que lo rehabiliten.
      if (actual.activo && !entrada.activo)
        await this.cerrarSesiones(tx, id, 'usuario dado de baja')

      await this.auditar(
        tx,
        sesion,
        id,
        actual.activo && !entrada.activo ? 'baja' : 'modificacion',
        antes,
        this.foto(modificado, entrada),
        ip,
      )

      const [listado] = await this.completar(tx, [modificado], sesion, habilidades)
      if (!listado) throw new ErrorUsuarios('NO_ENCONTRADO')
      return listado
    })
  }

  nuevaPassword(id: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const { habilidades } = contextoDelPedido()
      if (id === sesion.usuarioId) throw new ErrorUsuarios('ES_USTED')
      const actual = await this.buscar(tx, id)
      await this.verificarAlcanzable(tx, habilidades, id)

      const passwordInicial = generarPassword()
      await tx
        .update(usuario)
        .set({
          hashPassword: await argon2.hash(passwordInicial, { type: argon2.argon2id }),
          actualizadoEn: new Date(),
        })
        .where(eq(usuario.id, id))
      // Quien se la olvidó no tiene sesiones que cuidar; quien se la robó, sí.
      await this.cerrarSesiones(tx, id, 'contraseña regenerada')

      // Sin la contraseña ni su hash: la auditoría dice que pasó, no cuál es.
      await this.auditar(tx, sesion, id, 'modificacion', null, { password: 'regenerada' }, ip)

      const [listado] = await this.completar(tx, [actual], sesion, habilidades)
      if (!listado) throw new ErrorUsuarios('NO_ENCONTRADO')
      return { usuario: listado, passwordInicial }
    })
  }

  // ── reglas ──────────────────────────────────────────────────────────────────

  /** Que existan en esta concesionaria, y que quien asigna tenga cada permiso que dan. */
  private async verificarAsignables(tx: Db, habilidades: Habilidades, entrada: DatosUsuario) {
    const roles = entrada.rolIds.length
      ? await tx.select().from(rol).where(inArray(rol.id, entrada.rolIds))
      : []
    const sucursales = await tx
      .select({ id: sucursal.id })
      .from(sucursal)
      .where(and(inArray(sucursal.id, entrada.sucursalIds), eq(sucursal.activa, true)))

    // RLS ya deja afuera los de otra concesionaria: si no aparecen, no existen para ésta.
    if (
      roles.length !== new Set(entrada.rolIds).size ||
      sucursales.length !== new Set(entrada.sucursalIds).size
    ) {
      throw new ErrorUsuarios('REFERENCIA_INVALIDA')
    }

    for (const r of roles) {
      const leFalta = permisosQueNoTiene(habilidades, r.habilidades as ReglaPermiso[])
      if (leFalta.length > 0) {
        throw new ErrorUsuarios('ROL_NO_OTORGABLE', { rol: r.nombre, leFalta })
      }
    }
  }

  /** Que el usuario no tenga ningún permiso que quien lo modifica no tiene. */
  private async verificarAlcanzable(tx: Db, habilidades: Habilidades, id: string) {
    if ((await this.permisosDe(tx, id, habilidades)).length > 0) {
      throw new ErrorUsuarios('USUARIO_CON_MAS_PERMISOS')
    }
  }

  private async permisosDe(tx: Db, id: string, habilidades: Habilidades) {
    const reglas = await tx
      .select({ habilidades: rol.habilidades })
      .from(usuarioRol)
      .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
      .where(eq(usuarioRol.usuarioId, id))
    return permisosQueNoTiene(
      habilidades,
      reglas.flatMap((r) => r.habilidades as ReglaPermiso[]),
    )
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private async buscar(tx: Db, id: string) {
    const [encontrado] = await tx.select().from(usuario).where(eq(usuario.id, id)).limit(1)
    if (!encontrado) throw new ErrorUsuarios('NO_ENCONTRADO')
    return encontrado
  }

  private async asignar(tx: Db, sesion: Sesion, usuarioId: string, entrada: DatosUsuario) {
    const tenantId = sesion.tenantId
    if (entrada.rolIds.length) {
      await tx
        .insert(usuarioRol)
        .values([...new Set(entrada.rolIds)].map((rolId) => ({ tenantId, usuarioId, rolId })))
    }
    await tx.insert(usuarioSucursal).values(
      [...new Set(entrada.sucursalIds)].map((sucursalId) => ({
        tenantId,
        usuarioId,
        sucursalId,
      })),
    )
  }

  private async cerrarSesiones(tx: Db, usuarioId: string, motivo: string) {
    await tx
      .update(tablaSesion)
      .set({ anuladaEn: new Date(), motivoAnulacion: motivo })
      .where(and(eq(tablaSesion.usuarioId, usuarioId), isNull(tablaSesion.anuladaEn)))
  }

  private async rolIdsDe(tx: Db, id: string) {
    const filas = await tx
      .select({ id: usuarioRol.rolId })
      .from(usuarioRol)
      .where(eq(usuarioRol.usuarioId, id))
    return filas.map((f) => f.id)
  }

  private async sucursalIdsDe(tx: Db, id: string) {
    const filas = await tx
      .select({ id: usuarioSucursal.sucursalId })
      .from(usuarioSucursal)
      .where(eq(usuarioSucursal.usuarioId, id))
    return filas.map((f) => f.id)
  }

  /** Lo que queda en la auditoría. Nunca el hash de la contraseña. */
  private foto(
    u: { email: string; nombre: string; apellido: string; activo: boolean },
    asignado: { rolIds: string[]; sucursalIds: string[] },
  ) {
    return {
      email: u.email,
      nombre: u.nombre,
      apellido: u.apellido,
      activo: u.activo,
      rolIds: asignado.rolIds,
      sucursalIds: asignado.sucursalIds,
    }
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    registroId: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosAntes: unknown,
    datosDespues: unknown,
    ip?: string,
  ) {
    await tx.insert(auditoria).values({
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      tabla: 'usuario',
      registroId,
      accion,
      datosAntes,
      datosDespues,
      ip: ip ?? null,
    })
  }

  /** Cada usuario con sus roles, sus sucursales y si quien pide lo puede modificar. */
  private async completar(
    tx: Db,
    usuarios: Array<{
      id: string
      email: string
      nombre: string
      apellido: string
      activo: boolean
      ultimoAcceso: Date | null
    }>,
    sesion: Sesion,
    habilidades: Habilidades,
  ) {
    if (usuarios.length === 0) return []
    const ids = usuarios.map((u) => u.id)

    const roles = await tx
      .select({
        usuarioId: usuarioRol.usuarioId,
        id: rol.id,
        nombre: rol.nombre,
        habilidades: rol.habilidades,
      })
      .from(usuarioRol)
      .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
      .where(inArray(usuarioRol.usuarioId, ids))
      .orderBy(asc(rol.nombre))

    const sucursales = await tx
      .select({ usuarioId: usuarioSucursal.usuarioId, id: sucursal.id, nombre: sucursal.nombre })
      .from(usuarioSucursal)
      .innerJoin(sucursal, eq(sucursal.id, usuarioSucursal.sucursalId))
      .where(inArray(usuarioSucursal.usuarioId, ids))
      .orderBy(asc(sucursal.nombre))

    return usuarios.map((u) => {
      const suyos = roles.filter((r) => r.usuarioId === u.id)
      const reglas = suyos.flatMap((r) => r.habilidades as ReglaPermiso[])
      return {
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        apellido: u.apellido,
        activo: u.activo,
        ultimoAcceso: u.ultimoAcceso?.toISOString() ?? null,
        roles: suyos.map((r) => ({ id: r.id, nombre: r.nombre })),
        sucursales: sucursales
          .filter((s) => s.usuarioId === u.id)
          .map((s) => ({ id: s.id, nombre: s.nombre })),
        editable: u.id !== sesion.usuarioId && permisosQueNoTiene(habilidades, reglas).length === 0,
      }
    })
  }
}
