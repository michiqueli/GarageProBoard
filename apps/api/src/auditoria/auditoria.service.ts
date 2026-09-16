import { type Db, eq, sql } from '@gpb/db'
import { auditoria, condicionIva, dispositivo, provincia, rol, sucursal } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { DatosDelTenant } from '../comun/datos.ts'

export class ErrorAuditoria extends Error {
  constructor(readonly codigo: 'NO_ENCONTRADO') {
    super(codigo)
  }
}

type Foto = Record<string, unknown> | null

/**
 * Para traducir ids y códigos a nombres: roles y sucursales de la concesionaria, y los
 * catálogos de AFIP. «provincia: «vacío» → «12»» no le dice nada a quien audita.
 */
export interface Nombres {
  roles: ReadonlyMap<string, string>
  sucursales: ReadonlyMap<string, string>
  condicionesIva: ReadonlyMap<number, string>
  provincias: ReadonlyMap<number, string>
}

/** Los valores fijos que la base guarda como código, dichos como en la pantalla. */
const VALORES: Record<string, Record<string, string>> = {
  condicionIibb: {
    local: 'Contribuyente local',
    convenio: 'Convenio Multilateral',
    exento: 'Exento',
    no_inscripto: 'No inscripto',
  },
  uso: { facturacion: 'Facturación', remito: 'Remitos', otro: 'Otro' },
}

/** Un valor como lo lee una persona. Un código que ya no está en el catálogo se muestra tal cual. */
function legible(clave: string, valor: unknown, nombres: Nombres): string {
  if (valor === null || valor === undefined || valor === '') return 'vacío'
  if (clave === 'condicionIva') return nombres.condicionesIva.get(Number(valor)) ?? String(valor)
  if (clave === 'provinciaCodigo') return nombres.provincias.get(Number(valor)) ?? String(valor)
  return VALORES[clave]?.[String(valor)] ?? String(valor)
}

/** «domicilio: «Ruta 34 km 3» → «Ruta 34 km 3,5»», por cada campo que cambió. */
function cambiosDe(
  campos: Record<string, string>,
  antes: Foto,
  despues: Foto,
  nombres: Nombres,
): string[] {
  const partes: string[] = []
  for (const [clave, etiqueta] of Object.entries(campos)) {
    if (!(clave in (antes ?? {}))) continue
    const a = antes?.[clave] ?? null
    const d = despues?.[clave] ?? null
    if (a !== d) {
      partes.push(`${etiqueta}: «${legible(clave, a, nombres)}» → «${legible(clave, d, nombres)}»`)
    }
  }
  return partes
}

/** «el rol Mecánico», «los roles Mecánico y Cajero». */
function enumerar(singular: string, plural: string, nombres: string[]): string {
  if (nombres.length === 1) return `${singular} ${nombres[0]}`
  return `${plural} ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

/** Lo que se agregó y lo que se quitó de una lista, en palabras. */
function diferencia(
  antes: unknown,
  despues: unknown,
  nombres: ReadonlyMap<string, string>,
  singular: string,
  plural: string,
): string[] {
  const a = new Set(Array.isArray(antes) ? (antes as string[]) : [])
  const d = new Set(Array.isArray(despues) ? (despues as string[]) : [])
  // Un rol borrado después no tiene nombre: se dice, en vez de mostrar un id.
  const nombre = (id: string) => nombres.get(id) ?? 'uno que ya no existe'

  const agregados = [...d].filter((x) => !a.has(x)).map(nombre)
  const quitados = [...a].filter((x) => !d.has(x)).map(nombre)
  return [
    ...(agregados.length ? [`le agregó ${enumerar(singular, plural, agregados)}`] : []),
    ...(quitados.length ? [`le quitó ${enumerar(singular, plural, quitados)}`] : []),
  ]
}

function juntar(partes: string[]): string {
  if (partes.length === 0) return 'Sin cambios'
  const frase =
    partes.length === 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

/**
 * Qué cambió, contado como lo contaría una persona: «Le agregó el rol Administrador de
 * sistema y le quitó el rol Repuestero».
 *
 * Se arma al leer y no al escribir: la auditoría guarda los datos tal cual, y cómo se
 * cuentan puede mejorar sin reescribir la historia. Los nombres de roles y sucursales son
 * los de hoy.
 */
/** Los campos de empresas, sucursales y puntos de venta, como se llaman en la pantalla. */
const CAMPOS_ORGANIZACION: Record<string, string> = {
  razonSocial: 'razón social',
  nombreFantasia: 'nombre de fantasía',
  condicionIva: 'condición frente al IVA',
  inicioActividades: 'inicio de actividades',
  domicilioFiscal: 'domicilio fiscal',
  provinciaCodigo: 'provincia',
  numeroIibb: 'número de Ingresos Brutos',
  nombre: 'nombre',
  domicilio: 'domicilio',
  localidad: 'localidad',
  telefono: 'teléfono',
  uso: 'uso',
  modo: 'modo',
}

/** «la empresa Litoral SAS», «la sucursal Rafaela», «el punto de venta 0002». */
export function sobreQue(tabla: string, antes: Foto, despues: Foto): string {
  const dato = (clave: string) => despues?.[clave] ?? antes?.[clave]
  if (tabla === 'empresa') return `la empresa ${String(dato('razonSocial'))}`
  if (tabla === 'sucursal') return `la sucursal ${String(dato('nombre'))}`
  if (tabla === 'punto_venta') {
    return `el punto de venta ${String(dato('numero')).padStart(4, '0')}`
  }
  if (tabla === 'cliente') return `el cliente ${String(dato('razonSocial'))}`
  return tabla
}

/** Los campos de un cliente, como se llaman en la pantalla. */
const CAMPOS_CLIENTE: Record<string, string> = {
  razonSocial: 'nombre o razón social',
  condicionIva: 'condición frente al IVA',
  domicilio: 'domicilio',
  localidad: 'localidad',
  codigoPostal: 'código postal',
  provinciaCodigo: 'provincia',
  email: 'correo',
  telefono: 'teléfono',
  numeroIibb: 'número de Ingresos Brutos',
  condicionIibb: 'condición en Ingresos Brutos',
  observaciones: 'observaciones',
}

function describirCliente(accion: string, antes: Foto, despues: Foto, nombres: Nombres): string {
  if (accion === 'alta') {
    // Si la identidad ya existía, el alta pisó sus datos: se dice, y se dice qué cambió.
    if (!despues?.yaExistia) return 'Lo dio de alta'
    return juntar([
      'lo dio de alta sobre una identidad fiscal que ya existía',
      ...cambiosDe(CAMPOS_CLIENTE, antes, despues, nombres),
    ])
  }
  const partes: string[] = []
  if (antes?.activo !== despues?.activo) {
    partes.push(despues?.activo ? 'lo volvió a activar' : 'lo desactivó')
  }
  return juntar([...partes, ...cambiosDe(CAMPOS_CLIENTE, antes, despues, nombres)])
}

/** Qué cambió en una empresa, sucursal o punto de venta. Masculino y femenino, como se dice. */
function describirOrganizacion(
  tabla: string,
  accion: string,
  antes: Foto,
  despues: Foto,
  nombres: Nombres,
): string {
  const la = tabla === 'punto_venta' ? 'lo' : 'la'
  if (accion === 'alta') return `${la === 'lo' ? 'Lo' : 'La'} dio de alta`

  const partes: string[] = []
  const activoAntes = antes?.activa ?? antes?.activo
  const activoDespues = despues?.activa ?? despues?.activo
  if (activoAntes !== activoDespues) {
    partes.push(activoDespues ? `${la} volvió a activar` : `${la} desactivó`)
  }
  if (antes?.predeterminado !== despues?.predeterminado && tabla === 'punto_venta') {
    partes.push(
      despues?.predeterminado ? 'lo marcó como predeterminado' : 'le sacó el predeterminado',
    )
  }
  if (antes?.convenioMultilateral !== despues?.convenioMultilateral && tabla === 'empresa') {
    partes.push(
      despues?.convenioMultilateral
        ? 'la pasó a Convenio Multilateral'
        : 'la sacó de Convenio Multilateral',
    )
  }
  return juntar([...partes, ...cambiosDe(CAMPOS_ORGANIZACION, antes, despues, nombres)])
}

export function describirCambio(
  tabla: string,
  accion: string,
  antes: Foto,
  despues: Foto,
  nombres: Nombres,
): string {
  if (tabla === 'empresa' || tabla === 'sucursal' || tabla === 'punto_venta') {
    return describirOrganizacion(tabla, accion, antes, despues, nombres)
  }
  if (tabla === 'cliente') return describirCliente(accion, antes, despues, nombres)
  if (tabla === 'dispositivo') {
    return `Nombre: «${antes?.nombre ?? 'sin nombre'}» → «${despues?.nombre ?? 'sin nombre'}»`
  }
  if (despues?.password === 'regenerada') return 'Le generó una contraseña nueva'

  if (accion === 'alta') {
    const roles = Array.isArray(despues?.rolIds) ? (despues.rolIds as string[]) : []
    const sucursales = Array.isArray(despues?.sucursalIds) ? (despues.sucursalIds as string[]) : []
    const conRoles = roles.length
      ? `con ${enumerar(
          'el rol',
          'los roles',
          roles.map((id) => nombres.roles.get(id) ?? 'uno que ya no existe'),
        )}`
      : 'sin rol'
    const donde = sucursales.map((id) => nombres.sucursales.get(id) ?? 'una que ya no existe')
    return `Lo dio de alta ${conRoles}${donde.length ? `, en ${donde.join(', ')}` : ''}`
  }

  const partes: string[] = []
  if (antes?.activo !== despues?.activo) {
    partes.push(despues?.activo ? 'lo volvió a habilitar' : 'lo dio de baja')
  }
  partes.push(...diferencia(antes?.rolIds, despues?.rolIds, nombres.roles, 'el rol', 'los roles'))
  partes.push(
    ...diferencia(
      antes?.sucursalIds,
      despues?.sucursalIds,
      nombres.sucursales,
      'la sucursal',
      'las sucursales',
    ).map((parte) =>
      parte.replace('le agregó', 'le dio acceso a').replace('le quitó', 'le sacó el acceso a'),
    ),
  )
  for (const [clave, etiqueta] of [
    ['nombre', 'nombre'],
    ['apellido', 'apellido'],
  ] as const) {
    if (antes?.[clave] !== despues?.[clave]) {
      partes.push(
        `${etiqueta}: «${String(antes?.[clave] ?? '')}» → «${String(despues?.[clave] ?? '')}»`,
      )
    }
  }

  return juntar(partes)
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
      const nombres: Nombres = {
        roles: new Map(
          (await tx.select({ id: rol.id, nombre: rol.nombre }).from(rol)).map((r) => [
            r.id,
            r.nombre,
          ]),
        ),
        sucursales: new Map(
          (await tx.select({ id: sucursal.id, nombre: sucursal.nombre }).from(sucursal)).map(
            (r) => [r.id, r.nombre],
          ),
        ),
        condicionesIva: new Map(
          (
            await tx
              .select({ codigo: condicionIva.codigo, descripcion: condicionIva.descripcion })
              .from(condicionIva)
          ).map((c) => [c.codigo, c.descripcion]),
        ),
        provincias: new Map(
          (
            await tx.select({ codigo: provincia.codigo, nombre: provincia.nombre }).from(provincia)
          ).map((p) => [p.codigo, p.nombre]),
        ),
      }

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
                : sobreQue(r.tabla, r.datos_antes, r.datos_despues),
          accion: r.accion,
          detalle: describirCambio(r.tabla, r.accion, r.datos_antes, r.datos_despues, nombres),
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
