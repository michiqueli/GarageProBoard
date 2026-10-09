import { type Carroceria, HOJA_DE, HOJA_POR_OMISION } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { ClienteElegido } from '../../componentes/SelectorCliente.tsx'
import type { VehiculoElegido } from '../../componentes/SelectorVehiculo.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import type { Danio } from './DiagramaDanios.tsx'
import type { Inventario } from './InventarioRecepcion.tsx'
import { type Combustible, nombreOrden } from './ordenes.ts'
import type { Cambio, PuntoRevisado } from './RevisionRecepcion.tsx'

export interface DatosRecepcion {
  vehiculo: VehiculoElegido | null
  paga: ClienteElegido | null
  traeNombre: string
  traeTelefono: string
  autorizaNombre: string
  autorizaTelefono: string
  kilometraje: string
  combustible: Combustible | null
  pedido: string
  observaciones: string
  entregaEstimada: string
  /**
   * Qué es el vehículo, cuando su modelo todavía no lo dice. Si el modelo lo dice, gana el
   * modelo —igual que en el servidor—: corregirlo es cosa del catálogo, no de una recepción.
   */
  carroceria: Carroceria | null
  danios: Danio[]
  inventario: Inventario
  /** Lo contestado de la revisión, por punto. Lo que no está, no se revisó. */
  revision: Record<string, Cambio>
}

const VACIA: DatosRecepcion = {
  vehiculo: null,
  paga: null,
  traeNombre: '',
  traeTelefono: '',
  autorizaNombre: '',
  autorizaTelefono: '',
  kilometraje: '',
  combustible: null,
  pedido: '',
  observaciones: '',
  entregaEstimada: '',
  carroceria: null,
  danios: [],
  inventario: {},
  revision: {},
}

export type OrdenAbierta = Awaited<ReturnType<typeof api.ordenes.abrir>>

/**
 * La recepción de un vehículo, sin la pantalla: qué se carga, qué falta y cómo se abre la
 * orden.
 *
 * Existe para que **la de escritorio y la de tablet sean dos vistas del mismo flujo** (ver
 * `docs/tecnicos/recepcion-en-tablet.md`). Con dos flujos separados, el día que se agregue un
 * dato a la recepción se agrega en uno solo, y el de menos uso queda viejo sin que nadie se
 * entere. Lo único que cambia entre las dos es qué se hace con la orden recién abierta.
 */
export function useRecepcion(alAbrir: (orden: OrdenAbierta) => void) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const navegar = useNavigate()
  const [datos, setDatos] = useState<DatosRecepcion>(VACIA)
  const [tocado, setTocado] = useState(false)

  function poner<K extends keyof DatosRecepcion>(campo: K, valor: DatosRecepcion[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }))
  }

  function elegirVehiculo(v: VehiculoElegido | null) {
    // Quien paga arranca en el titular: es el caso de todos los días. Y las marcas se van con
    // el auto: son puntos de su dibujo, no de la pantalla.
    setDatos((d) => ({ ...d, vehiculo: v, paga: v?.titular ?? null, carroceria: null, danios: [] }))
  }

  /** Lo que el modelo ya sabe manda; lo elegido sólo llena el hueco. */
  const carroceria = datos.vehiculo?.carroceria ?? datos.carroceria
  const hojaTipo = carroceria ? HOJA_DE[carroceria] : HOJA_POR_OMISION

  /**
   * Los dibujos que tiene cargados el taller. Se piden una vez y quedan en la caché: son
   * cuatro filas y no cambian mientras alguien recibe un auto.
   */
  const hojas = useQuery({ queryKey: ['hojas', tenantId], queryFn: () => api.hojas.listar() })
  const hojaImagenId = hojas.data?.datos.find((h) => h.tipo === hojaTipo)?.propia?.id ?? null
  /** Los puntos que revisa el taller. Como los dibujos: se piden una vez y quedan en la caché. */
  const catalogo = useQuery({
    queryKey: ['revision', tenantId],
    queryFn: () => api.revision.listar(),
  })
  const puntosRevision: PuntoRevisado[] = (catalogo.data?.datos ?? [])
    .filter((p) => p.activo)
    .map((p) => ({
      puntoId: p.id,
      seccion: p.seccion,
      nombre: p.nombre,
      estado: datos.revision[p.id]?.estado ?? null,
      nota: datos.revision[p.id]?.nota ?? null,
    }))

  function contestar(puntoId: string, cambio: Cambio) {
    setDatos((d) => ({ ...d, revision: { ...d.revision, [puntoId]: cambio } }))
  }

  /** Se pregunta cuando nadie lo sabe: con un modelo sin carrocería, o sin modelo cargado. */
  const faltaCarroceria = !datos.vehiculo?.carroceria

  /** Cambiar de dibujo borra las marcas: están puestas sobre el anterior. */
  function elegirCarroceria(c: Carroceria) {
    setDatos((d) => ({
      ...d,
      carroceria: c,
      danios: HOJA_DE[c] === hojaTipo ? d.danios : [],
    }))
  }

  const abrir = useMutation({
    mutationFn: () =>
      api.ordenes.abrir({
        vehiculoId: datos.vehiculo?.id as string,
        pagaId: datos.paga?.id ?? null,
        traeNombre: datos.traeNombre,
        traeTelefono: datos.traeTelefono,
        autorizaNombre: datos.autorizaNombre,
        autorizaTelefono: datos.autorizaTelefono,
        kilometraje: datos.kilometraje ? Number(datos.kilometraje) : null,
        combustible: datos.combustible,
        pedido: datos.pedido,
        observaciones: datos.observaciones,
        entregaEstimada: datos.entregaEstimada || null,
        carroceria: datos.carroceria,
        danios: datos.danios.map(({ tipo, x, y, nota }) => ({ tipo, x, y, nota })),
        inventario: datos.inventario,
        // Sólo lo contestado: lo que nadie tocó queda sin revisar, que no es lo mismo que bien.
        revision: Object.entries(datos.revision)
          .filter(([, c]) => c.estado)
          .map(([puntoId, c]) => ({ puntoId, estado: c.estado, nota: c.nota })),
        items: [],
      }),
    onSuccess: async (o) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['ordenes', tenantId] }),
        // El auto que se acaba de recibir tiene que aparecer en el taller sin recargar.
        cache.invalidateQueries({ queryKey: ['tablero', tenantId], exact: false }),
      ])
      alAbrir(o)
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

  const faltaVehiculo = !datos.vehiculo
  const faltaPedido = datos.pedido.trim().length < 3

  /** Intenta abrirla. Si falta algo, lo marca y devuelve qué, para que la vista lleve ahí. */
  function enviar(): 'vehiculo' | 'pedido' | null {
    setTocado(true)
    if (faltaVehiculo) return 'vehiculo'
    if (faltaPedido) return 'pedido'
    if (!abrir.isPending) abrir.mutate()
    return null
  }

  function empezarOtra() {
    setDatos(VACIA)
    setTocado(false)
    abrir.reset()
  }

  return {
    datos,
    poner,
    elegirVehiculo,
    hojaTipo,
    hojaImagenId,
    faltaCarroceria,
    elegirCarroceria,
    puntosRevision,
    contestar,
    enviar,
    empezarOtra,
    abriendo: abrir.isPending,
    faltaVehiculo: tocado && faltaVehiculo,
    faltaPedido: tocado && faltaPedido,
  }
}
