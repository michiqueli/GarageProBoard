import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { ModuloPrincipal } from './app.module.ts'
import { configurarApp } from './arranque.ts'

const app = await NestFactory.create<NestFastifyApplication>(
  ModuloPrincipal,
  new FastifyAdapter({ trustProxy: true }),
)

await configurarApp(app)

// Otro proceso y otro puerto que la API de los clientes. En producción, otro dominio.
const puerto = Number(process.env.BACKOFFICE_PORT ?? 3090)
await app.listen(puerto, process.env.BACKOFFICE_HOST ?? '127.0.0.1')

console.log(`Back-office API  http://localhost:${puerto}/api`)
