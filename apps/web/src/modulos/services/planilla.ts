import {
  COLUMNAS_IMPORTACION,
  COLUMNAS_OBLIGATORIAS,
  type ColumnaImportacion,
  columnaDeEncabezado,
  ENCABEZADOS_IMPORTACION,
  type FilaImportacion,
  MAXIMO_FILAS_IMPORTACION,
} from '@gpb/core'

/** Lo que está mal con el archivo entero: se le dice a quien lo subió, con qué hacer. */
export class ErrorDePlanilla extends Error {}

export interface FilaLeida {
  /** El renglón de la planilla: «fila 14» tiene que ser la 14 cuando la abra en el Excel. */
  numero: number
  datos: FilaImportacion
}

export interface PlanillaLeida {
  filas: FilaLeida[]
  /** Columnas del archivo que no se usan: se avisan, para que nadie crea que se importaron. */
  ignoradas: string[]
}

const LARGO_MAXIMO_CELDA = 600

type Celda = string | number | boolean | Date | null | undefined

/**
 * Un número de Excel pasa a texto con coma: `1.234` en una celda numérica es uno coma doscientos
 * treinta y cuatro, y con punto se leería como mil doscientos treinta y cuatro.
 */
function textoDeCelda(celda: Celda): string {
  if (celda === null || celda === undefined) return ''
  if (typeof celda === 'number') return String(celda).replace('.', ',')
  if (celda instanceof Date) return celda.toLocaleDateString('es-AR')
  return String(celda).trim().slice(0, LARGO_MAXIMO_CELDA)
}

/** De la matriz que sale de un Excel o de un CSV, a las filas. El encabezado manda el orden. */
export function filasDeMatriz(matriz: readonly (readonly Celda[])[]): PlanillaLeida {
  const textos = matriz.map((fila) => fila.map(textoDeCelda))
  const inicio = textos.findIndex((fila) => fila.some(Boolean))
  if (inicio < 0)
    throw new ErrorDePlanilla('El archivo está vacío. Bajá la plantilla y completala.')

  const encabezado = textos[inicio] as string[]
  const posicion = new Map<ColumnaImportacion, number>()
  const ignoradas: string[] = []
  encabezado.forEach((titulo, i) => {
    if (!titulo) return
    const columna = columnaDeEncabezado(titulo)
    if (columna && !posicion.has(columna)) posicion.set(columna, i)
    else ignoradas.push(titulo)
  })

  const faltan = COLUMNAS_OBLIGATORIAS.filter((c) => !posicion.has(c))
  if (faltan.length) {
    const nombres = faltan.map((c) => `«${ENCABEZADOS_IMPORTACION[c]}»`).join(', ')
    throw new ErrorDePlanilla(
      `Le ${faltan.length === 1 ? 'falta la columna' : 'faltan las columnas'} ${nombres}. La primera fila tiene que tener los títulos de la plantilla.`,
    )
  }

  const filas: FilaLeida[] = []
  textos.slice(inicio + 1).forEach((fila, i) => {
    if (!fila.some(Boolean)) return
    const datos = Object.fromEntries(
      COLUMNAS_IMPORTACION.map((c) => {
        const p = posicion.get(c)
        return [c, p === undefined ? '' : (fila[p] ?? '')]
      }),
    ) as FilaImportacion
    filas.push({ numero: inicio + i + 2, datos })
  })

  if (!filas.length) throw new ErrorDePlanilla('Tiene los títulos, pero ninguna fila cargada.')
  if (filas.length > MAXIMO_FILAS_IMPORTACION) {
    throw new ErrorDePlanilla(
      `Son ${filas.length} filas y entran hasta ${MAXIMO_FILAS_IMPORTACION}. Partí el archivo en dos.`,
    )
  }
  return { filas, ignoradas }
}

/** Excel guarda los CSV en Windows-1252 si no se le dice otra cosa: «Descripción» saldría roto. */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Las librerías se piden recién acá: quien no importa nada no las descarga. */
export async function leerPlanilla(archivo: File): Promise<PlanillaLeida> {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith('.xls')) {
    throw new ErrorDePlanilla('Es un Excel viejo (.xls). Guardalo como .xlsx o como CSV.')
  }
  if (!nombre.endsWith('.xlsx') && !nombre.endsWith('.csv')) {
    throw new ErrorDePlanilla('Tiene que ser un Excel (.xlsx) o un CSV.')
  }
  if (archivo.size > 5_000_000) {
    throw new ErrorDePlanilla('Pesa más de 5 MB: revisá que sea la planilla correcta.')
  }

  if (nombre.endsWith('.csv')) {
    const { default: Papa } = await import('papaparse')
    const { data } = Papa.parse<string[]>(decodificar(await archivo.arrayBuffer()), {
      delimitersToGuess: [';', ',', '\t'],
    })
    return filasDeMatriz(data)
  }

  const { readSheet } = await import('read-excel-file/browser')
  try {
    return filasDeMatriz((await readSheet(archivo)) as Celda[][])
  } catch (error) {
    if (error instanceof ErrorDePlanilla) throw error
    throw new ErrorDePlanilla(
      'No se pudo leer ese Excel. Abrilo, guardalo de nuevo y volvé a subirlo.',
    )
  }
}

const EJEMPLO: Array<Record<ColumnaImportacion, string | number | null>> = [
  {
    marca: 'Renault',
    modelo: 'Kangoo',
    service: 'Service 10.000 km',
    kilometros: 10000,
    tipo: 'Trabajo',
    descripcion: 'Cambio de aceite y filtro',
    codigo: null,
    cantidad: 1,
    minutos: 30,
    precio: 25000,
  },
  {
    marca: 'Renault',
    modelo: 'Kangoo',
    service: 'Service 10.000 km',
    kilometros: 10000,
    tipo: 'Repuesto',
    descripcion: 'Filtro de aceite',
    codigo: '152085',
    cantidad: 1,
    minutos: null,
    precio: null,
  },
  {
    marca: null,
    modelo: null,
    service: 'Revisión general',
    kilometros: null,
    tipo: 'Trabajo',
    descripcion: 'Revisión de 30 puntos',
    codigo: null,
    cantidad: 1,
    minutos: 45,
    precio: 18000,
  },
]

function bajar(archivo: Blob, nombre: string) {
  const url = URL.createObjectURL(archivo)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const TITULOS = COLUMNAS_IMPORTACION.map((c) => ENCABEZADOS_IMPORTACION[c])

/**
 * La hoja que se completa va vacía y el ejemplo en otra: con el ejemplo en la primera, lo que
 * alguien se olvida de borrar se importa como un service de verdad.
 */
export async function bajarPlantillaExcel() {
  const { default: escribir } = await import('write-excel-file/browser')
  const titulos = TITULOS.map((value) => ({ value, fontWeight: 'bold' as const }))
  const blob = await escribir([
    { sheet: 'Services', data: [titulos] },
    {
      sheet: 'Ejemplo',
      data: [titulos, ...EJEMPLO.map((f) => COLUMNAS_IMPORTACION.map((c) => f[c]))],
    },
  ]).toBlob()
  bajar(blob, 'plantilla-services.xlsx')
}

/** Con punto y coma y BOM: es como Excel en castellano abre un CSV sin romper los acentos. */
export function bajarPlantillaCsv() {
  bajar(
    new Blob([`﻿${TITULOS.join(';')}\r\n`], { type: 'text/csv;charset=utf-8' }),
    'plantilla-services.csv',
  )
}
