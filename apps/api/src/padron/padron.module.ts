import { readFileSync } from 'node:fs'
import { crearPadronArca, PadronNoDisponible, type ServicioPadron } from '@gpb/afip'
import { Module } from '@nestjs/common'
import { ControladorPadron } from './padron.controller.ts'
import { PADRON, ServicioConsultaPadron } from './padron.service.ts'

/**
 * El padrón con la credencial de GarageProBoard, leída del entorno:
 *
 *     AFIP_PADRON_CUIT, AFIP_PADRON_CERT, AFIP_PADRON_KEY, AFIP_PADRON_PRODUCCION
 *
 * Sin configurar, la API arranca igual y la consulta contesta «no disponible»: autocompletar
 * un CUIT es una ayuda, y su falta no puede impedir cargar los datos a mano.
 */
function crearPadron(): ServicioPadron {
  const cuit = process.env.AFIP_PADRON_CUIT
  const cert = process.env.AFIP_PADRON_CERT
  const key = process.env.AFIP_PADRON_KEY

  if (!cuit || !cert || !key) {
    return {
      consultar: () => Promise.reject(new PadronNoDisponible('Falta configurar AFIP_PADRON_*')),
    }
  }

  return crearPadronArca({
    cuit,
    certificadoPem: readFileSync(cert, 'utf8'),
    clavePrivadaPem: readFileSync(key, 'utf8'),
    produccion: process.env.AFIP_PADRON_PRODUCCION === 'true',
    carpetaTickets: process.env.AFIP_TICKETS,
  })
}

@Module({
  controllers: [ControladorPadron],
  providers: [{ provide: PADRON, useFactory: crearPadron }, ServicioConsultaPadron],
  // La facturación también lo usa: la letra de la factura sale de lo que informa el padrón.
  exports: [ServicioConsultaPadron],
})
export class ModuloPadron {}
