import { Module } from '@nestjs/common'
import { APP_GUARD, DiscoveryModule } from '@nestjs/core'
import { VerificadorAcceso } from '../comun/operacion.ts'
import { ControladorAuth } from './auth.controller.ts'
import { ServicioAuth } from './auth.service.ts'
import { GuardiaOperador } from './guard.ts'

@Module({
  imports: [DiscoveryModule],
  controllers: [ControladorAuth],
  providers: [
    ServicioAuth,
    VerificadorAcceso,
    // Global y cerrada por omisión, como en la API: cada ruta se abre en el contrato.
    { provide: APP_GUARD, useClass: GuardiaOperador },
  ],
})
export class ModuloAuth {}
