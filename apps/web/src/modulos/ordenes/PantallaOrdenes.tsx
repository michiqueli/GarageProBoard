import { formatearImporte } from '@garagepro/core'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { EstadoOT } from '../../componentes/EstadoOT.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usePuede } from '../../sesion/permisos.ts'
import { useAtajo } from '../../teclado/index.ts'
import { ORDENES, type OrdenListada } from './datos-de-ejemplo.ts'

const COLUMNAS = ['OT', 'Patente', 'Vehículo', 'Cliente', 'Ingreso', 'Mecánico', 'Estado'] as const

export function PantallaOrdenes() {
  const [seleccionada, setSeleccionada] = useState(ORDENES[0]?.numero ?? '')
  const esEscritorio = useMedia(ES_ESCRITORIO)

  // Todavía sin contrato: cuando exista la ruta de OT, estos permisos van a salir de
  // ahí, como los de vehículos. La acción y el sujeto son los mismos que va a declarar.
  const puedeCerrar = usePuede('editar', 'Orden')
  const puedeCrear = usePuede('crear', 'Orden')

  // Sin permiso para cerrar, F4 no se registra: la barra de estado la muestra atenuada
  // en vez de anunciar un verbo que no va a hacer nada.
  useAtajo(
    'ordenes.cerrar',
    () => {
      // Abre la confirmación, nunca ejecuta: F4 está pegada a F3 y alguien le va a errar.
      window.alert(`Cerrar la orden ${seleccionada}\n\n(la confirmación va acá)`)
    },
    puedeCerrar,
  )

  return (
    <Shell
      titulo="Órdenes de trabajo"
      requiere={{ accion: 'ver', sujeto: 'Orden' }}
      acciones={
        puedeCerrar ? (
          <Boton accion="ordenes.cerrar" variante="principal" onClick={() => {}}>
            Cerrar la orden
          </Boton>
        ) : undefined
      }
    >
      <section className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2.5">
        <Kpi titulo="En proceso" valor="12" pie="3 sobre tiempo estimado" />
        <Kpi titulo="Esperando autorización" valor="3" pie="la más vieja, 2 días" alerta />
        <Kpi titulo="Esperando repuesto" valor="5" pie="2 con pedido a fábrica" alerta />
        <Kpi titulo="Terminadas hoy" valor="8" pie="facturado $ 4.182.940,00" />
      </section>

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Piso de taller</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {ORDENES.length} abiertas
          </span>
          {/* Se dice en la pantalla y no sólo en el código: una demo con datos
              inventados sin avisar es una demo que engaña. */}
          <span className="rounded-full border border-atencion px-2 py-px text-[10.5px] font-semibold text-atencion">
            datos de ejemplo
          </span>
          {puedeCrear && (
            <span className="ml-auto">
              <Boton accion="global.nuevo" onClick={() => {}}>
                Nueva orden
              </Boton>
            </span>
          )}
        </header>

        {/*
          El patrón de listado, que heredan todas las pantallas: tabla densa en
          escritorio y tarjetas en teléfono. Una tabla con scroll horizontal en un
          celular es una tabla rota, no una versión móvil.

          Se elige cuál renderizar en vez de ocultar una con CSS: armar las dos y
          esconder una duplica el DOM, y sobre quinientas filas virtualizadas eso se
          paga en la máquina del mostrador.
        */}
        {esEscritorio ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-dato">
              <thead>
                <tr>
                  {COLUMNAS.map((c) => (
                    <th
                      key={c}
                      className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                  <th className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-right text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDENES.map((o) => (
                  <tr
                    key={o.numero}
                    onClick={() => setSeleccionada(o.numero)}
                    className={[
                      'cursor-pointer',
                      o.numero === seleccionada
                        ? 'bg-marca-suave shadow-[inset_2px_0_0_var(--color-marca)]'
                        : 'hover:bg-superficie-2',
                    ].join(' ')}
                  >
                    <Celda mono>{o.numero}</Celda>
                    <Celda mono>{o.dominio}</Celda>
                    <Celda>{o.vehiculo}</Celda>
                    <Celda>{o.cliente}</Celda>
                    <Celda mono suave>
                      {o.ingreso}
                    </Celda>
                    <Celda suave>{o.mecanico}</Celda>
                    <Celda>
                      <EstadoOT estado={o.estado} />
                    </Celda>
                    <td className="h-fila border-b border-borde-suave px-3 text-right font-mono whitespace-nowrap">
                      {o.total ? (
                        formatearImporte(o.total)
                      ) : (
                        <span className="text-texto-tenue">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-borde-suave">
            {ORDENES.map((o) => (
              <Tarjeta key={o.numero} orden={o} />
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

function Celda({
  children,
  mono = false,
  suave = false,
}: {
  children: React.ReactNode
  mono?: boolean
  suave?: boolean
}) {
  return (
    <td
      className={[
        'h-fila border-b border-borde-suave px-3 whitespace-nowrap',
        mono ? 'font-mono text-etiqueta' : '',
        suave ? 'text-texto-suave' : '',
      ].join(' ')}
    >
      {children}
    </td>
  )
}

/** La misma fila, en teléfono: sólo lo que se necesita para reconocerla y decidir. */
function Tarjeta({ orden }: { orden: OrdenListada }) {
  return (
    <li className="grid gap-1 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-dato font-semibold">{orden.dominio}</span>
        <span className="truncate text-dato text-texto-suave">{orden.vehiculo}</span>
        <span className="ml-auto font-mono text-dato">
          {orden.total ? formatearImporte(orden.total) : '—'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <EstadoOT estado={orden.estado} />
        <span className="truncate text-etiqueta text-texto-suave">{orden.cliente}</span>
        <span className="ml-auto font-mono text-etiqueta text-texto-tenue">{orden.ingreso}</span>
      </div>
    </li>
  )
}

function Kpi({
  titulo,
  valor,
  pie,
  alerta = false,
}: {
  titulo: string
  valor: string
  pie: string
  alerta?: boolean
}) {
  return (
    <div className="grid gap-0.5 rounded-base border border-borde bg-superficie px-3 py-2.5">
      <span className="text-[11.5px] text-texto-suave">{titulo}</span>
      <b
        className={[
          'font-display text-2xl leading-tight font-semibold',
          alerta ? 'text-atencion' : '',
        ].join(' ')}
      >
        {valor}
      </b>
      <small className="font-mono text-[10.5px] text-texto-tenue">{pie}</small>
    </div>
  )
}
