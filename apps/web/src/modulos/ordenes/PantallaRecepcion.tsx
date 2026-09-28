import { accesoDeRuta, contrato } from '@gpb/contracts'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useId } from 'react'
import { notificar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoImprimir } from '../../componentes/iconos.tsx'
import { SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { SelectorVehiculo } from '../../componentes/SelectorVehiculo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { DiagramaDanios } from './DiagramaDanios.tsx'
import { InventarioRecepcion } from './InventarioRecepcion.tsx'
import { COMBUSTIBLES, imprimirOrden, nombreOrden } from './ordenes.ts'
import { useRecepcion } from './useRecepcion.ts'

/**
 * La recepción de un vehículo: la pantalla que compite con la velocidad del operador de
 * Oversoft. **Todo con teclado**: la patente, `Enter` elige el auto, `Tab` recorre, `F2`
 * abre la orden. Quien paga arranca en el titular; sólo se toca si es otro.
 *
 * Es una de las dos vistas del mismo flujo: la otra es la de tablet, en `/recepcion`. Lo que
 * se carga y cómo se abre la orden vive en `useRecepcion`.
 */
export function PantallaRecepcion() {
  const navegar = useNavigate()
  const r = useRecepcion((o) => {
    notificar.ok(`${nombreOrden(o.numero)} abierta`, {
      accion: { texto: 'Imprimir la orden', alHacer: () => void imprimirOrden(o.id) },
    })
    void navegar({ to: '/ordenes/$id', params: { id: o.id } })
  })
  const { datos: d, poner } = r

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    r.enviar()
  }

  return (
    <Shell
      titulo="Recibir un vehículo"
      requiere={accesoDeRuta(contrato.ordenes.abrir)}
      acciones={
        <Link
          to="/recepcion"
          className="inline-flex h-campo items-center rounded-base border border-borde px-3 text-dato text-texto-suave hover:border-texto-tenue"
        >
          Vista tablet
        </Link>
      }
    >
      <form onSubmit={enviar} aria-label="Recepción" className="grid gap-3">
        <div className="grid gap-4 rounded-base border border-borde bg-superficie p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <SelectorVehiculo
                etiqueta="Vehículo"
                valor={d.vehiculo}
                onChange={r.elegirVehiculo}
                autoFocus
              />
              {r.faltaVehiculo && (
                <span className="text-etiqueta text-critico">Elegí el vehículo que entra.</span>
              )}
              {d.vehiculo && (
                <span className="text-etiqueta text-texto-suave">
                  Titular: {d.vehiculo.titular?.razonSocial ?? 'sin titular cargado'}
                </span>
              )}
            </div>
            <SelectorCliente etiqueta="Paga" valor={d.paga} onChange={(v) => poner('paga', v)} />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Campo
              etiqueta="Lo trae"
              value={d.traeNombre}
              onChange={(e) => poner('traeNombre', e.target.value)}
              ayuda="Si no es el titular"
            />
            <Campo
              etiqueta="Teléfono de quien lo trae"
              inputMode="tel"
              value={d.traeTelefono}
              onChange={(e) => poner('traeTelefono', e.target.value)}
            />
            <Campo
              etiqueta="Quién autoriza"
              value={d.autorizaNombre}
              onChange={(e) => poner('autorizaNombre', e.target.value)}
              ayuda="A quién se le consultan los presupuestos"
            />
            <Campo
              etiqueta="Teléfono de quien autoriza"
              inputMode="tel"
              value={d.autorizaTelefono}
              onChange={(e) => poner('autorizaTelefono', e.target.value)}
            />
            <Campo
              etiqueta="Kilómetros"
              inputMode="numeric"
              value={d.kilometraje}
              onChange={(e) => poner('kilometraje', e.target.value.replace(/\D/g, ''))}
            />
            <ElegirCombustible valor={d.combustible} onChange={(c) => poner('combustible', c)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Texto
              etiqueta="Qué pide el cliente"
              valor={d.pedido}
              onChange={(v) => poner('pedido', v)}
              ayuda={
                r.faltaPedido
                  ? 'Anotá qué pide el cliente, con sus palabras'
                  : 'Con sus palabras: «hace ruido al frenar»'
              }
              invalido={r.faltaPedido}
            />
            <div className="grid content-start gap-3">
              <Campo
                etiqueta="Entrega estimada"
                type="date"
                value={d.entregaEstimada}
                onChange={(e) => poner('entregaEstimada', e.target.value)}
              />
            </div>
          </div>
        </div>

        <Bloque
          titulo="Estado del vehículo al recibirlo"
          ayuda="Queda impreso en la orden que firma el cliente"
        >
          <DiagramaDanios danios={d.danios} onChange={(v) => poner('danios', v)} />
          <div className="grid gap-4 border-t border-borde pt-3 lg:grid-cols-[3fr_2fr]">
            <div className="grid content-start gap-2">
              <h3 className="text-etiqueta font-medium text-texto-suave">Vino con el auto</h3>
              <InventarioRecepcion
                inventario={d.inventario}
                onChange={(v) => poner('inventario', v)}
              />
            </div>
            <Texto
              etiqueta="Otras observaciones"
              valor={d.observaciones}
              onChange={(v) => poner('observaciones', v)}
              ayuda="Lo que no entra en el dibujo: testigos prendidos, olor a quemado, objetos adentro"
            />
          </div>
        </Bloque>

        <div className="flex flex-wrap items-center gap-2">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={r.abriendo}
            onClick={() => enviar()}
          >
            {r.abriendo ? 'Abriendo…' : 'Abrir la orden'}
          </Boton>
          <Boton accion="global.cancelar" onClick={() => void navegar({ to: '/ordenes' })}>
            Cancelar
          </Boton>
          <span className="ml-auto inline-flex items-center gap-1.5 text-etiqueta text-texto-tenue">
            <IconoImprimir /> Al abrirla, la imprimís desde su ficha
          </span>
        </div>
      </form>
    </Shell>
  )
}

function Bloque({
  titulo,
  ayuda,
  children,
}: {
  titulo: string
  ayuda?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
        {ayuda && <span className="text-etiqueta text-texto-tenue">{ayuda}</span>}
      </header>
      {children}
    </section>
  )
}

export function ElegirCombustible({
  valor,
  onChange,
}: {
  valor: (typeof COMBUSTIBLES)[number]['valor'] | null
  onChange: (v: (typeof COMBUSTIBLES)[number]['valor']) => void
}) {
  const nombre = useId()
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-etiqueta font-medium text-texto-suave">Combustible</legend>
      <div role="radiogroup" aria-label="Combustible" className="flex gap-1">
        {COMBUSTIBLES.map((c) => (
          <label
            key={c.valor}
            className={`inline-flex h-campo flex-1 cursor-pointer items-center justify-center rounded-base border text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
              valor === c.valor
                ? 'border-marca bg-marca-suave font-semibold text-marca'
                : 'border-borde text-texto-suave'
            }`}
          >
            <input
              type="radio"
              name={nombre}
              className="sr-only"
              checked={valor === c.valor}
              onChange={() => onChange(c.valor)}
            />
            {c.texto}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Texto({
  etiqueta,
  valor,
  onChange,
  ayuda,
  invalido = false,
  filas = 3,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  ayuda?: string
  invalido?: boolean
  filas?: number
}) {
  const id = useId()
  // La ayuda va afuera de la etiqueta y enganchada con aria-describedby, como en Campo: adentro
  // se sumaría al nombre del campo.
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={filas}
        aria-invalid={invalido}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        className="rounded-base border border-borde bg-superficie-2 px-2.5 py-1.5 text-dato text-texto outline-none focus-visible:border-marca aria-invalid:border-critico"
      />
      {ayuda && (
        <span
          id={`${id}-ayuda`}
          className={`text-etiqueta ${invalido ? 'text-critico' : 'text-texto-tenue'}`}
        >
          {ayuda}
        </span>
      )}
    </div>
  )
}
