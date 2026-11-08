/**
 * La planilla de importación del catálogo de services: qué columnas tiene y qué fila está bien.
 *
 * Vive acá porque la miran dos: el navegador, para marcar el error apenas se tipea, y la API, que
 * no le cree a nadie y vuelve a validar antes de guardar. Ver
 * `docs/tecnicos/catalogo-de-services.md`.
 *
 * Una fila es un renglón de un service; las filas con la misma marca, modelo y service son el
 * mismo service. Todo llega como texto, que es lo que hay en un CSV y lo que se edita en el
 * preview.
 */

export const COLUMNAS_IMPORTACION = [
  'marca',
  'modelo',
  'service',
  'kilometros',
  'tipo',
  'descripcion',
  'codigo',
  'cantidad',
  'minutos',
  'precio',
] as const

export type ColumnaImportacion = (typeof COLUMNAS_IMPORTACION)[number]
export type FilaImportacion = Record<ColumnaImportacion, string>
export type ProblemasDeFila = Partial<Record<ColumnaImportacion, string>>

/** El techo lo pone el tamaño de un pedido: un catálogo entero de una marca entra de sobra. */
export const MAXIMO_FILAS_IMPORTACION = 3000

export const ENCABEZADOS_IMPORTACION: Record<ColumnaImportacion, string> = {
  marca: 'Marca',
  modelo: 'Modelo',
  service: 'Service',
  kilometros: 'Kilómetros',
  tipo: 'Tipo',
  descripcion: 'Descripción',
  codigo: 'Código',
  cantidad: 'Cantidad',
  minutos: 'Minutos',
  precio: 'Precio',
}

/** Sin estas tres no se puede armar nada: es lo primero que se le dice a quien sube el archivo. */
export const COLUMNAS_OBLIGATORIAS: readonly ColumnaImportacion[] = [
  'service',
  'tipo',
  'descripcion',
]

const ALIAS: Record<string, ColumnaImportacion> = {
  marca: 'marca',
  modelo: 'modelo',
  service: 'service',
  servicio: 'service',
  kilometros: 'kilometros',
  km: 'kilometros',
  kms: 'kilometros',
  kilometraje: 'kilometros',
  tipo: 'tipo',
  descripcion: 'descripcion',
  detalle: 'descripcion',
  operacion: 'descripcion',
  codigo: 'codigo',
  cod: 'codigo',
  'codigo repuesto': 'codigo',
  'codigo de repuesto': 'codigo',
  cantidad: 'cantidad',
  cant: 'cantidad',
  minutos: 'minutos',
  min: 'minutos',
  tiempo: 'minutos',
  'tiempo estipulado': 'minutos',
  precio: 'precio',
  'precio final': 'precio',
}

const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** A qué columna corresponde un encabezado, escrito como lo haya escrito cada uno. */
export const columnaDeEncabezado = (texto: string): ColumnaImportacion | null =>
  ALIAS[sinAcentos(texto)] ?? null

export type TipoRenglonService = 'trabajo' | 'repuesto'

/** «Mano de obra», «MO», «T»: lo que se escribe en una planilla de taller. */
export function tipoDeHoja(texto: string): TipoRenglonService | null {
  const t = sinAcentos(texto)
  if (['trabajo', 'mano de obra', 'mo', 't'].includes(t)) return 'trabajo'
  if (['repuesto', 'pieza', 'r'].includes(t)) return 'repuesto'
  return null
}

/**
 * Un número como viene en una planilla argentina —«1.234,50», «1,5»— o inglesa —«1,234.50»— a
 * «1234.50». `null` si no es un número. «1.500» son mil quinientos: acá el punto separa miles.
 */
export function numeroDeHoja(texto: string): string | null {
  const s = texto.trim().replace(/[\s$]/g, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return s.replace(/\./g, '').replace(',', '.')
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return s.replace(/,/g, '')
  if (/^\d+,\d+$/.test(s)) return s.replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return s
  return null
}

/** Qué hace que dos filas sean el mismo service. Es lo mismo que mira el índice único de la base. */
export const claveDeService = (marca: string | null, modelo: string | null, nombre: string) =>
  [marca ?? '', modelo ?? '', nombre].map((x) => x.trim().toLowerCase()).join('|')

const claveDeFila = (f: FilaImportacion) => claveDeService(f.marca, f.modelo, f.service)

const LARGOS: Partial<Record<ColumnaImportacion, number>> = {
  marca: 60,
  modelo: 80,
  service: 120,
  descripcion: 500,
  codigo: 40,
}

/**
 * Los errores de cada fila, en el mismo orden. Una fila con error frena la importación entera:
 * importar a medias deja un catálogo que nadie sabe qué tiene.
 *
 * Lo que necesita mirar la base —si el código existe en repuestos— lo agrega la API.
 */
export function erroresDeFilas(filas: readonly FilaImportacion[]): ProblemasDeFila[] {
  const kmDe = new Map<string, string>()

  return filas.map((f) => {
    const e: ProblemasDeFila = {}
    for (const [columna, maximo] of Object.entries(LARGOS) as Array<[ColumnaImportacion, number]>) {
      if (f[columna].trim().length > maximo) e[columna] = `Es largo: hasta ${maximo} letras`
    }

    if (!f.service.trim()) e.service = 'Falta el nombre del service: «Service 10.000 km»'

    const tipo = tipoDeHoja(f.tipo)
    if (!tipo) e.tipo = 'Poné «Trabajo» o «Repuesto»'

    if (!f.descripcion.trim() && !(tipo === 'repuesto' && f.codigo.trim())) {
      e.descripcion = tipo === 'repuesto' ? 'Poné la descripción o el código' : 'Falta qué se hace'
    }

    if (f.kilometros.trim()) {
      const km = numeroDeHoja(f.kilometros)
      if (km === null || !Number.isInteger(Number(km))) {
        e.kilometros = 'En kilómetros, sin letras: 10000'
      } else {
        const clave = claveDeFila(f)
        const anterior = kmDe.get(clave)
        if (anterior === undefined) kmDe.set(clave, km)
        else if (Number(anterior) !== Number(km)) {
          e.kilometros = `Otra fila de este service dice ${anterior}: tiene que ser el mismo`
        }
      }
    }

    if (f.cantidad.trim()) {
      const cantidad = numeroDeHoja(f.cantidad)
      if (cantidad === null || Number(cantidad) <= 0) e.cantidad = 'Tiene que ser mayor a cero'
    }

    if (f.minutos.trim()) {
      const minutos = numeroDeHoja(f.minutos)
      if (tipo === 'repuesto') e.minutos = 'Los minutos van en los trabajos'
      else if (minutos === null || !Number.isInteger(Number(minutos))) {
        e.minutos = 'En minutos enteros: 90 para una hora y media'
      } else if (Number(minutos) > 6000) e.minutos = 'Son más de 100 horas: revisalo'
    }

    if (f.precio.trim() && numeroDeHoja(f.precio) === null) {
      e.precio = 'Tiene que ser un número: 15000,50'
    }

    return e
  })
}

export const hayProblemas = (filas: readonly ProblemasDeFila[]) =>
  filas.some((f) => Object.keys(f).length > 0)

export interface RenglonImportado {
  /** La posición en las filas, para encontrar su repuesto y su aviso. */
  indice: number
  tipo: TipoRenglonService
  descripcion: string
  codigo: string | null
  cantidad: string
  minutos: number | null
  precio: string | null
}

export interface ServiceImportado {
  marca: string | null
  modelo: string | null
  nombre: string
  kilometros: number | null
  renglones: RenglonImportado[]
}

/** Las filas sin errores, juntas por service y en el orden en que vinieron. */
export function armarServices(
  filas: readonly FilaImportacion[],
  errores: readonly ProblemasDeFila[],
): ServiceImportado[] {
  const porClave = new Map<string, ServiceImportado>()

  filas.forEach((f, indice) => {
    if (Object.keys(errores[indice] ?? {}).length) return
    const clave = claveDeFila(f)
    let s = porClave.get(clave)
    if (!s) {
      s = {
        marca: f.marca.trim() || null,
        modelo: f.modelo.trim() || null,
        nombre: f.service.trim(),
        kilometros: null,
        renglones: [],
      }
      porClave.set(clave, s)
    }
    if (s.kilometros === null && f.kilometros.trim()) {
      s.kilometros = Number(numeroDeHoja(f.kilometros))
    }
    s.renglones.push({
      indice,
      tipo: tipoDeHoja(f.tipo) as TipoRenglonService,
      descripcion: f.descripcion.trim(),
      codigo: f.codigo.trim() || null,
      cantidad: f.cantidad.trim() ? (numeroDeHoja(f.cantidad) as string) : '1',
      minutos: f.minutos.trim() ? Number(numeroDeHoja(f.minutos)) : null,
      precio: f.precio.trim() ? numeroDeHoja(f.precio) : null,
    })
  })

  return [...porClave.values()]
}
