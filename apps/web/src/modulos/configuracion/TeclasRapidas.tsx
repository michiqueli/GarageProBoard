import {
  atajosParaSembrar,
  catalogoPorAmbito,
  type DefinicionAccion,
  type Diferencias,
  mostrarTecla,
  soloDiferencias,
  teclaDesdeEvento,
  validarAtajos,
} from '@gpb/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoEditar } from '../../componentes/iconos.tsx'
import { Tecla } from '../../componentes/Tecla.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { useCambiosSinGuardar } from '../../teclado/index.ts'

/** Las de fábrica, para el botón que vuelve todo atrás. */
const DE_FABRICA: Readonly<Record<string, string>> = Object.fromEntries(
  atajosParaSembrar().map((a) => [a.accion, a.tecla]),
)

function mismasDiferencias(a: Diferencias, b: Diferencias): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...claves].every((k) => a[k] === b[k])
}

/**
 * Configuración → Teclas rápidas.
 *
 * Existe porque el mapa por omisión está razonado sobre convenciones de Windows y del rubro,
 * **no sobre observar a un operador real**. Si el que viene de Oversoft tiene otra tecla en
 * los dedos, acomodarla tiene que costarle dos minutos y no un año de pelearse.
 *
 * Lo que se guarda son las **diferencias**, no el mapa entero: el día que cambiemos una
 * tecla por omisión, le llega a todos los que nunca configuraron nada.
 */
export function TeclasRapidas() {
  const guardados = usarSesion((e) => e.datos?.atajos ?? {})

  // El mapa que se está editando. Arranca del de la sesión y no lee de la base otra vez: la
  // sesión ya lo trae, y una consulta acá haría parpadear la pantalla con datos que ya tenemos.
  const [mapa, setMapa] = useState<Record<string, string>>(() => ({ ...guardados }))
  const [cambiando, setCambiando] = useState<DefinicionAccion | null>(null)

  const diferencias = soloDiferencias(mapa)
  const problemas = validarAtajos(diferencias)
  const motivoDe = new Map(problemas.map((p) => [p.accion, p.motivo]))
  const hayCambios = !mismasDiferencias(diferencias, soloDiferencias(guardados))

  useCambiosSinGuardar(hayCambios)

  const guardar = useMutation({
    mutationFn: () => api.configuracion.guardarAtajos({ atajos: diferencias }),
    onSuccess: ({ atajos }) => {
      // La sesión es la fuente de verdad del mapa: al actualizarla, los botones de todas las
      // pantallas y la barra de estado ya dibujan la tecla nueva, sin recargar nada.
      const { datos, actualizarDatos } = usarSesion.getState()
      if (datos) actualizarDatos({ ...datos, atajos })
      setMapa({ ...atajos })
    },
    meta: { exito: 'Teclas guardadas' },
  })

  /** La que rige ahora para esta acción. Las fijas muestran la suya y no se tocan. */
  function teclaDe(d: DefinicionAccion): string {
    return d.reasignable ? (mapa[d.accion] ?? d.porOmision) : d.porOmision
  }

  function asignar(accion: string, tecla: string) {
    setMapa((actual) => ({ ...actual, [accion]: tecla }))
    setCambiando(null)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-dato text-texto-suave">
          Las teclas de fábrica son un punto de partida. Cambiá las que quieras: son sólo tuyas y no
          afectan a nadie más. Las que el navegador se queda —F11, F12, Ctrl+W— se rechazan con el
          motivo, y Esc no se puede reasignar porque cancela en todos lados.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sin confirmación a propósito: acá todavía no se descarta nada. Los cambios quedan a
              la vista fila por fila y no se guardan hasta Guardar, y salir con Esc pregunta. */}
          {Object.keys(diferencias).length > 0 && (
            <Boton onClick={() => setMapa({ ...DE_FABRICA })}>Volver a las de fábrica</Boton>
          )}
          <Boton
            accion="global.guardar"
            variante="principal"
            onClick={() => guardar.mutate()}
            deshabilitado={!hayCambios || problemas.length > 0 || guardar.isPending}
          >
            Guardar
          </Boton>
        </div>
      </div>

      {problemas.length > 0 && (
        <p role="alert" className="text-dato text-critico">
          Hay {problemas.length === 1 ? 'una tecla' : `${problemas.length} teclas`} que no se pueden
          usar. Están marcadas abajo.
        </p>
      )}

      {catalogoPorAmbito().map((grupo) => (
        <section key={grupo.ambito} className="grid gap-1.5">
          <h2 className="text-dato font-semibold">{grupo.etiqueta}</h2>
          <ul className="overflow-hidden rounded-base border border-borde bg-superficie">
            {grupo.acciones.map((d) => {
              const tecla = teclaDe(d)
              const cambiada = d.reasignable && tecla !== d.porOmision
              const motivo = motivoDe.get(d.accion)

              return (
                <li
                  key={d.accion}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-borde-suave px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 basis-48">
                    <b className="block text-dato font-medium">{d.etiqueta}</b>
                    {d.descripcion && (
                      <span className="block text-etiqueta text-texto-tenue">{d.descripcion}</span>
                    )}
                    {motivo && (
                      <span role="alert" className="block text-etiqueta text-critico">
                        {motivo}
                      </span>
                    )}
                  </span>

                  <Tecla tecla={tecla} tono={motivo ? 'normal' : cambiada ? 'marca' : 'normal'} />

                  {d.reasignable ? (
                    <span className="flex items-center gap-1.5">
                      <Boton tamano="chico" icono={<IconoEditar />} onClick={() => setCambiando(d)}>
                        Cambiar
                      </Boton>
                      {cambiada && (
                        <Boton
                          tamano="chico"
                          variante="sutil"
                          onClick={() => asignar(d.accion, d.porOmision)}
                        >
                          Volver a {mostrarTecla(d.porOmision)}
                        </Boton>
                      )}
                    </span>
                  ) : (
                    <span className="text-etiqueta text-texto-tenue italic">
                      Fija: cancela en todos lados
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {cambiando && (
        <CapturarTecla
          definicion={cambiando}
          diferencias={diferencias}
          alElegir={(tecla) => asignar(cambiando.accion, tecla)}
          alCerrar={() => setCambiando(null)}
        />
      )}
    </>
  )
}

/**
 * Pide la combinación apretándola, que es la única forma sensata de elegir un atajo: una
 * lista desplegable con doscientas combinaciones no la lee nadie.
 *
 * Es un diálogo modal **también por el teclado**: mientras esté abierto, el registro de
 * atajos de la aplicación no dispara nada —mira si hay un `aria-modal`—, así que apretar F2
 * acá elige F2 en vez de guardar.
 */
function CapturarTecla({
  definicion,
  diferencias,
  alElegir,
  alCerrar,
}: {
  definicion: DefinicionAccion
  diferencias: Diferencias
  alElegir: (tecla: string) => void
  alCerrar: () => void
}) {
  const [rechazada, setRechazada] = useState<{ tecla: string; motivo: string } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  // En una ref para que el escucha no se vuelva a montar en cada render y pierda una tecla.
  const ultimo = useRef({ definicion, diferencias, alElegir, alCerrar })
  ultimo.current = { definicion, diferencias, alElegir, alCerrar }

  useEffect(() => {
    panel.current?.focus()

    function alPresionar(evento: KeyboardEvent) {
      // Los modificadores sueltos no son una combinación: mientras alguien mantiene Ctrl
      // buscando la otra tecla, no hay nada que decidir.
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(evento.key)) return

      // F11 y F12 son las únicas que el navegador no suelta. Prevenirlas no sirve de nada, y
      // por eso mismo son las que hay que rechazar con el motivo escrito.
      const interceptable = evento.key !== 'F11' && evento.key !== 'F12'
      if (interceptable) {
        evento.preventDefault()
        evento.stopPropagation()
      }

      const { definicion: d, diferencias: dif, alElegir: elegir, alCerrar: cerrar } = ultimo.current

      // Esc cierra: es la salida de cualquier diálogo del sistema, y además está reservada,
      // así que nunca podría ser la respuesta a esta pregunta.
      if (evento.key === 'Escape') {
        cerrar()
        return
      }

      const tecla = teclaDesdeEvento(evento)
      const motivo = porQueNoSePuede(d.accion, tecla, dif)
      if (motivo) {
        setRechazada({ tecla, motivo })
        return
      }
      elegir(tecla)
    }

    // En captura: llega antes que cualquier otro escucha de la aplicación.
    document.addEventListener('keydown', alPresionar, true)
    return () => document.removeEventListener('keydown', alPresionar, true)
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancelar"
        tabIndex={-1}
        onClick={alCerrar}
        className="absolute inset-0 animate-aparecer bg-velo"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Elegir la tecla de ${definicion.etiqueta}`}
        tabIndex={-1}
        className="relative grid w-full max-w-sm gap-2 rounded-base border border-borde bg-superficie p-4 text-center outline-none animate-emerger shadow-flotante"
      >
        <h2 className="font-display text-dato font-semibold">
          Apretá la tecla para «{definicion.etiqueta}»
        </h2>
        <p className="text-dato text-texto-suave">
          Puede ser con Ctrl, Alt o Shift. Ahora está en{' '}
          <b className="text-texto">{mostrarTecla(definicion.porOmision)}</b>.
        </p>

        {rechazada && (
          <p role="alert" className="text-dato text-critico">
            {mostrarTecla(rechazada.tecla)}: {rechazada.motivo}
          </p>
        )}

        <p className="text-etiqueta text-texto-tenue">Esc para dejarlo como está.</p>
      </div>
    </div>
  )
}

/**
 * Por qué esta tecla no sirve para esta acción, o nada si sirve.
 *
 * Valida el mapa **entero** con la tecla ya puesta y se queda con lo que antes no estaba mal:
 * un choque lo reporta la acción que llega segunda al recorrer, que puede ser la otra y no
 * ésta, y el usuario necesita ver justamente ese motivo —«F3 ya está en Buscar»— y no un
 * «no se puede» pelado.
 */
function porQueNoSePuede(accion: string, tecla: string, diferencias: Diferencias): string | null {
  const antes = validarAtajos(diferencias)
  const candidato = { ...diferencias, [accion]: tecla }
  const conocido = new Set(antes.map((p) => `${p.accion}|${p.motivo}`))
  const nuevos = validarAtajos(candidato).filter((p) => !conocido.has(`${p.accion}|${p.motivo}`))

  return nuevos[0]?.motivo ?? null
}
