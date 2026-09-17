import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { useCambiosSinGuardar, useFlechasPestanas } from '../../teclado/index.ts'
import { TeclasRapidas } from './TeclasRapidas.tsx'

// Por id y no importando la ruta: `rutas.tsx` importa esta pantalla, y el camino inverso
// armaría un ciclo.
const ruta = getRouteApi('/con-sesion/configuracion')

export type Vista = 'generales' | 'teclas'

const VISTAS: Array<{ id: Vista; etiqueta: string }> = [
  { id: 'generales', etiqueta: 'Generales' },
  { id: 'teclas', etiqueta: 'Teclas rápidas' },
]

/**
 * Lo que cada uno configura de lo suyo: cómo se ve el sistema y qué hace cada tecla.
 *
 * **No pide ningún permiso** —va con `conSesion`—, y por eso la sección del menú tampoco
 * declara `requiere`: un permiso acá significaría que alguien le elige el tema y las teclas
 * al de al lado.
 *
 * La pestaña vive en la dirección (`?ver=teclas`) y no en estado local, así el buscador del
 * sistema puede llevar derecho a las teclas rápidas, que es como la mayoría va a llegar.
 */
export function PantallaConfiguracion() {
  const navegar = ruta.useNavigate()
  const vista = ruta.useSearch({ select: (s) => s.ver ?? 'generales' })

  useFlechasPestanas(
    VISTAS.map((v) => v.id),
    vista,
    (ver) => void navegar({ search: { ver } }),
  )

  return (
    <Shell titulo="Configuración" requiere={accesoDeRuta(contrato.configuracion.guardar)}>
      <div role="tablist" aria-label="Configuración" className="flex gap-1 border-b border-borde">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            onClick={() => void navegar({ search: { ver: v.id } })}
            className={`-mb-px h-campo border-b-2 px-3 text-dato ${
              vista === v.id
                ? 'border-marca font-semibold text-marca'
                : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      {/* Cada pestaña se desmonta al salir, y con eso suelta su Guardar: sin esto, F2 en
          Teclas rápidas podría llegarle al formulario de Generales. */}
      <section role="tabpanel" className="grid gap-3">
        {vista === 'generales' ? <Generales /> : <TeclasRapidas />}
      </section>
    </Shell>
  )
}

type Borrador = {
  tema: 'claro' | 'oscuro' | 'sistema'
  densidad: 'compacta' | 'comoda'
  /** Como texto: es lo que hay en el campo mientras se escribe, con sus estados inválidos. */
  filasPorPagina: string
  /** Cadena vacía: preguntar cada vez. */
  sucursalPredeterminadaId: string
}

const MINIMO_FILAS = 10
const MAXIMO_FILAS = 200

function Generales() {
  const config = usarSesion((e) => e.datos?.config)
  const sucursales = usarSesion((e) => e.datos?.sucursales ?? [])

  const inicial: Borrador = {
    tema: config?.tema ?? 'sistema',
    densidad: config?.densidad ?? 'compacta',
    filasPorPagina: String(config?.filasPorPagina ?? 50),
    sucursalPredeterminadaId: config?.sucursalPredeterminadaId ?? '',
  }

  const [borrador, setBorrador] = useState<Borrador>(inicial)
  const [tocoFilas, setTocoFilas] = useState(false)

  const filas = Number(borrador.filasPorPagina)
  const filasMal =
    !Number.isInteger(filas) || filas < MINIMO_FILAS || filas > MAXIMO_FILAS
      ? `Entre ${MINIMO_FILAS} y ${MAXIMO_FILAS} filas.`
      : null

  const hayCambios = (Object.keys(inicial) as Array<keyof Borrador>).some(
    (k) => inicial[k] !== borrador[k],
  )
  useCambiosSinGuardar(hayCambios)

  const guardar = useMutation({
    mutationFn: () =>
      api.configuracion.guardar({
        tema: borrador.tema,
        densidad: borrador.densidad,
        filasPorPagina: filas,
        sucursalPredeterminadaId: borrador.sucursalPredeterminadaId || null,
      }),
    onSuccess: (nueva) => {
      // La sesión es la fuente de verdad: al actualizarla, el tema y la densidad cambian en
      // el momento, sin recargar.
      const { datos, actualizarDatos } = usarSesion.getState()
      if (datos) actualizarDatos({ ...datos, config: nueva })
    },
    meta: { exito: 'Configuración guardada' },
  })

  function cambiar<K extends keyof Borrador>(clave: K, valor: Borrador[K]) {
    setBorrador((actual) => ({ ...actual, [clave]: valor }))
  }

  return (
    <div className="grid gap-4">
      <Elegir
        titulo="Tema"
        ayuda="En un taller la pantalla se mira todo el día."
        nombre="tema"
        valor={borrador.tema}
        alElegir={(v) => cambiar('tema', v as Borrador['tema'])}
        opciones={[
          { valor: 'claro', etiqueta: 'Claro' },
          { valor: 'oscuro', etiqueta: 'Oscuro' },
          { valor: 'sistema', etiqueta: 'El del sistema operativo' },
        ]}
      />

      <Elegir
        titulo="Densidad"
        ayuda="Cuánto mide cada fila de una tabla."
        nombre="densidad"
        valor={borrador.densidad}
        alElegir={(v) => cambiar('densidad', v as Borrador['densidad'])}
        opciones={[
          { valor: 'compacta', etiqueta: 'Compacta', detalle: 'Más filas a la vista' },
          { valor: 'comoda', etiqueta: 'Cómoda', detalle: 'Filas más altas' },
        ]}
      />

      <div className="grid gap-1">
        <label htmlFor="filas" className="text-dato font-semibold">
          Filas por página
        </label>
        <input
          id="filas"
          type="number"
          inputMode="numeric"
          min={MINIMO_FILAS}
          max={MAXIMO_FILAS}
          value={borrador.filasPorPagina}
          onChange={(e) => cambiar('filasPorPagina', e.target.value)}
          // Al salir del campo y no en cada tecla: marcar en rojo mientras alguien todavía
          // está escribiendo «50» es hostil.
          onBlur={() => setTocoFilas(true)}
          aria-invalid={tocoFilas && filasMal ? true : undefined}
          aria-describedby={tocoFilas && filasMal ? 'filas-error' : undefined}
          className="h-campo w-28 rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none focus-visible:border-marca"
        />
        {tocoFilas && filasMal && (
          <span id="filas-error" className="text-etiqueta text-critico">
            {filasMal}
          </span>
        )}
      </div>

      <div className="grid gap-1">
        <label htmlFor="sucursal" className="text-dato font-semibold">
          Al entrar
        </label>
        {sucursales.length > 1 ? (
          <>
            <select
              id="sucursal"
              value={borrador.sucursalPredeterminadaId}
              onChange={(e) => cambiar('sucursalPredeterminadaId', e.target.value)}
              className="h-campo w-full max-w-xs rounded-base border border-borde bg-superficie-2 px-2 text-dato text-texto outline-none focus-visible:border-marca"
            >
              <option value="">Preguntarme a qué sucursal entro</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  Entrar a {s.nombre}
                </option>
              ))}
            </select>
            <span className="text-etiqueta text-texto-tenue">
              Con una sucursal elegida no se pregunta más. Igual se cambia de sucursal desde el menú
              en cualquier momento.
            </span>
          </>
        ) : (
          <span className="text-dato text-texto-suave">
            Entrás siempre a {sucursales[0]?.nombre ?? 'tu sucursal'}: es la única que tenés.
          </span>
        )}
      </div>

      <div className="flex">
        <Boton
          accion="global.guardar"
          variante="principal"
          onClick={() => guardar.mutate()}
          deshabilitado={!hayCambios || Boolean(filasMal) || guardar.isPending}
        >
          Guardar
        </Boton>
      </div>
    </div>
  )
}

/**
 * Un grupo de opciones excluyentes, con radios de verdad.
 *
 * Con `<input type="radio">` y no con botones porque las flechas ya se mueven entre las
 * opciones sin que haya que programarlo, y el lector de pantalla las cuenta. De paso, el
 * foco en un radio impide que ← y → cambien de pestaña, que es exactamente lo que se quiere
 * mientras se elige acá.
 */
function Elegir({
  titulo,
  ayuda,
  nombre,
  valor,
  opciones,
  alElegir,
}: {
  titulo: string
  ayuda: string
  nombre: string
  valor: string
  opciones: Array<{ valor: string; etiqueta: string; detalle?: string }>
  alElegir: (valor: string) => void
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-dato font-semibold">{titulo}</legend>
      <span className="text-etiqueta text-texto-tenue">{ayuda}</span>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={`flex cursor-pointer items-center gap-2 rounded-base border px-3 py-1.5 text-dato ${
              valor === o.valor
                ? 'border-marca bg-marca-suave text-marca font-semibold'
                : 'border-borde bg-superficie-2 text-texto-suave hover:border-texto-tenue'
            }`}
          >
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => alElegir(o.valor)}
              className="accent-marca"
            />
            {o.etiqueta}
            {o.detalle && <span className="text-etiqueta text-texto-tenue">{o.detalle}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
