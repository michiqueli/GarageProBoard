import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAtajo, useVolver } from '../../teclado/index.ts'
import { importeUnidad, nombreUnidad } from '../stock/stock.tsx'

/** Empezar una venta: qué unidad y a quién. El resto se completa en el borrador. */
export function PantallaNuevaVenta() {
  const { unidad: desdeStock } = getRouteApi('/con-sesion/ventas/nueva').useSearch()
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  useVolver(() => void navegar({ to: '/ventas' }))

  const stock = useQuery({
    queryKey: ['stock', tenantId, 'para-vender'],
    queryFn: () => api.cartera.listar({ pagina: 1, porPagina: 200, estado: 'en_stock' }),
  })
  const [unidadId, setUnidadId] = useState<string | null>(desdeStock ?? null)
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)

  const crear = useMutation({
    mutationFn: () =>
      api.ventas.crear({ unidadId: unidadId as string, clienteId: cliente?.id as string }),
    onSuccess: async (v) => {
      await cache.invalidateQueries({ queryKey: ['ventas', tenantId] })
      void navegar({ to: '/ventas/$id', params: { id: v.id } })
    },
    meta: { exito: 'Venta empezada: completala y confirmala', error: mensajeGeneral },
  })
  const listo = Boolean(unidadId && cliente) && !crear.isPending
  useAtajo('global.guardar', () => listo && crear.mutate())

  return (
    <Shell titulo="Nueva venta" requiere={accesoDeRuta(contrato.ventas.crear)}>
      <Link to="/ventas" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todas las ventas
      </Link>
      <section
        aria-label="Qué y a quién"
        className="grid max-w-2xl gap-3 rounded-base border border-borde bg-superficie p-3"
      >
        <Selector
          etiqueta="Unidad"
          valor={unidadId}
          vacio="Elegí una del stock"
          onChange={setUnidadId}
          opciones={(stock.data?.datos ?? []).map((u) => ({
            valor: u.id,
            texto: `${nombreUnidad(u)} · ${u.vehiculo.dominio ?? u.vehiculo.chasis} · ${importeUnidad(u.precio, u.moneda)}${u.estado === 'reservada' ? ` · reservada para ${u.reservas.map((r) => r.cliente.nombre).join(', ')}` : ''}`,
          }))}
        />
        <SelectorCliente etiqueta="Comprador" valor={cliente} onChange={setCliente} autoFocus />
        <div>
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={!listo}
            onClick={() => crear.mutate()}
          >
            Empezar la venta
          </Boton>
        </div>
      </section>
    </Shell>
  )
}
