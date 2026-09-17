import { and, asc, count, type Db, eq, ilike, or, sql } from '@gpb/db'
import { cliente, condicionIva, entidadComercial, proveedor, provincia } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { tipoPersonaDe } from '../clientes/clientes.service.ts'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { ErrorRepuestos } from './errores.ts'

type CondicionIibb = 'local' | 'convenio' | 'exento' | 'no_inscripto'

interface DatosProveedor {
  razonSocial: string
  condicionIva: number
  domicilio: string | null
  provinciaCodigo: number | null
  localidad: string | null
  codigoPostal: string | null
  email: string | null
  telefono: string | null
  numeroIibb: string | null
  condicionIibb: CondicionIibb
  condicionPago: string | null
}

/**
 * Los proveedores: la fábrica, los distribuidores, la casa de repuestos de la vuelta.
 *
 * Igual que el cliente, es un **rol** de la identidad fiscal: si el CUIT ya está cargado como
 * cliente, se le suma el rol y no se duplica.
 */
@Injectable()
export class ServicioProveedores {
  constructor(@Inject(DatosDelTenant) private readonly datos: DatosDelTenant) {}

  listar(entrada: {
    pagina: number
    porPagina: number
    buscar?: string | undefined
    estado: 'activos' | 'todos'
  }) {
    return this.datos.transaccion(async (tx) => {
      const texto = entrada.buscar?.trim()
      const digitos = texto?.replace(/[\s.-]/g, '')
      const filtro = and(
        entrada.estado === 'activos' ? eq(proveedor.activo, true) : undefined,
        texto
          ? or(
              ilike(entidadComercial.razonSocial, `%${texto}%`),
              digitos && /^[0-9]+$/.test(digitos)
                ? ilike(entidadComercial.numeroDocumento, `%${digitos}%`)
                : undefined,
            )
          : undefined,
      )
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(proveedor)
        .innerJoin(entidadComercial, eq(entidadComercial.id, proveedor.id))
        .where(filtro)
      const filas = await this.consulta(tx)
        .where(filtro)
        .orderBy(asc(entidadComercial.razonSocial))
        .limit(entrada.porPagina)
        .offset((entrada.pagina - 1) * entrada.porPagina)
      return { datos: filas.map(aSalida), total }
    })
  }

  ficha(id: string) {
    return this.datos.transaccion((tx) => this.uno(tx, id))
  }

  crear(entrada: DatosProveedor & { tipoDocumento: number; numeroDocumento: string }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)
      const { tipoDocumento, numeroDocumento, condicionPago, ...identidad } = entrada
      const [existente] = await tx
        .select()
        .from(entidadComercial)
        .where(
          and(
            eq(entidadComercial.tipoDocumento, tipoDocumento),
            eq(entidadComercial.numeroDocumento, numeroDocumento),
          ),
        )
        .limit(1)

      let id: string
      if (existente) {
        id = existente.id
        await tx
          .update(entidadComercial)
          .set({ ...identidad, actualizadoEn: new Date() })
          .where(eq(entidadComercial.id, id))
      } else {
        const [creada] = await tx
          .insert(entidadComercial)
          .values({
            tenantId: sesion.tenantId,
            tipoDocumento,
            numeroDocumento,
            tipoPersona: tipoPersonaDe(tipoDocumento, numeroDocumento),
            ...identidad,
          })
          .returning({ id: entidadComercial.id })
        if (!creada) throw new Error('No se pudo crear la identidad fiscal del proveedor.')
        id = creada.id
      }

      const [rol] = await tx
        .insert(proveedor)
        .values({ id, tenantId: sesion.tenantId, condicionPago })
        .onConflictDoNothing()
        .returning({ id: proveedor.id })
      if (!rol) {
        throw new ErrorRepuestos('PROVEEDOR_DUPLICADO', {
          id,
          razonSocial: existente?.razonSocial ?? identidad.razonSocial,
        })
      }
      await this.auditar(
        tx,
        sesion,
        id,
        'alta',
        {
          razonSocial: identidad.razonSocial,
          texto: existente
            ? 'Lo sumó como proveedor: ya estaba cargado como cliente'
            : 'Lo dio de alta',
        },
        ip,
      )
      return this.uno(tx, id)
    })
  }

  editar(id: string, entrada: DatosProveedor & { activo: boolean }, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const [antes] = await this.consulta(tx).where(eq(proveedor.id, id)).limit(1)
      if (!antes) throw new ErrorRepuestos('NO_ENCONTRADO')
      await this.verificarReferencias(tx, entrada.condicionIva, entrada.provinciaCodigo)
      const { activo, condicionPago, ...identidad } = entrada
      await tx
        .update(entidadComercial)
        .set({ ...identidad, actualizadoEn: new Date() })
        .where(eq(entidadComercial.id, id))
      await tx.update(proveedor).set({ condicionPago, activo }).where(eq(proveedor.id, id))
      await this.auditar(
        tx,
        sesion,
        id,
        antes.activo && !activo ? 'baja' : 'modificacion',
        {
          razonSocial: identidad.razonSocial,
          texto:
            antes.activo !== activo
              ? activo
                ? 'Lo volvió a activar'
                : 'Lo desactivó'
              : 'Lo modificó',
        },
        ip,
      )
      return this.uno(tx, id)
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private consulta(tx: Db) {
    return tx
      .select({
        entidad: entidadComercial,
        condicionPago: proveedor.condicionPago,
        activo: proveedor.activo,
        esCliente: sql<boolean>`${cliente.id} is not null`,
      })
      .from(proveedor)
      .innerJoin(entidadComercial, eq(entidadComercial.id, proveedor.id))
      .leftJoin(cliente, eq(cliente.id, proveedor.id))
      .$dynamic()
  }

  private async uno(tx: Db, id: string) {
    const [fila] = await this.consulta(tx).where(eq(proveedor.id, id)).limit(1)
    if (!fila) throw new ErrorRepuestos('NO_ENCONTRADO')
    return aSalida(fila)
  }

  private async verificarReferencias(tx: Db, condicion: number, provinciaCodigo: number | null) {
    const [iva] = await tx
      .select({ codigo: condicionIva.codigo })
      .from(condicionIva)
      .where(eq(condicionIva.codigo, condicion))
    if (!iva) throw new ErrorRepuestos('REFERENCIA_INVALIDA')
    if (provinciaCodigo !== null) {
      const [existe] = await tx
        .select({ codigo: provincia.codigo })
        .from(provincia)
        .where(eq(provincia.codigo, provinciaCodigo))
      if (!existe) throw new ErrorRepuestos('REFERENCIA_INVALIDA')
    }
  }

  private async auditar(
    tx: Db,
    sesion: Sesion,
    id: string,
    accion: 'alta' | 'modificacion' | 'baja',
    datosDespues: Record<string, unknown>,
    ip?: string,
  ) {
    await auditar(tx, sesion, {
      tabla: 'proveedor',
      registroId: id,
      accion,
      despues: datosDespues,
      ip,
    })
  }
}

function aSalida(fila: {
  entidad: typeof entidadComercial.$inferSelect
  condicionPago: string | null
  activo: boolean
  esCliente: boolean
}) {
  const e = fila.entidad
  return {
    id: e.id,
    tipoDocumento: e.tipoDocumento,
    numeroDocumento: e.numeroDocumento,
    tipoPersona: e.tipoPersona as 'fisica' | 'juridica',
    razonSocial: e.razonSocial,
    condicionIva: e.condicionIva,
    domicilio: e.domicilio,
    provinciaCodigo: e.provinciaCodigo,
    localidad: e.localidad,
    codigoPostal: e.codigoPostal,
    email: e.email,
    telefono: e.telefono,
    numeroIibb: e.numeroIibb,
    condicionIibb: e.condicionIibb as CondicionIibb,
    condicionPago: fila.condicionPago,
    activo: fila.activo,
    esCliente: fila.esCliente,
  }
}
