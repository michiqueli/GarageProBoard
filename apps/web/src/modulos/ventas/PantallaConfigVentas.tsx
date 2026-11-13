import { accesoDeRuta, contrato } from '@gpb/contracts'
import type { ConfigVentas } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoVolver } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'

/** Cada concesionaria trabaja distinto: lo que varía en las ventas se elige acá. */
export function PantallaConfigVentas() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['ventas', tenantId, 'config'],
    queryFn: () => api.ventas.config(),
  })

  return (
    <Shell titulo="Configuración de ventas" requiere={accesoDeRuta(contrato.ventas.guardarConfig)}>
      <Link to="/ventas" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todas las ventas
      </Link>
      {consulta.isPending && <div className="h-32 animate-pulse rounded-base bg-superficie" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}
      {consulta.data && <Formulario inicial={consulta.data} />}
    </Shell>
  )
}

function Formulario({ inicial }: { inicial: ConfigVentas }) {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  useVolver(() => void navegar({ to: '/ventas' }))
  const [descuento, setDescuento] = useState(inicial.descuentoMaximo?.toString() ?? '')
  const [exigeSaldoCero, setExige] = useState(inicial.exigeSaldoCero)
  const [cambios, setCambios] = useState(false)
  useCambiosSinGuardar(cambios)

  const valor = Number(descuento.replace(',', '.'))
  const descuentoMalo = descuento.trim() !== '' && (Number.isNaN(valor) || valor < 0 || valor > 100)

  const guardar = useMutation({
    mutationFn: () =>
      api.ventas.guardarConfig({
        descuentoMaximo: descuento.trim() ? valor : null,
        exigeSaldoCero,
      }),
    onSuccess: async () => {
      setCambios(false)
      await cache.invalidateQueries({ queryKey: ['ventas', tenantId] })
    },
    meta: { exito: 'Configuración guardada', error: mensajeGeneral },
  })
  const guardable = cambios && !descuentoMalo && !guardar.isPending
  useAtajo('global.guardar', () => guardable && guardar.mutate(), cambios)

  return (
    <section
      aria-label="Opciones"
      className="grid max-w-2xl gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <Campo
        etiqueta="Descuento máximo sin autorización (%)"
        ayuda="Vacío: sin límite. Pasarlo pide a alguien con permiso de autorizar ventas"
        inputMode="decimal"
        value={descuento}
        onChange={(e) => {
          setCambios(true)
          setDescuento(e.target.value)
        }}
      />
      {descuentoMalo && <p className="text-etiqueta text-critico">Es un porcentaje, de 0 a 100.</p>}
      <label className="inline-flex items-center gap-2 text-dato">
        <input
          type="checkbox"
          checked={exigeSaldoCero}
          onChange={(e) => {
            setCambios(true)
            setExige(e.target.checked)
          }}
        />
        Confirmar una venta sólo con todo pagado
      </label>
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
