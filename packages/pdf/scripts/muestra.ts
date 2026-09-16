// Genera PDFs de muestra para mirarlos: node --experimental-strip-types scripts/muestra.ts <carpeta>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generarFacturaPdf } from '../src/factura.ts'
import { FACTURA_A, FACTURA_B } from '../test/ejemplos.ts'

const carpeta = process.argv[2] ?? '.'
writeFileSync(join(carpeta, 'factura-b.pdf'), await generarFacturaPdf(FACTURA_B))
writeFileSync(
  join(carpeta, 'factura-a.pdf'),
  await generarFacturaPdf({ ...FACTURA_A, copias: ['ORIGINAL'] }),
)
