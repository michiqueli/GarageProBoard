import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import type { api } from '../../sesion/cliente.ts'

export type Tablero = Awaited<ReturnType<typeof api.fichaje.tablero>>
export type Tarjeta = Tablero['autos'][number]

/**
 * Las piezas del tablero de piso, compartidas por las dos pantallas que lo muestran: la del
 * jefe de taller y el televisor colgado en el piso.
 *
 * Están acá y no duplicadas a propósito. Son **dos vistas del mismo tablero**, no dos
 * tableros: si fueran dos, la que menos se usa queda vieja y nadie se entera hasta que alguien
 * compara los números delante de un cliente.
 */

/** «2 h 14 min», «41 min». Lo que se mira de un auto es cuánto, no los minutos sueltos. */
export function enHoras(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}

export const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })

/** «000123», como se lee en la orden impresa y en la tarjeta del taller. */
export const numeroOrden = (n: number) => String(n).padStart(6, '0')

/**
 * El estado sale de `EstadoOT`, que es **el único lugar del sistema que decide cómo se dibuja
 * uno**. Acá había una copia propia que además lo contradecía: dos maneras de mostrar lo mismo
 * terminan enseñándole al usuario dos idiomas para el mismo dato.
 *
 * Lo único que agrega este envoltorio es el tamaño, porque el televisor del piso se lee a cinco
 * metros y la tabla del jefe de taller no.
 */
export function Estado({ estado, grande }: { estado: Tarjeta['estado']; grande?: boolean }) {
  if (!grande) return <EstadoOT estado={estado} />
  return (
    <span className="inline-flex [&>span]:px-3 [&>span]:py-0.5 [&>span]:text-[1rem]">
      <EstadoOT estado={estado} />
    </span>
  )
}

/**
 * Quién lo tiene ahora. Es la columna que no existía antes del fichaje, y la que convierte un
 * listado de órdenes en un tablero: sin esto, «qué está pasando en el taller» se contesta
 * caminando hasta el fondo y preguntando.
 */
export function Quien({ auto, grande }: { auto: Tarjeta; grande?: boolean }) {
  // Parado con motivo no es lo mismo que parado sin explicación: el primero espera algo, el
  // segundo es el que hay que ir a mirar.
  if (auto.trabajando.length === 0 && auto.espera) {
    return (
      <span
        className={`inline-flex items-baseline gap-1.5 rounded-full border border-atencion text-atencion ${
          grande ? 'px-3 text-[1rem]' : 'px-2 text-etiqueta'
        }`}
      >
        <span className="font-semibold">Espera: {auto.espera.motivo}</span>
        <span className="opacity-80">desde {HORA.format(new Date(auto.espera.desde))}</span>
      </span>
    )
  }
  if (auto.trabajando.length === 0) {
    return (
      <span
        className={`inline-flex rounded-full bg-critico-suave font-semibold text-critico ${
          grande ? 'px-3 text-[1rem]' : 'px-2 text-etiqueta'
        }`}
      >
        Parado
      </span>
    )
  }
  return (
    <span className={grande ? 'text-[1.15rem]' : 'text-dato'}>
      {auto.trabajando.map((t) => t.nombre).join(', ')}
      <span className={grande ? 'ml-2 opacity-70' : 'ml-1.5 text-texto-tenue'}>
        desde {HORA.format(new Date(auto.trabajando[0]?.desde ?? auto.ingreso))}
      </span>
    </span>
  )
}

/**
 * Los dos relojes y su diferencia.
 *
 * No son el mismo número y por eso van los dos: la mano de obra es lo que costó el trabajo, el
 * tiempo en taller es lo que el cliente percibió. La diferencia es el tiempo muerto, y es
 * normalmente lo que la concesionaria más quiere ver — es lo que explica por qué un auto
 * estuvo seis días.
 */
export function Relojes({ auto, grande }: { auto: Tarjeta; grande?: boolean }) {
  const base = grande ? 'text-[1.05rem]' : 'text-etiqueta'
  return (
    <span className={`flex flex-wrap gap-x-4 gap-y-1 tabular-nums ${base}`}>
      <span>
        <span className="opacity-60">En taller </span>
        {enHoras(auto.enTallerMin)}
      </span>
      <span>
        <span className="opacity-60">Trabajado </span>
        {enHoras(auto.manoDeObraMin)}
      </span>
      {auto.muertoMin > 0 && (
        <span className={auto.muertoMin > auto.manoDeObraMin ? 'text-atencion' : 'opacity-60'}>
          <span className="opacity-60">Muerto </span>
          {enHoras(auto.muertoMin)}
          {auto.esperadoMin > 0 && (
            <span className="opacity-60">
              {' '}
              (esperando {enHoras(Math.min(auto.esperadoMin, auto.muertoMin))})
            </span>
          )}
        </span>
      )}
    </span>
  )
}

/** Los tres números del encabezado, que es lo primero que alguien mira al entrar. */
export function Resumen({ resumen, grande }: { resumen: Tablero['resumen']; grande?: boolean }) {
  const numero = grande ? 'text-[2.6rem]' : 'text-[1.4rem]'
  const rotulo = grande ? 'text-[0.95rem]' : 'text-etiqueta'
  const items = [
    { valor: resumen.enTaller, texto: 'en el taller', tono: '' },
    { valor: resumen.conAlguien, texto: 'con alguien', tono: 'text-ok' },
    { valor: resumen.parados, texto: 'parados', tono: resumen.parados > 0 ? 'text-atencion' : '' },
  ]
  return (
    <div className={`flex ${grande ? 'gap-10' : 'gap-6'}`}>
      {items.map((i) => (
        <div key={i.texto} className="grid">
          <span className={`font-semibold tabular-nums ${numero} ${i.tono}`}>{i.valor}</span>
          <span className={`${rotulo} opacity-60`}>{i.texto}</span>
        </div>
      ))}
    </div>
  )
}
