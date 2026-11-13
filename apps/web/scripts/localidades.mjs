/**
 * Arma `src/datos/localidades.json`: las localidades de cada provincia, con el código de
 * provincia de AFIP. Sale del listado oficial Georef (datos.gob.ar), que numera las provincias
 * con los códigos del INDEC: acá se traducen.
 *
 * Se corre a mano, cuando haga falta actualizarlo: `node apps/web/scripts/localidades.mjs`.
 */
import { writeFileSync } from 'node:fs'

const URL_GEOREF =
  'https://apis.datos.gob.ar/georef/api/localidades?max=5000&campos=nombre,provincia.id&aplanar=true'

/** INDEC → AFIP. */
const AFIP = {
  '02': 0,
  '06': 1,
  10: 2,
  14: 3,
  18: 4,
  30: 5,
  38: 6,
  50: 7,
  46: 8,
  66: 9,
  70: 10,
  74: 11,
  82: 12,
  86: 13,
  90: 14,
  22: 16,
  26: 17,
  34: 18,
  54: 19,
  58: 20,
  42: 21,
  62: 22,
  78: 23,
  94: 24,
}

const respuesta = await fetch(URL_GEOREF)
if (!respuesta.ok) throw new Error(`Georef contestó ${respuesta.status}`)
const { localidades, total, cantidad } = await respuesta.json()
if (total !== cantidad) throw new Error(`Vinieron ${cantidad} de ${total}: subí el max`)

const porProvincia = {}
for (const l of localidades) {
  const codigo = AFIP[l.provincia_id]
  if (codigo === undefined) throw new Error(`Provincia sin código de AFIP: ${l.provincia_id}`)
  porProvincia[codigo] ??= new Set()
  porProvincia[codigo].add(l.nombre)
}
const salida = Object.fromEntries(
  Object.entries(porProvincia).map(([c, nombres]) => [
    c,
    [...nombres].sort((a, b) => a.localeCompare(b, 'es')),
  ]),
)
writeFileSync(
  new URL('../src/datos/localidades.json', import.meta.url),
  `${JSON.stringify(salida)}\n`,
)
console.log(`${localidades.length} localidades en ${Object.keys(salida).length} provincias`)
