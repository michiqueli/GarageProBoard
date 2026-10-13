import { contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { REFRESCO, type Visita } from '../recepcion/visitas.ts'

/**
 * Los que vinieron a buscar el auto y se anotaron en la puerta o en el tótem.
 *
 * Es la misma cola de la puerta, con la misma clave de caché: lo que otro agarró deja de verse
 * libre acá también. Muchos no pasan por la puerta para retirar, así que nada de esto es
 * obligatorio: se entrega igual sin visita.
 */
export function useRetiros(visitaId?: string | undefined) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const yo = usarSesion((e) => e.datos?.usuario.id)
  const puedeVer = usePuedeUsar(contrato.recepcion.hoy)

  const visitas = useQuery({
    queryKey: ['visitas', tenantId],
    queryFn: () => api.recepcion.hoy(),
    enabled: puedeVer,
    refetchInterval: REFRESCO,
  })

  const abiertas = (visitas.data?.datos ?? []).filter((v) => v.motivo === 'retiro' && !v.cerradaEn)
  return {
    /** Las que esperan, o las que ya tiene esta persona. Las de otro, no: no son para tomar. */
    retiros: abiertas.filter((v) => !v.atendidaPor || v.atendidaPor.id === yo),
    /** La visita que viaja en la dirección, si sigue abierta. */
    visita: visitaId ? abiertas.find((v) => v.id === visitaId) : undefined,
    esMia: (v: Visita) => v.atendidaPor?.id === yo,
  }
}

/** «S-004 · Juan Pérez», como se la llama. */
export function quienRetira(v: Visita): string {
  return `${v.numero} · ${v.nombre ?? 'Sin nombre'}`
}
