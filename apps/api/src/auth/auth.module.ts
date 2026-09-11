import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { ControladorAuth } from './auth.controller.ts'
import { ServicioAuth } from './auth.service.ts'
import { GuardiaAuth } from './guard.ts'

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secreto = process.env.JWT_SECRET
        // Sin secreto no se arranca. Un valor por omisión acá es una llave maestra
        // publicada en el repositorio de todo el que despliegue sin leer el README.
        if (!secreto || secreto.length < 32) {
          throw new Error('Falta JWT_SECRET, o tiene menos de 32 caracteres.')
        }
        return { secret: secreto, signOptions: { issuer: 'garagetick' } }
      },
    }),
  ],
  controllers: [ControladorAuth],
  providers: [ServicioAuth, { provide: APP_GUARD, useClass: GuardiaAuth }],
  exports: [ServicioAuth],
})
export class ModuloAuth {}
