import { type ReglaPermiso, ROLES_PREDEFINIDOS, resolverCondiciones } from '@garagetick/core'
import { and, conTenant, type Db, eq, isNull, sql } from '@garagetick/db'
import {
  empresa,
  rol,
  sesion,
  sucursal,
  tenant,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '@garagetick/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import argon2 from 'argon2'
import { DB } from '../comun/base.module.ts'
import { type ClaimsAcceso, generarRefresco, hashearRefresco, partirRefresco } from './tokens.ts'

/**
 * Hash de una contraseña que no existe.
 *
 * Cuando el correo no está registrado igual se verifica contra esto, para que la
 * respuesta tarde lo mismo que con un usuario real. Sin eso, medir el tiempo alcanza
 * para saber qué direcciones existen en el sistema.
 */
const HASH_SENUELO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudWVsb3NlbnVlbG8$3vT4qkP0mYcJXK2mQ8jVxRZ0nB1yD5wLfA6uH9eKmTs'

export class ErrorAuth extends Error {
  constructor(readonly codigo: 'CREDENCIALES_INVALIDAS' | 'SIN_ACCESO' | 'REFRESCO_INVALIDO') {
    super(codigo)
  }
}

export interface Sesion {
  usuarioId: string
  tenantId: string
  sucursalId: string
  sesionId: string
}

@Injectable()
export class ServicioAuth {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async iniciar(entrada: {
    email: string
    password: string
    sucursalId?: string | undefined
    agente?: string | undefined
    ip?: string | undefined
  }) {
    const encontrado = await this.buscarPorCorreo(entrada.email)

    // Se verifica igual cuando el correo no existe, contra un hash señuelo: sin eso, la
    // diferencia de tiempo entre "no existe" y "existe con otra clave" alcanza para
    // saber qué direcciones están registradas.
    const valida = await argon2
      .verify(encontrado?.hashPassword ?? HASH_SENUELO, entrada.password)
      .catch(() => false)

    if (!encontrado || !valida) throw new ErrorAuth('CREDENCIALES_INVALIDAS')

    return this.abrirSesion({
      tenantId: encontrado.tenantId,
      usuarioId: encontrado.usuarioId,
      sucursalPedida: entrada.sucursalId,
      familia: crypto.randomUUID(),
      agente: entrada.agente,
      ip: entrada.ip,
    })
  }

  async refrescar(token: string, sucursalPedida?: string) {
    const partido = partirRefresco(token)
    if (!partido) throw new ErrorAuth('REFRESCO_INVALIDO')

    const hash = hashearRefresco(token)

    const resultado = await conTenant(this.db, partido.tenantId, async (tx) => {
      const [actual] = await tx.select().from(sesion).where(eq(sesion.hashRefresco, hash)).limit(1)

      if (!actual) return { tipo: 'invalido' } as const

      // Detección de reuso: llegó un token que ya había sido rotado. O lo robaron, o
      // el legítimo se quedó con una copia vieja. No hay forma de distinguir al ladrón
      // del dueño, así que caen los dos.
      //
      // La anulación **no** se hace acá adentro. Esta función corre dentro de una
      // transacción y termina lanzando el error, y el rollback desharía la anulación:
      // el sistema detectaría el robo y después borraría su propia defensa. Se
      // devuelve la señal y se anula afuera, en una transacción que sí commitea.
      if (actual.anuladaEn) return { tipo: 'reuso', familia: actual.familia } as const

      if (actual.expiraEn.getTime() < Date.now()) return { tipo: 'invalido' } as const

      await tx
        .update(sesion)
        .set({ anuladaEn: new Date(), motivoAnulacion: 'rotada' })
        .where(eq(sesion.id, actual.id))

      const abierta = await this.abrirSesion(
        {
          tenantId: partido.tenantId,
          usuarioId: actual.usuarioId,
          sucursalPedida: sucursalPedida ?? actual.sucursalId ?? undefined,
          familia: actual.familia,
          agente: actual.agente ?? undefined,
          ip: actual.ip ?? undefined,
        },
        tx,
      )

      return { tipo: 'ok', sesion: abierta } as const
    })

    if (resultado.tipo === 'reuso') {
      await conTenant(this.db, partido.tenantId, (tx) =>
        tx
          .update(sesion)
          .set({ anuladaEn: new Date(), motivoAnulacion: 'reuso detectado' })
          .where(and(eq(sesion.familia, resultado.familia), isNull(sesion.anuladaEn))),
      )
      throw new ErrorAuth('REFRESCO_INVALIDO')
    }

    if (resultado.tipo === 'invalido') throw new ErrorAuth('REFRESCO_INVALIDO')

    return resultado.sesion
  }

  /** Cierra la familia entera: si el usuario dice «salir», sale de esta sesión completa. */
  async cerrar(token: string): Promise<boolean> {
    const partido = partirRefresco(token)
    if (!partido) return false

    const hash = hashearRefresco(token)

    return conTenant(this.db, partido.tenantId, async (tx) => {
      const [actual] = await tx.select().from(sesion).where(eq(sesion.hashRefresco, hash)).limit(1)
      if (!actual) return false

      await tx
        .update(sesion)
        .set({ anuladaEn: new Date(), motivoAnulacion: 'cierre de sesión' })
        .where(and(eq(sesion.familia, actual.familia), isNull(sesion.anuladaEn)))

      return true
    })
  }

  /** El estado de la sesión sin emitir tokens nuevos. */
  async describir(s: Sesion) {
    return conTenant(this.db, s.tenantId, (tx) => this.armarPayload(tx, s.usuarioId, s.sucursalId))
  }

  /**
   * Quién es y de qué concesionaria, a partir del correo.
   *
   * La única consulta del sistema que corre sin tenant en la sesión: autenticarse pasa
   * antes de saber a qué concesionaria pertenece quien entra. Va contra una función
   * SECURITY DEFINER que devuelve tres campos y nada más.
   */
  private async buscarPorCorreo(email: string) {
    const { rows } = await this.db.execute<{
      usuario_id: string
      tenant_id: string
      hash_password: string
    }>(sql`select * from autenticar_usuario(${email.toLowerCase()})`)

    const fila = rows[0]
    if (!fila) return null

    return {
      usuarioId: fila.usuario_id,
      tenantId: fila.tenant_id,
      hashPassword: fila.hash_password,
    }
  }

  private async abrirSesion(
    datos: {
      tenantId: string
      usuarioId: string
      sucursalPedida?: string | undefined
      familia: string
      agente?: string | undefined
      ip?: string | undefined
    },
    txExistente?: Db,
  ) {
    const trabajo = async (tx: Db) => {
      const disponibles = await this.sucursalesDe(tx, datos.usuarioId)
      if (disponibles.length === 0) throw new ErrorAuth('SIN_ACCESO')

      const [config] = await tx
        .select()
        .from(usuarioConfig)
        .where(eq(usuarioConfig.usuarioId, datos.usuarioId))
        .limit(1)

      const elegida =
        disponibles.find((s) => s.id === datos.sucursalPedida) ??
        disponibles.find((s) => s.id === config?.sucursalPredeterminadaId) ??
        disponibles[0]

      if (!elegida) throw new ErrorAuth('SIN_ACCESO')
      if (datos.sucursalPedida && elegida.id !== datos.sucursalPedida) {
        throw new ErrorAuth('SIN_ACCESO')
      }

      const refresh = generarRefresco(datos.tenantId)
      const diasRefresco = 30

      const [nueva] = await tx
        .insert(sesion)
        .values({
          tenantId: datos.tenantId,
          usuarioId: datos.usuarioId,
          hashRefresco: hashearRefresco(refresh),
          familia: datos.familia,
          sucursalId: elegida.id,
          expiraEn: new Date(Date.now() + diasRefresco * 24 * 60 * 60 * 1000),
          agente: datos.agente ?? null,
          ip: datos.ip ?? null,
        })
        .returning()

      if (!nueva) throw new ErrorAuth('REFRESCO_INVALIDO')

      await tx
        .update(usuario)
        .set({ ultimoAcceso: new Date() })
        .where(eq(usuario.id, datos.usuarioId))

      const claims: ClaimsAcceso = {
        sub: datos.usuarioId,
        ten: datos.tenantId,
        suc: elegida.id,
        ses: nueva.id,
      }

      const minutosAcceso = 15
      const access = await this.jwt.signAsync(claims, { expiresIn: `${minutosAcceso}m` })
      const payload = await this.armarPayload(tx, datos.usuarioId, elegida.id)

      return {
        access,
        refresh,
        expiraEn: new Date(Date.now() + minutosAcceso * 60 * 1000).toISOString(),
        ...payload,
      }
    }

    return txExistente ? trabajo(txExistente) : conTenant(this.db, datos.tenantId, trabajo)
  }

  private async sucursalesDe(tx: Db, usuarioId: string) {
    return tx
      .select({
        id: sucursal.id,
        nombre: sucursal.nombre,
        empresaId: empresa.id,
        razonSocial: empresa.razonSocial,
      })
      .from(usuarioSucursal)
      .innerJoin(sucursal, eq(sucursal.id, usuarioSucursal.sucursalId))
      .innerJoin(empresa, eq(empresa.id, sucursal.empresaId))
      .where(and(eq(usuarioSucursal.usuarioId, usuarioId), eq(sucursal.activa, true)))
  }

  private async armarPayload(tx: Db, usuarioId: string, sucursalId: string) {
    const [u] = await tx.select().from(usuario).where(eq(usuario.id, usuarioId)).limit(1)
    if (!u) throw new ErrorAuth('CREDENCIALES_INVALIDAS')

    const [t] = await tx.select().from(tenant).limit(1)
    if (!t) throw new ErrorAuth('CREDENCIALES_INVALIDAS')

    const disponibles = await this.sucursalesDe(tx, usuarioId)
    const activa = disponibles.find((s) => s.id === sucursalId)
    if (!activa) throw new ErrorAuth('SIN_ACCESO')

    const roles = await tx
      .select({ habilidades: rol.habilidades })
      .from(usuarioRol)
      .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
      .where(eq(usuarioRol.usuarioId, usuarioId))

    // Las condiciones traen marcadores como `${usuarioId}`, que sólo se pueden
    // resolver ahora que sabemos quién entró.
    const habilidades = resolverCondiciones(
      roles.flatMap((r) => (r.habilidades as ReglaPermiso[]) ?? []),
      { usuarioId, sucursalId, tenantId: t.id },
    )

    const guardados = await tx
      .select({ accion: usuarioAtajo.accion, tecla: usuarioAtajo.tecla })
      .from(usuarioAtajo)
      .where(eq(usuarioAtajo.usuarioId, usuarioId))

    const [config] = await tx
      .select()
      .from(usuarioConfig)
      .where(eq(usuarioConfig.usuarioId, usuarioId))
      .limit(1)

    return {
      usuario: { id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido },
      tenant: { id: t.id, nombre: t.nombre, slug: t.slug },
      sucursalActiva: activa,
      sucursales: disponibles,
      habilidades: habilidades as unknown[],
      atajos: Object.fromEntries(guardados.map((a) => [a.accion, a.tecla])),
      config: {
        tema: (config?.tema ?? 'sistema') as 'claro' | 'oscuro' | 'sistema',
        densidad: (config?.densidad ?? 'compacta') as 'compacta' | 'comoda',
        filasPorPagina: config?.filasPorPagina ?? 50,
        sucursalPredeterminadaId: config?.sucursalPredeterminadaId ?? null,
      },
    }
  }
}

/** Los roles que se crean junto con una concesionaria nueva. */
export const ROLES_INICIALES = ROLES_PREDEFINIDOS
