// node scripts/muestra-orden.ts <carpeta>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type EstadoRevision, PUNTOS_REVISION_INICIALES } from '@gpb/core'
import { generarOrdenPdf } from '../src/orden.ts'

const carpeta = process.argv[2] ?? '.'

const MUESTRA: Record<string, { estado: EstadoRevision; nota: string | null }> = {
  correas: { estado: 'ambar', nota: 'La de accesorios, cuarteada' },
  bateria: { estado: 'rojo', nota: 'No arranca en frío: 9,8 V en reposo' },
  escobillas_delanteras: { estado: 'ambar', nota: null },
  neumatico_ti: { estado: 'ambar', nota: 'Dibujo al límite' },
}
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
    entregaEstimada: '2026-09-18',
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
    observaciones: 'Testigo de check engine prendido al recibirlo.',
    // Sin dibujo: la muestra no tiene de dónde sacar la imagen que carga cada taller, y así
    // se ve además que la hoja sale igual cuando todavía no hay ninguno.
    hoja: null,
    danios: [
      { tipo: 'rayon', x: 0.38, y: 0.92, nota: 'Del lado izquierdo, largo' },
      { tipo: 'golpe', x: 0.78, y: 0.32, nota: null },
      { tipo: 'roto', x: 0.58, y: 0.28, nota: 'Rajadura chica abajo' },
      { tipo: 'falta', x: 0.12, y: 0.3, nota: 'Falta la tapa' },
      { tipo: 'golpe', x: 0.5, y: 0.67, nota: 'El piso, de cargar' },
    ],
    inventario: {
      auxilio: 'falta',
      gato: 'esta',
      llave_rueda: 'esta',
      llave_antirrobo: 'esta',
      matafuego: 'esta',
      balizas: 'falta',
      cedula: 'esta',
    },
    // La revisión de una recepción real: casi todo bien, algo para reparar, uno urgente y la
    // inspección dinámica todavía sin hacer, que se completa después de la prueba de ruta.
    revision: PUNTOS_REVISION_INICIALES.map((p) => ({
      nombre: p.nombre,
      ...(p.seccion === 'dinamica'
        ? { estado: null, nota: null }
        : (MUESTRA[p.clave] ?? { estado: 'verde' as const, nota: null })),
    })),
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
