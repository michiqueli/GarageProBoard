import { createPrivateKey } from 'node:crypto'
import {
  CertificadoRechazado,
  type Entorno,
  generarPedido,
  type MotivoRechazoCertificado,
  type ServicioFiscal,
  verificarCertificado,
} from '@gpb/afip'
import { and, type Db, desc, eq, inArray } from '@gpb/db'
import { certificadoAfip, empresa, puntoVenta } from '@gpb/db/schema'
import { Inject, Injectable } from '@nestjs/common'
import { auditar } from '../comun/auditoria.ts'
import type { Sesion } from '../comun/contexto.ts'
import { DatosDelTenant } from '../comun/datos.ts'
import { CajaFuerte, ClaveMaestraFaltante } from '../comun/secretos.ts'
import { FISCAL } from '../comun/simbolos.ts'

export class ErrorCertificado extends Error {
  constructor(
    readonly codigo:
      | 'NO_ENCONTRADA'
      | 'SIN_CLAVE_MAESTRA'
      | 'SIN_PEDIDO'
      | 'CERTIFICADO_RECHAZADO'
      | 'NADA_PARA_PROBAR'
      | 'AFIP_NO_ACEPTA'
      | 'CLAVE_ILEGIBLE',
    readonly datos?: { motivo: MotivoRechazoCertificado } | { detalle: string },
  ) {
    super(codigo)
  }
}

type FilaCertificado = typeof certificadoAfip.$inferSelect

/** La clave privada va atada a su empresa: copiada a otra fila, no se descifra. */
export const contextoClave = (empresaId: string) => `certificado_afip:${empresaId}`

const resumen = (c: FilaCertificado) => ({
  id: c.id,
  alias: c.alias,
  entorno: c.entorno as Entorno | null,
  vigenteDesde: c.vigenteDesde?.toISOString() ?? null,
  vigenteHasta: c.vigenteHasta?.toISOString() ?? null,
  creadoEn: c.creadoEn.toISOString(),
})

/**
 * Los certificados con los que factura cada razón social. El recorrido completo, con lo que
 * se hace en ARCA entre paso y paso, está en `docs/tecnicos/afip-certificados.md`.
 *
 * La prueba contra AFIP se hace **fuera** de toda transacción: AFIP puede tardar segundos, y
 * una transacción abierta mientras tanto retiene una conexión del pool. Se lee, se prueba,
 * y se escribe en otra transacción verificando que nadie haya cambiado el pedido en el medio.
 */
@Injectable()
export class ServicioCertificados {
  constructor(
    @Inject(DatosDelTenant) private readonly datos: DatosDelTenant,
    @Inject(CajaFuerte) private readonly caja: CajaFuerte,
    @Inject(FISCAL) private readonly fiscal: (entorno: Entorno) => ServicioFiscal,
  ) {}

  estado(empresaId: string) {
    return this.datos.transaccion((tx) => this.armar(tx, empresaId))
  }

  pedir(empresaId: string, alias: string, ip?: string) {
    if (!this.caja.disponible) return Promise.reject(new ErrorCertificado('SIN_CLAVE_MAESTRA'))
    return this.datos.transaccion(async (tx, sesion) => {
      const duenia = await this.empresa(tx, empresaId, true)
      const { pedidoPem, clavePrivadaPem } = await generarPedido({
        cuit: duenia.cuit,
        razonSocial: duenia.razonSocial,
        alias,
      })

      await tx
        .update(certificadoAfip)
        .set({ estado: 'descartado', actualizadoEn: new Date() })
        .where(
          and(eq(certificadoAfip.empresaId, empresaId), eq(certificadoAfip.estado, 'pendiente')),
        )

      const [creado] = await tx
        .insert(certificadoAfip)
        .values({
          tenantId: sesion.tenantId,
          empresaId,
          alias,
          pedido: pedidoPem,
          clavePrivadaCifrada: this.caja.cifrar(clavePrivadaPem, contextoClave(empresaId)),
        })
        .returning({ id: certificadoAfip.id })
      if (!creado) throw new Error('No se pudo guardar el pedido.')

      await this.auditar(
        tx,
        sesion,
        creado.id,
        'alta',
        {
          empresa: duenia.razonSocial,
          evento: 'pedido',
          alias,
        },
        ip,
      )
      return this.armar(tx, empresaId)
    })
  }

  /**
   * Un certificado que ya existe, con su clave: el de quien ya factura con otro sistema.
   * Queda como pedido pendiente con el certificado cargado, así la prueba es la misma que
   * para uno nuevo, y el que estaba activo sigue andando hasta que ésta pase.
   */
  importar(empresaId: string, certificadoPem: string, clavePrivadaPem: string, ip?: string) {
    if (!this.caja.disponible) return Promise.reject(new ErrorCertificado('SIN_CLAVE_MAESTRA'))
    try {
      createPrivateKey(clavePrivadaPem)
    } catch {
      return Promise.reject(new ErrorCertificado('CLAVE_ILEGIBLE'))
    }
    return this.datos.transaccion(async (tx, sesion) => {
      const duenia = await this.empresa(tx, empresaId, true)
      const leido = (() => {
        try {
          return verificarCertificado({ certificadoPem, clavePrivadaPem, cuit: duenia.cuit })
        } catch (error) {
          if (error instanceof CertificadoRechazado) {
            throw new ErrorCertificado('CERTIFICADO_RECHAZADO', { motivo: error.motivo })
          }
          throw error
        }
      })()

      await tx
        .update(certificadoAfip)
        .set({ estado: 'descartado', actualizadoEn: new Date() })
        .where(
          and(eq(certificadoAfip.empresaId, empresaId), eq(certificadoAfip.estado, 'pendiente')),
        )

      const [creado] = await tx
        .insert(certificadoAfip)
        .values({
          tenantId: sesion.tenantId,
          empresaId,
          alias: leido.alias,
          // No hubo pedido: el certificado se generó en otro lado.
          pedido: '',
          clavePrivadaCifrada: this.caja.cifrar(clavePrivadaPem.trim(), contextoClave(empresaId)),
          certificado: certificadoPem.trim(),
          entorno: leido.entorno,
          vigenteDesde: leido.vigenteDesde,
          vigenteHasta: leido.vigenteHasta,
        })
        .returning({ id: certificadoAfip.id })
      if (!creado) throw new Error('No se pudo guardar el certificado.')

      await this.auditar(
        tx,
        sesion,
        creado.id,
        'alta',
        {
          empresa: duenia.razonSocial,
          evento: 'importado',
          alias: leido.alias,
          entorno: leido.entorno,
          vigenteHasta: leido.vigenteHasta.toISOString().slice(0, 10),
        },
        ip,
      )
      return this.armar(tx, empresaId)
    })
  }

  cargar(empresaId: string, certificadoPem: string, ip?: string) {
    return this.datos.transaccion(async (tx, sesion) => {
      const duenia = await this.empresa(tx, empresaId)
      const [pendiente] = await tx
        .select()
        .from(certificadoAfip)
        .where(
          and(eq(certificadoAfip.empresaId, empresaId), eq(certificadoAfip.estado, 'pendiente')),
        )
        .for('update')
      if (!pendiente) throw new ErrorCertificado('SIN_PEDIDO')

      const leido = (() => {
        try {
          return verificarCertificado({
            certificadoPem,
            clavePrivadaPem: this.descifrar(pendiente),
            cuit: duenia.cuit,
          })
        } catch (error) {
          if (error instanceof CertificadoRechazado) {
            throw new ErrorCertificado('CERTIFICADO_RECHAZADO', { motivo: error.motivo })
          }
          throw error
        }
      })()

      await tx
        .update(certificadoAfip)
        .set({
          certificado: certificadoPem.trim(),
          entorno: leido.entorno,
          vigenteDesde: leido.vigenteDesde,
          vigenteHasta: leido.vigenteHasta,
          actualizadoEn: new Date(),
        })
        .where(eq(certificadoAfip.id, pendiente.id))

      await this.auditar(
        tx,
        sesion,
        pendiente.id,
        'modificacion',
        {
          empresa: duenia.razonSocial,
          evento: 'certificado',
          alias: pendiente.alias,
          entorno: leido.entorno,
          vigenteHasta: leido.vigenteHasta.toISOString().slice(0, 10),
        },
        ip,
      )
      return this.armar(tx, empresaId)
    })
  }

  async probar(empresaId: string, ip?: string) {
    // 1. Qué se prueba: el pedido con certificado si lo hay; si no, el activo.
    const aProbar = await this.datos.transaccion(async (tx) => {
      const duenia = await this.empresa(tx, empresaId)
      const filas = await tx
        .select()
        .from(certificadoAfip)
        .where(
          and(
            eq(certificadoAfip.empresaId, empresaId),
            inArray(certificadoAfip.estado, ['pendiente', 'activo']),
          ),
        )
      const elegido =
        filas.find((f) => f.estado === 'pendiente' && f.certificado) ??
        filas.find((f) => f.estado === 'activo')
      if (!elegido?.certificado || !elegido.entorno) throw new ErrorCertificado('NADA_PARA_PROBAR')
      return { duenia, fila: elegido, clave: this.descifrar(elegido) }
    })

    // 2. AFIP, sin transacción abierta.
    let enAfip: Awaited<ReturnType<ServicioFiscal['puntosDeVenta']>>
    try {
      enAfip = await this.fiscal(aProbar.fila.entorno as Entorno).puntosDeVenta({
        cuit: aProbar.duenia.cuit,
        certificadoPem: aProbar.fila.certificado as string,
        clavePrivadaPem: aProbar.clave,
      })
    } catch (error) {
      const causa = (error as { cause?: unknown }).cause ?? error
      throw new ErrorCertificado('AFIP_NO_ACEPTA', {
        detalle: String((causa as Error)?.message ?? causa).slice(0, 500),
      })
    }

    // 3. Si era un pedido, pasa a ser el activo.
    return this.datos.transaccion(async (tx, sesion) => {
      if (aProbar.fila.estado === 'pendiente') {
        const [sigue] = await tx
          .select({ id: certificadoAfip.id })
          .from(certificadoAfip)
          .where(
            and(
              eq(certificadoAfip.id, aProbar.fila.id),
              eq(certificadoAfip.estado, 'pendiente'),
              // Si en el medio cargaron otro certificado, lo probado ya no es lo que hay.
              eq(certificadoAfip.certificado, aProbar.fila.certificado as string),
            ),
          )
          .for('update')
        if (sigue) {
          const ahora = new Date()
          await tx
            .update(certificadoAfip)
            .set({ estado: 'reemplazado', actualizadoEn: ahora })
            .where(
              and(eq(certificadoAfip.empresaId, empresaId), eq(certificadoAfip.estado, 'activo')),
            )
          await tx
            .update(certificadoAfip)
            .set({ estado: 'activo', actualizadoEn: ahora })
            .where(eq(certificadoAfip.id, aProbar.fila.id))
          await this.auditar(
            tx,
            sesion,
            aProbar.fila.id,
            'modificacion',
            {
              empresa: aProbar.duenia.razonSocial,
              evento: 'activado',
              alias: aProbar.fila.alias,
              entorno: aProbar.fila.entorno,
            },
            ip,
          )
        }
      }

      const cargados = await tx
        .select({ numero: puntoVenta.numero })
        .from(puntoVenta)
        .where(and(eq(puntoVenta.empresaId, empresaId), eq(puntoVenta.activo, true)))
      const numerosCargados = new Set(cargados.map((c) => c.numero))
      const habilitados = new Set(
        enAfip.filter((p) => !p.bloqueado && !p.dadoDeBaja).map((p) => p.numero),
      )

      return {
        estado: await this.armar(tx, empresaId),
        puntosDeVenta: enAfip
          .map((p) => ({ ...p, cargado: numerosCargados.has(p.numero) }))
          .sort((a, b) => a.numero - b.numero),
        faltanEnAfip: [...numerosCargados].filter((n) => !habilitados.has(n)).sort((a, b) => a - b),
      }
    })
  }

  // ── piezas ──────────────────────────────────────────────────────────────────

  private descifrar(fila: FilaCertificado): string {
    try {
      return this.caja.descifrar(fila.clavePrivadaCifrada, contextoClave(fila.empresaId))
    } catch (error) {
      if (error instanceof ClaveMaestraFaltante) throw new ErrorCertificado('SIN_CLAVE_MAESTRA')
      throw error
    }
  }

  private async empresa(tx: Db, empresaId: string, bloquear = false) {
    const consulta = tx
      .select({
        id: empresa.id,
        razonSocial: empresa.razonSocial,
        cuit: empresa.cuit,
        condicionIva: empresa.condicionIva,
      })
      .from(empresa)
      .where(eq(empresa.id, empresaId))
    // Dos pedidos a la vez para la misma empresa: el segundo espera y descarta al primero,
    // en vez de chocar contra el índice de un solo pendiente.
    const [encontrada] = bloquear ? await consulta.for('update') : await consulta
    if (!encontrada) throw new ErrorCertificado('NO_ENCONTRADA')
    return encontrada
  }

  private async armar(tx: Db, empresaId: string) {
    const duenia = await this.empresa(tx, empresaId)
    const filas = await tx
      .select()
      .from(certificadoAfip)
      .where(
        and(
          eq(certificadoAfip.empresaId, empresaId),
          inArray(certificadoAfip.estado, ['pendiente', 'activo']),
        ),
      )
      .orderBy(desc(certificadoAfip.creadoEn))
    const activo = filas.find((f) => f.estado === 'activo')
    const pendiente = filas.find((f) => f.estado === 'pendiente')
    return {
      empresa: duenia,
      activo: activo ? resumen(activo) : null,
      pendiente: pendiente
        ? {
            ...resumen(pendiente),
            pedido: pendiente.pedido,
            conCertificado: !!pendiente.certificado,
          }
        : null,
    }
  }

  /** Nunca con la clave ni el certificado: la auditoría la lee mucha más gente. */
  private async auditar(
    tx: Db,
    sesion: Sesion,
    registroId: string,
    accion: 'alta' | 'modificacion',
    datosDespues: Record<string, unknown>,
    ip?: string,
  ) {
    await auditar(tx, sesion, {
      tabla: 'certificado_afip',
      registroId,
      accion,
      despues: datosDespues,
      ip,
    })
  }
}
