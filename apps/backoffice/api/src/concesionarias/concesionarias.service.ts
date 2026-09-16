import { randomBytes, randomUUID } from 'node:crypto'
import {
  atajosParaSembrar,
  dependenciasRotas,
  dependientesDe,
  describirDependencia,
  ETIQUETA_MODULO,
  MODULOS,
  type Modulo,
  ROLES_PREDEFINIDOS,
} from '@gpb/core'
import { and, asc, condicionVigente, conTenant, type Db, desc, enOrden, eq, sql } from '@gpb/db'
import {
  auditoriaBackoffice,
  condicionIva,
  empresa,
  rol,
  sucursal,
  operador as tablaOperador,
  tenant,
  tenantModulo,
  usuario,
  usuarioAtajo,
  usuarioConfig,
  usuarioRol,
  usuarioSucursal,
} from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import argon2 from 'argon2'
import type { Operador } from '../auth/auth.service.ts'
import { DB } from '../comun/simbolos.ts'

export class ErrorConcesionaria extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADA'
      | 'DEPENDENCIAS_ROTAS'
      | 'SLUG_DUPLICADO'
      | 'EMAIL_DUPLICADO'
      | 'CONDICION_IVA_DESCONOCIDA'
      | 'VIGENCIA_INVALIDA',
    readonly motivos: string[] = [],
  ) {
    super(codigo)
  }
}

/** Quién hace el cambio y desde dónde, para la auditoría. */
export interface Autor {
  operador: Operador
  ip?: string | undefined
}

export interface DatosAlta {
  nombre: string
  slug: string
  modulos: Modulo[]
  empresa: { razonSocial: string; cuit: string; condicionIva: number }
  sucursal: string
  gerente: { email: string; nombre: string; apellido: string }
}

/** Una violación de unicidad, con el nombre del índice, o `null` si el error es otro. */
function indiceDuplicado(error: unknown): string | null {
  let actual = error as { cause?: unknown; code?: string; constraint?: string } | undefined
  while (actual) {
    if (actual.code === '23505') return actual.constraint ?? ''
    actual = actual.cause as typeof actual
  }
  return null
}

@Injectable()
export class ServicioConcesionarias {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listar() {
    const concesionarias = await this.db.select().from(tenant).orderBy(asc(tenant.nombre))
    const prendidos = await this.db
      .select({ tenantId: tenantModulo.tenantId, modulo: tenantModulo.modulo })
      .from(tenantModulo)
      .where(condicionVigente())

    return concesionarias.map((t) =>
      resumen(
        t,
        prendidos.filter((p) => p.tenantId === t.id).map((p) => p.modulo),
      ),
    )
  }

  async ver(id: string, tx: Db = this.db) {
    const [t] = await tx.select().from(tenant).where(eq(tenant.id, id)).limit(1)
    if (!t) throw new ErrorConcesionaria('NO_ENCONTRADA')

    const contratos = await tx
      .select({
        modulo: tenantModulo.modulo,
        activo: tenantModulo.activo,
        vigenteDesde: tenantModulo.vigenteDesde,
        vigenteHasta: tenantModulo.vigenteHasta,
        vigente: sql<boolean>`(${condicionVigente()})`,
      })
      .from(tenantModulo)
      .where(eq(tenantModulo.tenantId, id))

    const historial = await tx
      .select({
        fecha: auditoriaBackoffice.creadoEn,
        operador: tablaOperador.nombre,
        accion: auditoriaBackoffice.accion,
        motivo: auditoriaBackoffice.motivo,
      })
      .from(auditoriaBackoffice)
      .innerJoin(tablaOperador, eq(tablaOperador.id, auditoriaBackoffice.operadorId))
      .where(eq(auditoriaBackoffice.tenantAfectado, id))
      .orderBy(desc(auditoriaBackoffice.creadoEn))
      .limit(50)

    const vigentes = contratos.filter((c) => c.vigente).map((c) => c.modulo)

    return {
      ...resumen(t, vigentes),
      // Todo el catálogo, contratado o no: la pantalla muestra una fila por módulo y
      // no tiene que saber cuáles existen.
      contratos: MODULOS.map((modulo) => {
        const c = contratos.find((x) => x.modulo === modulo)
        return {
          modulo,
          contrato: c
            ? {
                modulo,
                activo: c.activo,
                vigenteDesde: c.vigenteDesde.toISOString(),
                vigenteHasta: c.vigenteHasta?.toISOString() ?? null,
                vigente: c.vigente,
              }
            : null,
        }
      }),
      historial: historial.map((h) => ({ ...h, fecha: h.fecha.toISOString() })),
    }
  }

  /**
   * Da de alta una concesionaria **en una sola transacción**: la concesionaria, sus
   * módulos, la razón social, la sucursal, los roles predefinidos y el gerente. Si algo
   * falla —un correo que ya existe, un identificador repetido— no queda nada a medias
   * que después haya que encontrar y borrar a mano.
   *
   * Corre con `conTenant()` sobre el id nuevo: las políticas de aislamiento de siempre
   * garantizan que todo lo que se inserta quede a nombre de esta concesionaria.
   */
  async crear(datos: DatosAlta, autor: Autor) {
    const rotas = dependenciasRotas(datos.modulos)
    if (rotas.length > 0) {
      throw new ErrorConcesionaria('DEPENDENCIAS_ROTAS', rotas.map(describirDependencia))
    }

    const id = randomUUID()
    const passwordInicial = randomBytes(12).toString('base64url')
    const hashPassword = await argon2.hash(passwordInicial, { type: argon2.argon2id })
    const email = datos.gerente.email.toLowerCase()

    try {
      await conTenant(this.db, id, async (tx) => {
        const [condicion] = await tx
          .select()
          .from(condicionIva)
          .where(eq(condicionIva.codigo, datos.empresa.condicionIva))
          .limit(1)
        if (!condicion) throw new ErrorConcesionaria('CONDICION_IVA_DESCONOCIDA')

        await tx.insert(tenant).values({ id, nombre: datos.nombre, slug: datos.slug })
        await tx
          .insert(tenantModulo)
          .values(datos.modulos.map((modulo) => ({ tenantId: id, modulo })))

        const [e] = await tx
          .insert(empresa)
          .values({ tenantId: id, ...datos.empresa })
          .returning({ id: empresa.id })
        if (!e) throw new Error('No se pudo crear la empresa.')

        const [s] = await tx
          .insert(sucursal)
          .values({ tenantId: id, empresaId: e.id, nombre: datos.sucursal })
          .returning({ id: sucursal.id })
        if (!s) throw new Error('No se pudo crear la sucursal.')

        // Todos los roles predefinidos y no sólo el de gerente: la concesionaria arranca
        // con el organigrama de base armado, y lo edita ella.
        const roles = await tx
          .insert(rol)
          .values(
            ROLES_PREDEFINIDOS.map((r) => ({
              tenantId: id,
              nombre: r.nombre,
              descripcion: r.descripcion,
              habilidades: r.habilidades,
            })),
          )
          .returning({ id: rol.id, nombre: rol.nombre })
        const gerente = roles.find((r) => r.nombre === 'Gerente')
        if (!gerente) throw new Error('Falta el rol Gerente en los roles predefinidos.')

        const [u] = await tx
          .insert(usuario)
          .values({
            tenantId: id,
            email,
            hashPassword,
            nombre: datos.gerente.nombre,
            apellido: datos.gerente.apellido,
          })
          .returning({ id: usuario.id })
        if (!u) throw new Error('No se pudo crear el usuario.')

        await tx.insert(usuarioRol).values({ tenantId: id, usuarioId: u.id, rolId: gerente.id })
        await tx.insert(usuarioSucursal).values({ tenantId: id, usuarioId: u.id, sucursalId: s.id })
        await tx.insert(usuarioConfig).values({ tenantId: id, usuarioId: u.id })
        await tx.insert(usuarioAtajo).values(
          atajosParaSembrar().map((a) => ({
            tenantId: id,
            usuarioId: u.id,
            ambito: a.ambito,
            accion: a.accion,
            tecla: a.tecla,
          })),
        )

        await this.auditar(tx, autor, id, 'alta_concesionaria', null, null, {
          nombre: datos.nombre,
          slug: datos.slug,
          modulos: datos.modulos,
          empresa: datos.empresa,
          gerente: email,
        })
      })
    } catch (error) {
      const indice = indiceDuplicado(error)
      if (indice === 'tenant_slug_uq') throw new ErrorConcesionaria('SLUG_DUPLICADO')
      if (indice === 'usuario_email_uq') throw new ErrorConcesionaria('EMAIL_DUPLICADO')
      throw error
    }

    const [creada] = (await this.listar()).filter((c) => c.id === id)
    if (!creada) throw new Error('La concesionaria no aparece después de crearla.')
    return { concesionaria: creada, passwordInicial }
  }

  /**
   * Suspende o rehabilita la concesionaria entera. La API mira `tenant.activo` en cada
   * pedido, así que suspender corta las sesiones abiertas en el próximo clic.
   */
  async cambiarEstado(id: string, activo: boolean, motivo: string, autor: Autor) {
    await this.db.transaction(async (tx) => {
      const [antes] = await tx.select().from(tenant).where(eq(tenant.id, id)).limit(1)
      if (!antes) throw new ErrorConcesionaria('NO_ENCONTRADA')

      await tx.update(tenant).set({ activo }).where(eq(tenant.id, id))
      await this.auditar(
        tx,
        autor,
        id,
        activo ? 'rehabilitar_concesionaria' : 'suspender_concesionaria',
        motivo,
        { activo: antes.activo },
        { activo },
      )
    })

    const [actual] = (await this.listar()).filter((c) => c.id === id)
    if (!actual) throw new ErrorConcesionaria('NO_ENCONTRADA')
    return actual
  }

  /**
   * Prende, apaga o cambia la vigencia de un módulo.
   *
   * Apagar uno del que dependen otros prendidos los apaga a todos juntos, **si se pide**
   * con `apagarDependientes`; si no, se rechaza diciendo cuáles. Apagar el núcleo es
   * apagar la concesionaria entera, y eso lo decide quien opera viendo la lista.
   *
   * Lo demás que **agrega** una dependencia rota se rechaza siempre: prender servicios sin
   * núcleo, o ponerle al núcleo un vencimiento anterior. Las que ya estaban rotas antes no
   * frenan un cambio que no tiene nada que ver con ellas; si no, una concesionaria mal
   * cargada no se podría ni arreglar de a un paso.
   */
  async cambiarModulo(
    id: string,
    cambio: {
      modulo: Modulo
      activo: boolean
      vigenteHasta: string | null
      motivo: string
      apagarDependientes: boolean
    },
    autor: Autor,
  ) {
    return this.db.transaction(async (tx) => {
      const [t] = await tx.select({ id: tenant.id }).from(tenant).where(eq(tenant.id, id))
      if (!t) throw new ErrorConcesionaria('NO_ENCONTRADA')

      const vigentesAntes = await this.vigentesDe(tx, id)
      const rotasAntes = dependenciasRotas(vigentesAntes)

      const [actual] = await tx
        .select()
        .from(tenantModulo)
        .where(and(eq(tenantModulo.tenantId, id), eq(tenantModulo.modulo, cambio.modulo)))
        .limit(1)

      const hasta = cambio.vigenteHasta ? new Date(cambio.vigenteHasta) : null
      const desde = actual?.vigenteDesde ?? new Date()
      if (hasta && hasta <= desde) throw new ErrorConcesionaria('VIGENCIA_INVALIDA')

      if (actual) {
        await tx
          .update(tenantModulo)
          .set({ activo: cambio.activo, vigenteHasta: hasta, actualizadoEn: new Date() })
          .where(and(eq(tenantModulo.tenantId, id), eq(tenantModulo.modulo, cambio.modulo)))
      } else {
        await tx.insert(tenantModulo).values({
          tenantId: id,
          modulo: cambio.modulo,
          activo: cambio.activo,
          // Sin vigenteDesde: lo pone la base con now(). Con el reloj de este proceso, unos
          // milisegundos adelante del de Postgres alcanzaban para que un módulo recién
          // contratado figurara «no vigente», porque now() es la hora en que empezó la
          // transacción.
          vigenteHasta: hasta,
        })
      }

      // Los que caen junto con éste. Se apagan con la llave y no se tocan sus fechas: si
      // se vuelve a prender el núcleo, cada uno se prende de nuevo a mano, con su motivo.
      const arrastrados =
        !cambio.activo && cambio.apagarDependientes
          ? dependientesDe(cambio.modulo, vigentesAntes)
          : []
      for (const dependiente of arrastrados) {
        await tx
          .update(tenantModulo)
          .set({ activo: false, actualizadoEn: new Date() })
          .where(and(eq(tenantModulo.tenantId, id), eq(tenantModulo.modulo, dependiente)))
        await this.auditar(
          tx,
          autor,
          id,
          'modulo',
          `${cambio.motivo} (se apagó con ${ETIQUETA_MODULO[cambio.modulo]})`,
          { modulo: dependiente, activo: true },
          { modulo: dependiente, activo: false },
        )
      }

      const clave = (r: { modulo: Modulo; falta: Modulo }) => `${r.modulo}>${r.falta}`
      const yaRotas = new Set(rotasAntes.map(clave))
      const nuevas = dependenciasRotas(await this.vigentesDe(tx, id)).filter(
        (r) => !yaRotas.has(clave(r)),
      )
      // Lanzar adentro de la transacción la deshace: el cambio no queda escrito.
      if (nuevas.length > 0) {
        throw new ErrorConcesionaria('DEPENDENCIAS_ROTAS', nuevas.map(describirDependencia))
      }

      await this.auditar(
        tx,
        autor,
        id,
        'modulo',
        cambio.motivo,
        actual
          ? { modulo: actual.modulo, activo: actual.activo, vigenteHasta: actual.vigenteHasta }
          : null,
        { modulo: cambio.modulo, activo: cambio.activo, vigenteHasta: hasta },
      )

      return this.ver(id, tx)
    })
  }

  private async vigentesDe(tx: Db, id: string): Promise<Modulo[]> {
    const filas = await tx
      .select({ modulo: tenantModulo.modulo })
      .from(tenantModulo)
      .where(and(eq(tenantModulo.tenantId, id), condicionVigente()))
    return enOrden(filas.map((f) => f.modulo))
  }

  private async auditar(
    tx: Db,
    autor: Autor,
    tenantAfectado: string,
    accion: string,
    motivo: string | null,
    datosAntes: unknown,
    datosDespues: unknown,
  ) {
    await tx.insert(auditoriaBackoffice).values({
      operadorId: autor.operador.id,
      tenantAfectado,
      accion,
      motivo,
      datosAntes,
      datosDespues,
      ip: autor.ip ?? null,
    })
  }
}

function resumen(
  t: { id: string; nombre: string; slug: string; activo: boolean; creadoEn: Date },
  prendidos: Iterable<string>,
) {
  return {
    id: t.id,
    nombre: t.nombre,
    slug: t.slug,
    activo: t.activo,
    creadoEn: t.creadoEn.toISOString(),
    modulos: enOrden(prendidos),
  }
}
