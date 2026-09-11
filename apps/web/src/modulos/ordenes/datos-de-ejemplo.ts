import type { Estado } from '../../componentes/EstadoOT.tsx'

export interface OrdenListada {
  numero: string
  dominio: string
  vehiculo: string
  cliente: string
  ingreso: string
  mecanico: string
  estado: Estado
  /** Cadena decimal, nunca un número: los importes no pasan por punto flotante. */
  total: string | null
}

/**
 * Datos de ejemplo hasta que exista el módulo de órdenes contra la API.
 *
 * Son plausibles a propósito — las dos formas de patente que existen, clientes con y
 * sin CUIT, importes con la magnitud real. Una pantalla probada con «Lorem ipsum» y
 * «$1,00» se rompe el día que entra «Municipalidad de Rafaela» y «$1.140.200,00».
 */
export const ORDENES: OrdenListada[] = [
  {
    numero: '00012847',
    dominio: 'AB123CD',
    vehiculo: 'Toyota Hilux SRX 2.8',
    cliente: 'Transportes del Sur SRL',
    ingreso: '09/09 08:14',
    mecanico: 'R. Paz',
    estado: 'en_proceso',
    total: '284500.00',
  },
  {
    numero: '00012846',
    dominio: 'AC844KL',
    vehiculo: 'VW Amarok Comfortline',
    cliente: 'Gómez, Luis Alberto',
    ingreso: '09/09 08:02',
    mecanico: 'D. Ruiz',
    estado: 'esperando_autorizacion',
    total: '1140200.00',
  },
  {
    numero: '00012845',
    dominio: 'MFV872',
    vehiculo: 'Ford Ranger XLT',
    cliente: 'Álvarez, Marcela',
    ingreso: '08/09 16:40',
    mecanico: 'R. Paz',
    estado: 'esperando_repuesto',
    total: '96800.00',
  },
  {
    numero: '00012844',
    dominio: 'AD901MN',
    vehiculo: 'Toyota Corolla XEI',
    cliente: 'Acuña, Jorge',
    ingreso: '08/09 15:22',
    mecanico: 'S. Molina',
    estado: 'en_proceso',
    total: '142300.00',
  },
  {
    numero: '00012843',
    dominio: 'AA412FT',
    vehiculo: 'Chevrolet S10 High Country',
    cliente: 'Agro Litoral SA',
    ingreso: '08/09 14:05',
    mecanico: 'D. Ruiz',
    estado: 'terminada',
    total: '512750.00',
  },
  {
    numero: '00012842',
    dominio: 'NPQ334',
    vehiculo: 'Renault Kangoo Express',
    cliente: 'Ñandú Distribuciones',
    ingreso: '08/09 11:48',
    mecanico: 'S. Molina',
    estado: 'esperando_repuesto',
    total: '74900.00',
  },
  {
    numero: '00012841',
    dominio: 'AF220RS',
    vehiculo: 'Peugeot 208 Allure',
    cliente: 'Pérez, Ana Laura',
    ingreso: '08/09 10:30',
    mecanico: 'L. Vega',
    estado: 'en_proceso',
    total: '88400.00',
  },
  {
    numero: '00012840',
    dominio: 'AE775BW',
    vehiculo: 'Fiat Cronos Drive',
    cliente: 'Sosa, Ramón',
    ingreso: '08/09 09:15',
    mecanico: 'L. Vega',
    estado: 'presupuestada',
    total: '61250.00',
  },
  {
    numero: '00012839',
    dominio: 'JKL118',
    vehiculo: 'VW Gol Trend',
    cliente: 'Benítez, Carla',
    ingreso: '07/09 17:52',
    mecanico: 'R. Paz',
    estado: 'terminada',
    total: '47900.00',
  },
  {
    numero: '00012838',
    dominio: 'AG018TY',
    vehiculo: 'Toyota Yaris XLS',
    cliente: 'Municipalidad de Rafaela',
    ingreso: '07/09 16:20',
    mecanico: 'S. Molina',
    estado: 'esperando_autorizacion',
    total: '203600.00',
  },
  {
    numero: '00012837',
    dominio: 'AB559HK',
    vehiculo: 'Ford Transit Furgón',
    cliente: 'Logística del Litoral SRL',
    ingreso: '07/09 15:03',
    mecanico: 'D. Ruiz',
    estado: 'en_proceso',
    total: '318700.00',
  },
  {
    numero: '00012836',
    dominio: 'RTY662',
    vehiculo: 'Chevrolet Onix LT',
    cliente: 'Fernández, Diego',
    ingreso: '07/09 12:41',
    mecanico: 'L. Vega',
    estado: 'recibida',
    total: null,
  },
  {
    numero: '00012835',
    dominio: 'AH304DV',
    vehiculo: 'Nissan Frontier XE',
    cliente: 'Campo Verde SA',
    ingreso: '07/09 11:10',
    mecanico: 'R. Paz',
    estado: 'terminada',
    total: '427100.00',
  },
  {
    numero: '00012834',
    dominio: 'AC661PL',
    vehiculo: 'Toyota Etios XLS',
    cliente: 'Ríos, Silvina',
    ingreso: '06/09 18:25',
    mecanico: 'S. Molina',
    estado: 'entregada',
    total: '39800.00',
  },
  {
    numero: '00012833',
    dominio: 'BCD447',
    vehiculo: 'Fiat Toro Freedom',
    cliente: 'Transportes del Sur SRL',
    ingreso: '06/09 16:00',
    mecanico: 'D. Ruiz',
    estado: 'entregada',
    total: '276350.00',
  },
  {
    numero: '00012832',
    dominio: 'AF882QW',
    vehiculo: 'VW Saveiro Cross',
    cliente: 'Molina, Héctor',
    ingreso: '06/09 14:37',
    mecanico: 'L. Vega',
    estado: 'entregada',
    total: '118900.00',
  },
  {
    numero: '00012831',
    dominio: 'AD115ZX',
    vehiculo: 'Renault Duster Iconic',
    cliente: 'Cabrera, Nora',
    ingreso: '06/09 10:12',
    mecanico: 'R. Paz',
    estado: 'entregada',
    total: '92400.00',
  },
  {
    numero: '00012830',
    dominio: 'GHJ209',
    vehiculo: 'Ford Ka SE',
    cliente: 'Suárez, Pablo',
    ingreso: '05/09 17:44',
    mecanico: 'S. Molina',
    estado: 'anulada',
    total: null,
  },
]
