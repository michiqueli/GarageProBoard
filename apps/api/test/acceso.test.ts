import 'reflect-metadata'
import { publico } from '@garagepro/contracts'
import { construirHabilidades } from '@garagepro/core'
import { Controller, Get, type Type } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { oc } from '@orpc/contract'
import { implement } from '@orpc/nest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { contextoDelPedido, enContexto } from '../src/comun/contexto.ts'
import { DatosDelTenant } from '../src/comun/datos.ts'
import { Operacion, rutasSinAcceso, VerificadorAcceso } from '../src/comun/operacion.ts'
import { generarOpenApi } from '../src/documentacion/openapi.ts'

/**
 * El mecanismo, sin base ni aplicación: que sea imposible declarar una ruta sin decir
 * quién la usa, y que los datos no se lean fuera de un pedido con sesión.
 */

/**
 * Aplica un decorador de método a mano. Los tests no usan la sintaxis con arroba: el
 * transpilador de Vitest no la acepta en clases declaradas dentro de una función.
 */
function decorar(clase: Type, metodo: string, decorador: MethodDecorator): void {
  const descriptor = Object.getOwnPropertyDescriptor(clase.prototype, metodo)
  if (!descriptor) throw new Error(`${clase.name} no tiene el método ${metodo}`)
  decorador(clase.prototype, metodo, descriptor)
}

const contratoPublico = publico
  .route({ method: 'GET', path: '/prueba' })
  .output(z.object({ ok: z.boolean() }))

describe('una ruta sin acceso declarado', () => {
  it('revienta al cargar el controlador si su contrato no lo dice', () => {
    const sinDeclarar = oc.route({ method: 'GET', path: '/olvidada' }).output(z.object({}))

    expect(() => Operacion(sinDeclarar as never)).toThrow(
      /GET \/olvidada no declara quién puede usarla/,
    )
  })

  it('se detecta si alguien escribe un @Get a mano, sin @Operacion', () => {
    class Olvidado {
      aMano() {
        return {}
      }
    }
    decorar(Olvidado, 'aMano', Get('/a-mano'))

    expect(rutasSinAcceso([Olvidado])).toEqual(['Olvidado.aMano'])
  })

  it('la API no arranca con una ruta así', async () => {
    // Que la función detecte el caso no alcanza: hay que ver que el verificador esté
    // conectado y encuentre los controladores. Si no encontrara ninguno, pasaría callado.
    class Olvidado {
      aMano() {
        return {}
      }
    }
    Controller()(Olvidado)
    decorar(Olvidado, 'aMano', Get('/a-mano'))

    const modulo = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [Olvidado],
      providers: [VerificadorAcceso],
    }).compile()
    const app = modulo.createNestApplication(new FastifyAdapter(), { logger: false })

    await expect(app.init()).rejects.toThrow(/Rutas sin acceso declarado: Olvidado\.aMano/)
    await app.close()
  })

  it('no marca las que sí la declaran', () => {
    class EnRegla {
      prueba() {
        return implement(contratoPublico).handler(() => ({ ok: true }))
      }
    }
    decorar(EnRegla, 'prueba', Operacion(contratoPublico) as MethodDecorator)

    expect(rutasSinAcceso([EnRegla])).toEqual([])
  })
})

describe('los datos de una concesionaria', () => {
  const SESION = { usuarioId: 'u', tenantId: 't', sucursalId: 's', sesionId: 'x' }

  it('no se leen fuera de un pedido con sesión', () => {
    // Ni siquiera llega a la base: no hay de dónde sacar el tenant.
    const datos = new DatosDelTenant(null as never)

    expect(() => datos.transaccion(async () => 1)).toThrow(/No hay sesión en este contexto/)
  })

  it('dentro de un contexto, la sesión llega a través de lo asincrónico', async () => {
    const contexto = { sesion: SESION, habilidades: construirHabilidades([]) }

    const leido = await enContexto(contexto, async () => {
      await new Promise((r) => setTimeout(r, 1))
      return contextoDelPedido().sesion.tenantId
    })

    expect(leido).toBe('t')
  })
})

describe('el documento OpenAPI publica quién puede usar cada ruta', () => {
  // Quien integra no tiene nuestros tipos: tiene este documento.
  it('las rutas con permiso documentan el 401 y el 403', async () => {
    const spec = await generarOpenApi()
    const respuestas = Object.keys(spec.paths?.['/vehiculos']?.post?.responses ?? {})

    expect(respuestas).toContain('401')
    expect(respuestas).toContain('403')
  })

  it('las que sólo piden sesión documentan el 401', async () => {
    const spec = await generarOpenApi()
    const respuestas = Object.keys(spec.paths?.['/auth/yo']?.get?.responses ?? {})

    expect(respuestas).toContain('401')
    expect(respuestas).not.toContain('403')
  })

  it('las públicas no documentan ninguno de los dos', async () => {
    const spec = await generarOpenApi()
    const respuestas = Object.keys(spec.paths?.['/salud']?.get?.responses ?? {})

    expect(respuestas).not.toContain('401')
    expect(respuestas).not.toContain('403')
  })
})
