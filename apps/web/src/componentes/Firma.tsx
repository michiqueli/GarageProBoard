import { useEffect, useRef, useState } from 'react'
import { Boton } from './Boton.tsx'

/** El grosor del trazo, en píxeles de pantalla: se lee impreso sin parecer un marcador. */
const GROSOR = 2.5

/**
 * Donde el cliente firma con el dedo, o con el mouse. Avisa con la imagen cada vez que termina un
 * trazo, y con `null` cuando se borra: quien la usa decide cuándo mandarla.
 *
 * La imagen es un PNG con fondo blanco, del doble del tamaño en pantalla en una tablet con
 * pantalla densa: sale nítida en el comprobante. `touch-action: none` es lo que evita que firmar
 * desplace la página.
 */
export function Firma({
  etiqueta,
  alCambiar,
}: {
  etiqueta: string
  alCambiar: (imagen: Blob | null) => void
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [firmada, setFirmada] = useState(false)
  const avisar = useRef(alCambiar)
  avisar.current = alCambiar

  function preparar() {
    const c = lienzo.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const escala = window.devicePixelRatio || 1
    c.width = Math.round(c.clientWidth * escala)
    c.height = Math.round(c.clientHeight * escala)
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    const estilo = getComputedStyle(document.documentElement)
    ctx.fillStyle = estilo.getPropertyValue('--color-papel').trim() || 'white'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.lineWidth = GROSOR
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = estilo.getPropertyValue('--color-papel-tinta').trim() || 'black'
  }

  useEffect(preparar, [])

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - caja.left, y: e.clientY - caja.top }
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = lienzo.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    const { x, y } = punto(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // Un toque sin arrastrar también deja marca: un punto es parte de muchas firmas.
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }

  function seguir(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return
    const ctx = lienzo.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = punto(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function terminar() {
    if (!dibujando.current) return
    dibujando.current = false
    setFirmada(true)
    lienzo.current?.toBlob((imagen) => avisar.current(imagen), 'image/png')
  }

  function borrar() {
    preparar()
    setFirmada(false)
    avisar.current(null)
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-etiqueta font-medium text-texto-suave">{etiqueta}</span>
      <div className="relative">
        <canvas
          ref={lienzo}
          aria-label={etiqueta}
          className="h-48 w-full touch-none rounded-base border border-borde bg-papel"
          onPointerDown={empezar}
          onPointerMove={seguir}
          onPointerUp={terminar}
          onPointerCancel={terminar}
        />
        {!firmada && (
          <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-texto-tenue text-etiqueta text-texto-tenue">
            Firmá acá
          </span>
        )}
      </div>
      <span>
        <Boton tamano="chico" variante="sutil" deshabilitado={!firmada} onClick={borrar}>
          Borrar y firmar de nuevo
        </Boton>
      </span>
    </div>
  )
}
