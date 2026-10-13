import { contrato } from '@gpb/contracts'
import { MAXIMO_FOTOS, type MomentoFoto } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoBorrar, IconoCamara } from '../../componentes/iconos.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { achicar } from './FotosVehiculo.tsx'

type Orden = Awaited<ReturnType<typeof api.ordenes.ficha>>
type Foto = Orden['fotos'][number]

/** Mientras el auto está en el taller: se suman las de entrada y se dan de baja. */
const ABIERTA = [
  'recibida',
  'en_proceso',
  'esperando_repuesto',
  'esperando_autorizacion',
  'terminada',
  'facturada',
]

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Las fotos del auto en la ficha de la orden: las de cuando entró y las de cuando salió. Con
 * la orden abierta se suman las de entrada —las que no se sacaron en el mostrador, o las que
 * no se llegaron a subir— y se dan de baja, siempre preguntando antes.
 */
export function FotosDeLaOrden({ orden: o }: { orden: Orden }) {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const puedeSubir = usePuedeUsar(contrato.ordenes.subirFoto)
  const abierta = ABIERTA.includes(o.estado)
  const entrada = useRef<HTMLInputElement>(null)
  const deIngreso = o.fotos.filter((f) => f.momento === 'ingreso')

  const refrescar = () =>
    cache.invalidateQueries({ queryKey: ['ordenes', tenantId, 'ficha', o.id] })

  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      for (const a of archivos) {
        const imagen = await achicar(a)
        await api.ordenes.subirFoto({
          id: o.id,
          momento: 'ingreso',
          imagen: new File([imagen], 'foto.jpg', { type: imagen.type || 'image/jpeg' }),
        })
      }
    },
    onSettled: refrescar,
    meta: { exito: 'Fotos guardadas', error: mensajeGeneral },
  })

  const quitar = useMutation({
    mutationFn: (f: Foto) => api.ordenes.quitarFoto({ id: o.id, fotoId: f.id }),
    onSettled: refrescar,
    meta: { exito: 'Foto dada de baja', error: mensajeGeneral },
  })

  async function preguntarYQuitar(f: Foto) {
    const si = await confirmar({
      titulo: 'Dar de baja la foto',
      texto: 'Deja de verse en la orden. Queda en la auditoría, con tu nombre.',
      confirmar: 'Dar de baja',
      peligro: true,
    })
    if (si) quitar.mutate(f)
  }

  const quedan = MAXIMO_FOTOS - deIngreso.length

  return (
    <section
      aria-label="Fotos"
      className="overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Fotos</h2>
        {abierta && puedeSubir && (
          <span className="ml-auto">
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              aria-label="Sumar fotos de cuando entró"
              onChange={(e) => {
                const archivos = [...(e.target.files ?? [])].slice(0, quedan)
                if (archivos.length) subir.mutate(archivos)
                e.target.value = ''
              }}
            />
            <Boton
              tamano="chico"
              icono={<IconoCamara />}
              deshabilitado={subir.isPending || quedan <= 0}
              onClick={() => entrada.current?.click()}
            >
              {subir.isPending ? 'Subiendo…' : 'Agregar fotos'}
            </Boton>
          </span>
        )}
      </header>
      {!o.fotos.length && (
        <p className="px-3 py-4 text-dato text-texto-suave">
          No tiene fotos. Son optativas: si hace falta mostrar cómo entró el auto, agregalas acá.
        </p>
      )}
      {(['ingreso', 'egreso'] as const).map((momento) => {
        const fotos = o.fotos.filter((f) => f.momento === momento)
        if (!fotos.length) return null
        return (
          <div key={momento} className="grid gap-2 px-3 py-2.5">
            <h3 className="text-etiqueta font-medium text-texto-suave">
              {momento === 'ingreso' ? 'Al recibirlo' : 'Al entregarlo'}
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {fotos.map((f, i) => (
                <li key={f.id} className="grid content-start gap-1">
                  <ImagenFoto ordenId={o.id} foto={f} numero={i + 1} momento={momento} />
                  <span className="text-etiqueta">{f.nota ?? ''}</span>
                  <span className="text-etiqueta text-texto-tenue">
                    {[f.sacadaPor, FECHA.format(new Date(f.sacadaEn))].filter(Boolean).join(', ')}
                  </span>
                  {abierta && puedeSubir && (
                    <span>
                      <Boton
                        tamano="chico"
                        icono={<IconoBorrar />}
                        deshabilitado={quitar.isPending}
                        onClick={() => void preguntarYQuitar(f)}
                      >
                        Dar de baja
                      </Boton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

/** Traída por el cliente: un `<img>` no manda el token de la sesión. Abre grande en otra pestaña. */
function ImagenFoto({
  ordenId,
  foto,
  numero,
  momento,
}: {
  ordenId: string
  foto: Foto
  numero: number
  momento: MomentoFoto
}) {
  const imagen = useQuery({
    queryKey: ['foto', ordenId, foto.id],
    queryFn: async () =>
      URL.createObjectURL((await api.ordenes.foto({ id: ordenId, fotoId: foto.id })) as Blob),
    staleTime: Number.POSITIVE_INFINITY,
  })
  useEffect(() => {
    const url = imagen.data
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [imagen.data])
  const nombre = `Foto ${numero} ${momento === 'ingreso' ? 'al recibirlo' : 'al entregarlo'}`
  if (!imagen.data) {
    return <div className="aspect-[4/3] animate-pulse rounded-base bg-superficie-2" />
  }
  return (
    <a href={imagen.data} target="_blank" rel="noreferrer" aria-label={`Ver grande: ${nombre}`}>
      <img
        src={imagen.data}
        alt={nombre}
        className="aspect-[4/3] w-full rounded-base border border-borde object-cover"
      />
    </a>
  )
}
