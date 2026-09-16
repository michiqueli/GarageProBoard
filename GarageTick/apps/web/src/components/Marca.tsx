/**
 * Identidad de la pantalla.
 *
 * Arriba manda el cliente: la herramienta tiene que sentirse del taller, no de
 * un proveedor. Es lo que hace que el jefe la presente como "nuestro sistema" y
 * no como "un programa que compramos", y eso mueve la adopción más que
 * cualquier feature.
 *
 * El nombre va en tipografía y no como logo bajado de internet: el rombo de
 * Renault es marca registrada, y una versión vieja o pixelada del logo de
 * Kumenia se nota enseguida. Cuando entreguen el SVG, entra acá y nada más.
 */

export function MarcaCliente({ tamano = 'md' }: { tamano?: 'md' | 'lg' }) {
  const grande = tamano === 'lg'
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`block w-1 rounded-full bg-emerald-500 ${grande ? 'h-10' : 'h-8'}`}
      />
      <div>
        <div
          className={`font-bold leading-none tracking-tight text-white ${
            grande ? 'text-3xl' : 'text-xl'
          }`}
        >
          Kumenia
        </div>
        <div
          className={`mt-1 uppercase tracking-[0.18em] text-neutral-500 ${
            grande ? 'text-xs' : 'text-[10px]'
          }`}
        >
          Renault · Taller
        </div>
      </div>
    </div>
  )
}

/** La firma va chica y abajo. El protagonista es el cliente. */
export function Firma() {
  return (
    <div className="text-[11px] leading-relaxed text-neutral-600">
      <span className="text-neutral-500">GarageTick</span> · control de tiempos
      <br />
      por{' '}
      <a
        href="https://michiqueli.dev"
        target="_blank"
        rel="noreferrer"
        className="text-neutral-500 underline-offset-2 hover:text-neutral-400 hover:underline"
      >
        michiqueli.dev
      </a>
    </div>
  )
}
