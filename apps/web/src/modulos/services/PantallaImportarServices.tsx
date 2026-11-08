import { accesoDeRuta, contrato } from '@gpb/contracts'
import {
  COLUMNAS_IMPORTACION,
  type ColumnaImportacion,
  ENCABEZADOS_IMPORTACION,
  erroresDeFilas,
  type ProblemasDeFila,
} from '@gpb/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { confirmar, notificar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { IconoBorrar, IconoDescargar, IconoSubir, IconoVolver } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'
import { enHorasYMinutos } from '../ordenes/ordenes.ts'
import {
  bajarPlantillaCsv,
  bajarPlantillaExcel,
  ErrorDePlanilla,
  type FilaLeida,
  leerPlanilla,
} from './planilla.ts'

type Paso = 1 | 2 | 3
const PASOS: Array<{ paso: Paso; titulo: string }> = [
  { paso: 1, titulo: 'Bajá la plantilla' },
  { paso: 2, titulo: 'Subí el archivo' },
  { paso: 3, titulo: 'Revisá e importá' },
]

const COLUMNAS_EXPLICADAS: Array<{ columna: ColumnaImportacion; explica: string }> = [
  { columna: 'marca', explica: 'Vacía, el service es genérico y se ofrece para cualquier auto.' },
  { columna: 'modelo', explica: 'Opcional: para los que cambian de modelo a modelo.' },
  {
    columna: 'service',
    explica: 'Obligatoria. Las filas con igual marca, modelo y service van juntas.',
  },
  { columna: 'kilometros', explica: 'Opcional. El mismo en todas las filas del service.' },
  { columna: 'tipo', explica: 'Obligatoria: Trabajo o Repuesto.' },
  { columna: 'descripcion', explica: 'Obligatoria. En un repuesto alcanza con el código.' },
  { columna: 'codigo', explica: 'Si está en Repuestos, se engancha y descuenta stock.' },
  { columna: 'cantidad', explica: 'Vacía es 1.' },
  { columna: 'minutos', explica: 'Sólo en los trabajos: el tiempo estipulado.' },
  { columna: 'precio', explica: 'Con IVA. En una pieza de Repuestos va el precio de ese día.' },
]

const POR_PAGINA = 50

/**
 * Importar el catálogo de una planilla, en tres pasos: la plantilla, el archivo y el preview,
 * donde cada error se corrige ahí mismo. **Nada se guarda hasta el final**, y entra todo o nada.
 * Ver `docs/tecnicos/catalogo-de-services.md`.
 */
export function PantallaImportarServices() {
  const [paso, setPaso] = useState<Paso>(1)
  const [leida, setLeida] = useState<{ filas: FilaLeida[]; ignoradas: string[] } | null>(null)
  const navegar = useNavigate()
  useVolver(() => void navegar({ to: '/taller/services' }))

  return (
    <Shell titulo="Importar services" requiere={accesoDeRuta(contrato.services.importar)}>
      <Link to="/taller/services" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todos los services
      </Link>

      <ol aria-label="Pasos" className="flex flex-wrap gap-x-5 gap-y-1">
        {PASOS.map((p) => (
          <li
            key={p.paso}
            aria-current={p.paso === paso ? 'step' : undefined}
            className={`flex items-center gap-2 text-dato ${p.paso === paso ? 'font-semibold text-marca' : 'text-texto-tenue'}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-5 items-center justify-center rounded-full border text-etiqueta ${p.paso === paso ? 'border-marca bg-marca-suave' : 'border-borde'}`}
            >
              {p.paso}
            </span>
            {p.titulo}
          </li>
        ))}
      </ol>

      {paso === 1 && <PasoPlantilla alSeguir={() => setPaso(2)} />}
      {paso === 2 && (
        <PasoArchivo
          alVolver={() => setPaso(1)}
          alLeer={(l) => {
            setLeida(l)
            setPaso(3)
          }}
        />
      )}
      {paso === 3 && leida && <PasoRevisar leida={leida} alOtroArchivo={() => setPaso(2)} />}
    </Shell>
  )
}

function PasoPlantilla({ alSeguir }: { alSeguir: () => void }) {
  const [bajando, setBajando] = useState(false)

  async function bajarExcel() {
    setBajando(true)
    try {
      await bajarPlantillaExcel()
    } catch {
      notificar.error('No se pudo armar la plantilla. Probá con la de CSV.')
    } finally {
      setBajando(false)
    }
  }

  return (
    <section
      aria-label="Plantilla"
      className="grid max-w-3xl gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <p className="text-dato text-texto-suave">
        Una fila por cada trabajo o repuesto. La plantilla de Excel trae una hoja de ejemplo. Si ya
        tenés tu archivo con estos títulos, seguí derecho.
      </p>
      <div className="flex flex-wrap gap-2">
        <Boton icono={<IconoDescargar />} deshabilitado={bajando} onClick={() => void bajarExcel()}>
          {bajando ? 'Armando…' : 'Plantilla de Excel'}
        </Boton>
        <Boton icono={<IconoDescargar />} onClick={bajarPlantillaCsv}>
          Plantilla CSV
        </Boton>
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-dato sm:grid-cols-[8rem_1fr]">
        {COLUMNAS_EXPLICADAS.map((c) => (
          <div key={c.columna} className="contents">
            <dt className="font-medium">{ENCABEZADOS_IMPORTACION[c.columna]}</dt>
            <dd className="text-texto-suave">{c.explica}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Boton variante="principal" onClick={alSeguir}>
          Ya tengo el archivo
        </Boton>
      </div>
    </section>
  )
}

function PasoArchivo({
  alVolver,
  alLeer,
}: {
  alVolver: () => void
  alLeer: (l: { filas: FilaLeida[]; ignoradas: string[] }) => void
}) {
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)

  async function leer(archivo: File | undefined) {
    if (!archivo) return
    setLeyendo(true)
    setError(null)
    try {
      alLeer(await leerPlanilla(archivo))
    } catch (e) {
      setError(
        e instanceof ErrorDePlanilla ? e.message : 'No se pudo leer el archivo. Probá de nuevo.',
      )
    } finally {
      setLeyendo(false)
    }
  }

  return (
    <section
      aria-label="Archivo"
      className="grid max-w-3xl gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          void leer(e.dataTransfer.files[0])
        }}
        className={`grid cursor-pointer justify-items-center gap-1 rounded-base border border-dashed px-3 py-8 text-center text-dato focus-within:border-marca ${encima ? 'border-marca bg-marca-suave' : 'border-borde'}`}
      >
        <span className="[&>svg]:size-5" aria-hidden="true">
          <IconoSubir />
        </span>
        <span className="font-medium">{leyendo ? 'Leyendo…' : 'Elegí el archivo'}</span>
        <span className="text-etiqueta text-texto-suave">
          O arrastralo acá. Excel (.xlsx) o CSV. Todavía no se guarda nada.
        </span>
        <input
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          disabled={leyendo}
          onChange={(e) => {
            void leer(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-dato text-critico">
          {error}
        </p>
      )}
      <div>
        <Boton onClick={alVolver}>Volver a la plantilla</Boton>
      </div>
    </section>
  )
}

const ANCHOS: Record<ColumnaImportacion, string> = {
  marca: 'w-24',
  modelo: 'w-24',
  service: 'w-44',
  kilometros: 'w-20',
  tipo: 'w-24',
  descripcion: '',
  codigo: 'w-28',
  cantidad: 'w-16',
  minutos: 'w-16',
  precio: 'w-24',
}

function PasoRevisar({
  leida,
  alOtroArchivo,
}: {
  leida: { filas: FilaLeida[]; ignoradas: string[] }
  alOtroArchivo: () => void
}) {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const [filas, setFilas] = useState(leida.filas)
  const [version, setVersion] = useState(0)
  const [soloProblemas, setSoloProblemas] = useState(false)
  const [pagina, setPagina] = useState(1)
  useCambiosSinGuardar(true)

  // Lo de formato se contesta al toque, acá mismo.
  const errores = useMemo(() => erroresDeFilas(filas.map((f) => f.datos)), [filas])

  // Lo que necesita mirar la base —si el código existe, si el service ya estaba— espera a que se
  // deje de tipear. La respuesta se guarda por número de fila: llega tarde, y las filas se mueven.
  const [pedido, setPedido] = useState({ version: 0, filas })
  useEffect(() => {
    const espera = setTimeout(() => setPedido({ version, filas }), 350)
    return () => clearTimeout(espera)
  }, [version, filas])
  const preview = useQuery({
    queryKey: ['services-preview', tenantId, pedido.version],
    queryFn: async () => ({
      version: pedido.version,
      numeros: pedido.filas.map((f) => f.numero),
      ...(await api.services.previsualizar({ filas: pedido.filas.map((f) => f.datos) })),
    }),
    enabled: pedido.filas.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  })

  const delServidor = useMemo(() => {
    const mapa = new Map<number, { errores: ProblemasDeFila; avisos: ProblemasDeFila }>()
    preview.data?.numeros.forEach((n, i) => {
      const f = preview.data?.filas[i]
      if (f) mapa.set(n, f)
    })
    return mapa
  }, [preview.data])

  /** El de formato manda; del servidor sólo importa lo que este lado no puede saber: el código. */
  const problemas = (f: FilaLeida, i: number) => {
    const servidor = delServidor.get(f.numero)
    const local = errores[i] ?? {}
    return {
      errores: servidor?.errores.codigo
        ? { ...local, codigo: local.codigo ?? servidor.errores.codigo }
        : local,
      avisos: servidor?.avisos ?? {},
    }
  }

  const conProblemas = filas.map((f, i) => ({ f, i, p: problemas(f, i) }))
  const cuantosErrores = conProblemas.filter((x) => Object.keys(x.p.errores).length).length
  const cuantosAvisos = conProblemas.filter((x) => Object.keys(x.p.avisos).length).length
  const visibles = soloProblemas
    ? conProblemas.filter((x) => Object.keys(x.p.errores).length || Object.keys(x.p.avisos).length)
    : conProblemas
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const enPagina = visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)

  const alDia = preview.data?.version === version && !preview.isFetching
  const services = alDia ? (preview.data?.services ?? []) : []
  const nuevos = services.filter((s) => s.accion === 'nuevo').length
  const reemplazan = services.length - nuevos

  function cambiar(numero: number, columna: ColumnaImportacion, valor: string) {
    setFilas((xs) =>
      xs.map((x) => (x.numero === numero ? { ...x, datos: { ...x.datos, [columna]: valor } } : x)),
    )
    setVersion((v) => v + 1)
  }

  async function quitar(f: FilaLeida) {
    if (
      !(await confirmar({
        titulo: `¿Quitar la fila ${f.numero}?`,
        texto: 'No se importa. Tu archivo no cambia.',
        confirmar: 'Quitar',
        peligro: true,
      }))
    ) {
      return
    }
    setFilas((xs) => xs.filter((x) => x.numero !== f.numero))
    setVersion((v) => v + 1)
  }

  async function otroArchivo() {
    if (
      await confirmar({
        titulo: '¿Elegir otro archivo?',
        texto: 'Se pierden las correcciones que hiciste acá.',
        confirmar: 'Elegir otro',
        peligro: true,
      })
    ) {
      alOtroArchivo()
    }
  }

  const importar = useMutation({
    mutationFn: () => api.services.importar({ filas: filas.map((f) => f.datos) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['services', tenantId] })
      void navegar({ to: '/taller/services' })
    },
    meta: {
      exito: (r) => {
        const { creados, reemplazados } = r as { creados: number; reemplazados: number }
        return `Listo: ${creados} ${creados === 1 ? 'nuevo' : 'nuevos'} y ${reemplazados} ${reemplazados === 1 ? 'reemplazado' : 'reemplazados'}`
      },
      error: mensajeGeneral,
    },
  })

  const importable =
    alDia && cuantosErrores === 0 && filas.length > 0 && services.length > 0 && !importar.isPending

  async function pedirImportar() {
    if (!importable) return
    if (
      await confirmar({
        titulo: `¿Importar ${services.length === 1 ? 'el service' : `${services.length} services`}?`,
        texto: [
          `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}.`,
          reemplazan
            ? `${reemplazan} ${reemplazan === 1 ? 'ya estaba y se reemplaza' : 'ya estaban y se reemplazan'} entero${reemplazan === 1 ? '' : 's'}.`
            : '',
          'Las órdenes que ya los usaron no cambian.',
        ]
          .filter(Boolean)
          .join(' '),
        confirmar: 'Importar',
      })
    ) {
      importar.mutate()
    }
  }

  useAtajo('global.guardar', () => void pedirImportar(), importable)

  /** ↑ y ↓ van a la misma columna de la fila de al lado, como en una planilla. */
  function moverse(e: KeyboardEvent<HTMLInputElement>, posicion: number, columna: string) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const destino = document.querySelector<HTMLInputElement>(
      `[data-celda="${posicion + (e.key === 'ArrowDown' ? 1 : -1)}-${columna}"]`,
    )
    if (!destino) return
    e.preventDefault()
    destino.focus()
    destino.select()
  }

  const celda = (
    { f, p }: (typeof conProblemas)[number],
    columna: ColumnaImportacion,
    posicion: number,
    conEtiqueta: boolean,
  ) => (
    <Celda
      columna={columna}
      numero={f.numero}
      posicion={posicion}
      valor={f.datos[columna]}
      error={p.errores[columna]}
      aviso={p.avisos[columna]}
      conEtiqueta={conEtiqueta}
      alCambiar={(v) => cambiar(f.numero, columna, v)}
      alTecla={(e) => moverse(e, posicion, columna)}
    />
  )

  return (
    <>
      <section
        aria-label="Resumen"
        className="grid gap-2 rounded-base border border-borde bg-superficie px-3 py-2.5"
      >
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-dato">
          <span>
            <b>{filas.length}</b> {filas.length === 1 ? 'fila' : 'filas'}
          </span>
          <span className={cuantosErrores ? 'font-semibold text-critico' : 'text-ok'}>
            {cuantosErrores
              ? `${cuantosErrores} con errores: corregilas para importar`
              : 'Sin errores'}
          </span>
          {cuantosAvisos > 0 && (
            <span className="text-atencion">
              {cuantosAvisos} con avisos: se pueden importar igual
            </span>
          )}
          {!alDia && !preview.isError && (
            <span className="text-etiqueta text-texto-tenue">Revisando…</span>
          )}
        </p>
        {leida.ignoradas.length > 0 && (
          <p className="text-etiqueta text-texto-suave">
            No se usan estas columnas del archivo: {leida.ignoradas.join(', ')}.
          </p>
        )}
        {preview.isError && (
          <p role="alert" className="text-dato text-critico">
            No se pudo revisar con el sistema. {mensajeGeneral(preview.error)}
          </p>
        )}
        {services.length > 0 && (
          <ul
            aria-label="Qué va a pasar"
            className="grid max-h-40 gap-0.5 overflow-y-auto text-etiqueta"
          >
            {services.map((s) => (
              <li
                key={`${s.marca}|${s.modelo}|${s.nombre}`}
                className="flex flex-wrap items-center gap-x-2"
              >
                <span
                  className={`rounded-full border px-2 ${s.accion === 'nuevo' ? 'border-borde text-texto-suave' : 'border-atencion text-atencion'}`}
                >
                  {s.accion === 'nuevo' ? 'Nuevo' : 'Reemplaza'}
                </span>
                <span className="font-medium">{s.nombre}</span>
                <span className="text-texto-suave">
                  {[s.marca ?? 'Genérico', s.modelo].filter(Boolean).join(' ')} · {s.trabajos}{' '}
                  {s.trabajos === 1 ? 'trabajo' : 'trabajos'} · {s.repuestos}{' '}
                  {s.repuestos === 1 ? 'repuesto' : 'repuestos'}
                  {s.minutos ? ` · ${enHorasYMinutos(s.minutos)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Filas"
        className="overflow-hidden rounded-base border border-borde bg-superficie"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-borde px-3 py-2">
          <label className="inline-flex items-center gap-2 text-etiqueta text-texto-suave">
            <input
              type="checkbox"
              checked={soloProblemas}
              onChange={(e) => {
                setSoloProblemas(e.target.checked)
                setPagina(1)
              }}
            />
            Sólo las que tienen algo
          </label>
          {paginas > 1 && (
            <span className="ml-auto flex items-center gap-2 text-etiqueta text-texto-suave">
              <Boton
                tamano="chico"
                deshabilitado={actual === 1}
                onClick={() => setPagina(actual - 1)}
              >
                Anterior
              </Boton>
              Página {actual} de {paginas}
              <Boton
                tamano="chico"
                deshabilitado={actual === paginas}
                onClick={() => setPagina(actual + 1)}
              >
                Siguiente
              </Boton>
            </span>
          )}
        </header>

        {enPagina.length === 0 && (
          <p className="px-3 py-4 text-dato text-texto-suave">
            {filas.length ? 'Ninguna fila tiene errores ni avisos.' : 'Quitaste todas las filas.'}
          </p>
        )}

        {enPagina.length > 0 && esEscritorio && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-dato">
              <thead>
                <tr className="text-left text-etiqueta text-texto-tenue">
                  <th className="w-12 border-b border-borde px-2 py-1.5 font-medium">Fila</th>
                  {COLUMNAS_IMPORTACION.map((c) => (
                    <th
                      key={c}
                      className={`border-b border-borde px-1 py-1.5 font-medium ${ANCHOS[c]}`}
                    >
                      {ENCABEZADOS_IMPORTACION[c]}
                    </th>
                  ))}
                  <th className="w-20 border-b border-borde px-1 py-1.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {enPagina.map((x, posicion) => (
                  <tr key={x.f.numero} className="align-top">
                    <td className="tabular border-b border-borde-suave px-2 py-1.5 font-mono text-etiqueta text-texto-tenue">
                      {x.f.numero}
                    </td>
                    {COLUMNAS_IMPORTACION.map((c) => (
                      <td key={c} className="border-b border-borde-suave px-1 py-1">
                        {celda(x, c, posicion, false)}
                      </td>
                    ))}
                    <td className="border-b border-borde-suave px-1 py-1">
                      <Boton
                        tamano="chico"
                        variante="sutil"
                        icono={<IconoBorrar />}
                        onClick={() => void quitar(x.f)}
                      >
                        Quitar
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {enPagina.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {enPagina.map((x, posicion) => (
              <li key={x.f.numero} className="grid gap-2 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-etiqueta text-texto-tenue">
                    Fila {x.f.numero}
                  </span>
                  <Boton
                    tamano="chico"
                    variante="sutil"
                    icono={<IconoBorrar />}
                    onClick={() => void quitar(x.f)}
                  >
                    Quitar
                  </Boton>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {COLUMNAS_IMPORTACION.map((c) => (
                    <div
                      key={c}
                      className={c === 'descripcion' || c === 'service' ? 'col-span-2' : ''}
                    >
                      {celda(x, c, posicion, true)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-borde-suave px-3 py-2">
          <Boton onClick={() => void otroArchivo()}>Elegir otro archivo</Boton>
          <span className="ml-auto">
            <Boton
              accion="global.guardar"
              variante="principal"
              deshabilitado={!importable}
              onClick={() => void pedirImportar()}
            >
              {importar.isPending ? 'Importando…' : 'Importar'}
            </Boton>
          </span>
        </footer>
      </section>
    </>
  )
}

function Celda({
  columna,
  numero,
  posicion,
  valor,
  error,
  aviso,
  conEtiqueta,
  alCambiar,
  alTecla,
}: {
  columna: ColumnaImportacion
  numero: number
  posicion: number
  valor: string
  error: string | undefined
  aviso: string | undefined
  conEtiqueta: boolean
  alCambiar: (v: string) => void
  alTecla: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  const titulo = ENCABEZADOS_IMPORTACION[columna]
  return (
    <div className="grid gap-0.5">
      {conEtiqueta && <span className="text-etiqueta text-texto-suave">{titulo}</span>}
      <input
        aria-label={`${titulo} de la fila ${numero}`}
        aria-invalid={Boolean(error)}
        data-celda={`${posicion}-${columna}`}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={alTecla}
        className={`h-7 w-full min-w-0 rounded-base border bg-superficie-2 px-1.5 text-dato text-texto outline-none focus-visible:border-marca ${error ? 'border-critico' : aviso ? 'border-atencion' : 'border-borde'}`}
      />
      {error && <span className="text-etiqueta text-critico">{error}</span>}
      {!error && aviso && <span className="text-etiqueta text-atencion">{aviso}</span>}
    </div>
  )
}
