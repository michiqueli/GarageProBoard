import { contrato } from '@gpb/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoAnular } from '../../componentes/iconos.tsx'
import { SelectorVehiculo, type VehiculoElegido } from '../../componentes/SelectorVehiculo.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { ElegirReceptor, type Receptor } from './ElegirReceptor.tsx'
import { diaDe, horaDe, instante, type Turno } from './turnos.ts'

/**
 * Agendar o cambiar un turno. **Lo mínimo es la patente, un nombre y qué le pasa**: se
 * agenda por teléfono, y obligar a cargar el auto entero es lo que manda a la gente al
 * cuaderno. Si el auto está cargado se elige, y su titular alcanza como nombre.
 */
export function FormTurno({
  turno,
  dia,
  receptores,
  alTerminar,
}: {
  turno?: Turno | undefined
  dia: string
  receptores: Receptor[]
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeBuscarAutos = usePuedeUsar(contrato.vehiculos.listar)
  const primerCampo = useRef<HTMLInputElement>(null)

  const [fecha, setFecha] = useState(turno ? diaDe(turno.fechaHora) : dia)
  const [hora, setHora] = useState(turno ? horaDe(turno.fechaHora) : '09:00')
  const [auto, setAuto] = useState<VehiculoElegido | null>(null)
  const [dominio, setDominio] = useState(turno?.vehiculo ? '' : (turno?.dominio ?? ''))
  const [nombre, setNombre] = useState(turno?.nombre ?? '')
  const [telefono, setTelefono] = useState(turno?.telefono ?? '')
  const [pedido, setPedido] = useState(turno?.pedido ?? '')
  const [asesorId, setAsesorId] = useState<string | null>(turno?.asesor?.id ?? null)
  // El auto ya elegido de un turno que se edita: se conserva aunque no se vuelva a buscar.
  const vehiculoId = auto?.id ?? (dominio ? null : (turno?.vehiculo?.id ?? null))

  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const invalidar = () => cache.invalidateQueries({ queryKey: ['turnos', tenantId] })

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        fechaHora: instante(fecha, hora),
        vehiculoId,
        dominio: vehiculoId ? null : dominio,
        nombre,
        telefono,
        pedido,
        asesorId,
      }
      return turno ? api.turnos.editar({ id: turno.id, ...datos }) : api.turnos.crear(datos)
    },
    onSuccess: async () => {
      await invalidar()
      alTerminar()
    },
    meta: {
      exito: turno
        ? 'El turno quedó cambiado'
        : `Turno agendado para el ${fecha.split('-').reverse().join('/')} a las ${hora}`,
      error: mensajeGeneral,
    },
  })

  const cancelar = useMutation({
    mutationFn: (id: string) => api.turnos.cancelar({ id }),
    onSuccess: async () => {
      await invalidar()
      alTerminar()
    },
    meta: { exito: 'El turno quedó cancelado', error: mensajeGeneral },
  })

  async function cancelarTurno() {
    if (!turno) return
    const si = await confirmar({
      titulo: '¿Cancelar el turno?',
      texto:
        'Queda en la agenda como cancelado, con quién lo canceló. No se puede volver a agendar el mismo: se agenda uno nuevo.',
      confirmar: 'Cancelar el turno',
      peligro: true,
    })
    if (si) cancelar.mutate(turno.id)
  }

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!guardar.isPending) guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      aria-label={turno ? 'Cambiar el turno' : 'Agendar un turno'}
      className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">
        {turno ? 'Cambiar el turno' : 'Agendar un turno'}
      </h2>
      <div className="grid gap-3 md:grid-cols-4">
        <Campo
          ref={primerCampo}
          etiqueta="Día"
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <Campo
          etiqueta="Hora"
          type="time"
          step={900}
          required
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
        <div className="md:col-span-2">
          {puedeBuscarAutos && !dominio ? (
            <SelectorVehiculo etiqueta="Auto, si está cargado" valor={auto} onChange={setAuto} />
          ) : null}
        </div>
        {!vehiculoId && (
          <Campo
            etiqueta="Patente"
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            ayuda="Si el auto no está cargado"
          />
        )}
        {turno?.vehiculo && !auto && !dominio && (
          <p className="self-end text-dato text-texto-suave">{turno.vehiculo.descripcion}</p>
        )}
        <Campo
          etiqueta="A nombre de"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          ayuda={vehiculoId ? 'Vacío: el titular del auto' : undefined}
        />
        <Campo
          etiqueta="Teléfono"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <ElegirReceptor
          motivo="servicio"
          valor={asesorId}
          receptores={receptores}
          onChange={setAsesorId}
          actual={turno?.asesor ?? null}
        />
        <div className="md:col-span-4">
          <Campo
            etiqueta="Qué le pasa o qué service es"
            required
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton accion="global.guardar" variante="principal" onClick={() => enviar()}>
          {turno ? 'Guardar' : 'Agendar'}
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Volver
        </Boton>
        {turno && (
          <span className="ml-auto">
            <Boton variante="peligro" icono={<IconoAnular />} onClick={() => void cancelarTurno()}>
              Cancelar el turno
            </Boton>
          </span>
        )}
      </div>
    </form>
  )
}
