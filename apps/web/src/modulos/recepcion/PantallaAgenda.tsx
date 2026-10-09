import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado, useFlechasPestanas } from '../../teclado/index.ts'
import { FormTurno } from './FormTurno.tsx'
import {
  autoDe,
  diaDe,
  ESTADO_TURNO_NOMBRE,
  horaDe,
  lunesDe,
  sumarDias,
  type Turno,
} from './turnos.ts'

const NOMBRE_DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
const FECHA_CORTA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})
const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const aFecha = (dia: string) => new Date(`${dia}T12:00:00Z`)

/**
 * La agenda del taller: la semana arriba, con cuántos turnos tiene cada día, y el día elegido
 * abajo, por hora. El porqué, en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * **Sin cupos**: cuenta cuántos hay por hora pero no impide agendar. El que atiende el
 * teléfono sabe que el jueves falta un mecánico; un sistema que no lo deja anotar se
 * reemplaza por un cuaderno.
 *
 * Con teclado: ← → cambian de día, ↑ ↓ eligen un turno y Enter lo abre, `Ins` agenda uno.
 */
export function PantallaAgenda() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.turnos.listar)
  const puedeAgendar = usePuedeUsar(contrato.turnos.crear)
  const puedeCambiar = usePuedeUsar(contrato.turnos.editar)
  // A quién se le puede pedir sale de la puerta: sin ese permiso, el turno va sin asesor.
  const puedeElegirAsesor = usePuedeUsar(contrato.recepcion.receptores)
  const hoy = diaDe(new Date())
  const [dia, setDia] = useState(hoy)
  const [form, setForm] = useState<{ turno?: Turno } | null>(null)

  const lunes = lunesDe(dia)
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))

  const turnos = useQuery({
    queryKey: ['turnos', tenantId, lunes],
    queryFn: () => api.turnos.listar({ desde: lunes, hasta: sumarDias(lunes, 6) }),
    enabled: puedeVer,
  })
  const receptores = useQuery({
    queryKey: ['receptores', tenantId],
    queryFn: () => api.recepcion.receptores(),
    enabled: puedeElegirAsesor,
  })

  const todos = turnos.data?.datos ?? []
  const delDia = todos.filter((t) => diaDe(t.fechaHora) === dia)
  const vigentes = (d: string) =>
    todos.filter((t) => diaDe(t.fechaHora) === d && t.estado !== 'cancelado').length

  // ← → mueven el día, y en las puntas pasan de semana.
  useFlechasPestanas([sumarDias(lunes, -1), ...semana, sumarDias(lunes, 7)], dia, setDia)
  const abrir = (t: Turno) => puedeCambiar && t.estado === 'agendado' && setForm({ turno: t })
  const { propsFila } = useFilasConTeclado(form ? [] : delDia, abrir)

  // Cuántos hay en cada hora del día, para ver de un vistazo dónde se amontonan.
  const porHora = new Map<string, number>()
  for (const t of delDia) {
    if (t.estado === 'cancelado') continue
    const h = horaDe(t.fechaHora).slice(0, 2)
    porHora.set(h, (porHora.get(h) ?? 0) + 1)
  }

  return (
    <Shell
      titulo="Agenda"
      requiere={accesoDeRuta(contrato.turnos.listar)}
      acciones={
        puedeAgendar && !form ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => setForm({})}>
            Agendar un turno
          </Boton>
        ) : undefined
      }
    >
      {form && (
        <FormTurno
          turno={form.turno}
          dia={dia}
          receptores={receptores.data?.datos ?? []}
          alTerminar={() => setForm(null)}
        />
      )}

      <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
        <Boton tamano="chico" onClick={() => setDia(sumarDias(lunes, -7))}>
          Semana anterior
        </Boton>
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {semana.map((d) => {
            const elegido = d === dia
            const n = vigentes(d)
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setDia(d)}
                  aria-current={elegido ? 'date' : undefined}
                  className={`grid w-full justify-items-center rounded-base border px-1 py-1 text-etiqueta ${
                    elegido
                      ? 'border-marca bg-marca-suave font-semibold text-texto'
                      : 'border-borde text-texto-suave hover:border-texto-tenue'
                  }`}
                >
                  <span className="capitalize">
                    {NOMBRE_DIA.format(aFecha(d)).replace('.', '')} {d === hoy ? '· hoy' : ''}
                  </span>
                  <span className="font-mono">{FECHA_CORTA.format(aFecha(d))}</span>
                  <span className="font-mono text-texto-tenue">{n ? `${n} t.` : '—'}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <Boton tamano="chico" onClick={() => setDia(sumarDias(lunes, 7))}>
          Semana siguiente
        </Boton>
        {dia !== hoy && (
          <Boton tamano="chico" variante="sutil" onClick={() => setDia(hoy)}>
            Hoy
          </Boton>
        )}
      </nav>

      <section
        aria-label="Turnos del día"
        className="overflow-hidden rounded-base border border-borde bg-superficie"
      >
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold first-letter:uppercase">
            {FECHA_LARGA.format(aFecha(dia))}
          </h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {[...porHora].map(([h, n]) => `${h} h: ${n}`).join(' · ')}
          </span>
        </header>
        {turnos.isPending && (
          <div className="grid gap-px p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
            ))}
          </div>
        )}
        {turnos.isError && (
          <p role="alert" className="px-3 py-4 text-dato text-critico">
            {mensajeGeneral(turnos.error)}
          </p>
        )}
        {turnos.data && !delDia.length && (
          <div className="grid justify-items-start gap-2 px-3 py-6">
            <p className="text-dato text-texto-suave">No hay turnos este día.</p>
            {puedeAgendar && !form && (
              <Boton variante="principal" onClick={() => setForm({})}>
                Agendar uno
              </Boton>
            )}
          </div>
        )}
        {delDia.length > 0 && (
          <ul className="divide-y divide-borde-suave">
            {delDia.map((t, i) => (
              <li
                key={t.id}
                {...propsFila(i)}
                className={`flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2 data-[activa=true]:bg-marca-suave data-[activa=true]:shadow-[inset_3px_0_0_var(--color-marca)] ${
                  t.estado === 'cancelado' ? 'text-texto-tenue line-through' : ''
                }`}
              >
                <span className="font-mono font-semibold">{horaDe(t.fechaHora)}</span>
                <span className="font-mono">{autoDe(t)}</span>
                <span>{t.nombre ?? 'A nombre del titular'}</span>
                <span className="text-texto-suave">{t.pedido}</span>
                {t.asesor && (
                  <span className="text-etiqueta text-texto-suave">Para {t.asesor.nombre}</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <EstadoTurno estado={t.estado} />
                  {puedeCambiar && t.estado === 'agendado' && (
                    <Boton tamano="chico" onClick={() => setForm({ turno: t })}>
                      Cambiar
                    </Boton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/**
 * **Forma además de color**: agendado va contorneado —en curso normal—, «no vino» lleno —hay
 * que llamarlo—, y llegado o cancelado sin píldora, porque ya terminaron.
 */
export function EstadoTurno({ estado }: { estado: Turno['estado'] }) {
  if (estado === 'agendado') {
    return (
      <span className="inline-flex rounded-full border border-marca px-2 text-etiqueta text-marca">
        {ESTADO_TURNO_NOMBRE[estado]}
      </span>
    )
  }
  if (estado === 'ausente') {
    return (
      <span className="inline-flex rounded-full border border-atencion bg-atencion-suave px-2 text-etiqueta font-semibold text-atencion">
        {ESTADO_TURNO_NOMBRE[estado]}
      </span>
    )
  }
  return <span className="text-etiqueta text-texto-suave">{ESTADO_TURNO_NOMBRE[estado]}</span>
}
