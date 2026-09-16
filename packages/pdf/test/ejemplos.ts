import type { DatosFacturaImpresa } from '../src/factura.ts'

/**
 * La Factura B 00008-00000007 que se emitió de prueba el 16/09/2026, con el CAE real.
 * Los datos del emisor son de ejemplo.
 */
export const FACTURA_B: DatosFacturaImpresa = {
  emisor: {
    nombreFantasia: 'Taller Ejemplo',
    razonSocial: 'TALLER EJEMPLO S.R.L.',
    domicilio: 'Av. Siempreviva 742 - Mendoza, Mendoza',
    condicionIva: 'IVA Responsable Inscripto',
    cuit: '30712345671',
    ingresosBrutos: '0712345671',
    inicioActividades: '2015-03-01',
  },
  comprobante: {
    letra: 'B',
    codigo: 6,
    nombre: 'FACTURA',
    puntoVenta: 8,
    numero: 7,
    fecha: '2026-09-16',
  },
  receptor: {
    tipoDocumento: null,
    documento: null,
    nombre: 'Consumidor Final',
    condicionIva: 'Consumidor Final',
    domicilio: null,
    condicionVenta: 'Contado',
  },
  renglones: [
    {
      codigo: null,
      descripcion: 'Prueba de facturación electrónica',
      cantidad: '1',
      unidad: 'unidades',
      precioUnitario: '1',
      bonificacionPorcentaje: '0',
      importeBonificacion: '0',
      subtotal: '1',
    },
  ],
  totales: { otrosTributos: '0', total: '1.00', ivaContenido: '0.17' },
  cae: '86373382230591',
  vencimientoCae: '2026-09-26',
  urlQr: 'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyNi0wOS0xNiJ9',
}

export const FACTURA_A: DatosFacturaImpresa = {
  ...FACTURA_B,
  comprobante: { ...FACTURA_B.comprobante, letra: 'A', codigo: 1, numero: 123 },
  receptor: {
    tipoDocumento: 'CUIT',
    documento: '30500010912',
    nombre: 'TRANSPORTES DEL OESTE S.A.',
    condicionIva: 'IVA Responsable Inscripto',
    domicilio: 'Ruta 7 km 1030 - Luján de Cuyo, Mendoza',
    condicionVenta: 'Cuenta Corriente',
  },
  renglones: [
    {
      codigo: 'FIL-001',
      descripcion: 'Filtro de aceite',
      cantidad: '2',
      unidad: 'unidades',
      precioUnitario: '8264.46',
      bonificacionPorcentaje: '0',
      importeBonificacion: '0',
      subtotal: '16528.92',
      alicuota: '21%',
      subtotalConIva: '20000.00',
    },
    {
      codigo: 'MO',
      descripcion:
        'Mano de obra: service de 10.000 km, cambio de aceite y filtros, revisión de frenos y tren delantero',
      cantidad: '1',
      unidad: 'unidades',
      precioUnitario: '45000',
      bonificacionPorcentaje: '0',
      importeBonificacion: '0',
      subtotal: '45000',
      alicuota: '21%',
      subtotalConIva: '54450',
    },
  ],
  totales: {
    netoGravado: '61528.92',
    ivaPorAlicuota: [
      { etiqueta: 'IVA 27%', importe: '0' },
      { etiqueta: 'IVA 21%', importe: '12921.08' },
      { etiqueta: 'IVA 10,5%', importe: '0' },
      { etiqueta: 'IVA 5%', importe: '0' },
      { etiqueta: 'IVA 2,5%', importe: '0' },
      { etiqueta: 'IVA 0%', importe: '0' },
    ],
    otrosTributos: '0',
    total: '74450.00',
  },
}
