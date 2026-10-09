import { PUNTOS_REVISION_INICIALES } from '@gpb/core'
import { describe, expect, it } from 'vitest'
import { type DatosOrdenImpresa, generarOrdenPdf } from '../src/orden.ts'

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
})
