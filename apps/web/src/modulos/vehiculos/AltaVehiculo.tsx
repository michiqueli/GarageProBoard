import { ORPCError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { type ClienteElegido, SelectorCliente } from '../../componentes/SelectorCliente.tsx'
import { api } from '../../sesion/cliente.ts'
import {
  CamposVehiculo,
  DATOS_VACIOS,
  type Datos,
  hoy,
  paraEnviar,
  problemas,
} from './datos-vehiculo.tsx'

export type VehiculoCreado = Awaited<ReturnType<typeof api.vehiculos.crear>>

/** Un error al guardar dice qué hacer; la patente repetida, además, de qué vehículo es. */
export function mensajeDeGuardar(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.code === 'DOMINIO_DUPLICADO') {
      const chasis = (error.data as { chasis?: string } | undefined)?.chasis
      return `Esa patente ya la tiene el vehículo con chasis ${chasis}. Revisá cuál de los dos está mal.`
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * El alta de un vehículo. La usan el listado de vehículos y la recepción: el auto que entra
 * por primera vez se da de alta ahí mismo, con el cliente adelante, y la recepción sigue con
 * él ya elegido. Mandar a otra pantalla a cargarlo es perder lo que ya se cargó.
 */
export function AltaVehiculo({
  dominio = '',
  titular: titularInicial = null,
  alCrear,
  alCancelar,
}: {
  /** La patente que se buscó y no estaba. */
  dominio?: string
  titular?: ClienteElegido | null
  alCrear: (vehiculo: VehiculoCreado) => void
  alCancelar: () => void
}) {
  const cache = useQueryClient()
  const id = useId()
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const [chasis, setChasis] = useState('')
  const [datos, setDatos] = useState<Datos>({ ...DATOS_VACIOS, dominio: dominio.toUpperCase() })
  const [titular, setTitular] = useState<ClienteElegido | null>(titularInicial)
  const [desde, setDesde] = useState(hoy())
  const [tocado, setTocado] = useState(false)

  const errores = tocado ? problemas(datos) : {}
  const chasisValido = /^[A-HJ-NPR-Z0-9]{6,17}$/.test(chasis)
  const chasisMal = tocado && !chasisValido

  const guardar = useMutation({
    mutationFn: () =>
      api.vehiculos.crear({
        chasis,
        ...paraEnviar(datos),
        titular: titular ? { clienteId: titular.id, desde } : null,
      }),
    onSuccess: async (creado) => {
      await cache.invalidateQueries({ queryKey: ['vehiculos'] })
      alCrear(creado)
    },
    meta: { exito: 'Vehículo dado de alta', error: mensajeDeGuardar },
  })

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    setTocado(true)
    if (!chasisValido || Object.keys(problemas(datos)).length || guardar.isPending) return
    guardar.mutate()
  }

  return (
    <section
      aria-label="Nuevo vehículo"
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">Nuevo vehículo</h2>
      <form id={id} onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
        <Campo
          ref={primerCampo}
          etiqueta="Chasis"
          required
          value={chasis}
          onChange={(e) => setChasis(e.target.value.toUpperCase().replace(/\s/g, ''))}
          aria-invalid={chasisMal}
          ayuda={
            chasisMal
              ? 'De 6 a 17 letras y números, sin I, O ni Q'
              : 'Está en la cédula verde: es la identidad del vehículo'
          }
        />
        <CamposVehiculo
          datos={datos}
          cambiar={(parcial) => setDatos((d) => ({ ...d, ...parcial }))}
          errores={errores}
        />
        <div className="md:col-span-2">
          <SelectorCliente etiqueta="Titular" valor={titular} onChange={setTitular} />
        </div>
        {titular ? (
          <Campo
            etiqueta="Titular desde"
            type="date"
            max={hoy()}
            required
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        ) : (
          <p className="self-end pb-2 text-etiqueta text-texto-tenue">
            Sin titular si está en stock.
          </p>
        )}
      </form>

      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() => enviar()}
        >
          Guardar
        </Boton>
        <Boton accion="global.cancelar" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </section>
  )
}
