import { accesoDeRuta, contrato } from '@gpb/contracts'
import { MOTIVOS_VISITA, MOTIVOS_VISITA_NOMBRE, type MotivoVisita, nivelEspera } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoListo } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useAtajo, useFilasConTeclado } from '../../teclado/index.ts'
import { ElegirReceptor, type Receptor } from './ElegirReceptor.tsx'
import { TurnosDeHoy } from './TurnosDeHoy.tsx'
import { errorAlAtender, minutos, REFRESCO, useAhora, type Visita } from './visitas.ts'

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })

/**
 * La puerta: quién está esperando, a quién se le derivó y quién lo está atendiendo. Es lo que
 * la recepcionista mira todo el día. El porqué, en `docs/tecnicos/recepcion-y-turnos.md`.
 *
 * **Los estados salen de las horas**: sin hora de atención está esperando, sin hora de cierre
 * lo están atendiendo. Así la pantalla no puede decir una cosa y la visita otra.
 */
export function PantallaPuerta() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.recepcion.hoy)
  const puedeAnotar = usePuedeUsar(contrato.recepcion.anotar)
  const puedeEditar = usePuedeUsar(contrato.recepcion.atender)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const ahora = useAhora()
  const [alta, setAlta] = useState(false)

  const clave = ['visitas', tenantId]
  const visitas = useQuery({
    queryKey: clave,
    queryFn: () => api.recepcion.hoy(),
    enabled: puedeVer,
    refetchInterval: REFRESCO,
  })
  const receptores = useQuery({
    queryKey: ['receptores', tenantId],
    queryFn: () => api.recepcion.receptores(),
    enabled: puedeVer,
  })

  const cache = useQueryClient()
  const invalidar = () => cache.invalidateQueries({ queryKey: clave })

  const atender = useMutation({
    mutationFn: (v: Visita) => api.recepcion.atender({ id: v.id }),
    onSuccess: invalidar,
    onError: invalidar,
    meta: { exito: (r) => `${(r as Visita).numero} quedó a tu nombre`, error: errorAlAtender },
  })
  const cerrar = useMutation({
    mutationFn: ({ v, resultado }: { v: Visita; resultado: 'atendida' | 'se_fue' }) =>
      api.recepcion.cerrar({ id: v.id, resultado }),
    onSuccess: invalidar,
    meta: {
      exito: (r) => {
        const v = r as Visita
        return v.resultado === 'se_fue'
          ? `${v.numero} quedó como que se fue`
          : `${v.numero} terminada`
      },
      error: mensajeGeneral,
    },
  })
  const soltar = useMutation({
    mutationFn: (v: Visita) => api.recepcion.soltar({ id: v.id }),
    onSuccess: invalidar,
    meta: { exito: (r) => `${(r as Visita).numero} volvió a la cola`, error: mensajeGeneral },
  })
  const derivar = useMutation({
    mutationFn: ({ v, a }: { v: Visita; a: string | null }) =>
      api.recepcion.derivar({ id: v.id, derivadaA: a }),
    onSuccess: invalidar,
    meta: {
      exito: (r) => {
        const v = r as Visita
        return v.derivadaA
          ? `${v.numero}: lo atiende ${v.derivadaA.nombre}`
          : `${v.numero}: sin asignar`
      },
      error: mensajeGeneral,
    },
  })

  const todas = visitas.data?.datos ?? []
  const esperando = todas.filter((v) => !v.atendidaEn && !v.cerradaEn)
  const atendiendo = todas.filter((v) => v.atendidaEn && !v.cerradaEn)
  const terminadas = todas.filter((v) => v.cerradaEn)
  const abiertas = [...esperando, ...atendiendo]

  async function seFue(v: Visita) {
    const si = await confirmar({
      titulo: `¿${v.numero} se fue sin que lo atiendan?`,
      texto:
        'Queda registrado así, con lo que esperó. No se borra: es justamente lo que sirve para ' +
        'saber cuánta gente se va de la puerta.',
      confirmar: 'Se fue',
      peligro: true,
    })
    if (si) cerrar.mutate({ v, resultado: 'se_fue' })
  }

  // Enter atiende a la marcada. Terminar es F9 aparte: con Enter, un segundo toque
  // terminaría por error la que se acaba de agarrar.
  const accionar = (v: Visita) => {
    if (puedeEditar && !v.atendidaEn) atender.mutate(v)
  }
  const { activa, propsFila } = useFilasConTeclado(abiertas, accionar)
  const marcada = activa === null ? undefined : abiertas[activa]

  useAtajo(
    'recepcion.atender',
    () => marcada && atender.mutate(marcada),
    Boolean(marcada && !marcada.atendidaEn && puedeEditar),
  )
  useAtajo(
    'recepcion.terminar',
    () => marcada && cerrar.mutate({ v: marcada, resultado: 'atendida' }),
    Boolean(marcada && puedeEditar),
  )

  const fila = (v: Visita, i: number) => ({
    v,
    props: propsFila(i),
    ahora,
    receptores: receptores.data?.datos ?? [],
    puedeEditar,
    atender: () => atender.mutate(v),
    terminar: () => cerrar.mutate({ v, resultado: 'atendida' }),
    seFue: () => void seFue(v),
    derivar: (a: string | null) => derivar.mutate({ v, a }),
    soltar: () => soltar.mutate(v),
  })

  return (
    <Shell
      titulo="Recepción"
      requiere={accesoDeRuta(contrato.recepcion.hoy)}
      acciones={
        puedeAnotar && !alta ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => setAlta(true)}>
            Anotar a alguien
          </Boton>
        ) : undefined
      }
    >
      {alta && (
        <Anotar receptores={receptores.data?.datos ?? []} alTerminar={() => setAlta(false)} />
      )}

      <TurnosDeHoy />

      {visitas.isPending && <Esqueleto />}
      {visitas.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(visitas.error)}
        </p>
      )}

      {visitas.data && (
        <>
          <Bloque
            titulo="Esperando"
            cuenta={esperando.length}
            vacio="No hay nadie esperando."
            esEscritorio={esEscritorio}
            filas={esperando.map((v, i) => fila(v, i))}
          />
          <Bloque
            titulo="Atendiendo"
            cuenta={atendiendo.length}
            vacio="Nadie está siendo atendido ahora."
            esEscritorio={esEscritorio}
            filas={atendiendo.map((v, i) => fila(v, esperando.length + i))}
          />
          <Terminadas visitas={terminadas} />
        </>
      )}
    </Shell>
  )
}

interface PropsFila {
  v: Visita
  props: { 'data-activa': string | undefined }
  ahora: number
  receptores: Receptor[]
  puedeEditar: boolean
  atender: () => void
  terminar: () => void
  seFue: () => void
  derivar: (a: string | null) => void
  soltar: () => void
}

function Bloque({
  titulo,
  cuenta,
  vacio,
  esEscritorio,
  filas,
}: {
  titulo: string
  cuenta: number
  vacio: string
  esEscritorio: boolean
  filas: PropsFila[]
}) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">{titulo}</h2>
        <span className="font-mono text-etiqueta text-texto-tenue">{cuenta}</span>
      </header>
      {!filas.length && <p className="px-3 py-4 text-dato text-texto-suave">{vacio}</p>}
      {filas.length > 0 && esEscritorio && (
        <table className="w-full border-collapse text-dato">
          <thead>
            <tr>
              {['Número', 'Motivo', 'Quién', 'Lo atiende', 'Llegó', 'Espera', ''].map((c) => (
                <th
                  key={c}
                  className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaTabla key={f.v.id} {...f} />
            ))}
          </tbody>
        </table>
      )}
      {filas.length > 0 && !esEscritorio && (
        <ul className="divide-y divide-borde-suave">
          {filas.map((f) => (
            <Tarjeta key={f.v.id} {...f} />
          ))}
        </ul>
      )}
    </section>
  )
}

const CELDA = 'h-fila border-b border-borde-suave px-3'

/**
 * La fila no abre nada —la visita no tiene ficha—, así que no lleva el cursor de ojo de
 * `FILA_CLICABLE`: sólo la marca de las flechas.
 */
const FILA_MARCABLE =
  'hover:bg-superficie-2 data-[activa=true]:bg-marca-suave data-[activa=true]:shadow-[inset_3px_0_0_var(--color-marca)]'

function FilaTabla(f: PropsFila) {
  const { v } = f
  return (
    <tr {...f.props} className={FILA_MARCABLE}>
      <td className={`${CELDA} font-mono font-semibold`}>{v.numero}</td>
      <td className={`${CELDA} text-texto-suave`}>{MOTIVOS_VISITA_NOMBRE[v.motivo]}</td>
      <td className={CELDA}>
        <Quien v={v} />
      </td>
      <td className={`${CELDA} py-1`}>
        <QuienAtiende {...f} />
      </td>
      <td className={`${CELDA} font-mono text-etiqueta text-texto-suave`}>
        {HORA.format(new Date(v.llegoEn))}
      </td>
      <td className={CELDA}>
        <Espera v={v} ahora={f.ahora} />
      </td>
      <td className={`${CELDA} py-1 text-right`}>
        <Acciones {...f} />
      </td>
    </tr>
  )
}

function Tarjeta(f: PropsFila) {
  const { v } = f
  return (
    <li {...f.props} className="grid gap-1.5 px-3 py-2.5 data-[activa=true]:bg-marca-suave">
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-semibold">{v.numero}</span>
        <span className="text-etiqueta text-texto-suave">{MOTIVOS_VISITA_NOMBRE[v.motivo]}</span>
        <span className="ml-auto">
          <Espera v={v} ahora={f.ahora} />
        </span>
      </div>
      <Quien v={v} />
      <QuienAtiende {...f} />
      <div className="flex flex-wrap gap-2">
        <Acciones {...f} />
      </div>
    </li>
  )
}

function Quien({ v }: { v: Visita }) {
  if (!v.nombre && !v.telefono) return <span className="text-texto-tenue">Sin nombre</span>
  return (
    <span className="grid leading-tight">
      <span>{v.nombre ?? 'Sin nombre'}</span>
      {v.telefono && <span className="text-etiqueta text-texto-suave">{v.telefono}</span>}
    </span>
  )
}

/**
 * A quién se le derivó, mientras espera, se cambia ahí mismo. Una vez que alguien la agarró,
 * lo que importa es quién la tiene.
 */
function QuienAtiende({ v, receptores, puedeEditar, derivar }: PropsFila) {
  if (v.atendidaPor) {
    return <span className="text-texto-suave">La tiene {v.atendidaPor.nombre}</span>
  }
  if (!puedeEditar) {
    return <span className="text-texto-suave">{v.derivadaA?.nombre ?? 'Sin asignar'}</span>
  }
  return (
    <ElegirReceptor
      compacto
      motivo={v.motivo}
      valor={v.derivadaA?.id ?? null}
      receptores={receptores}
      onChange={derivar}
      // Si quien estaba derivado ya no está entre los receptores, igual se tiene que ver.
      actual={v.derivadaA}
    />
  )
}

function Acciones({ v, puedeEditar, atender, terminar, seFue, soltar }: PropsFila) {
  if (!puedeEditar) return null
  return (
    <span className="inline-flex gap-1.5">
      {!v.atendidaEn && (
        <Boton tamano="chico" variante="principal" onClick={atender}>
          Atender
        </Boton>
      )}
      <Boton tamano="chico" icono={<IconoListo />} onClick={terminar}>
        Terminar
      </Boton>
      {!v.atendidaEn && (
        <Boton tamano="chico" variante="sutil" onClick={seFue}>
          Se fue
        </Boton>
      )}
      {/* La tablet que la tenía se apagó, o la agarró quien no era: vuelve a esperar. */}
      {v.atendidaEn && (
        <Boton tamano="chico" variante="sutil" onClick={soltar}>
          Devolver a la cola
        </Boton>
      )}
    </span>
  )
}

/**
 * Cuánto lleva esperando —o cuánto lleva siendo atendido—. **Forma además de color**: hasta el
 * primer umbral es texto, después contorneado en ámbar, y pasado el segundo, lleno en rojo:
 * alguien tiene que hacer algo.
 */
function Espera({ v, ahora }: { v: Visita; ahora: number }) {
  if (v.atendidaEn) {
    return (
      <span className="font-mono text-etiqueta text-texto-suave">
        {minutos(v.atendidaEn, ahora)} min atendiendo
      </span>
    )
  }
  const m = minutos(v.llegoEn, ahora)
  const nivel = nivelEspera(m)
  const clases = {
    bien: 'text-texto-suave',
    ambar: 'rounded-full border border-atencion px-2 font-semibold text-atencion',
    rojo: 'rounded-full border border-critico bg-critico-suave px-2 font-semibold text-critico',
  }[nivel]
  return <span className={`inline-flex font-mono text-etiqueta ${clases}`}>{m} min</span>
}

/** Anotar a alguien que llegó: a qué vino, quién es y quién lo atiende. */
function Anotar({ receptores, alTerminar }: { receptores: Receptor[]; alTerminar: () => void }) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLSelectElement>(null)

  const [motivo, setMotivo] = useState<MotivoVisita>('servicio')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [derivadaA, setDerivadaA] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const guardar = useMutation({
    mutationFn: () => api.recepcion.anotar({ motivo, nombre, telefono, derivadaA, nota }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['visitas', tenantId] })
      alTerminar()
    },
    meta: {
      exito: (r) => `Anotado con el ${(r as Visita).numero}`,
      error: mensajeGeneral,
    },
  })

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!guardar.isPending) guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      aria-label="Anotar a alguien que llegó"
      className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Anotar a alguien que llegó</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-etiqueta font-medium text-texto-suave">A qué vino</span>
          <select
            ref={primerCampo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoVisita)}
            className="h-campo rounded-base border border-borde bg-superficie-2 px-2 text-dato text-texto"
          >
            {MOTIVOS_VISITA.map((m) => (
              <option key={m} value={m}>
                {MOTIVOS_VISITA_NOMBRE[m]}
              </option>
            ))}
          </select>
        </label>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo
          etiqueta="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          inputMode="tel"
        />
        <ElegirReceptor
          motivo={motivo}
          valor={derivadaA}
          receptores={receptores}
          onChange={setDerivadaA}
        />
        <div className="md:col-span-2">
          <Campo
            etiqueta="Nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            ayuda="Una línea: «pregunta por el Taos, financiado»"
          />
        </div>
      </div>
      <p className="text-etiqueta text-texto-suave">
        Nombre y teléfono no son obligatorios: al que viene a preguntar se lo anota igual.
      </p>
      <div className="flex flex-wrap gap-2">
        <Boton accion="global.guardar" variante="principal" onClick={() => enviar()}>
          Anotar
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

/** Las que ya terminaron hoy, para ver de un vistazo cuántas y cómo. */
function Terminadas({ visitas }: { visitas: Visita[] }) {
  if (!visitas.length) return null
  const seFueron = visitas.filter((v) => v.resultado === 'se_fue').length
  return (
    <details className="rounded-base border border-borde bg-superficie">
      <summary className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Terminadas hoy</h2>
        <span className="font-mono text-etiqueta text-texto-tenue">
          {visitas.length}
          {seFueron ? ` · ${seFueron} ${seFueron === 1 ? 'se fue' : 'se fueron'}` : ''}
        </span>
      </summary>
      <ul className="divide-y divide-borde-suave border-t border-borde">
        {visitas.map((v) => (
          <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5">
            <span className="font-mono font-semibold">{v.numero}</span>
            <span className="text-texto-suave">{MOTIVOS_VISITA_NOMBRE[v.motivo]}</span>
            <span>{v.nombre ?? 'Sin nombre'}</span>
            <span className="ml-auto text-etiqueta text-texto-suave">
              {v.resultado === 'se_fue'
                ? `Se fue después de ${minutos(v.llegoEn, new Date(v.cerradaEn ?? v.llegoEn).getTime())} min`
                : `Atendió ${v.atendidaPor?.nombre ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-px rounded-base border border-borde bg-superficie p-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
