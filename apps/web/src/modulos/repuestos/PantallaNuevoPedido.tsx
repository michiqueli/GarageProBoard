import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { chasisValido, normalizarChasis, seis } from './repuestos.ts'

const ruta = getRouteApi('/con-sesion/repuestos/pedidos/nuevo')

type Destino = 'orden' | 'cliente' | 'mostrador'

const DESTINOS: Array<{ valor: Destino; texto: string; ayuda: string }> = [
  {
    valor: 'orden',
    texto: 'Una orden de trabajo',
    ayuda: 'Se entrega al taller y se cobra con la orden',
  },
  { valor: 'cliente', texto: 'Un cliente', ayuda: 'Venta de mostrador, se factura en caja' },
  { valor: 'mostrador', texto: 'Nadie en particular', ayuda: 'Mostrador, consumidor final' },
]

/**
 * Abrir un pedido de repuestos. Lo único obligatorio es el chasis, que es con lo que se busca
 * en la base de la marca; si va a una orden, sale del auto de la orden. Los repuestos se
 * cargan en la ficha, que es donde se busca y se arma.
 */
export function PantallaNuevoPedido() {
  const { ordenId: ordenInicial } = ruta.useSearch()
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursalId = usarSesion((e) => e.datos?.sucursalActiva.id)
  const puedeVerOrdenes = usePuedeUsar(contrato.ordenes.listar)

  const [destino, setDestino] = useState<Destino>(ordenInicial ? 'orden' : 'mostrador')
  const [ordenId, setOrdenId] = useState<string | null>(ordenInicial ?? null)
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [chasis, setChasis] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [nota, setNota] = useState('')
  const [tocado, setTocado] = useState(false)

  const ordenes = useQuery({
    queryKey: ['ordenes', tenantId, sucursalId, 'para-pedido'],
    queryFn: () => api.ordenes.listar({ pagina: 1, porPagina: 100, estado: 'en_taller' }),
    enabled: puedeVerOrdenes && destino === 'orden',
  })
  const enTaller = (ordenes.data?.datos ?? []).filter((o) =>
    ['recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion'].includes(o.estado),
  )
  const orden = enTaller.find((o) => o.id === ordenId)

  const abrir = useMutation({
    mutationFn: () =>
      api.pedidosRepuestos.abrir({
        ...(destino === 'orden' ? { ordenId } : { chasis: normalizarChasis(chasis) }),
        clienteId: destino === 'cliente' ? (cliente?.id ?? null) : null,
        solicitante,
        nota,
        items: [],
      }),
    onSuccess: async (p) => {
      await cache.invalidateQueries({ queryKey: ['pedidos-repuestos', tenantId] })
      void navegar({ to: '/repuestos/pedidos/$id', params: { id: p.id } })
    },
    meta: {
      exito: (p) => `Pedido ${seis((p as { numero: number }).numero)} abierto`,
      error: (error) =>
        error instanceof ORPCError && error.code === 'ORDEN_CERRADA'
          ? 'Esa orden ya no está en el taller.'
          : mensajeGeneral(error),
    },
  })

  const falta =
    destino === 'orden'
      ? !ordenId
        ? 'Elegí la orden.'
        : null
      : !chasisValido(chasis)
        ? 'Falta el chasis: de 6 a 17 letras y números, sin I, O ni Q.'
        : destino === 'cliente' && !cliente
          ? 'Elegí el cliente.'
          : null

  function enviar(e?: FormEvent) {
    e?.preventDefault()
    setTocado(true)
    if (!falta) abrir.mutate()
  }

  return (
    <Shell
      titulo="Nuevo pedido de repuestos"
      requiere={accesoDeRuta(contrato.pedidosRepuestos.abrir)}
    >
      <Link to="/repuestos/pedidos" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todos los pedidos
      </Link>
      <form
        onSubmit={enviar}
        className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
      >
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-etiqueta font-medium text-texto-suave">
            ¿Para quién es?
          </legend>
          <div className="grid gap-2 md:grid-cols-3">
            {DESTINOS.map((d) => (
              <label
                key={d.valor}
                className={`grid cursor-pointer gap-0.5 rounded-base border px-3 py-2 ${destino === d.valor ? 'border-marca bg-marca-suave' : 'border-borde'}`}
              >
                <span className="flex items-center gap-2 text-dato font-semibold">
                  <input
                    type="radio"
                    name="destino"
                    className="accent-marca"
                    checked={destino === d.valor}
                    onChange={() => setDestino(d.valor)}
                  />
                  {d.texto}
                </span>
                <span className="text-etiqueta text-texto-suave">{d.ayuda}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {destino === 'orden' ? (
          <div className="grid gap-2">
            <span className="text-etiqueta font-medium text-texto-suave">Orden</span>
            {ordenes.isPending && (
              <div className="h-16 animate-pulse rounded-base bg-superficie-2" />
            )}
            {ordenes.data && enTaller.length === 0 && (
              <p className="text-dato text-texto-suave">No hay órdenes en el taller.</p>
            )}
            <ul aria-label="Órdenes en el taller" className="grid gap-1 md:grid-cols-2">
              {enTaller.map((o) => (
                <li key={o.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-base border px-2.5 py-1.5 text-dato ${ordenId === o.id ? 'border-marca bg-marca-suave' : 'border-borde'}`}
                  >
                    <input
                      type="radio"
                      name="orden"
                      className="accent-marca"
                      checked={ordenId === o.id}
                      onChange={() => setOrdenId(o.id)}
                    />
                    <span className="font-mono">OT {seis(o.numero)}</span>
                    <Patente dominio={o.vehiculo.dominio} />
                    <span className="truncate text-texto-suave">
                      {[o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(' ')}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {orden && (
              <p className="text-etiqueta text-texto-suave">
                Chasis <span className="font-mono">{orden.vehiculo.chasis}</span>, del auto de la
                orden.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <Campo
              etiqueta="Chasis"
              required
              autoFocus
              value={chasis}
              onChange={(e) => setChasis(e.target.value)}
              className="font-mono"
              ayuda="Pegalo como venga: los espacios no cuentan"
              aria-invalid={tocado && !chasisValido(chasis)}
            />
            {destino === 'cliente' && (
              <SelectorCliente etiqueta="Cliente" valor={cliente} onChange={setCliente} />
            )}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Campo
            etiqueta="Quién lo pide"
            value={solicitante}
            onChange={(e) => setSolicitante(e.target.value)}
            ayuda="Diego, box 3 · cliente por teléfono"
          />
          <div className="md:col-span-2">
            <Campo etiqueta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={abrir.isPending}
            onClick={() => enviar()}
          >
            Abrir el pedido
          </Boton>
          {tocado && falta && <span className="text-etiqueta text-critico">{falta}</span>}
        </div>
      </form>
    </Shell>
  )
}
