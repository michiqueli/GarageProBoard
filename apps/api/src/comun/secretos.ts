import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export class ClaveMaestraFaltante extends Error {
  constructor() {
    super('SECRETOS_MASTER_KEY no está configurada: tienen que ser 32 bytes en base64.')
    this.name = 'ClaveMaestraFaltante'
  }
}

const VERSION = 'v1'

/**
 * Cifra lo que no puede quedar legible en la base: hoy, la clave privada de cada
 * certificado de AFIP. AES-256-GCM con la clave maestra de `SECRETOS_MASTER_KEY`.
 *
 * Cada secreto se ata a un **contexto** —«de qué empresa es»— como dato autenticado: una
 * clave copiada a la fila de otra empresa no se descifra. Sin eso, quien pueda escribir
 * en la tabla podría hacer facturar a una empresa con el certificado de otra.
 *
 * Sin clave maestra la API arranca igual: lo que no la necesita sigue andando, y lo que sí
 * falla con un error que dice qué configurar.
 *
 * Formato: `v1.<base64 de iv(12) + tag(16) + cifrado>`. La versión deja lugar para rotar la
 * clave maestra sin reescribir todo de una vez.
 */
export class CajaFuerte {
  private readonly clave: Buffer | null

  constructor(claveMaestraBase64: string | undefined) {
    const clave = claveMaestraBase64 ? Buffer.from(claveMaestraBase64, 'base64') : null
    this.clave = clave?.length === 32 ? clave : null
  }

  get disponible(): boolean {
    return this.clave !== null
  }

  cifrar(texto: string, contexto: string): string {
    const clave = this.exigir()
    const iv = randomBytes(12)
    const cifrador = createCipheriv('aes-256-gcm', clave, iv)
    cifrador.setAAD(Buffer.from(contexto))
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()])
    return `${VERSION}.${Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64')}`
  }

  descifrar(guardado: string, contexto: string): string {
    const clave = this.exigir()
    const [version, cuerpo] = guardado.split('.')
    if (version !== VERSION || !cuerpo) throw new Error('Secreto con un formato desconocido.')
    const datos = Buffer.from(cuerpo, 'base64')
    const descifrador = createDecipheriv('aes-256-gcm', clave, datos.subarray(0, 12))
    descifrador.setAAD(Buffer.from(contexto))
    descifrador.setAuthTag(datos.subarray(12, 28))
    return Buffer.concat([descifrador.update(datos.subarray(28)), descifrador.final()]).toString(
      'utf8',
    )
  }

  private exigir(): Buffer {
    if (!this.clave) throw new ClaveMaestraFaltante()
    return this.clave
  }
}
