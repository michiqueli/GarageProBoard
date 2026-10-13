import { LADO_FOTO, MAXIMO_FOTOS, MAXIMO_NOTA_FOTO } from '@gpb/core'
import { useEffect, useId, useMemo, useRef } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoBorrar, IconoCamara } from '../../componentes/iconos.tsx'

/** Una foto sacada en la pantalla que todavía no se subió: se sube con la orden. */
export interface FotoNueva {
  clave: string
  imagen: Blob
  nota: string
}

/**
 * Achica la foto antes de subirla: una de celular pesa varios megas, y en la tablet del
 * mostrador eso es esperar. Si el navegador no puede dibujarla, va como vino: el servidor la
 * acepta igual mientras no se pase del tope.
 */
export async function achicar(archivo: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return archivo
  try {
    const bitmap = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_FOTO / Math.max(bitmap.width, bitmap.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    const ctx = lienzo.getContext('2d')
    if (!ctx) return archivo
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    bitmap.close()
    const chica = await new Promise<Blob | null>((listo) =>
      lienzo.toBlob(listo, 'image/jpeg', 0.82),
    )
    return chica ?? archivo
  } catch {
    return archivo
  }
}

/**
 * Las fotos del vehículo, para sacar con la cámara de la tablet o elegir de la computadora.
 * Optativas: sin ninguna, todo sigue igual. Se suben con la orden; hasta acá viven en la
 * pantalla.
 */
export function FotosVehiculo({
  fotos,
  onChange,
  tactil = false,
}: {
  fotos: FotoNueva[]
  onChange: (fotos: FotoNueva[]) => void
  tactil?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const id = useId()
  const quedan = MAXIMO_FOTOS - fotos.length

  async function agregar(archivos: FileList | null) {
    if (!archivos?.length) return
    const elegidas = [...archivos].filter((a) => a.type.startsWith('image/')).slice(0, quedan)
    const nuevas = await Promise.all(
      elegidas.map(async (a) => ({
        clave: crypto.randomUUID(),
        imagen: await achicar(a),
        nota: '',
      })),
    )
    onChange([...fotos, ...nuevas])
    if (entrada.current) entrada.current.value = ''
  }

  async function quitar(f: FotoNueva) {
    const si = await confirmar({
      titulo: 'Quitar la foto',
      texto: 'No se sube con la orden.',
      confirmar: 'Quitar',
      peligro: true,
    })
    if (si) onChange(fotos.filter((x) => x.clave !== f.clave))
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* La cámara trasera en la tablet; en la computadora, elegir archivos. */}
        <input
          ref={entrada}
          id={id}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          aria-label="Fotos del vehículo"
          onChange={(e) => void agregar(e.target.files)}
        />
        <Boton
          icono={<IconoCamara />}
          deshabilitado={quedan <= 0}
          onClick={() => entrada.current?.click()}
        >
          {tactil ? 'Sacar una foto' : 'Agregar fotos'}
        </Boton>
        <span className="text-etiqueta text-texto-tenue">
          {fotos.length
            ? `${fotos.length} de ${MAXIMO_FOTOS}`
            : 'Optativas: la prueba de cómo estaba el auto'}
        </span>
      </div>
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f, i) => (
            <Miniatura
              key={f.clave}
              foto={f}
              numero={i + 1}
              onNota={(nota) =>
                onChange(fotos.map((x) => (x.clave === f.clave ? { ...x, nota } : x)))
              }
              onQuitar={() => void quitar(f)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function Miniatura({
  foto,
  numero,
  onNota,
  onQuitar,
}: {
  foto: FotoNueva
  numero: number
  onNota: (nota: string) => void
  onQuitar: () => void
}) {
  const url = useMemo(() => URL.createObjectURL(foto.imagen), [foto.imagen])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <li className="grid content-start gap-1.5 rounded-base border border-borde bg-superficie p-1.5">
      <img
        src={url}
        alt={`Foto ${numero}`}
        className="aspect-[4/3] w-full rounded-[2px] bg-superficie-2 object-cover"
      />
      <input
        value={foto.nota}
        onChange={(e) => onNota(e.target.value.slice(0, MAXIMO_NOTA_FOTO))}
        placeholder="Qué muestra (optativo)"
        aria-label={`Qué muestra la foto ${numero}`}
        className="h-campo rounded-base border border-borde bg-fondo px-2 text-etiqueta"
      />
      <Boton tamano="chico" icono={<IconoBorrar />} onClick={onQuitar}>
        Quitar
      </Boton>
    </li>
  )
}

/** Sube las fotos nuevas de una orden, de a una. Devuelve cuántas no se pudieron subir. */
export async function subirFotos(
  subir: (foto: FotoNueva) => Promise<unknown>,
  fotos: FotoNueva[],
): Promise<number> {
  let fallaron = 0
  for (const f of fotos) {
    try {
      await subir(f)
    } catch {
      fallaron++
    }
  }
  return fallaron
}
