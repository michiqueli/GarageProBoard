import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { InterceptorContexto } from '../comun/contexto.ts'
import { VerificadorAcceso } from '../comun/operacion.ts'
import { AutenticadorDeEstaciones, InterceptorEstacion } from '../fichaje/estacion.ts'
import { ControladorAuth } from './auth.controller.ts'
import { ServicioAuth } from './auth.service.ts'
import { GuardiaAcceso } from './guard.ts'

@Module({
  imports: [
    DiscoveryModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secreto = process.env.JWT_SECRET
        // Sin secreto no se arranca. Un valor por omisión acá es una llave maestra
        // publicada en el repositorio de todo el que despliegue sin leer el README.
        if (!secreto || secreto.length < 32) {
          throw new Error('Falta JWT_SECRET, o tiene menos de 32 caracteres.')
        }
        return { secret: secreto, signOptions: { issuer: 'gpb' } }
      },
    }),
  ],
  controllers: [ControladorAuth],
  providers: [
    ServicioAuth,
    VerificadorAcceso,
    // La guardia lo necesita para resolver el token de una estación de fichaje.
    AutenticadorDeEstaciones,
    // Global: toda ruta pasa por acá, y cada una se abre declarando su acceso en el
    // contrato. Al revés — abierto por omisión — el endpoint que alguien se olvida de
    // proteger queda expuesto sin que nada avise.
    { provide: APP_GUARD, useClass: GuardiaAcceso },
    { provide: APP_INTERCEPTOR, useClass: InterceptorContexto },
    // El gemelo del anterior, para los pedidos que llegan de una estación: ahí no hay sesión
    // ni permisos, hay un aparato registrado.
    { provide: APP_INTERCEPTOR, useClass: InterceptorEstacion },
  ],
  exports: [ServicioAuth],
})
export class ModuloAuth {}
