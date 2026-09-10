import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { ModuloPrincipal } from './app.module.ts'

const app = await NestFactory.create<NestFastifyApplication>(
  ModuloPrincipal,
  new FastifyAdapter({ trustProxy: true }),
  { bufferLogs: true },
)

app.useLogger(app.get(Logger))

// Las rutas del contrato se declaran sin prefijo; el /api se agrega acá una vez.
app.setGlobalPrefix('api')

const puerto = Number(process.env.API_PORT ?? 3000)
await app.listen(puerto, process.env.API_HOST ?? '0.0.0.0')

console.log(`API escuchando en http://localhost:${puerto}`)
