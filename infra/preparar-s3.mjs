// node infra/preparar-s3.mjs
//
// Garage recién levantado no sirve para nada: el nodo existe pero no tiene rol, no hay clave y
// no hay bucket. Esto se lo da, y se puede correr todas las veces que haga falta — cada paso
// mira antes de tocar.
//
// Va acá y no en un contenedor de init porque la imagen de Garage no trae shell: es el binario
// solo. Y usa `docker exec` y no la API de administración porque el CLI es lo que está
// documentado, y esto corre una vez por máquina de desarrollo.
import { execFileSync } from 'node:child_process'

const CONTENEDOR = 'gpb-garage'
// Los mismos del .env.example. Garage exige que la clave empiece con GK y mida 26.
const ACCESS_KEY = 'GK1a2b3c4d5e6f708192a3b4c5'
const SECRET_KEY = '3f8c1d7b2e5a9046c8b1f3d7e2a5c904b6d8f1e3a7c250b9d4f6e8a1c3b5d709'
const BUCKET = 'gpb'

function garage(...args) {
  return execFileSync('docker', ['exec', CONTENEDOR, '/garage', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function intentar(...args) {
  try {
    return { ok: true, salida: garage(...args) }
  } catch (error) {
    return { ok: false, salida: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const estado = intentar('status')
if (!estado.ok) {
  console.error('✗ No se pudo hablar con Garage. ¿Levantaste `pnpm infra:up`?')
  console.error(estado.salida.trim())
  process.exit(1)
}

// ── el rol del nodo ────────────────────────────────────────────────────────────
//
// Se mira `layout show` y no `status`: apenas se asigna un rol, `status` ya lo muestra aunque
// el layout siga sin aplicar, y ahí todo lo demás falla con «Layout not ready».
// `layout show` sale con código distinto de cero cuando hay cambios pendientes, así que se lee
// con `intentar`.
const layout = intentar('layout', 'show').salida
if (layout.includes('No nodes currently have a role')) {
  // Puede haber quedado asignado de una corrida anterior que no llegó a aplicar.
  if (!/STAGED ROLE CHANGES ====\s*\nID\s+Tags\s+Zone\s+Capacity\s*\n\s*\S/.test(layout)) {
    // El id del nodo lo genera él la primera vez, así que hay que leerlo, no inventarlo.
    const id = estado.salida.match(/^([0-9a-f]{16})\s/m)?.[1]
    if (!id) {
      console.error('✗ No se encontró el id del nodo en la salida de `garage status`.')
      process.exit(1)
    }
    garage('layout', 'assign', '-z', 'gpb', '-c', '10G', id)
  }
  const vigente = Number(layout.match(/layout version:?\s*(\d+)/i)?.[1] ?? 0)
  const aplicada = intentar('layout', 'apply', '--version', String(vigente + 1))
  if (!aplicada.ok) {
    console.error('✗ No se pudo aplicar el layout.')
    console.error(aplicada.salida.trim())
    process.exit(1)
  }
  console.log('✓ El nodo quedó con rol y 10G de capacidad.')
} else {
  console.log('✓ El nodo ya tenía rol.')
}

// ── la clave ───────────────────────────────────────────────────────────────────
if (intentar('key', 'info', ACCESS_KEY).ok) {
  console.log('✓ La clave ya estaba.')
} else {
  const r = intentar('key', 'import', '--yes', '-n', 'gpb', ACCESS_KEY, SECRET_KEY)
  if (!r.ok) {
    console.error('✗ No se pudo importar la clave.')
    console.error(r.salida.trim())
    process.exit(1)
  }
  console.log('✓ Clave importada.')
}

// ── el bucket ──────────────────────────────────────────────────────────────────
if (intentar('bucket', 'info', BUCKET).ok) {
  console.log('✓ El bucket ya estaba.')
} else {
  const r = intentar('bucket', 'create', BUCKET)
  if (!r.ok) {
    console.error('✗ No se pudo crear el bucket.')
    console.error(r.salida.trim())
    process.exit(1)
  }
  console.log('✓ Bucket creado.')
}

// Los permisos se vuelven a dar siempre: es barato y cubre el bucket que ya existía sin ellos.
const permisos = intentar('bucket', 'allow', '--read', '--write', '--owner', BUCKET, '--key', 'gpb')
if (!permisos.ok) {
  console.error('✗ No se pudieron dar los permisos sobre el bucket.')
  console.error(permisos.salida.trim())
  process.exit(1)
}

console.log('\n  El almacén quedó listo. En el .env:')
console.log('    S3_ENDPOINT=http://localhost:3900')
console.log(`    S3_ACCESS_KEY=${ACCESS_KEY}`)
console.log(`    S3_SECRET_KEY=${SECRET_KEY}`)
console.log(`    S3_BUCKET=${BUCKET}`)
