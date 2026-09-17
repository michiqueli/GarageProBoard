/**
 * Desarrollo de la API: `tsc --watch` compila a `dist/` y este script reinicia la API cuando
 * cambia lo compilado.
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
 *
 * **Por qué no `node --watch`.** Vigila cada módulo que se carga, librerías incluidas, y en
 * Windows cargar uno por primera vez avisa un «cambio»: la primera consulta al padrón carga el
 * SOAP de AFIP, la API se reiniciaba en medio del pedido y el navegador recibía un 502 que al
 * segundo intento no pasaba. `--watch-path` tampoco sirve: con varias carpetas termina vigilando
 * el repositorio entero, y reiniciaba la API cuando Vite escribía sus temporales.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc')
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Una pasada completa antes de arrancar: sin `dist/` al día, `node` ejecutaría lo que
// haya quedado de la vez anterior — o nada.
const inicial = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' })
if (inicial.status !== 0) {
  console.error('La compilación inicial falló: corregí los errores de arriba y volvé a correr.')
  process.exit(inicial.status ?? 1)
}

let cerrando = false

// `--preserveWatchOutput`: sin esto tsc limpia la consola en cada cambio y se lleva puesto
// el log de la API.
const compilador = spawn(
  process.execPath,
  [tsc, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  { stdio: 'inherit' },
)
compilador.on('exit', (codigo) => cerrar(codigo ?? 0))

/** La API corriendo. Se reemplaza en cada reinicio. */
let api = null
function arrancar() {
  api = spawn(process.execPath, ['--env-file=../../.env', 'dist/main.js'], { stdio: 'inherit' })
  const esta = api
  esta.on('exit', (codigo, senal) => {
    // Si la matamos nosotros para reiniciar, no es un final.
    if (esta !== api || cerrando) return
    console.error(
      `La API terminó${senal ? ` (${senal})` : ` con código ${codigo}`}. Esperando un cambio para arrancarla de nuevo.`,
    )
  })
}

// Lo que cambia en desarrollo: lo compilado de la API y de los paquetes propios.
const carpetas = [
  join(raiz, 'dist'),
  ...['contracts', 'core', 'db', 'afip', 'pdf'].map((p) =>
    join(raiz, '..', '..', 'packages', p, 'dist'),
  ),
].filter((c) => existsSync(c))

// tsc escribe muchos archivos seguidos: se espera a que termine antes de reiniciar.
let pendiente = null
function reiniciar(archivo) {
  if (!archivo || !/\.(js|json)$/.test(archivo)) return
  clearTimeout(pendiente)
  pendiente = setTimeout(() => {
    console.log(`Cambió ${archivo}: reiniciando la API`)
    const anterior = api
    if (anterior && anterior.exitCode === null) {
      anterior.once('exit', arrancar)
      anterior.kill()
    } else {
      arrancar()
    }
  }, 300)
}

const vigilantes = carpetas.map((c) =>
  watch(c, { recursive: true }, (_evento, archivo) => reiniciar(archivo)),
)
arrancar()

function cerrar(codigo = 0) {
  if (cerrando) return
  cerrando = true
  for (const v of vigilantes) v.close()
  compilador.kill()
  api?.kill()
  process.exit(codigo)
}

process.on('SIGINT', () => cerrar())
process.on('SIGTERM', () => cerrar())
