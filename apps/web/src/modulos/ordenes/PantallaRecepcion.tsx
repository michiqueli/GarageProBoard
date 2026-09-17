import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { notificar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoImprimir } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { SelectorVehiculo, type VehiculoElegido } from '../../componentes/SelectorVehiculo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { COMBUSTIBLES, type Combustible, imprimirOrden, nombreOrden } from './ordenes.ts'

/**
 * La recepción de un vehículo: la pantalla que compite con la velocidad del operador de
 * Oversoft. **Todo con teclado**: la patente, `Enter` elige el auto, `Tab` recorre, `F2`
 * abre la orden. Quien paga arranca en el titular; sólo se toca si es otro.
 */
export function PantallaRecepcion() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const navegar = useNavigate()
  const cache = useQueryClient()

  const [vehiculo, setVehiculo] = useState<VehiculoElegido | null>(null)
  const [paga, setPaga] = useState<ClienteElegido | null>(null)
  const [traeNombre, setTraeNombre] = useState('')
  const [traeTelefono, setTraeTelefono] = useState('')
  const [autorizaNombre, setAutorizaNombre] = useState('')
  const [autorizaTelefono, setAutorizaTelefono] = useState('')
  const [kilometraje, setKilometraje] = useState('')
  const [combustible, setCombustible] = useState<Combustible | null>(null)
  const [pedido, setPedido] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [prometidaPara, setPrometidaPara] = useState('')
  const [mecanicoId, setMecanicoId] = useState<string | null>(null)
  const [tocado, setTocado] = useState(false)

  const personal = useQuery({
    queryKey: ['ordenes', tenantId, 'personal'],
    queryFn: () => api.ordenes.personal(),
    staleTime: 5 * 60_000,
  })

  function elegirVehiculo(v: VehiculoElegido | null) {
    setVehiculo(v)
    // Quien paga arranca en el titular: es el caso de todos los días.
    setPaga(v?.titular ?? null)
  }

  const abrir = useMutation({
    mutationFn: () =>
      api.ordenes.abrir({
        vehiculoId: vehiculo?.id as string,
        pagaId: paga?.id ?? null,
        traeNombre,
        traeTelefono,
        autorizaNombre,
        autorizaTelefono,
        kilometraje: kilometraje ? Number(kilometraje) : null,
        combustible,
        pedido,
        observaciones,
        prometidaPara: prometidaPara || null,
        mecanicoId,
        items: [],
      }),
    onSuccess: async (o) => {
      await cache.invalidateQueries({ queryKey: ['ordenes', tenantId] })
      notificar.ok(`${nombreOrden(o.numero)} abierta`, {
        accion: { texto: 'Imprimir la orden', alHacer: () => void imprimirOrden(o.id) },
      })
      void navegar({ to: '/ordenes/$id', params: { id: o.id } })
    },
    meta: {
      error: (error) => {
        if (error instanceof ORPCError && error.code === 'VEHICULO_CON_ORDEN') {
          const d = error.data as { ordenId: string; numero: number }
          return {
            texto: `Ese vehículo ya está en el taller con la ${nombreOrden(d.numero)}.`,
            accion: {
              texto: 'Abrir esa orden',
              alHacer: () => void navegar({ to: '/ordenes/$id', params: { id: d.ordenId } }),
            },
          }
        }
        return mensajeGeneral(error)
      },
    },
  })

  const faltaVehiculo = tocado && !vehiculo
  const faltaPedido = tocado && pedido.trim().length < 3

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    setTocado(true)
    if (!vehiculo || pedido.trim().length < 3 || abrir.isPending) return
    abrir.mutate()
  }

  return (
    <Shell titulo="Recibir un vehículo" requiere={accesoDeRuta(contrato.ordenes.abrir)}>
      <form
        onSubmit={enviar}
        aria-label="Recepción"
        className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <SelectorVehiculo
              etiqueta="Vehículo"
              valor={vehiculo}
              onChange={elegirVehiculo}
              autoFocus
            />
            {faltaVehiculo && (
              <span className="text-etiqueta text-critico">Elegí el vehículo que entra.</span>
            )}
            {vehiculo && (
              <span className="text-etiqueta text-texto-suave">
                Titular: {vehiculo.titular?.razonSocial ?? 'sin titular cargado'}
              </span>
            )}
          </div>
          <SelectorCliente etiqueta="Paga" valor={paga} onChange={setPaga} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Campo
            etiqueta="Lo trae"
            value={traeNombre}
            onChange={(e) => setTraeNombre(e.target.value)}
            ayuda="Si no es el titular"
          />
          <Campo
            etiqueta="Teléfono de quien lo trae"
            inputMode="tel"
            value={traeTelefono}
            onChange={(e) => setTraeTelefono(e.target.value)}
          />
          <Campo
            etiqueta="Quién autoriza"
            value={autorizaNombre}
            onChange={(e) => setAutorizaNombre(e.target.value)}
            ayuda="A quién se le consultan los presupuestos"
          />
          <Campo
            etiqueta="Teléfono de quien autoriza"
            inputMode="tel"
            value={autorizaTelefono}
            onChange={(e) => setAutorizaTelefono(e.target.value)}
          />
          <Campo
            etiqueta="Kilómetros"
            inputMode="numeric"
            value={kilometraje}
            onChange={(e) => setKilometraje(e.target.value.replace(/\D/g, ''))}
          />
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-etiqueta font-medium text-texto-suave">Combustible</legend>
            <div role="radiogroup" aria-label="Combustible" className="flex gap-1">
              {COMBUSTIBLES.map((c) => (
                <label
                  key={c.valor}
                  className={`inline-flex h-campo flex-1 cursor-pointer items-center justify-center rounded-base border text-etiqueta focus-within:outline-2 focus-within:outline-marca ${
                    combustible === c.valor
                      ? 'border-marca bg-marca-suave font-semibold text-marca'
                      : 'border-borde text-texto-suave'
                  }`}
                >
                  <input
                    type="radio"
                    name="combustible"
                    className="sr-only"
                    checked={combustible === c.valor}
                    onChange={() => setCombustible(c.valor)}
                  />
                  {c.texto}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Texto
            etiqueta="Qué pide el cliente"
            valor={pedido}
            onChange={setPedido}
            ayuda={
              faltaPedido
                ? 'Anotá qué pide el cliente, con sus palabras'
                : 'Con sus palabras: «hace ruido al frenar»'
            }
            invalido={faltaPedido}
          />
          <Texto
            etiqueta="Estado del vehículo al recibirlo"
            valor={observaciones}
            onChange={setObservaciones}
            ayuda="Rayones, golpes, lo que falta: queda firmado en la orden"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Campo
            etiqueta="Prometida para"
            type="date"
            value={prometidaPara}
            onChange={(e) => setPrometidaPara(e.target.value)}
          />
          <Selector
            etiqueta="Mecánico"
            valor={mecanicoId}
            vacio="Sin asignar"
            onChange={setMecanicoId}
            opciones={(personal.data?.datos ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={abrir.isPending}
            onClick={() => enviar()}
          >
            {abrir.isPending ? 'Abriendo…' : 'Abrir la orden'}
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

export function Texto({
  etiqueta,
  valor,
  onChange,
  ayuda,
  invalido = false,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  ayuda?: string
  invalido?: boolean
}) {
  const id = useId()
  // La ayuda va afuera de la etiqueta y enganchada con aria-describedby, como en Campo: adentro
  // se sumaría al nombre del campo.
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-etiqueta font-medium text-texto-suave">
        {etiqueta}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
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
