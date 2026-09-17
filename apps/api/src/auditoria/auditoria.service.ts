import { diferenciaDePermisos, type Permiso } from '@gpb/core'
import { type Db, eq, sql } from '@gpb/db'
import { condicionIva, dispositivo, provincia, rol, sucursal } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
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
  combustible: {
    nafta: 'Nafta',
    diesel: 'Diésel',
    gnc: 'GNC',
    electrico: 'Eléctrico',
    hibrido: 'Híbrido',
  },
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
  if (tabla === 'certificado_afip') {
    return `el certificado de AFIP de ${String(dato('empresa'))}`
  }
  if (tabla === 'comprobante' && dato('comprobante')) return `la ${String(dato('comprobante'))}`
  if (tabla === 'comprobante') return 'un comprobante'
  if (tabla === 'orden') return `la orden ${String(dato('numero'))}`
  if (tabla === 'repuesto') return `el repuesto ${String(dato('codigo'))}`
  if (tabla === 'pedido_repuestos') return `el pedido de repuestos ${String(dato('numero'))}`
  if (tabla === 'compra') return `la compra ${String(dato('numero'))}`
  if (tabla === 'proveedor') return `el proveedor ${String(dato('razonSocial'))}`
  if (tabla === 'rol') return `el rol ${String(dato('nombre'))}`
  if (tabla === 'vehiculo' || tabla === 'titularidad') {
    return `el vehículo ${String(dato('dominio') ?? dato('chasis'))}`
  }
  return tabla
}

/** «Lo creó a partir de Mecánico», «Le agregó ver clientes y le quitó anular comprobantes». */
function describirRol(accion: string, antes: Foto, despues: Foto): string {
  if (accion === 'alta') {
    return despues?.basadoEn ? `Lo creó a partir de ${String(despues.basadoEn)}` : 'Lo creó'
  }
  const permisos = (f: Foto) => (Array.isArray(f?.permisos) ? (f.permisos as Permiso[]) : [])
  const { agregados, quitados } = diferenciaDePermisos(permisos(antes), permisos(despues))
  const lista = (frases: string[]) =>
    frases.length <= 1 ? (frases[0] ?? '') : `${frases.slice(0, -1).join(', ')} y ${frases.at(-1)}`
  return juntar([
    ...(antes?.nombre !== despues?.nombre
      ? [`nombre: «${String(antes?.nombre)}» → «${String(despues?.nombre)}»`]
      : []),
    ...(agregados.length ? [`le agregó ${lista(agregados)}`] : []),
    ...(quitados.length ? [`le quitó ${lista(quitados)}`] : []),
  ])
}

/** Los campos de un vehículo, como se llaman en la pantalla. */
const CAMPOS_VEHICULO: Record<string, string> = {
  dominio: 'patente',
  marca: 'marca',
  modelo: 'modelo',
  anio: 'año',
  color: 'color',
  motor: 'motor',
  combustible: 'combustible',
  kilometraje: 'kilómetros',
  observaciones: 'observaciones',
}

/** «16/09/2026», como se escribe una fecha acá. */
function fecha(iso: unknown): string {
  const [a, m, d] = String(iso).split('-')
  return `${d}/${m}/${a}`
}

function describirVehiculo(
  tabla: string,
  accion: string,
  antes: Foto,
  despues: Foto,
  nombres: Nombres,
): string {
  if (tabla === 'titularidad') {
    const desde = fecha(despues?.desde)
    return despues?.anterior
      ? `Pasó de ${String(despues.anterior)} a ${String(despues?.cliente)}, desde el ${desde}`
      : `Le asignó como titular a ${String(despues?.cliente)}, desde el ${desde}`
  }
  if (accion === 'alta') return 'Lo dio de alta'
  return juntar(cambiosDe(CAMPOS_VEHICULO, antes, despues, nombres))
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

/** Lo que pasó con una orden de trabajo, en palabras del taller. */
const ESTADOS_ORDEN: Record<string, string> = {
  recibida: 'recibida',
  en_proceso: 'en proceso',
  esperando_repuesto: 'esperando repuesto',
  esperando_autorizacion: 'esperando autorización',
  terminada: 'terminada: pasó a caja',
  entregada: 'entregada',
}

const MEDIOS: Record<string, string> = {
  presencial: 'en persona',
  telefono: 'teléfono',
  whatsapp: 'WhatsApp',
  mail: 'mail',
}

function describirOrden(accion: string, despues: Foto): string {
  if (accion === 'alta') return `La abrió: «${String(despues?.pedido)}»`
  if (accion === 'baja') return 'La anuló'
  if (despues?.presupuesto !== undefined) {
    if (despues.enviadoA)
      return `Mandó el presupuesto ${String(despues.presupuesto)} a ${String(despues.enviadoA)}`
    if (despues.medio) {
      return `Registró la respuesta al presupuesto ${String(despues.presupuesto)}: ${String(despues.autoriza)} autorizó ${String(despues.autorizados)} y rechazó ${String(despues.rechazados)}, por ${MEDIOS[String(despues.medio)] ?? String(despues.medio)}`
    }
    return `Armó el presupuesto ${String(despues.presupuesto)} por $ ${String(despues.total).replace('.', ',')}, con ${String(despues.renglones)} renglones`
  }
  if (despues?.estado)
    return `La pasó a ${ESTADOS_ORDEN[String(despues.estado)] ?? String(despues.estado)}`
  if (despues?.items !== undefined) return `Cargó ${String(despues.items)} trabajos y repuestos`
  return 'Modificó la recepción'
}

/** Cada paso del certificado de AFIP. Nunca guarda ni muestra la clave. */
function describirCertificado(despues: Foto): string {
  const entorno = despues?.entorno === 'produccion' ? 'de producción' : 'de homologación'
  if (despues?.evento === 'pedido') {
    return `Generó el pedido de certificado para el computador «${String(despues.alias)}»`
  }
  if (despues?.evento === 'importado') {
    return `Cargó un certificado ${entorno} que ya existía, vigente hasta el ${fecha(despues.vigenteHasta)}`
  }
  if (despues?.evento === 'certificado') {
    return `Cargó el certificado ${entorno}, vigente hasta el ${fecha(despues.vigenteHasta)}`
  }
  if (despues?.evento === 'activado') {
    return `Lo probó contra AFIP y quedó activo: se factura con el computador «${String(despues.alias)}»`
  }
  return 'Lo modificó'
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
  if (tabla === 'certificado_afip') return describirCertificado(despues)
  if (tabla === 'orden') return describirOrden(accion, despues)
  // Repuestos anota la frase al hacer el cambio: cada operación sabe mejor que nadie qué pasó.
  if (['repuesto', 'pedido_repuestos', 'compra', 'proveedor'].includes(tabla)) {
    return String(despues?.texto ?? 'Lo modificó')
  }
  if (tabla === 'comprobante') {
    if (despues?.enviadoA) return `La mandó por mail a ${String(despues.enviadoA)}`
    return despues?.verificado
      ? 'Lo verificó contra AFIP: había quedado emitido'
      : String(despues?.comprobante ?? '').startsWith('Nota de Crédito')
        ? `La emitió a ${String(despues?.receptor)} por $ ${String(despues?.total).replace('.', ',')}, anulando la factura`
        : `La emitió a ${String(despues?.receptor)} por $ ${String(despues?.total).replace('.', ',')}`
  }
  if (tabla === 'rol') return describirRol(accion, antes, despues)
  if (tabla === 'vehiculo' || tabla === 'titularidad') {
    return describirVehiculo(tabla, accion, antes, despues, nombres)
  }
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

/** Los nombres de hoy para contar la auditoría: roles, sucursales y catálogos de AFIP. */
export async function cargarNombres(tx: Db): Promise<Nombres> {
  const mapa = <K, V>(filas: Array<{ k: K; v: V }>) => new Map(filas.map((f) => [f.k, f.v]))
  return {
    roles: mapa(await tx.select({ k: rol.id, v: rol.nombre }).from(rol)),
    sucursales: mapa(await tx.select({ k: sucursal.id, v: sucursal.nombre }).from(sucursal)),
    condicionesIva: mapa(
      await tx.select({ k: condicionIva.codigo, v: condicionIva.descripcion }).from(condicionIva),
    ),
    provincias: mapa(await tx.select({ k: provincia.codigo, v: provincia.nombre }).from(provincia)),
  }
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
      const nombres = await cargarNombres(tx)

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

  /**
   * Todo lo que cambió en la base, lo haya contado alguien o no.
   *
   * Al lado de cada cambio va la frase que dejó la operación, cuando dejó alguna: se juntan
   * por la transacción que las produjo, que las dos firman. Pero se devuelven **todas** las
   * filas, también las que nadie narró — que son justamente las que hay que poder ver.
   */
  cambiosCrudos(entrada: { pagina: number; porPagina: number }) {
    return this.datos.transaccion(async (tx) => {
      const nombres = await cargarNombres(tx)

      const { rows } = await tx.execute<{
        fecha: Date
        autor: string | null
        tabla: string
        antes: Foto
        despues: Foto
        accion: 'alta' | 'modificacion' | 'baja'
        ip: string | null
        narracion: Foto
        narracion_tabla: string | null
        narracion_accion: string | null
        total: string
      }>(sql`
        select c.creado_en as fecha,
               autor.nombre || ' ' || autor.apellido as autor,
               c.tabla, c.antes, c.despues, c.accion, c.ip,
               n.datos_despues as narracion,
               n.tabla as narracion_tabla,
               n.accion as narracion_accion,
               count(*) over () as total
          from auditoria_cambio c
          left join usuario autor on autor.id = c.usuario_id
          -- La frase de la misma operación, si la hubo. Por transacción y por registro: una
          -- operación puede tocar varias cosas, y cada una tiene la suya.
          left join lateral (
            select a.tabla, a.accion, a.datos_despues
              from auditoria a
             where a.transaccion = c.transaccion
               and a.registro_id = c.registro_id
             order by a.creado_en
             limit 1
          ) n on true
         order by c.creado_en desc, c.id
         limit ${entrada.porPagina} offset ${(entrada.pagina - 1) * entrada.porPagina}
      `)

      return {
        datos: rows.map((r) => ({
          fecha: new Date(r.fecha).toISOString(),
          autor: r.autor,
          tabla: NOMBRE_TABLA[r.tabla] ?? r.tabla,
          sobre: sobreQue(r.tabla, r.antes, r.despues),
          accion: r.accion,
          campos: camposQueCambiaron(r.antes, r.despues, nombres),
          ip: r.ip,
          narracion: r.narracion
            ? describirCambio(
                r.narracion_tabla ?? r.tabla,
                r.narracion_accion ?? r.accion,
                null,
                r.narracion,
                nombres,
              )
            : null,
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
      await auditar(tx, sesion, {
        tabla: 'dispositivo',
        registroId: id,
        accion: 'modificacion',
        antes: { nombre: antes.nombre },
        despues: { nombre },
        ip,
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

// ── El registro crudo ─────────────────────────────────────────────────────────

/**
 * El nombre de cada tabla como lo diría una persona. La que no esté acá se muestra con su
 * propio nombre, que es feo pero honesto: preferimos eso a esconder el cambio.
 */
const NOMBRE_TABLA: Record<string, string> = {
  empresa: 'la empresa',
  sucursal: 'la sucursal',
  punto_venta: 'el punto de venta',
  certificado_afip: 'el certificado de AFIP',
  comprobante: 'el comprobante',
  comprobante_renglon: 'un renglón de un comprobante',
  orden: 'la orden de trabajo',
  orden_presupuesto: 'el presupuesto',
  repuesto: 'el repuesto',
  repuesto_stock: 'la ubicación y el mínimo del repuesto',
  movimiento_stock: 'un movimiento de stock',
  pedido_repuestos: 'el pedido de repuestos',
  compra: 'la compra',
  entidad_comercial: 'los datos fiscales',
  cliente: 'el cliente',
  proveedor: 'el proveedor',
  empleado: 'el empleado',
  marca: 'la marca',
  modelo: 'el modelo',
  vehiculo: 'el vehículo',
  titularidad: 'la titularidad del vehículo',
  usuario: 'el usuario',
  rol: 'el rol',
  usuario_rol: 'los roles de un usuario',
  usuario_sucursal: 'el acceso de un usuario a una sucursal',
  dispositivo: 'la computadora',
}

/** Todos los campos que sabemos nombrar, juntos: el crudo puede traer cualquiera. */
const CAMPOS_CONOCIDOS: Record<string, string> = {
  ...CAMPOS_ORGANIZACION,
  ...CAMPOS_VEHICULO,
  ...CAMPOS_CLIENTE,
  chasis: 'chasis',
  codigo: 'código',
  descripcion: 'descripción',
  estado: 'estado',
  numero: 'número',
  total: 'total',
  activo: 'activo',
  activa: 'activa',
  ubicacion: 'ubicación',
  minimo: 'mínimo',
  precioVenta: 'precio de venta',
  costo: 'costo',
  hasta: 'hasta',
  desde: 'desde',
  legajo: 'legajo',
}

/** «código» si lo sabemos decir; si no, el nombre del campo tal cual. */
function nombreDeCampo(clave: string): string {
  return CAMPOS_CONOCIDOS[clave] ?? clave
}

/**
 * Qué cambió, campo por campo, sobre la foto cruda de la fila.
 *
 * A diferencia de la narrada, acá **no se elige qué mostrar**: se recorre todo lo que vino,
 * porque el sentido de este registro es que no haya nada escondido. Lo que no sabemos
 * nombrar sale con el nombre del campo.
 */
function camposQueCambiaron(antes: Foto, despues: Foto, nombres: Nombres): string[] {
  if (!antes) {
    return Object.entries(despues ?? {})
      .filter(([, v]) => v !== null && v !== '')
      .map(([k, v]) => `${nombreDeCampo(k)}: «${legible(k, v, nombres)}»`)
  }
  if (!despues) return []

  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)])
  return [...claves]
    .filter((k) => (antes[k] ?? null) !== (despues[k] ?? null))
    .map(
      (k) =>
        `${nombreDeCampo(k)}: «${legible(k, antes[k], nombres)}» → «${legible(k, despues[k], nombres)}»`,
    )
}
