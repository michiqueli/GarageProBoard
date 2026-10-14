import { MAXIMO_MOTIVO_CORRECCION, MINIMO_MOTIVO_CORRECCION } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

type Orden = Awaited<ReturnType<typeof api.ordenes.ficha>>
type Sesion = Orden['sesiones'][number]

/** «2026-10-13T08:30», lo que entiende un `<input type="datetime-local">`, en la hora local. */
function paraElCampo(iso: string): string {
  const d = new Date(iso)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/**
 * Corregir una sesión de trabajo, ahí en su renglón. Regla 3 del control de tiempos: **con
 * motivo, siempre**, y el antes y el después quedan escritos. Una abierta arranca con el fin en
 * ahora: es el caso del que se fue sin pasar la credencial.
 */
export function CorregirSesion({
  orden,
  sesion: s,
  alTerminar,
  guardada,
}: {
  orden: Orden
  sesion: Sesion
  alTerminar: () => void
  guardada: (o: Orden) => void | Promise<void>
}) {
  const [inicio, setInicio] = useState(paraElCampo(s.inicio))
  const [fin, setFin] = useState(paraElCampo(s.fin ?? new Date().toISOString()))
  const [motivo, setMotivo] = useState('')
  const motivoCorto = motivo.trim().length < MINIMO_MOTIVO_CORRECCION

  const corregir = useMutation({
    mutationFn: () =>
      api.ordenes.corregirSesion({
        id: orden.id,
        sesionId: s.id,
        inicio: new Date(inicio).toISOString(),
        fin: new Date(fin).toISOString(),
        motivo: motivo.trim(),
      }),
    onSuccess: async (o) => {
      await guardada(o)
      alTerminar()
    },
    meta: {
      exito: 'Tiempo corregido',
      error: (error) =>
        error instanceof ORPCError && error.code === 'TIEMPO_INVALIDO'
          ? String((error.data as { motivo: string }).motivo)
          : mensajeGeneral(error),
    },
  })

  return (
    <form
      aria-label={`Corregir el tiempo de ${s.nombre}`}
      className="grid w-full gap-3 rounded-base border border-borde bg-fondo p-2.5 sm:grid-cols-[repeat(2,12rem)_1fr]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!motivoCorto && !corregir.isPending) corregir.mutate()
      }}
    >
      <Campo
        etiqueta="Empezó"
        type="datetime-local"
        value={inicio}
        onChange={(e) => setInicio(e.target.value)}
      />
      <Campo
        etiqueta="Terminó"
        type="datetime-local"
        value={fin}
        onChange={(e) => setFin(e.target.value)}
      />
      <Campo
        etiqueta="Por qué se corrige"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, MAXIMO_MOTIVO_CORRECCION))}
        ayuda="Obligatorio: queda escrito con tu nombre"
      />
      <span className="flex gap-2 sm:col-span-3">
        <Boton
          tamano="chico"
          variante="principal"
          deshabilitado={motivoCorto || corregir.isPending}
          onClick={() => corregir.mutate()}
        >
          {corregir.isPending ? 'Corrigiendo…' : 'Corregir'}
        </Boton>
        <Boton tamano="chico" onClick={alTerminar}>
          Cancelar
        </Boton>
      </span>
    </form>
  )
}
