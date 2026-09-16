import { type Db, eq, sql } from '@gpb/db'
import { auditoria, dispositivo } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorAuditoria extends Error {
  constructor(readonly codigo: 'NO_ENCONTRADO') {
    super(codigo)
  }
}

type Foto = Record<string, unknown> | null

/**
 * Qué cambió entre dos fotos de la auditoría, en palabras: «roles, sucursales».
 *
 * Se arma al leer y no al escribir: la auditoría guarda los datos tal cual, y cómo se
 * cuentan puede mejorar sin reescribir la historia.
 */
function describirCambio(tabla: string, accion: string, antes: Foto, despues: Foto): string {
  if (accion === 'alta') return 'alta'
  if (despues?.password === 'regenerada') return 'contraseña nueva'

  if (tabla === 'dispositivo') {
    return `nombre: «${antes?.nombre ?? 'sin nombre'}» → «${despues?.nombre ?? 'sin nombre'}»`
  }

  const nombres: Record<string, string> = {
    nombre: 'nombre',
    apellido: 'apellido',
    email: 'correo',
    activo: accion === 'baja' ? 'dado de baja' : 'estado',
    rolIds: 'roles',
    sucursalIds: 'sucursales',
  }
  const igual = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) ? [...a].sort().join() === [...b].sort().join() : a === b

  const cambiados = Object.keys(nombres).filter((k) => !igual(antes?.[k], despues?.[k]))
  return cambiados.map((k) => nombres[k]).join(', ') || 'sin cambios'
}

/**
 * El registro de la concesionaria: quién entró, desde dónde, y quién cambió qué.
 *
 * Es lo que controla a quien administra usuarios. No bloquea nada: deja la historia a la
 * vista de quien tiene que mirarla. Todo corre con el tenant de la sesión, así que RLS lo
 * acota a la concesionaria sin que ninguna consulta tenga que acordarse.
 */
@Injectable()
export class ServicioAuditoria {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  ingresos(entrada: { pagina: number; porPagina: number; usuarioId?: string | undefined }) {
    return this.datos.transaccion(async (tx) => {
      // Un ingreso es la primera sesión de cada familia: las renovaciones de cada quince
      // minutos son la misma persona sentada en la misma silla.
      const { rows } = await tx.execute<{
        fecha: Date
        usuario_id: string
        usuario_nombre: string
        email: string
        dispositivo_id: string | null
        dispositivo_nombre: string | null
        dispositivo_agente: string | null
        ip: string | null
        sucursal: string | null
        computadora_nueva: boolean
        total: string
      }>(sql`
        with ingresos as (
          select distinct on (s.familia)
                 s.familia, s.creado_en, s.usuario_id, s.dispositivo_id, s.ip, s.sucursal_id
            from sesion s
           order by s.familia, s.creado_en
        )
        select i.creado_en as fecha,
               u.id as usuario_id,
               u.nombre || ' ' || u.apellido as usuario_nombre,
               u.email,
               d.id as dispositivo_id,
               d.nombre as dispositivo_nombre,
               d.agente as dispositivo_agente,
               i.ip,
               su.nombre as sucursal,
               (i.dispositivo_id is not null and not exists (
                  select 1 from sesion p
                   where p.usuario_id = i.usuario_id
                     and p.dispositivo_id = i.dispositivo_id
                     and p.creado_en < i.creado_en
               )) as computadora_nueva,
               count(*) over () as total
          from ingresos i
          join usuario u on u.id = i.usuario_id
          left join dispositivo d on d.id = i.dispositivo_id
          left join sucursal su on su.id = i.sucursal_id
         where (${entrada.usuarioId ?? null}::uuid is null or i.usuario_id = ${entrada.usuarioId ?? null}::uuid)
         order by i.creado_en desc
         limit ${entrada.porPagina} offset ${(entrada.pagina - 1) * entrada.porPagina}
      `)

      return {
        datos: rows.map((r) => ({
          fecha: new Date(r.fecha).toISOString(),
          usuario: { id: r.usuario_id, nombre: r.usuario_nombre, email: r.email },
          dispositivo: r.dispositivo_id
            ? { id: r.dispositivo_id, nombre: r.dispositivo_nombre, agente: r.dispositivo_agente }
            : null,
          computadoraNueva: r.computadora_nueva,
          ip: r.ip,
          sucursal: r.sucursal,
        })),
        total: Number(rows[0]?.total ?? 0),
      }
    })
  }

  cambios(entrada: { pagina: number; porPagina: number }) {
    return this.datos.transaccion(async (tx) => {
      const { rows } = await tx.execute<{
        fecha: Date
        autor: string | null
        tabla: string
        accion: 'alta' | 'modificacion' | 'baja'
        datos_antes: Foto
        datos_despues: Foto
        ip: string | null
        sobre_usuario: string | null
        sobre_dispositivo: string | null
        total: string
      }>(sql`
        select a.creado_en as fecha,
               autor.nombre || ' ' || autor.apellido as autor,
               a.tabla, a.accion, a.datos_antes, a.datos_despues, a.ip,
               objetivo.email as sobre_usuario,
               coalesce(d.nombre, d.agente) as sobre_dispositivo,
               count(*) over () as total
          from auditoria a
          left join usuario autor on autor.id = a.usuario_id
          left join usuario objetivo on a.tabla = 'usuario' and objetivo.id = a.registro_id
          left join dispositivo d on a.tabla = 'dispositivo' and d.id = a.registro_id
         order by a.creado_en desc
         limit ${entrada.porPagina} offset ${(entrada.pagina - 1) * entrada.porPagina}
      `)

      return {
        datos: rows.map((r) => ({
          fecha: new Date(r.fecha).toISOString(),
          autor: r.autor,
          sobre:
            r.tabla === 'usuario'
              ? `el usuario ${r.sobre_usuario ?? 'borrado'}`
              : r.tabla === 'dispositivo'
                ? `la computadora ${r.sobre_dispositivo ?? 'sin datos'}`
                : r.tabla,
          accion: r.accion,
          detalle: describirCambio(r.tabla, r.accion, r.datos_antes, r.datos_despues),
          ip: r.ip,
        })),
        total: Number(rows[0]?.total ?? 0),
      }
    })
  }

  dispositivos() {
    return this.datos.transaccion(async (tx) => ({ datos: await this.listarDispositivos(tx) }))
  }

  /**
   * Le pone nombre a una computadora. Queda en la auditoría: renombrar la PC de sistemas
   * como «PC del gerente» es una forma de borrar huellas.
   */
  nombrar(id: string, nombre: string | null, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await tx.select().from(dispositivo).where(eq(dispositivo.id, id)).limit(1)
      if (!antes) throw new ErrorAuditoria('NO_ENCONTRADO')

      await tx.update(dispositivo).set({ nombre }).where(eq(dispositivo.id, id))
      await tx.insert(auditoria).values({
        tenantId: sesion.tenantId,
        usuarioId: sesion.usuarioId,
        tabla: 'dispositivo',
        registroId: id,
        accion: 'modificacion',
        datosAntes: { nombre: antes.nombre },
        datosDespues: { nombre },
        ip: ip ?? null,
      })

      const [listado] = await this.listarDispositivos(tx, id)
      if (!listado) throw new ErrorAuditoria('NO_ENCONTRADO')
      return listado
    })
  }

  private async listarDispositivos(tx: Db, soloId?: string) {
    const { rows } = await tx.execute<{
      id: string
      nombre: string | null
      agente: string | null
      creado_en: Date
      ultimo_uso_en: Date
      usuarios: string[] | null
    }>(sql`
      select d.id, d.nombre, d.agente, d.creado_en, d.ultimo_uso_en,
             array_remove(array_agg(distinct u.nombre || ' ' || u.apellido), null) as usuarios
        from dispositivo d
        left join sesion s on s.dispositivo_id = d.id
        left join usuario u on u.id = s.usuario_id
       where (${soloId ?? null}::uuid is null or d.id = ${soloId ?? null}::uuid)
       group by d.id
       order by d.ultimo_uso_en desc
    `)

    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      agente: r.agente,
      creadoEn: new Date(r.creado_en).toISOString(),
      ultimoUsoEn: new Date(r.ultimo_uso_en).toISOString(),
      usuarios: r.usuarios ?? [],
    }))
  }
}
