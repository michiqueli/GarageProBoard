// node scripts/muestra-orden.ts <carpeta>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generarOrdenPdf } from '../src/orden.ts'

const carpeta = process.argv[2] ?? '.'
writeFileSync(
  join(carpeta, 'orden.pdf'),
  await generarOrdenPdf({
    concesionaria: 'Automotores Litoral',
    sucursal: {
      nombre: 'Casa Central',
      domicilio: 'Bv. Pellegrini 2500, Santa Fe',
      telefono: '342 455-0000',
    },
    numero: 1234,
    qr: 'GT1:O:A7K2P9QX:4F8B2C1D9E',
    ingreso: '2026-09-16T09:42',
    prometidaPara: '2026-09-18',
    vehiculo: {
      dominio: 'AE123BC',
      marcaModelo: 'Toyota Hilux',
      anio: 2022,
      color: 'Blanco',
      chasis: '8AJFB8CD5N1234567',
      kilometraje: 48210,
      combustible: 'medio',
    },
    titular: { nombre: 'Transportes del Sur SRL', telefono: '342 411-2233' },
    trae: { nombre: 'Juan Gómez', telefono: '342 555-1234' },
    paga: 'Transportes del Sur SRL',
    pedido:
      'Service de 50.000 km. Hace ruido al frenar adelante, del lado del acompañante. Revisar luz de check engine.',
    observaciones: 'Rayón en paragolpes trasero izquierdo. Sin rueda de auxilio.',
    asesor: 'Martín Gutiérrez',
    mecanico: 'Pedro Sosa',
    items: [
      { tipo: 'trabajo', descripcion: 'Service 50.000 km', cantidad: '1', total: '180000.00' },
      { tipo: 'repuesto', descripcion: 'Filtro de aceite', cantidad: '1', total: '18500.00' },
      { tipo: 'repuesto', descripcion: 'Aceite 5W30 sintético', cantidad: '6', total: '72000.00' },
    ],
    total: '270500.00',
  }),
)
