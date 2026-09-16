import { Module } from '@nestjs/common'
import { ORPCModule } from '@orpc/nest'
import { ModuloAuth } from './auth/auth.module.ts'
import { ModuloBase } from './comun/base.module.ts'
import { ControladorConcesionarias } from './concesionarias/concesionarias.controller.ts'
import { ServicioConcesionarias } from './concesionarias/concesionarias.service.ts'

@Module({
  imports: [ORPCModule.forRoot({ interceptors: [] }), ModuloBase, ModuloAuth],
  controllers: [ControladorConcesionarias],
  providers: [ServicioConcesionarias],
})
export class ModuloPrincipal {}
