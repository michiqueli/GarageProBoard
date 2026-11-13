import { accesoDeRuta, contrato, permite } from '@gpb/contracts'
import { MINIMO_MOTIVO_CARTERA, numeroDeHoja } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { notificar, preguntar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Patente } from '../../componentes/Patente.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAutorizacion, usePuedeUsar } from '../../sesion/permisos.ts'
import { useVolver } from '../../teclado/index.ts'
import { CostosDeUnidad } from './CostosDeUnidad.tsx'
import {
  CONDICION,
  EstadoUnidad,
  fechaCorta,
  importeUnidad,
  nombreUnidad,
  ORIGEN,
  TENENCIA,
} from './stock.tsx'

type Ficha = Awaited<ReturnType<typeof api.cartera.ficha>>
type Abierto = null | 'traslado' | 'reserva'

const validarMotivo = (v: string) =>
  v.trim().length < MINIMO_MOTIVO_CARTERA ? 'Decí por qué: queda escrito' : null

const ESTADO_RESERVA = {
  activa: 'Vigente',
  vencida: 'Venció',
  liberada: 'Liberada',
  desplazada: 'Desplazada',
  convertida: 'Se vendió',
} as const

export function PantallaFichaUnidad() {
  const { id } = getRouteApi('/con-sesion/stock/$id').useParams()
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeEditar = usePuedeUsar(contrato.cartera.editar)
  const puedeRetirar = usePuedeUsar(contrato.cartera.retirar)
  const [abierto, setAbierto] = useState<Abierto>(null)
  useVolver(() => void navegar({ to: '/stock' }), abierto === null)

  const clave = ['stock', tenantId, 'ficha', id]
  const consulta = useQuery({ queryKey: clave, queryFn: () => api.cartera.ficha({ id }) })
  const config = useQuery({
    queryKey: ['stock', tenantId, 'config'],
    queryFn: () => api.cartera.config(),
  })
  const u = consulta.data

  const guardada = async (f: Ficha) => {
    cache.setQueryData(clave, f)
    setAbierto(null)
    await cache.invalidateQueries({ queryKey: ['stock', tenantId], exact: false })
  }

  const liberar = useMutation({
    mutationFn: (v: { reservaId: string; motivo: string }) => api.cartera.liberar({ id, ...v }),
    onSuccess: guardada,
    meta: { exito: 'Reserva liberada', error: mensajeGeneral },
  })
  const retirar = useMutation({
    mutationFn: (motivo: string) => api.cartera.retirar({ id, motivo }),
    onSuccess: guardada,
    meta: { exito: 'La unidad salió del stock', error: mensajeGeneral },
  })
  const cambiarPrecio = useMutation({
    mutationFn: (precio: string | null) =>
      api.cartera.editar({
        id,
        precio,
        moneda: u?.moneda ?? 'ARS',
        observaciones: u?.observaciones ?? null,
      }),
    onSuccess: guardada,
    meta: { exito: 'Precio guardado', error: mensajeGeneral },
  })

  async function pedirLiberar(reservaId: string, cliente: string) {
    const motivo = await preguntar({
      titulo: `¿Liberar la reserva de ${cliente}?`,
      texto: 'La unidad vuelve a estar disponible si no tiene otra reserva.',
      confirmar: 'Liberar',
      peligro: true,
      campo: { etiqueta: 'Por qué', valor: '', validar: validarMotivo },
    })
    if (motivo) liberar.mutate({ reservaId, motivo: motivo.trim() })
  }

  async function pedirRetirar() {
    const motivo = await preguntar({
      titulo: '¿Sacar la unidad del stock?',
      texto: 'No se borra: queda con su historia. Una consignación devuelta, o un error de carga.',
      confirmar: 'Sacar del stock',
      peligro: true,
      campo: { etiqueta: 'Por qué', valor: '', validar: validarMotivo },
    })
    if (motivo) retirar.mutate(motivo.trim())
  }

  async function pedirPrecio() {
    const texto = await preguntar({
      titulo: 'Precio de la unidad',
      texto: `En ${u?.moneda === 'USD' ? 'dólares' : 'pesos'}. Vacío, queda sin precio.`,
      confirmar: 'Guardar',
      campo: {
        etiqueta: 'Precio',
        valor: u?.precio ?? '',
        validar: (v) =>
          v.trim() && numeroDeHoja(v) === null ? 'Tiene que ser un número: 15000000' : null,
      },
    })
    if (texto !== null && texto !== undefined) {
      cambiarPrecio.mutate(texto.trim() ? numeroDeHoja(texto) : null)
    }
  }

  const enStock = u?.estado === 'disponible' || u?.estado === 'reservada'

  return (
    <Shell
      titulo={u ? nombreUnidad(u) : 'Unidad'}
      requiere={accesoDeRuta(contrato.cartera.ficha)}
      acciones={
        u && enStock && puedeEditar ? (
          <>
            <Boton onClick={() => void pedirPrecio()}>Cambiar precio</Boton>
            <Boton onClick={() => setAbierto('traslado')}>Trasladar</Boton>
            <Boton variante="principal" onClick={() => setAbierto('reserva')}>
              Reservar
            </Boton>
          </>
        ) : undefined
      }
    >
      <Link to="/stock" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todo el stock
      </Link>
      {consulta.isPending && <div className="h-48 animate-pulse rounded-base bg-superficie" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}

      {u && (
        <div className="grid gap-3 md:grid-cols-2">
          <Bloque titulo="Datos">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 px-3 py-2.5 text-dato">
              <Dato nombre="Estado">
                <EstadoUnidad estado={u.estado} />
              </Dato>
              <Dato nombre="Patente">
                <Patente dominio={u.vehiculo.dominio} />
              </Dato>
              <Dato nombre="Chasis">
                <span className="font-mono">{u.vehiculo.chasis}</span>
              </Dato>
              <Dato nombre="Tipo">
                {CONDICION[u.condicion]} · {TENENCIA[u.tenencia]} · {ORIGEN[u.origen]}
              </Dato>
              <Dato nombre={u.consignante ? 'Consignante' : 'Razón social'}>
                {u.consignante?.nombre ?? u.empresa?.nombre ?? '—'}
              </Dato>
              <Dato nombre="Sucursal">{u.sucursal.nombre}</Dato>
              <Dato nombre="Precio">
                <span className="tabular font-mono">{importeUnidad(u.precio, u.moneda)}</span>
              </Dato>
              <Dato nombre="En stock">
                {u.diasEnStock} {u.diasEnStock === 1 ? 'día' : 'días'}, desde el{' '}
                {fechaCorta(u.fechaIngreso)}
              </Dato>
              {u.observaciones && <Dato nombre="Observaciones">{u.observaciones}</Dato>}
              {u.retiroMotivo && <Dato nombre="Salió por">{u.retiroMotivo}</Dato>}
            </dl>
            {enStock && puedeRetirar && (
              <footer className="border-t border-borde-suave px-3 py-2">
                <Boton
                  tamano="chico"
                  variante="peligro"
                  deshabilitado={retirar.isPending}
                  onClick={() => void pedirRetirar()}
                >
                  Sacar del stock
                </Boton>
              </footer>
            )}
          </Bloque>

          <Bloque titulo="Reservas">
            {abierto === 'reserva' && config.data && (
              <FormReserva
                ficha={u}
                exigeSena={config.data.reservaExigeSena}
                alTerminar={setAbierto}
                guardada={guardada}
              />
            )}
            {u.historialReservas.length === 0 && abierto !== 'reserva' && (
              <p className="px-3 py-4 text-dato text-texto-suave">Nadie la reservó todavía.</p>
            )}
            <ul className="divide-y divide-borde-suave">
              {u.historialReservas.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-dato"
                >
                  <span
                    className={`font-medium ${r.estado === 'activa' ? '' : 'text-texto-suave'}`}
                  >
                    {r.cliente.nombre}
                  </span>
                  <span className="text-etiqueta text-texto-suave">
                    {ESTADO_RESERVA[r.estado]}
                    {r.estado === 'activa' && r.vence ? `, vence el ${fechaCorta(r.vence)}` : ''}
                    {r.sena ? ` · seña ${importeUnidad(r.sena, r.moneda)}` : ''}
                    {r.cierreMotivo ? ` · ${r.cierreMotivo}` : ''}
                  </span>
                  {r.estado === 'activa' && puedeEditar && (
                    <span className="ml-auto">
                      <Boton
                        tamano="chico"
                        deshabilitado={liberar.isPending}
                        onClick={() => void pedirLiberar(r.id, r.cliente.nombre)}
                      >
                        Liberar
                      </Boton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>

          {abierto === 'traslado' && config.data && (
            <div className="md:col-span-2">
              <FormTraslado
                ficha={u}
                conComprobante={config.data.trasladoEntreEmpresas === 'con_comprobante'}
                alTerminar={setAbierto}
                guardada={guardada}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <CostosDeUnidad id={u.id} />
          </div>

          <div className="md:col-span-2">
            <Bloque titulo="Historia">
              <ol className="divide-y divide-borde-suave">
                {u.movimientos.map((m) => (
                  <li
                    key={m.id}
                    className="grid gap-0.5 px-3 py-2 md:grid-cols-[9rem_1fr_auto] md:gap-3"
                  >
                    <span className="font-mono text-etiqueta text-texto-tenue">
                      {new Date(m.creadoEn).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                    <span className="text-dato">
                      {m.detalle}
                      {m.comprobante ? ` · Comprobante ${m.comprobante}` : ''}
                    </span>
                    <span className="text-etiqueta text-texto-suave">{m.autor ?? '—'}</span>
                  </li>
                ))}
              </ol>
            </Bloque>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      </header>
      {children}
    </section>
  )
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-etiqueta text-texto-tenue">{nombre}</dt>
      <dd>{children}</dd>
    </>
  )
}

function FormTraslado({
  ficha: u,
  conComprobante,
  alTerminar,
  guardada,
}: {
  ficha: Ficha
  conComprobante: boolean
  alTerminar: (a: Abierto) => void
  guardada: (f: Ficha) => Promise<void>
}) {
  const sucursales = usarSesion((e) => e.datos?.sucursales ?? [])
  const destinos = sucursales.filter((s) => s.id !== u.sucursal.id)
  const [sucursalId, setSucursalId] = useState<string | null>(destinos[0]?.id ?? null)
  const [comprobante, setComprobante] = useState('')
  const [nota, setNota] = useState('')
  const destino = destinos.find((s) => s.id === sucursalId)
  const pide =
    conComprobante &&
    u.tenencia === 'propia' &&
    Boolean(destino) &&
    destino?.empresaId !== u.empresa?.id

  const trasladar = useMutation({
    mutationFn: () =>
      api.cartera.trasladar({
        id: u.id,
        sucursalId: sucursalId as string,
        comprobante: comprobante.trim() || null,
        nota: nota.trim() || null,
      }),
    onSuccess: guardada,
    meta: { exito: 'Unidad trasladada', error: mensajeGeneral },
  })

  if (!destinos.length) {
    return (
      <Bloque titulo="Traslado">
        <p className="px-3 py-3 text-dato text-texto-suave">
          No tenés otra sucursal a la que trasladarla.
        </p>
        <footer className="px-3 pb-2">
          <Boton tamano="chico" onClick={() => alTerminar(null)}>
            Cerrar
          </Boton>
        </footer>
      </Bloque>
    )
  }

  return (
    <Bloque titulo="Traslado">
      <div className="grid gap-3 p-3 md:grid-cols-3">
        <Selector
          etiqueta="A qué sucursal"
          valor={sucursalId}
          opciones={destinos.map((s) => ({ valor: s.id, texto: s.nombre }))}
          onChange={setSucursalId}
        />
        {pide && (
          <Campo
            etiqueta="Comprobante"
            ayuda="Cambia de razón social: la nueva dueña va a ser la de esa sucursal"
            value={comprobante}
            maxLength={60}
            onChange={(e) => setComprobante(e.target.value)}
          />
        )}
        <Campo
          etiqueta="Nota"
          value={nota}
          maxLength={500}
          onChange={(e) => setNota(e.target.value)}
        />
        <span className="flex gap-2 md:col-span-3">
          <Boton
            variante="principal"
            deshabilitado={!sucursalId || (pide && !comprobante.trim()) || trasladar.isPending}
            onClick={() => trasladar.mutate()}
          >
            Trasladar
          </Boton>
          <Boton onClick={() => alTerminar(null)}>Cancelar</Boton>
        </span>
      </div>
    </Bloque>
  )
}

function FormReserva({
  ficha: u,
  exigeSena,
  alTerminar,
  guardada,
}: {
  ficha: Ficha
  exigeSena: boolean
  alTerminar: (a: Abierto) => void
  guardada: (f: Ficha) => Promise<void>
}) {
  const puedeAutorizar = permite(useAutorizacion(), {
    modulo: 'cartera',
    accion: 'autorizar',
    sujeto: 'Unidad',
  })
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [sena, setSena] = useState('')
  const [nota, setNota] = useState('')
  const senaMala = sena.trim() !== '' && numeroDeHoja(sena) === null
  const falta = !cliente || senaMala || (exigeSena && !(Number(numeroDeHoja(sena) ?? 0) > 0))

  const reservar = useMutation({
    mutationFn: (pasarPorEncima: string | null) =>
      api.cartera.reservar({
        id: u.id,
        clienteId: cliente?.id as string,
        sena: sena.trim() ? numeroDeHoja(sena) : null,
        nota: nota.trim() || null,
        pasarPorEncima,
      }),
    onSuccess: guardada,
    onError: async (error) => {
      if (error instanceof ORPCError && error.code === 'YA_RESERVADA') {
        const { cliente: de } = error.data as { cliente: string }
        if (!puedeAutorizar) {
          notificar.error(`Ya está reservada para ${de}. Pedile a quien autoriza que la libere.`)
          return
        }
        const motivo = await preguntar({
          titulo: `Ya está reservada para ${de}`,
          texto: 'Si la pasás por encima, esa reserva queda desplazada y a la vista.',
          confirmar: 'Pasar por encima',
          peligro: true,
          campo: { etiqueta: 'Por qué', valor: '', validar: validarMotivo },
        })
        if (motivo) reservar.mutate(motivo.trim())
        return
      }
      notificar.error(mensajeGeneral(error))
    },
    meta: { exito: 'Unidad reservada', error: false },
  })

  return (
    <div className="grid gap-3 border-b border-borde p-3">
      <SelectorCliente etiqueta="Para quién" valor={cliente} onChange={setCliente} autoFocus />
      <Campo
        etiqueta={exigeSena ? 'Seña' : 'Seña (opcional)'}
        inputMode="decimal"
        value={sena}
        onChange={(e) => setSena(e.target.value)}
      />
      <Campo
        etiqueta="Nota"
        value={nota}
        maxLength={500}
        onChange={(e) => setNota(e.target.value)}
      />
      <span className="flex gap-2">
        <Boton
          variante="principal"
          deshabilitado={falta || reservar.isPending}
          onClick={() => reservar.mutate(null)}
        >
          Reservar
        </Boton>
        <Boton onClick={() => alTerminar(null)}>Cancelar</Boton>
      </span>
    </div>
  )
}
