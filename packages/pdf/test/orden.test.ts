import { PUNTOS_REVISION_INICIALES } from '@gpb/core'
import { describe, expect, it } from 'vitest'
import {
  type DatosEgresoImpreso,
  type DatosOrdenImpresa,
  generarEgresoPdf,
  generarOrdenPdf,
} from '../src/orden.ts'

const paginas = (pdf: Uint8Array) =>
  (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? []
  ).length

const ORDEN: DatosOrdenImpresa = {
  concesionaria: 'Automotores Litoral',
  sucursal: { nombre: 'Casa Central', domicilio: null, telefono: null },
  numero: 1234,
  qr: 'GT1:O:A7K2P9QX:4F8B2C1D9E',
  ingreso: '2026-09-16T09:42',
  entregaEstimada: null,
  vehiculo: {
    dominio: 'AE123BC',
    marcaModelo: 'Toyota Hilux',
    anio: 2022,
    color: null,
    chasis: '8AJFB8CD5N1234567',
    kilometraje: 48210,
    combustible: 'medio',
  },
  titular: null,
  trae: { nombre: null, telefono: null },
  paga: null,
  pedido: 'Service de 50.000 km',
  observaciones: null,
  hoja: null,
  danios: [],
  inventario: {},
  revision: [],
  asesor: 'Martín Gutiérrez',
  mecanico: null,
  items: [{ tipo: 'trabajo', descripcion: 'Service', cantidad: '1', total: '180000.00' }],
  total: '180000.00',
}

describe('la orden impresa', () => {
  it('sin revisión entra en una hoja por copia, como siempre', async () => {
    expect(paginas(await generarOrdenPdf(ORDEN))).toBe(2)
  })

  it('con todos los puntos sin contestar, la revisión no sale: no se revisó', async () => {
    const sinContestar = PUNTOS_REVISION_INICIALES.map((p) => ({
      nombre: p.nombre,
      estado: null,
      nota: null,
    }))
    expect(paginas(await generarOrdenPdf({ ...ORDEN, revision: sinContestar }))).toBe(2)
  })

  it('con la revisión entera, lo que no entra sigue en otra hoja en vez de perderse', async () => {
    const revisada = PUNTOS_REVISION_INICIALES.map((p, i) => ({
      nombre: p.nombre,
      estado: i % 7 === 0 ? ('rojo' as const) : ('verde' as const),
      nota: i % 7 === 0 ? 'Revisar con el cliente antes de seguir' : null,
    }))
    const items = Array.from({ length: 12 }, (_, i) => ({
      tipo: 'repuesto' as const,
      descripcion: `Repuesto ${i + 1}`,
      cantidad: '1',
      total: '1000.00',
    }))
    expect(paginas(await generarOrdenPdf({ ...ORDEN, revision: revisada, items }))).toBe(4)
  })

  it('firmada en la pantalla, la copia del cliente sale con la firma y sin una hoja de más', async () => {
    const pdf = await generarOrdenPdf({
      ...ORDEN,
      firma: { imagen: PNG_MINIMO, aclaracion: 'Juan Pérez' },
    })
    expect(paginas(pdf)).toBe(2)
    expect(Buffer.from(pdf).toString('latin1')).toMatch(/\/Subtype \/Image/)
  })

  it('una firma que no se puede leer no impide imprimirla: queda la línea para el papel', async () => {
    const pdf = await generarOrdenPdf({
      ...ORDEN,
      firma: { imagen: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), aclaracion: 'Juan Pérez' },
    })
    expect(paginas(pdf)).toBe(2)
    expect(Buffer.from(pdf).toString('latin1')).not.toMatch(/\/Subtype \/Image/)
  })
})

/** Un PNG de 1×1 de verdad: pdfkit lee la imagen entera, no sólo la cabecera. */
const PNG_MINIMO = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const EGRESO: DatosEgresoImpreso = {
  concesionaria: 'Automotores Litoral',
  sucursal: { nombre: 'Casa Central', domicilio: null, telefono: null },
  numero: 1234,
  ingreso: '2026-09-16T09:42',
  entrega: '2026-09-18T17:10',
  vehiculo: { dominio: 'AE123BC', marcaModelo: 'Toyota Hilux', chasis: '8AJFB8CD5N1234567' },
  titular: 'Transportes del Sur SRL',
  entregadaPor: 'Martín Gutiérrez',
  hecho: [
    {
      tipo: 'trabajo',
      descripcion: 'Service',
      cantidad: '1',
      total: '180000.00',
      codigosBarras: [],
    },
    {
      tipo: 'repuesto',
      descripcion: 'Pastillas de freno delanteras',
      cantidad: '1',
      total: '45000.00',
      codigosBarras: ['7790001234567'],
    },
  ],
  total: '225000.00',
  cobro: { factura: 'Factura B 0001-00000042' },
  noSeHizo: [{ descripcion: 'Neumáticos traseros', semaforo: 'ambar' }],
  entrada: { kilometraje: 48210, combustible: 'medio', inventario: { auxilio: 'esta' } },
  salida: { kilometraje: 48222, combustible: 'cuarto', inventario: { auxilio: 'esta' } },
  daniosNuevos: [],
  firma: { imagen: PNG_MINIMO, aclaracion: 'Juan Pérez' },
}

describe('la entrega impresa', () => {
  it('entra en una hoja, con la firma de la pantalla', async () => {
    const pdf = await generarEgresoPdf(EGRESO)
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-')
    expect(paginas(pdf)).toBe(1)
  })

  it('con muchos renglones sigue en otra hoja, sin firma y sin factura', async () => {
    const hecho = Array.from({ length: 40 }, (_, i) => ({
      tipo: 'repuesto' as const,
      descripcion: `Repuesto ${i + 1}`,
      cantidad: '1',
      total: '1000.00',
      codigosBarras: [`77900012345${String(i).padStart(2, '0')}`],
    }))
    const pdf = await generarEgresoPdf({
      ...EGRESO,
      hecho,
      firma: null,
      cobro: { sinFactura: 'Garantía', autorizadoPor: 'Martín Gutiérrez' },
      daniosNuevos: [{ tipo: 'rayon', nota: 'Puerta trasera' }],
    })
    expect(paginas(pdf)).toBeGreaterThan(1)
  })
})
