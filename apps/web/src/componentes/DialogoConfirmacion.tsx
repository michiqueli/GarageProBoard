import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { usarAvisos } from './avisos.ts'
import { Tecla } from './Tecla.tsx'

/**
 * La pregunta antes de algo que no se deshace solo. Una por vez, montada en la raíz.
 *
 * El teclado queda adentro mientras está abierta: `Tab` no se escapa a la pantalla de
 * atrás y los atajos globales no disparan (ver `teclado/contexto.tsx`). Si F2 guardara el
 * formulario de abajo con la pregunta abierta, la pregunta no protegería nada.
 *
 * Cuando es una baja, el foco arranca en **Cancelar**: un `Enter` de más no puede dar de
 * baja a nadie. En el resto arranca en confirmar, porque ahí `Enter` es lo esperado.
 *
 * `Esc` y `Enter` se escriben a mano, y es la excepción a la regla de los atajos: no son
 * reasignables. `Esc` está reservada y `Enter` es el botón con foco.
 */
export function DialogoConfirmacion() {
  const pregunta = usarAvisos((e) => e.confirmacion)
  const titulo = useId()
  const texto = useId()
  const panel = useRef<HTMLDivElement>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const aceptar = useRef<HTMLButtonElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const [valor, setValor] = useState('')
  const [tocado, setTocado] = useState(false)

  useEffect(() => {
    if (!pregunta) return
    setValor(pregunta.campo?.valor ?? '')
    setTocado(false)
    const antes = document.activeElement as HTMLElement | null
    // Con un dato para escribir, el foco va al campo; si no, como siempre.
    if (pregunta.campo) {
      entrada.current?.focus()
      entrada.current?.select()
    } else {
      ;(pregunta.peligro ? cancelar : aceptar).current?.focus()
    }
    // Al cerrar, el foco vuelve adonde estaba: quien opera con teclado sigue donde iba.
    return () => antes?.focus()
  }, [pregunta])

  if (!pregunta) return null

  const problema = pregunta.campo?.validar?.(valor) ?? null
  function responderSi() {
    setTocado(true)
    if (problema) return
    pregunta?.responder(true, valor)
  }

  function teclas(evento: KeyboardEvent) {
    // Que nada de lo que se aprieta acá llegue a los atajos de la pantalla de atrás.
    evento.stopPropagation()
    if (evento.key === 'Escape') {
      evento.preventDefault()
      pregunta?.responder(false)
      return
    }
    if (evento.key === 'Tab') {
      const botones = [entrada.current, cancelar.current, aceptar.current].filter(
        Boolean,
      ) as HTMLElement[]
      const i = botones.indexOf(document.activeElement as HTMLElement)
      evento.preventDefault()
      botones[(i + (evento.shiftKey ? -1 : 1) + botones.length) % botones.length]?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-velo p-4">
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titulo}
        aria-describedby={pregunta.texto ? texto : undefined}
        onKeyDown={teclas}
        className="grid w-full max-w-md animate-emerger gap-3 rounded-base border border-borde bg-superficie p-4 shadow-flotante"
      >
        <h2 id={titulo} className="font-display text-ui font-semibold">
          {pregunta.titulo}
        </h2>
        {pregunta.texto && (
          <p id={texto} className="text-dato text-texto-suave">
            {pregunta.texto}
          </p>
        )}
        {pregunta.campo && (
          <label className="grid gap-1">
            <span className="text-etiqueta font-medium text-texto-suave">
              {pregunta.campo.etiqueta}
            </span>
            <input
              ref={entrada}
              type={pregunta.campo.tipo ?? 'text'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  responderSi()
                }
              }}
              aria-invalid={tocado && Boolean(problema)}
              className="h-campo rounded-base border border-borde bg-superficie-2 px-2 text-dato text-texto outline-none focus-visible:border-marca"
            />
            {tocado && problema && <span className="text-etiqueta text-critico">{problema}</span>}
          </label>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelar}
            type="button"
            onClick={() => pregunta.responder(false)}
            className="inline-flex h-campo items-center gap-2 rounded-base border border-borde bg-superficie-2 px-3 text-dato text-texto"
          >
            Cancelar <Tecla tecla="Escape" />
          </button>
          <button
            ref={aceptar}
            type="button"
            onClick={responderSi}
            className={`inline-flex h-campo items-center gap-2 rounded-base border px-3 text-dato font-semibold ${
              pregunta.peligro
                ? 'border-critico bg-critico text-fondo'
                : 'border-marca bg-marca-suave text-marca'
            }`}
          >
            {pregunta.confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
