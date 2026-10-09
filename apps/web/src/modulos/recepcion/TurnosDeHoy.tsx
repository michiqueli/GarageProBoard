import { contrato } from '@gpb/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { autoDe, diaDe, horaDe, lunesDe, sumarDias, type Turno } from './turnos.ts'
import type { Visita } from './visitas.ts'

/**
 * Los turnos de hoy que todavía no llegaron, arriba de la puerta. «Llegó» los anota como
 * visita y entran a la cola de las tablets con el auto y el pedido.
 *
 * Pide la semana entera y no sólo hoy: es la misma consulta que la agenda, así lo que se
 * agenda en una se ve en la otra sin volver a preguntar.
 */
export function TurnosDeHoy() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.turnos.listar)
  const puedeMarcar = usePuedeUsar(contrato.turnos.llego)
  const cache = useQueryClient()
  const hoy = diaDe(new Date())
  const lunes = lunesDe(hoy)

  const turnos = useQuery({
    queryKey: ['turnos', tenantId, lunes],
    queryFn: () => api.turnos.listar({ desde: lunes, hasta: sumarDias(lunes, 6) }),
    enabled: puedeVer,
    refetchInterval: 60_000,
  })

  const refrescar = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['turnos', tenantId] }),
      cache.invalidateQueries({ queryKey: ['visitas', tenantId] }),
    ])

  const llego = useMutation({
    mutationFn: (t: Turno) => api.turnos.llego({ id: t.id }),
    onSuccess: refrescar,
    meta: {
      exito: (r) => `Llegó: ${(r as Visita).numero}, a la cola del taller`,
      error: mensajeGeneral,
    },
  })
  const noVino = useMutation({
    mutationFn: (t: Turno) => api.turnos.noVino({ id: t.id }),
    onSuccess: refrescar,
    meta: { exito: 'Quedó como que no vino', error: mensajeGeneral },
  })

  async function marcarNoVino(t: Turno) {
    const si = await confirmar({
      titulo: `¿${t.nombre ?? autoDe(t)} no vino?`,
      texto:
        'Queda en la agenda como que no vino. Si después llega, se lo anota como visita sin turno.',
      confirmar: 'No vino',
      peligro: true,
    })
    if (si) noVino.mutate(t)
  }

  if (!puedeVer) return null
  const pendientes = (turnos.data?.datos ?? []).filter(
    (t) => t.estado === 'agendado' && diaDe(t.fechaHora) === hoy,
  )

  return (
    <section
      aria-label="Turnos de hoy"
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Turnos de hoy</h2>
        <span className="font-mono text-etiqueta text-texto-tenue">
          {turnos.data ? `${pendientes.length} por llegar` : '…'}
        </span>
      </header>
      {turnos.isError && (
        <p role="alert" className="px-3 py-4 text-dato text-critico">
          {mensajeGeneral(turnos.error)}
        </p>
      )}
      {turnos.data && !pendientes.length && (
        <p className="px-3 py-4 text-dato text-texto-suave">No falta llegar nadie con turno.</p>
      )}
      {pendientes.length > 0 && (
        <ul className="divide-y divide-borde-suave">
          {pendientes.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5">
              <span className="font-mono font-semibold">{horaDe(t.fechaHora)}</span>
              <span className="font-mono">{autoDe(t)}</span>
              <span>{t.nombre ?? 'A nombre del titular'}</span>
              <span className="text-texto-suave">{t.pedido}</span>
              {puedeMarcar && (
                <span className="ml-auto inline-flex gap-1.5">
                  <Boton
                    tamano="chico"
                    variante="principal"
                    deshabilitado={llego.isPending}
                    onClick={() => llego.mutate(t)}
                  >
                    Llegó
                  </Boton>
                  <Boton tamano="chico" variante="sutil" onClick={() => void marcarNoVino(t)}>
                    No vino
                  </Boton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
