import { ALICUOTAS_IVA, urlQr } from '@gpb/afip'
import { contrato } from '@gpb/contracts'
import { type DatosFacturaImpresa, generarFacturaPdf } from '@gpb/pdf'
import { Controller, Inject, Logger, Req } from '@nestjs/common'
import { implement } from '@orpc/nest'
import { Decimal } from 'decimal.js'
import type { FastifyRequest } from 'fastify'
import { Operacion } from '../comun/operacion.ts'
import { ErrorComprobantes, ServicioComprobantes } from './comprobantes.service.ts'

const c = contrato.comprobantes

/** Los errores del servicio, con los del contrato. Lo demás sale como 500. */
function traducir<E extends Partial<Record<ErrorComprobantes['codigo'], unknown>>>(
  error: unknown,
  errores: E,
): never {
  if (error instanceof ErrorComprobantes) {
    const fabricar = errores[error.codigo] as ((opciones?: { data?: unknown }) => Error) | undefined
    if (fabricar)
      throw error.datos && Object.keys(error.datos).length
        ? fabricar({ data: error.datos })
        : fabricar()
  }
  throw error
}

const DOCUMENTOS: Record<number, string> = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI' }
const ETIQUETAS_IVA: Array<[number, string]> = [
  [6, 'IVA 27%'],
  [5, 'IVA 21%'],
  [4, 'IVA 10,5%'],
  [8, 'IVA 5%'],
  [9, 'IVA 2,5%'],
  [3, 'IVA 0%'],
]

type ParaImprimir = Awaited<ReturnType<ServicioComprobantes['paraImprimir']>>

/**
 * Del comprobante guardado a lo que dibuja el PDF. No se recalcula nada fiscal: los totales
 * son los que se informaron a AFIP. Lo único que se calcula es el precio sin IVA de cada
 * renglón de una A, que es sólo para mostrar.
 */
export function aImpresion({
  comprobante: d,
  emisor,
  condicionReceptor,
}: ParaImprimir): DatosFacturaImpresa {
  const letra = d.letra as 'A' | 'B' | 'C'
  const sinIva = (valor: string, codigo: number) =>
    new Decimal(valor)
      .dividedBy(new Decimal(1).plus(new Decimal(ALICUOTAS_IVA[codigo] ?? '0').dividedBy(100)))
      .toDecimalPlaces(2)
      .toFixed(2)

  return {
    emisor: {
      nombreFantasia: emisor.nombreFantasia,
      razonSocial: emisor.razonSocial,
      domicilio: [emisor.domicilio, emisor.provincia].filter(Boolean).join(' - '),
      condicionIva: emisor.condicionIva,
      cuit: emisor.cuit,
      ingresosBrutos: emisor.numeroIibb ?? emisor.cuit,
      inicioActividades: emisor.inicioActividades ?? '',
    },
    comprobante: {
      letra,
      codigo: d.tipoComprobante,
      nombre: d.nombre.replace(/ [ABCEM]$/, '').toUpperCase(),
      puntoVenta: d.puntoVenta,
      numero: d.numero,
      fecha: d.fecha,
      periodo: d.servicio ?? undefined,
    },
    receptor: {
      tipoDocumento: DOCUMENTOS[d.tipoDocReceptor] ?? null,
      documento: d.tipoDocReceptor === 99 ? null : d.numeroDocReceptor,
      nombre: d.receptorNombre,
      condicionIva: condicionReceptor,
      domicilio: d.receptorDomicilio,
      condicionVenta: d.condicionVenta,
    },
    renglones: d.renglones.map((r) => {
      const bruto = new Decimal(r.cantidad).times(r.precioUnitario).toDecimalPlaces(2)
      const bonificacion = bruto.minus(r.total).toFixed(2)
      return letra === 'A'
        ? {
            codigo: r.codigo,
            descripcion: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            precioUnitario: sinIva(r.precioUnitario, r.codigoAlicuota),
            bonificacionPorcentaje: r.bonificacionPorcentaje,
            importeBonificacion: sinIva(bonificacion, r.codigoAlicuota),
            subtotal: sinIva(r.total, r.codigoAlicuota),
            alicuota: `${String(ALICUOTAS_IVA[r.codigoAlicuota]).replace('.', ',')}%`,
            subtotalConIva: r.total,
          }
        : {
            codigo: r.codigo,
            descripcion: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            precioUnitario: r.precioUnitario,
            bonificacionPorcentaje: r.bonificacionPorcentaje,
            importeBonificacion: bonificacion,
            subtotal: r.total,
          }
    }),
    totales: {
      netoGravado: letra === 'A' ? d.importeNeto : undefined,
      ivaPorAlicuota:
        letra === 'A'
          ? ETIQUETAS_IVA.map(([codigo, etiqueta]) => ({
              etiqueta,
              importe: d.alicuotas.find((a) => a.codigoAlicuota === codigo)?.importe ?? '0',
            }))
          : undefined,
      otrosTributos: '0',
      total: d.importeTotal,
      // Ley 27.743, régimen de transparencia fiscal: la B dice cuánto IVA contiene.
      ivaContenido: letra === 'B' ? d.importeIva : undefined,
    },
    cae: d.cae ?? '',
    vencimientoCae: d.vencimientoCae ?? '',
    urlQr: urlQr({
      fecha: d.fecha,
      cuitEmisor: emisor.cuit,
      puntoVenta: d.puntoVenta,
      tipoComprobante: d.tipoComprobante,
      numero: d.numero,
      importeTotal: d.importeTotal,
      tipoDocReceptor: d.tipoDocReceptor,
      numeroDocReceptor: d.numeroDocReceptor,
      cae: d.cae ?? '',
    }),
  }
}

@Controller()
export class ControladorComprobantes {
  private readonly log = new Logger('Comprobantes')

  constructor(@Inject(ServicioComprobantes) private readonly servicio: ServicioComprobantes) {}

  @Operacion(c.opciones)
  opciones() {
    return implement(c.opciones).handler(() => this.servicio.opciones())
  }

  @Operacion(c.receptor)
  receptor() {
    return implement(c.receptor).handler(({ input: { puntoVentaId, ...pedido }, errors }) =>
      this.servicio.receptor(puntoVentaId, pedido).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.emitir)
  emitir(@Req() pedido: FastifyRequest) {
    return implement(c.emitir).handler(({ input, errors }) =>
      this.servicio.emitir(input, pedido.ip).catch((e) => {
        if (e instanceof ErrorComprobantes && e.codigo === 'AFIP_NO_RESPONDE') {
          this.log.warn(`AFIP no contestó al emitir: ${JSON.stringify(e.datos)}`)
        }
        return traducir(e, errors)
      }),
    )
  }

  @Operacion(c.verificar)
  verificar(@Req() pedido: FastifyRequest) {
    return implement(c.verificar).handler(({ input, errors }) =>
      this.servicio.verificar(input.id, pedido.ip).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.listar)
  listar() {
    return implement(c.listar).handler(({ input }) => this.servicio.listar(input))
  }

  @Operacion(c.ficha)
  ficha() {
    return implement(c.ficha).handler(({ input, errors }) =>
      this.servicio.ficha(input.id).catch((e) => traducir(e, errors)),
    )
  }

  @Operacion(c.pdf)
  pdf() {
    return implement(c.pdf).handler(async ({ input, errors }) => {
      const datos = await this.servicio.paraImprimir(input.id).catch((e) => traducir(e, errors))
      const bytes = await generarFacturaPdf(aImpresion(datos))
      const d = datos.comprobante
      const nombre = `${d.nombre.replace(/ /g, '-')}-${String(d.puntoVenta).padStart(5, '0')}-${String(d.numero).padStart(8, '0')}.pdf`
      return new File([bytes], nombre, { type: 'application/pdf' })
    })
  }
}
