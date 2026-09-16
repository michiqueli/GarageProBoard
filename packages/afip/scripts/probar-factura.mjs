/**
 * Prueba real de facturación contra AFIP: el paso 6 del asistente de certificados, a mano.
 *
 *   pnpm --filter @gpb/afip probar-factura -- --punto-venta 8 --total 1
 *   pnpm --filter @gpb/afip probar-factura -- --punto-venta 8 --total 1 --emitir
 *
 * Sin `--emitir` no emite nada: verifica el acceso, que el punto de venta esté habilitado y
 * muestra el comprobante que armaría. **Con `--emitir`, en producción, la factura queda
 * emitida de verdad** y sólo se anula con una nota de crédito.
 *
 * Usa las credenciales de `AFIP_PADRON_*` del `.env`. Es una Factura B a consumidor final,
 * por productos: la prueba mínima de un Responsable Inscripto.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  armarComprobante,
  ComprobanteRechazado,
  crearFacturacionArca,
  FacturacionNoDisponible,
  urlQr,
} from '../dist/index.js'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const env = Object.fromEntries(
  readFileSync(resolve(raiz, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^AFIP_PADRON_\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
// Las rutas del .env son relativas a apps/api, que es quien las usa normalmente.
const desdeApi = (ruta) => resolve(raiz, 'apps/api', ruta)

const args = process.argv.slice(2)
const valor = (nombre) => {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}
const puntoVenta = Number(valor('--punto-venta'))
const total = valor('--total')
const emitir = args.includes('--emitir')
if (!puntoVenta || !total) {
  console.error('Faltan --punto-venta y --total.')
  process.exit(1)
}

const produccion = env.AFIP_PADRON_PRODUCCION === 'true'
const cred = {
  cuit: env.AFIP_PADRON_CUIT,
  certificadoPem: readFileSync(desdeApi(env.AFIP_PADRON_CERT), 'utf8'),
  clavePrivadaPem: readFileSync(desdeApi(env.AFIP_PADRON_KEY), 'utf8'),
}
const afip = crearFacturacionArca({ produccion })
const TIPO = 6 // Factura B
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
  new Date(),
)

console.log(
  `Entorno: ${produccion ? 'PRODUCCIÓN' : 'homologación'} · CUIT terminado en ${cred.cuit.slice(-3)}`,
)

const pvs = await afip.puntosDeVenta(cred)
const pv = pvs.find((p) => p.numero === puntoVenta)
if (!pv || pv.bloqueado || pv.dadoDeBaja) {
  console.error(
    `El punto de venta ${puntoVenta} no está habilitado para web services en este CUIT.`,
  )
  process.exit(1)
}
console.log(`Punto de venta ${puntoVenta}: ${pv.tipoEmision}`)

const ultimo = await afip.ultimoAutorizado(cred, puntoVenta, TIPO)
const solicitud = armarComprobante({
  puntoVenta,
  tipoComprobante: TIPO,
  numero: ultimo + 1,
  fecha: hoy,
  concepto: 1,
  tipoDocReceptor: 99,
  numeroDocReceptor: '0',
  condicionIvaReceptor: 5,
  renglones: [{ total, codigoAlicuota: 5 }],
})
const numero = `${String(puntoVenta).padStart(5, '0')}-${String(solicitud.numero).padStart(8, '0')}`
console.log(`Último Factura B autorizada: ${ultimo}. Se emitiría la ${numero}:`)
console.log(
  `  neto ${solicitud.importeNeto} + IVA 21% ${solicitud.importeIva} = total ${solicitud.importeTotal}, a consumidor final, fecha ${hoy}`,
)

if (!emitir) {
  console.log('No se emitió nada. Para emitir de verdad, repetir con --emitir.')
  process.exit(0)
}

try {
  const autorizado = await afip.autorizar(cred, solicitud)
  console.log(`AUTORIZADA ${numero} · CAE ${autorizado.cae} · vence ${autorizado.vencimientoCae}`)
  for (const o of autorizado.observaciones) console.log(`  Observación ${o.codigo}: ${o.mensaje}`)
  console.log(`QR: ${urlQr({ ...solicitud, cuitEmisor: cred.cuit, cae: autorizado.cae })}`)
  const confirmado = await afip.ultimoAutorizado(cred, puntoVenta, TIPO)
  console.log(
    `AFIP informa como último: ${confirmado} ${confirmado === solicitud.numero ? '(coincide)' : '(NO coincide)'}`,
  )
} catch (error) {
  if (error instanceof ComprobanteRechazado) {
    console.error('RECHAZADA. El número no se usó.')
    for (const e of [...error.errores, ...error.observaciones])
      console.error(`  ${e.codigo}: ${e.mensaje}`)
    process.exit(2)
  }
  if (error instanceof FacturacionNoDisponible) {
    console.error(
      'AFIP no contestó: NO se sabe si quedó emitida. Consultar el último autorizado antes de reintentar.',
    )
    console.error(error.cause)
    process.exit(3)
  }
  throw error
}
