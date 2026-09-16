/**
 * Datos inventados para la demo. Nombres, patentes y modelos verosímiles de un
 * taller de concesionaria argentina: si los números se ven falsos, el cliente
 * deja de mirar el producto y empieza a mirar los datos.
 *
 * Vive detrás de `data.ts`. Cuando exista `apps/api` se reemplaza la fuente y
 * ninguna pantalla se entera.
 */

import type { Charge, HoldReason, WorkOrderStatus } from '@garagetick/shared'

export interface Mechanic {
  id: string
  code: string
  firstName: string
  lastName: string
  employeeNumber: string
}

export interface WorkOrder {
  id: string
  code: string
  number: string
  charge: Charge
  status: WorkOrderStatus
  openedAt: string
  licensePlate: string | null
  make: string
  model: string
  customerName: string
  description: string
}

export interface Session {
  id: string
  workOrderId: string
  userId: string
  startedAt: string
  endedAt: string | null
  closedBy: 'mechanic' | 'auto' | 'manager' | null
}

export const mechanics: Mechanic[] = [
  { id: 'm1', code: 'A7K2P9QX', firstName: 'Rubén', lastName: 'Gómez', employeeNumber: '104' },
  { id: 'm2', code: 'B3M8T5RW', firstName: 'Diego', lastName: 'Ferreyra', employeeNumber: '112' },
  { id: 'm3', code: 'C9N4V7ZK', firstName: 'Marcelo', lastName: 'Quiroga', employeeNumber: '118' },
  { id: 'm4', code: 'D2P6X1HJ', firstName: 'Sergio', lastName: 'Ibáñez', employeeNumber: '121' },
  { id: 'm5', code: 'E8R3Y4TM', firstName: 'Walter', lastName: 'Sosa', employeeNumber: '127' },
  { id: 'm6', code: 'F1S9Z2KN', firstName: 'Cristian', lastName: 'Ledesma', employeeNumber: '133' },
]

/** Minutos atrás → ISO. Los tiempos de la demo son relativos a cuando se abre. */
function hace(minutos: number): string {
  return new Date(Date.now() - minutos * 60_000).toISOString()
}

export const workOrders: WorkOrder[] = [
  {
    id: 'o1', code: 'K4M7P2QR', number: '45821', charge: 'customer', status: 'in_progress',
    openedAt: hace(190), licensePlate: 'AB123CD', make: 'Renault', model: 'Duster Iconic',
    customerName: 'Martínez, Hugo', description: 'Service de 40.000 km + ruido tren delantero',
  },
  {
    id: 'o2', code: 'L8N3R6TV', number: '45822', charge: 'warranty', status: 'in_progress',
    openedAt: hace(120), licensePlate: 'AF482KL', make: 'Renault', model: 'Alaskan Iconic 4x4',
    customerName: 'Distribuidora del Sur SRL', description: 'Falla módulo de confort — garantía',
  },
  {
    id: 'o3', code: 'M2P9S4WX', number: '45823', charge: 'customer', status: 'in_progress',
    openedAt: hace(75), licensePlate: 'PKR418', make: 'Renault', model: 'Kangoo Express',
    customerName: 'Beltrán, Silvia', description: 'Cambio de embrague completo',
  },
  {
    id: 'o4', code: 'N6R1T8YZ', number: '45824', charge: 'internal', status: 'on_hold',
    openedAt: hace(2340), licensePlate: null, make: 'Renault', model: 'Kardian Techno',
    customerName: 'Stock concesionaria', description: 'Preentrega unidad 0 km',
  },
  {
    id: 'o5', code: 'P3S7V2ZA', number: '45825', charge: 'warranty', status: 'on_hold',
    openedAt: hace(4120), licensePlate: 'AD901MN', make: 'Renault', model: 'Captur Intens',
    customerName: 'Ríos, Fernando', description: 'Caja de cambios — esperando autorización',
  },
  {
    id: 'o6', code: 'Q9T4W6BC', number: '45826', charge: 'customer', status: 'open',
    openedAt: hace(35), licensePlate: 'AE557RT', make: 'Renault', model: 'Sandero Stepway',
    customerName: 'Cabrera, Noelia', description: 'Service de 20.000 km',
  },
  {
    id: 'o7', code: 'R5V8X1DE', number: '45810', charge: 'customer', status: 'finished',
    openedAt: hace(1580), licensePlate: 'AC334HJ', make: 'Renault', model: 'Logan Life',
    customerName: 'Paredes, Julián', description: 'Frenos delanteros + alineación',
  },
  {
    id: 'o8', code: 'S1W3Y7FG', number: '45811', charge: 'warranty', status: 'finished',
    openedAt: hace(2900), licensePlate: 'AG128PQ', make: 'Renault', model: 'Oroch Outsider',
    customerName: 'Aguirre, Marta', description: 'Sensor de estacionamiento — garantía',
  },
  {
    id: 'o9', code: 'T7X2Z5HK', number: '45812', charge: 'internal', status: 'finished',
    openedAt: hace(4400), licensePlate: 'JQD772', make: 'Renault', model: 'Master Furgón',
    customerName: 'Stock usados', description: 'Puesta a punto para venta',
  },
]

/** Sesiones abiertas cuando arranca la demo: el tablero tiene que tener gente. */
export const sessions: Session[] = [
  { id: 's1', workOrderId: 'o1', userId: 'm1', startedAt: hace(83), endedAt: null, closedBy: null },
  { id: 's2', workOrderId: 'o2', userId: 'm2', startedAt: hace(41), endedAt: null, closedBy: null },
  { id: 's3', workOrderId: 'o3', userId: 'm4', startedAt: hace(12), endedAt: null, closedBy: null },
  // Gómez tocó dos órdenes hoy: a la mañana el Kangoo, ahora el Duster.
  { id: 's9', workOrderId: 'o3', userId: 'm1', startedAt: hace(405), endedAt: hace(332), closedBy: 'mechanic' },
  // Cerrada por el auto-cierre de fin de turno: el jefe la ve marcada para revisar.
  { id: 's4', workOrderId: 'o1', userId: 'm3', startedAt: hace(310), endedAt: hace(160), closedBy: 'auto' },
  { id: 's5', workOrderId: 'o7', userId: 'm5', startedAt: hace(1520), endedAt: hace(1310), closedBy: 'mechanic' },
  { id: 's6', workOrderId: 'o8', userId: 'm2', startedAt: hace(2880), endedAt: hace(2600), closedBy: 'auto' },
  { id: 's7', workOrderId: 'o9', userId: 'm6', startedAt: hace(4380), endedAt: hace(4100), closedBy: 'mechanic' },
  { id: 's8', workOrderId: 'o7', userId: 'm1', startedAt: hace(1400), endedAt: hace(1290), closedBy: 'mechanic' },
]

// ─── Reporte mensual ──────────────────────────────────────────────────────────
// Agregado del mes cerrado. Es otra escala de tiempo que las sesiones vivas de
// arriba, por eso va aparte: el reporte no se calcula sobre la demo del kiosco.

export interface HorasPorCargo {
  charge: Charge
  horas: number
  horasMesAnterior: number
}

export const reporteMensual = {
  mes: 'Agosto 2026',
  mesAnterior: 'Julio 2026',
  ordenesCerradas: 118,
  ordenesCerradasMesAnterior: 109,
  porCargo: [
    { charge: 'customer', horas: 412, horasMesAnterior: 388 },
    { charge: 'warranty', horas: 168, horasMesAnterior: 191 },
    { charge: 'internal', horas: 74, horasMesAnterior: 88 },
  ] as HorasPorCargo[],
  /** La diferencia entre lead time y mano de obra. Es lo que el dueño quiere ver. */
  tiempoMuerto: [
    { motivo: 'Esperando repuestos', horas: 96 },
    { motivo: 'Autorización del cliente', horas: 41 },
    { motivo: 'Autorización de garantía', horas: 33 },
    { motivo: 'En diagnóstico', horas: 18 },
    { motivo: 'Esperando elevador', horas: 12 },
    { motivo: 'Turno del cliente', horas: 9 },
  ],
  masLargas: [
    { numero: '45702', vehiculo: 'Renault Captur Intens', patente: 'AD901MN', dias: 11, horas: 14 },
    { numero: '45688', vehiculo: 'Renault Alaskan 4x4', patente: 'AF482KL', dias: 9, horas: 21 },
    { numero: '45751', vehiculo: 'Renault Kangoo Express', patente: 'PKR418', dias: 8, horas: 26 },
    { numero: '45719', vehiculo: 'Renault Duster Iconic', patente: 'AB123CD', dias: 7, horas: 12 },
    { numero: '45744', vehiculo: 'Renault Kardian Techno', patente: null, dias: 6, horas: 5 },
  ],
}

// ─── Esperas ──────────────────────────────────────────────────────────────────
// El motivo de espera es lo que explica por qué un auto estuvo 6 días en el
// taller. Sin esto el lead time es un número sin historia.

export interface Hold {
  id: string
  workOrderId: string
  reason: HoldReason
  startedAt: string
  endedAt: string | null
  recordedBy: string | null
}

export const holds: Hold[] = [
  {
    id: 'h1', workOrderId: 'o5', reason: 'warranty_approval',
    startedAt: hace(3900), endedAt: null, recordedBy: 'm3',
  },
  {
    id: 'h2', workOrderId: 'o4', reason: 'parts',
    startedAt: hace(2100), endedAt: null, recordedBy: 'm5',
  },
]
