import { construirHabilidades } from '@gpb/core'
import { describe, expect, it } from 'vitest'
import {
  ArchivosDelTenant,
  crearAlmacenEnMemoria,
  crearAlmacenMinio,
  RutaInvalida,
} from '../src/comun/almacen.ts'
import { enContexto, type Sesion } from '../src/comun/contexto.ts'

/**
 * El aislamiento del almacén de archivos.
 *
 * Va aparte y con su propio archivo porque **un bucket no tiene RLS**: en la base, un tenant
 * mal pasado escribe donde no debe pero la política lo frena; acá el prefijo de la clave es
 * todo lo que separa una concesionaria de otra. Es la misma razón por la que el aislamiento de
 * Postgres tiene nueve tests propios.
 */

const sesion = (tenantId: string): Sesion => ({
  usuarioId: 'u',
  tenantId,
  sucursalId: 's',
  sesionId: 'ses',
})

function comoTenant<T>(tenantId: string, fn: () => T): T {
  return enContexto({ sesion: sesion(tenantId), habilidades: construirHabilidades([]) }, fn)
}

const contenido = (texto: string) => ({
  contenido: new TextEncoder().encode(texto),
  tipo: 'image/webp',
})

const texto = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('los archivos de la concesionaria', () => {
  it('la clave lleva el tenant de la sesión adelante, y nadie se lo pasa', async () => {
    const almacen = crearAlmacenEnMemoria()
    const archivos = new ArchivosDelTenant(almacen)

    await comoTenant('litoral', () => archivos.guardar('hojas/1/frente.webp', contenido('a')))

    expect(almacen.claves()).toEqual(['t/litoral/hojas/1/frente.webp'])
  })

  // El que importa: la misma ruta, dos concesionarias, y ninguna ve la del otro.
  it('dos concesionarias con la misma ruta no se pisan ni se leen', async () => {
    const archivos = new ArchivosDelTenant(crearAlmacenEnMemoria())
    const ruta = 'hojas/sedan/frente.webp'

    await comoTenant('litoral', () => archivos.guardar(ruta, contenido('el de litoral')))
    await comoTenant('norte', () => archivos.guardar(ruta, contenido('el de norte')))

    const deLitoral = await comoTenant('litoral', () => archivos.leer(ruta))
    const deNorte = await comoTenant('norte', () => archivos.leer(ruta))
    expect(texto(deLitoral?.contenido as Uint8Array)).toBe('el de litoral')
    expect(texto(deNorte?.contenido as Uint8Array)).toBe('el de norte')

    // Y borrar en una no toca la otra.
    await comoTenant('norte', () => archivos.borrar(ruta))
    expect(await comoTenant('norte', () => archivos.leer(ruta))).toBeNull()
    expect(await comoTenant('litoral', () => archivos.leer(ruta))).not.toBeNull()
  })

  /**
   * Las rutas se arman con partes que vienen del pedido. Un `..` que se cuele sube por encima
   * del prefijo del tenant, que es justo lo único que separa una concesionaria de otra.
   */
  it('una ruta que se escapa del tenant no llega al almacén', async () => {
    const almacen = crearAlmacenEnMemoria()
    const archivos = new ArchivosDelTenant(almacen)

    const invalidas = [
      '../norte/hojas/frente.webp',
      'hojas/../../norte/frente.webp',
      '/hojas/frente.webp',
      'hojas//frente.webp',
      'hojas/frente.webp/',
      '',
      'Hojas/Frente.webp',
      'hojas/frente webp',
    ]
    for (const ruta of invalidas) {
      expect(
        () => comoTenant('litoral', () => archivos.guardar(ruta, contenido('x'))),
        ruta,
      ).toThrow(RutaInvalida)
    }
    expect(almacen.claves()).toEqual([])
  })

  it('fuera de un pedido con sesión no se guarda nada', async () => {
    const archivos = new ArchivosDelTenant(crearAlmacenEnMemoria())
    expect(() => archivos.guardar('hojas/frente.webp', contenido('x'))).toThrow(/sesión/)
  })

  // La hoja que todavía nadie subió es el caso de todos los talleres el primer día.
  it('lo que no está se lee como nada, no como un error', async () => {
    const archivos = new ArchivosDelTenant(crearAlmacenEnMemoria())
    expect(await comoTenant('litoral', () => archivos.leer('hojas/sedan/arriba.webp'))).toBeNull()
  })
})

describe('el almacén sin configurar', () => {
  // Igual que el correo: un servidor sin almacén tiene que poder arrancar y facturar.
  it('deja arrancar la API, y recién falla al usarlo, diciendo qué falta', async () => {
    const almacen = crearAlmacenMinio({
      endpoint: undefined,
      region: undefined,
      accessKey: undefined,
      secretKey: undefined,
      bucket: undefined,
    })
    await expect(almacen.guardar('t/x/a.webp', contenido('x'))).rejects.toThrow(/S3_ENDPOINT/)
  })
})
