/**
 * Desarrollo del back-office: `tsc --watch` compila a `dist/` y `node --watch` lo ejecuta.
 *
 * Es el mismo arreglo que `apps/api/scripts/dev.mjs`: Nest 12 bajo los hooks de `tsx`
 * puede cargar dos veces el mismo módulo (la explicación está allá), y así en desarrollo
 * corre el mismo JavaScript que en producción.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc')

// Una pasada completa antes de arrancar: sin `dist/` al día, `node` ejecutaría lo que
// haya quedado de la vez anterior — o nada.
const inicial = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' })
if (inicial.status !== 0) {
  console.error('La compilación inicial falló: corregí los errores de arriba y volvé a correr.')
  process.exit(inicial.status ?? 1)
}

const procesos = [
  // `--preserveWatchOutput`: sin esto tsc limpia la consola en cada cambio y se lleva
  // puesto el log de la API que venía imprimiendo `node`.
  spawn(process.execPath, [tsc, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--env-file=../../../.env', 'dist/main.js'], {
    stdio: 'inherit',
  }),
]

// Si uno de los dos termina, no tiene sentido dejar al otro corriendo solo: un `tsc`
// compilando para nadie, o una API que ya no se recompila y parece que sí.
let cerrando = false
function cerrar(codigo = 0) {
  if (cerrando) return
  cerrando = true
  for (const p of procesos) p.kill()
  process.exit(codigo)
}

for (const p of procesos) p.on('exit', (codigo) => cerrar(codigo ?? 0))
process.on('SIGINT', () => cerrar())
process.on('SIGTERM', () => cerrar())
