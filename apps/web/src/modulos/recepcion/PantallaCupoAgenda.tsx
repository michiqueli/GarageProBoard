import { accesoDeRuta, contrato } from '@gpb/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoBorrar } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { diaDe } from './turnos.ts'

type Minutos = 15 | 30 | 60 | 120

const FRANJAS: Array<{ valor: Minutos; texto: string }> = [
  { valor: 15, texto: 'Cada 15 minutos' },
  { valor: 30, texto: 'Cada 30 minutos' },
  { valor: 60, texto: 'Cada hora' },
  { valor: 120, texto: 'Cada dos horas' },
]

/**
 * El cupo de la agenda de esta sucursal: de cuántos minutos es cada franja y cuántos turnos
 * entran en ella. Lo elige cada taller.
 *
 * **No impide agendar.** Con la franja llena, agendar pregunta si va como sobreturno, y el turno
 * queda marcado. Sin cupo, la agenda cuenta y no pone tope, como siempre.
 */
export function PantallaCupoAgenda() {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const sucursal = usarSesion((e) => e.datos?.sucursalActiva.nombre)
  const hoy = diaDe(new Date())

  // El cupo viaja con la agenda: un día alcanza para saber cuál es.
  const actual = useQuery({
    queryKey: ['turnos', tenantId, 'cupo'],
    queryFn: () => api.turnos.listar({ desde: hoy, hasta: hoy }),
  })
  const cupo = actual.data?.cupo ?? null

  const [minutos, setMinutos] = useState<Minutos>(30)
  const [cuantos, setCuantos] = useState('3')
  useEffect(() => {
    if (!cupo) return
    setMinutos(cupo.minutosFranja)
    setCuantos(String(cupo.cupo))
  }, [cupo])

  const invalidar = () => cache.invalidateQueries({ queryKey: ['turnos', tenantId] })

  const fijar = useMutation({
    mutationFn: () => api.turnos.fijarCupo({ minutosFranja: minutos, cupo: Number(cuantos) }),
    onSuccess: invalidar,
    meta: { exito: 'Cupo guardado', error: mensajeGeneral },
  })
  const quitar = useMutation({
    mutationFn: () => api.turnos.quitarCupo(),
    onSuccess: invalidar,
    meta: { exito: 'La agenda ya no tiene cupo', error: mensajeGeneral },
  })

  function guardar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!fijar.isPending) fijar.mutate()
  }

  async function sacarCupo() {
    const si = await confirmar({
      titulo: '¿Quitar el cupo de la agenda?',
      texto:
        'La agenda vuelve a contar los turnos sin tope. Los sobreturnos ya agendados quedan marcados.',
      confirmar: 'Quitar el cupo',
      peligro: true,
    })
    if (si) quitar.mutate()
  }

  const numero = Number(cuantos)
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 50

  return (
    <Shell titulo="Cupo de la agenda" requiere={accesoDeRuta(contrato.turnos.fijarCupo)}>
      <form
        onSubmit={guardar}
        aria-label="Cupo de la agenda"
        className="grid max-w-xl gap-3 rounded-base border border-borde bg-superficie p-3"
      >
        <p className="text-dato text-texto-suave">
          {actual.isPending
            ? 'Cargando…'
            : cupo
              ? `${sucursal ?? 'Esta sucursal'} tiene cupo: ${cupo.cupo} por franja, ${FRANJAS.find((f) => f.valor === cupo.minutosFranja)?.texto.toLowerCase()}.`
              : `${sucursal ?? 'Esta sucursal'} no tiene cupo: la agenda cuenta los turnos y no pone tope.`}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Selector
            etiqueta="Franjas"
            valor={minutos}
            opciones={FRANJAS}
            onChange={(v) => v && setMinutos(v)}
          />
          <Campo
            etiqueta="Turnos por franja"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={cuantos}
            onChange={(e) => setCuantos(e.target.value)}
            ayuda={valido ? 'Cuántos autos se reciben a la vez' : 'Entre 1 y 50 turnos'}
          />
        </div>
        <p className="text-etiqueta text-texto-tenue">
          No impide agendar: con la franja llena, agendar pregunta si va como sobreturno.
        </p>
        <div className="flex flex-wrap gap-2">
          <Boton
            accion="global.guardar"
            variante="principal"
            deshabilitado={!valido || fijar.isPending}
            onClick={() => guardar()}
          >
            Guardar
          </Boton>
          {cupo && (
            <Boton icono={<IconoBorrar />} deshabilitado={quitar.isPending} onClick={sacarCupo}>
              Quitar el cupo
            </Boton>
          )}
        </div>
      </form>
    </Shell>
  )
}
