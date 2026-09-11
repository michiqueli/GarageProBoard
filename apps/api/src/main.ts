import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { ModuloPrincipal } from './app.module.ts'
import { montarDocumentacion } from './documentacion/documentacion.ts'

const app = await NestFactory.create<NestFastifyApplication>(
  ModuloPrincipal,
  new FastifyAdapter({ trustProxy: true }),
  { bufferLogs: true },
)

app.useLogger(app.get(Logger))

// Las rutas del contrato se declaran sin prefijo; el /api se agrega acá una vez.
app.setGlobalPrefix('api')

await montarDocumentacion(app)

// 3080 y no 3000: el VPS de pruebas ya tiene ocupada esa franja de puertos.
const puerto = Number(process.env.API_PORT ?? 3080)
await app.listen(puerto, process.env.API_HOST ?? '0.0.0.0')

console.log(`API   http://localhost:${puerto}/api`)
console.log(`Docs  http://localhost:${puerto}/api/docs`)
