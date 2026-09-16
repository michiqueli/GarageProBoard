import { createHash, randomBytes } from 'node:crypto'
import { and, type Db, eq, gt, isNull, sql } from '@gpb/db'
import { operador, sesionOperador } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import argon2 from 'argon2'
import { DB } from '../comun/simbolos.ts'
import { HORAS_SESION } from './cookie.ts'

/** Ver `HASH_SENUELO` en la API: que un correo inexistente tarde lo mismo que uno real. */
const HASH_SENUELO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudWVsb3NlbnVlbG8$3vT4qkP0mYcJXK2mQ8jVxRZ0nB1yD5wLfA6uH9eKmTs'

export interface Operador {
  id: string
  email: string
  nombre: string
}

/** Se guarda el hash: un volcado de la base no alcanza para entrar al panel. */
function hashear(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

@Injectable()
export class ServicioAuth {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** El operador y el token de su sesión nueva, o `null` si no corresponde entrar. */
  async iniciar(entrada: {
    email: string
    password: string
    ip?: string | undefined
    agente?: string | undefined
  }): Promise<{ operador: Operador; token: string } | null> {
    const [encontrado] = await this.db
      .select()
      .from(operador)
      .where(and(eq(operador.email, entrada.email.toLowerCase()), eq(operador.activo, true)))
      .limit(1)

    const valida = await argon2
      .verify(encontrado?.hashPassword ?? HASH_SENUELO, entrada.password)
      .catch(() => false)
    if (!encontrado || !valida) return null

    const token = randomBytes(48).toString('base64url')
    await this.db.insert(sesionOperador).values({
      operadorId: encontrado.id,
      hashToken: hashear(token),
      expiraEn: new Date(Date.now() + HORAS_SESION * 60 * 60 * 1000),
      ip: entrada.ip ?? null,
      agente: entrada.agente ?? null,
    })
    await this.db
      .update(operador)
      .set({ ultimoAcceso: new Date() })
      .where(eq(operador.id, encontrado.id))

    return {
      operador: { id: encontrado.id, email: encontrado.email, nombre: encontrado.nombre },
      token,
    }
  }

  /**
   * El operador de una sesión viva. Se mira en cada pedido que siga activo: darlo de baja
   * corta sus sesiones en el acto, sin esperar las doce horas.
   */
  async operadorDe(token: string): Promise<Operador | null> {
    const [fila] = await this.db
      .select({ id: operador.id, email: operador.email, nombre: operador.nombre })
      .from(sesionOperador)
      .innerJoin(operador, eq(operador.id, sesionOperador.operadorId))
      .where(
        and(
          eq(sesionOperador.hashToken, hashear(token)),
          isNull(sesionOperador.anuladaEn),
          gt(sesionOperador.expiraEn, sql`now()`),
          eq(operador.activo, true),
        ),
      )
      .limit(1)

    return fila ?? null
  }

  async cerrar(token: string): Promise<boolean> {
    const anuladas = await this.db
      .update(sesionOperador)
      .set({ anuladaEn: new Date() })
      .where(and(eq(sesionOperador.hashToken, hashear(token)), isNull(sesionOperador.anuladaEn)))
      .returning({ id: sesionOperador.id })

    return anuladas.length > 0
  }
}
