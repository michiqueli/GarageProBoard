import { useEffect, useRef, useState } from 'react'

/** Lo mínimo de la API del navegador que se usa. No está en los tipos de TypeScript todavía. */
interface DetectorDeCodigos {
  detect(fuente: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opciones: { formats: string[] }) => DetectorDeCodigos
  }
}

/** Cada cuánto se mira un cuadro. Más seguido no lee más rápido y calienta la tablet. */
const MS_ENTRE_CUADROS = 200
/** El mismo código leído dos veces seguidas es la misma tarjeta que sigue frente a la cámara. */
const MS_REPETIDO = 3000

type Estado = 'pidiendo' | 'leyendo' | 'sin-camara'

/**
 * La cámara de la tablet leyendo un QR.
 *
 * Usa el lector que trae el navegador —`BarcodeDetector`, el de Chrome en Android— y, donde
 * no existe, como en Safari del iPad, `jsqr`, que se descarga recién ahí. La cámara es la de
 * adelante: quien recibe apoya su tarjeta contra la pantalla que está mirando.
 */
export function LectorQr({ alLeer, activo }: { alLeer: (texto: string) => void; activo: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [estado, setEstado] = useState<Estado>('pidiendo')
  const leer = useRef(alLeer)
  leer.current = alLeer
  const pausado = useRef(!activo)
  pausado.current = !activo

  useEffect(() => {
    let vivo = true
    let flujo: MediaStream | null = null
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let ultimo = { texto: '', en: 0 }

    async function arrancar() {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        })
      } catch {
        if (vivo) setEstado('sin-camara')
        return
      }
      const elemento = video.current
      if (!vivo || !elemento) return
      elemento.srcObject = flujo
      await elemento.play().catch(() => undefined)
      setEstado('leyendo')

      const leerCuadro = await armarLector()
      const mirar = async () => {
        if (!vivo) return
        if (!pausado.current && elemento.readyState >= 2) {
          const texto = await leerCuadro(elemento).catch(() => null)
          const ahora = Date.now()
          if (texto && (texto !== ultimo.texto || ahora - ultimo.en > MS_REPETIDO)) {
            ultimo = { texto, en: ahora }
            leer.current(texto)
          }
        }
        temporizador = setTimeout(mirar, MS_ENTRE_CUADROS)
      }
      void mirar()
    }

    void arrancar()
    return () => {
      vivo = false
      if (temporizador) clearTimeout(temporizador)
      for (const pista of flujo?.getTracks() ?? []) pista.stop()
    }
  }, [])

  return (
    <div className="grid justify-items-center gap-3">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Cámara"
        className={`aspect-[4/3] w-full max-w-md -scale-x-100 rounded-base border border-borde bg-superficie-2 object-cover ${
          estado === 'sin-camara' ? 'hidden' : ''
        }`}
      />
      {estado === 'pidiendo' && <p className="text-dato text-texto-tenue">Abriendo la cámara…</p>}
      {estado === 'sin-camara' && (
        <p role="alert" className="max-w-md text-center text-dato text-atencion">
          No se pudo usar la cámara. Dale permiso en el navegador, o pasá la credencial por el
          lector.
        </p>
      )}
    </div>
  )
}

/** Devuelve la función que lee un cuadro: la del navegador si existe, si no la de jsqr. */
async function armarLector(): Promise<(fuente: HTMLVideoElement) => Promise<string | null>> {
  if (window.BarcodeDetector) {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    return async (fuente) => (await detector.detect(fuente))[0]?.rawValue ?? null
  }

  const { default: jsQR } = await import('jsqr')
  const lienzo = document.createElement('canvas')
  const contexto = lienzo.getContext('2d', { willReadFrequently: true })
  return async (fuente) => {
    if (!contexto || !fuente.videoWidth) return null
    lienzo.width = fuente.videoWidth
    lienzo.height = fuente.videoHeight
    contexto.drawImage(fuente, 0, 0)
    const { data, width, height } = contexto.getImageData(0, 0, lienzo.width, lienzo.height)
    return jsQR(data, width, height)?.data ?? null
  }
}
