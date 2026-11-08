// La política de privacidad y los términos tienen datos que sólo el titular puede poner. Publicar
// con un «[COMPLETAR…]» a la vista es peor que no publicar: Meta y Mercado Pago los leen.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const faltan = readdirSync(dist)
  .filter((a) => a.endsWith('.html'))
  .flatMap((a) =>
    [...readFileSync(join(dist, a), 'utf8').matchAll(/\[COMPLETAR[^\]]*\]/g)].map(
      (m) => `${a}: ${m[0]}`,
    ),
  )

if (faltan.length) {
  console.error(`No se puede publicar todavía:\n  ${[...new Set(faltan)].join('\n  ')}`)
  process.exit(1)
}
console.log('Lista para publicar.')
