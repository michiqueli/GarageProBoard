import { describe, expect, it } from 'vitest'
import { type CredencialImpresa, generarCredencialesPdf } from '../src/credenciales.ts'

const paginas = (pdf: Uint8Array) =>
  (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? []
  ).length

function credencial(i: number): CredencialImpresa {
  return {
    nombre: `Jorge Pérez ${i}`,
    legajo: String(100 + i),
    puesto: 'Mecánico',
    sucursal: 'Casa central',
    qr: `GT1:M:A7K2P9Q${i}:4F8B2C1D9E`,
  }
}

describe('las credenciales impresas', () => {
  it('es un PDF', async () => {
    const pdf = await generarCredencialesPdf({
      concesionaria: 'Taller Ejemplo',
      credenciales: [credencial(1)],
    })
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(paginas(pdf)).toBe(1)
  })

  it('entran diez por hoja, y la número once abre otra', async () => {
    const diez = Array.from({ length: 10 }, (_, i) => credencial(i))
    expect(paginas(await generarCredencialesPdf({ concesionaria: 'T', credenciales: diez }))).toBe(
      1,
    )
    expect(
      paginas(
        await generarCredencialesPdf({
          concesionaria: 'T',
          credenciales: [...diez, credencial(11)],
        }),
      ),
    ).toBe(2)
  })

  it('veinticinco credenciales son tres hojas', async () => {
    const muchas = Array.from({ length: 25 }, (_, i) => credencial(i))
    expect(
      paginas(await generarCredencialesPdf({ concesionaria: 'T', credenciales: muchas })),
    ).toBe(3)
  })

  /**
   * El QR se dibuja celda por celda, así que el texto no aparece en el archivo: lo que se
   * verifica es que **dos códigos distintos dan dos dibujos distintos**. Sin esto, un error
   * que imprimiera siempre el mismo QR pasaría desapercibido hasta que dos mecánicos ficharan
   * como la misma persona.
   */
  it('cada credencial dibuja su propio QR', async () => {
    const uno = await generarCredencialesPdf({
      concesionaria: 'T',
      credenciales: [credencial(1)],
    })
    const otro = await generarCredencialesPdf({
      concesionaria: 'T',
      credenciales: [{ ...credencial(1), qr: 'GT1:M:ZZZZZZZZ:1111111111' }],
    })
    expect(Buffer.from(uno).equals(Buffer.from(otro))).toBe(false)
  })

  /**
   * PDFKit comprime los streams, así que el texto no se puede buscar en el archivo. Lo que se
   * verifica es que **cada dato de la tarjeta llegue al papel**: si alguno se dejara de
   * dibujar, cambiarlo no cambiaría nada y el PDF saldría idéntico.
   */
  it.each([
    ['el nombre', { nombre: 'Otra Persona' }],
    ['el legajo', { legajo: '9999' }],
    ['el puesto', { puesto: 'Lavador' }],
    ['la sucursal', { sucursal: 'Sucursal Norte' }],
  ])('%s sale impreso', async (_que, cambio) => {
    const base = await generarCredencialesPdf({
      concesionaria: 'Taller Ejemplo',
      credenciales: [credencial(1)],
    })
    const cambiada = await generarCredencialesPdf({
      concesionaria: 'Taller Ejemplo',
      credenciales: [{ ...credencial(1), ...cambio }],
    })
    expect(Buffer.from(base).equals(Buffer.from(cambiada))).toBe(false)
  })

  it('el nombre de la concesionaria también', async () => {
    const una = await generarCredencialesPdf({
      concesionaria: 'Taller Ejemplo',
      credenciales: [credencial(1)],
    })
    const otra = await generarCredencialesPdf({
      concesionaria: 'Otro Taller',
      credenciales: [credencial(1)],
    })
    expect(Buffer.from(una).equals(Buffer.from(otra))).toBe(false)
  })

  it('sin credenciales no se imprime una hoja en blanco', async () => {
    await expect(generarCredencialesPdf({ concesionaria: 'T', credenciales: [] })).rejects.toThrow(
      /no hay credenciales/i,
    )
  })
})
