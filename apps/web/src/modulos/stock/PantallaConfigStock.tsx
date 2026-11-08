import { accesoDeRuta, contrato } from '@gpb/contracts'
import { type ConfigCartera, MAXIMO_DIAS_RESERVA } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'
import { CategoriasDeGasto } from './CategoriasDeGasto.tsx'

/** Cada concesionaria trabaja distinto: lo que varía se elige acá. */
export function PantallaConfigStock() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['stock', tenantId, 'config'],
    queryFn: () => api.cartera.config(),
  })

  return (
    <Shell titulo="Configuración del stock" requiere={accesoDeRuta(contrato.cartera.guardarConfig)}>
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
      {consulta.data && <Formulario inicial={consulta.data} />}
      {consulta.data && <CategoriasDeGasto />}
    </Shell>
  )
}

function Formulario({ inicial }: { inicial: ConfigCartera }) {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  useVolver(() => void navegar({ to: '/stock' }))
  const [c, setC] = useState(inicial)
  const [dias, setDias] = useState(inicial.reservaDias?.toString() ?? '')
  const [cambios, setCambios] = useState(false)
  useCambiosSinGuardar(cambios)

  const poner = (parcial: Partial<ConfigCartera>) => {
    setCambios(true)
    setC((x) => ({ ...x, ...parcial }))
  }
  const numero = Number(dias)
  const diasMalos =
    dias.trim() !== '' && (!Number.isInteger(numero) || numero < 1 || numero > MAXIMO_DIAS_RESERVA)

  const guardar = useMutation({
    mutationFn: () => api.cartera.guardarConfig({ ...c, reservaDias: dias.trim() ? numero : null }),
    onSuccess: async () => {
      setCambios(false)
      await cache.invalidateQueries({ queryKey: ['stock', tenantId] })
    },
    meta: { exito: 'Configuración guardada', error: mensajeGeneral },
  })
  const guardable = cambios && !diasMalos && !guardar.isPending
  useAtajo('global.guardar', () => guardable && guardar.mutate(), cambios)

  return (
    <section
      aria-label="Opciones"
      className="grid max-w-2xl gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <Selector
        etiqueta="Trasladar entre razones sociales distintas"
        valor={c.trasladoEntreEmpresas}
        onChange={(v) => v && poner({ trasladoEntreEmpresas: v })}
        opciones={[
          { valor: 'solo_ubicacion' as const, texto: 'Sólo cambia dónde está la unidad' },
          { valor: 'con_comprobante' as const, texto: 'Cambia la dueña y pide el comprobante' },
        ]}
      />
      <Selector
        etiqueta="Cuando una unidad ya está reservada"
        valor={c.reservaModo}
        onChange={(v) => v && poner({ reservaModo: v })}
        opciones={[
          { valor: 'bloquea' as const, texto: 'No se puede reservar: sólo con autorización' },
          { valor: 'avisa' as const, texto: 'Se puede reservar igual, y queda más de una' },
        ]}
      />
      <Campo
        etiqueta="Días que dura una reserva"
        ayuda="Vacío: no vence sola"
        inputMode="numeric"
        value={dias}
        onChange={(e) => {
          setCambios(true)
          setDias(e.target.value)
        }}
      />
      {diasMalos && (
        <p className="text-etiqueta text-critico">
          Tienen que ser días enteros, de 1 a {MAXIMO_DIAS_RESERVA}.
        </p>
      )}
      <label className="inline-flex items-center gap-2 text-dato">
        <input
          type="checkbox"
          checked={c.reservaExigeSena}
          onChange={(e) => poner({ reservaExigeSena: e.target.checked })}
        />
        Pedir seña para reservar
      </label>
      <Selector
        etiqueta="Un usado arranca como"
        valor={c.tenenciaUsado}
        onChange={(v) => v && poner({ tenenciaUsado: v })}
        opciones={[
          { valor: 'propia' as const, texto: 'Propio' },
          { valor: 'consignacion' as const, texto: 'En consignación' },
        ]}
      />
      <Selector
        etiqueta="El precio arranca en"
        valor={c.moneda}
        onChange={(v) => v && poner({ moneda: v })}
        opciones={[
          { valor: 'ARS' as const, texto: 'Pesos' },
          { valor: 'USD' as const, texto: 'Dólares' },
        ]}
      />
      <div>
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={!guardable}
          onClick={() => guardar.mutate()}
        >
          Guardar
        </Boton>
      </div>
    </section>
  )
}
