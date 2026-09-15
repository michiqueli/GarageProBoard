/**
 * Desarrollo de la API: `tsc --watch` compila a `dist/` y `node --watch` lo ejecuta.
 *
 * **Por qué no `tsx`.** `@nestjs/core` 12 se publica sólo como ESM y `nestjs-pino` es
 * CommonJS: lo carga con `require`. Bajo los hooks de `tsx` ese `require` devuelve otra
 * instancia del módulo que la que importa la aplicación — verificado:
 * `require('@nestjs/core').ApplicationConfig === (await import('@nestjs/core')).ApplicationConfig`
 * da `true` con `node` y `false` con `tsx`. Con dos clases distintas, Nest no encuentra
 * `ApplicationConfig` al armar el `LoggerModule` y la API no arranca.
 *
 * Con `node` a secas el cargador es uno solo. Y de paso, en desarrollo corre exactamente
 * el mismo JavaScript que en producción, compilado por el mismo `tsc`.
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
  spawn(process.execPath, ['--watch', '--env-file=../../.env', 'dist/main.js'], {
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
