import { useEffect, useState } from 'react'
import { notificar } from './avisos.ts'
import { IconoCopiar, IconoListo } from './iconos.tsx'

/**
 * Copia un texto al portapapeles. Devuelve si pudo.
 *
 * El portapapeles moderno sólo anda en conexiones seguras. En un taller el sistema puede
 * abrirse por la IP de la red local, sin HTTPS: ahí se cae al método viejo, que sigue
 * andando en todos los navegadores.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch {
      // Sin permiso: se prueba el método viejo.
    }
  }
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/** Copia y avisa: lo usan el botón y los atajos de teclado. */
export async function copiarConAviso(valor: string, que: 'Patente' | 'Chasis'): Promise<boolean> {
  if (await copiarAlPortapapeles(valor)) {
    notificar.ok(`${que} ${valor} copiad${que === 'Patente' ? 'a' : 'o'}`)
    return true
  }
  notificar.error(
    `No se pudo copiar. Seleccioná ${que === 'Patente' ? 'la patente' : 'el chasis'} y usá Ctrl + C.`,
  )
  return false
}

/**
 * El botón de copiar que va al lado de una patente o un chasis. Se copia **sin espacios**
 * —`AE123BC`—, que es como lo piden el registro, la aseguradora y el sistema de la
 * terminal.
 *
 * Va al lado y no adentro del enlace: un botón dentro de un enlace es HTML inválido, y el
 * clic haría las dos cosas a la vez.
 */
export function BotonCopiar({ valor, que }: { valor: string; que: 'Patente' | 'Chasis' }) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 1500)
    return () => clearTimeout(t)
  }, [copiado])

  async function copiar() {
    if (await copiarConAviso(valor, que)) setCopiado(true)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${que.toLowerCase()} ${valor}`}
      title={`Copiar ${que.toLowerCase()}`}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-base border border-transparent transition-colors hover:border-borde hover:bg-superficie-2 hover:text-texto [&>svg]:size-3.5 ${
        copiado ? 'text-ok' : 'text-texto-tenue'
      }`}
    >
      {copiado ? <IconoListo /> : <IconoCopiar />}
    </button>
  )
}
