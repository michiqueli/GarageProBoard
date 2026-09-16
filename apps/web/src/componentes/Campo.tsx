import { type ComponentProps, useId } from 'react'

/**
 * Un campo con su etiqueta, y su ayuda si la tiene.
 *
 * La ayuda va afuera del `<label>` y enganchada con `aria-describedby`: adentro se pegaría
 * al nombre del campo, y un lector de pantalla leería «Correo Con este entra» como si
 * fuera una sola cosa.
 */
export function Campo({
  etiqueta,
  ayuda,
  ...props
}: ComponentProps<'input'> & { etiqueta: string; ayuda?: string | undefined }) {
  const id = useId()

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <input
        {...props}
        id={id}
        {...(ayuda ? { 'aria-describedby': `${id}-ayuda` } : {})}
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2.5 text-dato text-texto outline-none placeholder:text-texto-tenue focus-visible:border-marca disabled:opacity-60"
      />
      {ayuda && (
        <span id={`${id}-ayuda`} className="text-etiqueta text-texto-tenue">
          {ayuda}
        </span>
      )}
    </div>
  )
}
