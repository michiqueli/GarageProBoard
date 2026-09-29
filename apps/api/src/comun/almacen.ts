import { Inject, Injectable } from '@nestjs/common'
import { Client } from 'minio'
import { contextoDelPedido } from './contexto.ts'
import { ALMACEN } from './simbolos.ts'

export interface Objeto {
  contenido: Uint8Array
  tipo: string
}

/**
 * Los archivos que el sistema guarda, detrás de un puerto.
 *
 * En desarrollo y en producción es MinIO; en los tests, uno en memoria. Nada del resto del
 * sistema sabe cuál de los dos es, y por eso una prueba de la recepción no necesita un
 * contenedor más de los que ya levanta.
 *
 * Trabaja con claves completas. Quien lo usa **no** arma claves: usa `ArchivosDelTenant`.
 */
export interface Almacen {
  guardar(clave: string, objeto: Objeto): Promise<void>
  leer(clave: string): Promise<Objeto | null>
  borrar(clave: string): Promise<void>
}

export class AlmacenNoConfigurado extends Error {
  constructor() {
    super('Falta S3_ENDPOINT: el servidor no tiene configurado dónde guardar los archivos.')
    this.name = 'AlmacenNoConfigurado'
  }
}

export class RutaInvalida extends Error {
  constructor(readonly ruta: string) {
    super('Esa ruta de archivo no es válida.')
    this.name = 'RutaInvalida'
  }
}

/**
 * Minúsculas, números y `-` `_` `.` adentro de cada tramo, separados por `/`.
 *
 * Es deliberadamente angosta: sin `..`, sin barra al principio ni al final, sin tramos vacíos.
 * Una ruta se arma con partes que vienen del pedido —un id, una vista—, y un `..` que se cuele
 * en un almacén de objetos se lleva puesto el prefijo del tenant, que es justo lo único que
 * separa una concesionaria de otra.
 */
const RUTA = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*(?:\/[a-z0-9]+(?:[-_.][a-z0-9]+)*)*$/

/**
 * Los archivos de la concesionaria que está pidiendo.
 *
 * Es el gemelo de `DatosDelTenant`, y existe por el mismo motivo: **no recibe el tenant**, lo
 * toma de la sesión del pedido. Acá pesa más todavía, porque un bucket no tiene RLS. En la base
 * un tenant mal pasado escribe en la concesionaria equivocada pero RLS lo frena; en el almacén
 * no hay nada atrás. El prefijo `t/<tenantId>/` es todo el aislamiento, así que no puede haber
 * un parámetro que alguien pase mal.
 */
@Injectable()
export class ArchivosDelTenant {
  constructor(@Inject(ALMACEN) private readonly almacen: Almacen) {}

  guardar(ruta: string, objeto: Objeto): Promise<void> {
    return this.almacen.guardar(this.clave(ruta), objeto)
  }

  leer(ruta: string): Promise<Objeto | null> {
    return this.almacen.leer(this.clave(ruta))
  }

  borrar(ruta: string): Promise<void> {
    return this.almacen.borrar(this.clave(ruta))
  }

  private clave(ruta: string): string {
    if (!RUTA.test(ruta)) throw new RutaInvalida(ruta)
    const { sesion } = contextoDelPedido()
    return `t/${sesion.tenantId}/${ruta}`
  }
}

/** El almacén de los tests: rápido, sin contenedor y sin estado entre pruebas. */
export function crearAlmacenEnMemoria(): Almacen & { claves(): string[] } {
  const objetos = new Map<string, Objeto>()
  return {
    guardar(clave, objeto) {
      objetos.set(clave, { contenido: Uint8Array.from(objeto.contenido), tipo: objeto.tipo })
      return Promise.resolve()
    },
    leer(clave) {
      return Promise.resolve(objetos.get(clave) ?? null)
    },
    borrar(clave) {
      objetos.delete(clave)
      return Promise.resolve()
    },
    claves: () => [...objetos.keys()],
  }
}

export interface ConfigAlmacen {
  endpoint: string | undefined
  accessKey: string | undefined
  secretKey: string | undefined
  bucket: string | undefined
}

/**
 * MinIO, hablado por la API de S3: el día que esto sea otra cosa, cambia acá y nada más.
 *
 * Sin configurar, la API arranca igual y guardar falla con un error que dice qué falta — como
 * el correo. Un servidor sin almacén tiene que poder facturar.
 */
export function crearAlmacenMinio(config: ConfigAlmacen): Almacen {
  const { endpoint, accessKey, secretKey, bucket } = config
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return {
      guardar: () => Promise.reject(new AlmacenNoConfigurado()),
      leer: () => Promise.reject(new AlmacenNoConfigurado()),
      borrar: () => Promise.reject(new AlmacenNoConfigurado()),
    }
  }

  const url = new URL(endpoint)
  const cliente = new Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
    accessKey,
    secretKey,
  })

  // El bucket se crea una vez y la promesa se comparte: sin esto, veinte subidas a la vez
  // preguntan veinte veces si existe.
  let listo: Promise<void> | undefined
  const asegurarBucket = () => {
    listo ??= cliente
      .bucketExists(bucket)
      .then((existe) => (existe ? undefined : cliente.makeBucket(bucket)))
    return listo
  }

  return {
    async guardar(clave, objeto) {
      await asegurarBucket()
      await cliente.putObject(
        bucket,
        clave,
        Buffer.from(objeto.contenido),
        objeto.contenido.length,
        {
          'Content-Type': objeto.tipo,
        },
      )
    },
    async leer(clave) {
      await asegurarBucket()
      try {
        const [stat, flujo] = await Promise.all([
          cliente.statObject(bucket, clave),
          cliente.getObject(bucket, clave),
        ])
        const partes: Buffer[] = []
        for await (const parte of flujo) partes.push(parte as Buffer)
        return {
          contenido: new Uint8Array(Buffer.concat(partes)),
          tipo: stat.metaData?.['content-type'] ?? 'application/octet-stream',
        }
      } catch (error) {
        // Que no esté es una respuesta, no una falla: la hoja todavía sin subir es el caso
        // de todos los talleres el primer día.
        if (esNoEncontrado(error)) return null
        throw error
      }
    },
    async borrar(clave) {
      await asegurarBucket()
      await cliente.removeObject(bucket, clave)
    },
  }
}

function esNoEncontrado(error: unknown): boolean {
  const codigo = (error as { code?: string })?.code
  return codigo === 'NoSuchKey' || codigo === 'NotFound'
}
