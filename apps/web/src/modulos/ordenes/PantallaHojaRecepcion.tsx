import { accesoDeRuta, contrato } from '@gpb/contracts'
import {
  FORMATOS_HOJA,
  MAXIMO_BYTES_HOJA,
  MINIMO_LADO_HOJA,
  TIPOS_HOJA_NOMBRE,
  type TipoHoja,
} from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoBorrar } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { PuntosDeRevision } from './PuntosDeRevision.tsx'

type Casillero = Awaited<ReturnType<typeof api.hojas.listar>>['datos'][number]

const KB = (bytes: number) => `${Math.round(bytes / 1024)} KB`

/**
 * Los dibujos sobre los que se marca lo que trae el vehículo al entrar.
 *
 * Uno por tipo de carrocería, con todas las vistas adentro —la planta, los costados, el frente
 * y la cola—, que es como vienen las hojas de inspección de siempre. **Las imágenes las pone
 * cada concesionaria**: el sistema trae un juego para que un taller que recién entra pueda
 * recibir un auto el primer día, y el que quiere el suyo lo reemplaza.
 *
 * Reemplazar no pisa: la imagen anterior queda, porque hay órdenes ya firmadas que la
 * muestran. Por eso «Quitar» dice que vuelve a la del sistema y no que borra.
 */
export function PantallaHojaRecepcion() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.hojas.listar)
  const puedeConfigurar = usePuedeUsar(contrato.hojas.subir)

  const listado = useQuery({
    queryKey: ['hojas', tenantId],
    queryFn: () => api.hojas.listar(),
    enabled: puedeVer,
  })

  const cache = useQueryClient()
  const invalidar = () => cache.invalidateQueries({ queryKey: ['hojas', tenantId] })

  const subir = useMutation({
    mutationFn: (v: { tipo: TipoHoja; imagen: File }) => api.hojas.subir(v),
    onSuccess: invalidar,
    meta: { exito: 'El dibujo quedó cambiado', error: mensajeGeneral },
  })

  const quitar = useMutation({
    mutationFn: (v: { tipo: TipoHoja }) => api.hojas.quitar(v),
    onSuccess: invalidar,
    meta: { exito: 'Volvió el dibujo que trae el sistema', error: mensajeGeneral },
  })

  async function volverAlDelSistema(c: Casillero) {
    const si = await confirmar({
      titulo: `¿Volver al dibujo del sistema para ${TIPOS_HOJA_NOMBRE[c.tipo]}?`,
      texto:
        'El tuyo no se borra: las órdenes que se recibieron con él lo siguen mostrando y se ' +
        'imprimen igual. De acá en más se usa el del sistema.',
      confirmar: 'Volver al del sistema',
      peligro: true,
    })
    if (si) quitar.mutate({ tipo: c.tipo })
  }

  return (
    <Shell titulo="Hoja de recepción" requiere={accesoDeRuta(contrato.hojas.listar)}>
      <h2 className="font-display text-ui font-semibold">Dibujos del vehículo</h2>
      <p className="max-w-3xl text-dato text-texto-suave">
        El dibujo sobre el que se marcan los rayones y los golpes cuando entra un vehículo, uno por
        tipo de carrocería. Queda impreso en la orden que firma el cliente. Podés usar los que trae
        el sistema o subir los tuyos: PNG o JPEG, desde {MINIMO_LADO_HOJA} píxeles de lado y hasta{' '}
        {Math.round(MAXIMO_BYTES_HOJA / 1024 / 1024)} MB. Son los dos formatos que la orden impresa
        sabe embeber.
      </p>

      {listado.isPending && <Esqueleto />}
      {listado.isError && (
        <p role="alert" className="text-dato text-critico">
          No se pudieron cargar los dibujos. {mensajeGeneral(listado.error)}
        </p>
      )}

      {listado.data && (
        <ul aria-label="Dibujos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {listado.data.datos.map((c) => (
            <Casilla
              key={c.tipo}
              casillero={c}
              editable={puedeConfigurar}
              ocupado={subir.isPending || quitar.isPending}
              alElegir={(imagen) => subir.mutate({ tipo: c.tipo, imagen })}
              alQuitar={() => void volverAlDelSistema(c)}
            />
          ))}
        </ul>
      )}

      <PuntosDeRevision />
    </Shell>
  )
}

function Casilla({
  casillero: c,
  editable,
  ocupado,
  alElegir,
  alQuitar,
}: {
  casillero: Casillero
  editable: boolean
  ocupado: boolean
  alElegir: (imagen: File) => void
  alQuitar: () => void
}) {
  const archivo = useRef<HTMLInputElement>(null)

  return (
    <li className="grid content-start gap-2 rounded-base border border-borde bg-superficie p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-display text-dato font-semibold">{TIPOS_HOJA_NOMBRE[c.tipo]}</h2>
        <span className="text-etiqueta text-texto-tenue">
          {!c.propia
            ? 'Sin dibujo'
            : c.propia.porOmision
              ? 'El de VW, que trae el sistema'
              : `${c.propia.ancho}×${c.propia.alto} · ${KB(c.propia.bytes)}`}
        </span>
      </div>
      <Vistazo imagen={c.propia} tipo={c.tipo} />
      {editable && (
        <div className="flex flex-wrap gap-1.5">
          {/* El input va escondido y lo abre el botón: así se llega con Tab y con Enter. */}
          <input
            ref={archivo}
            type="file"
            accept={FORMATOS_HOJA.join(',')}
            className="sr-only"
            aria-label={`Elegir el dibujo de ${TIPOS_HOJA_NOMBRE[c.tipo]}`}
            onChange={(e) => {
              const elegido = e.target.files?.[0]
              // El valor se limpia para que elegir el mismo archivo otra vez vuelva a disparar.
              e.target.value = ''
              if (elegido) alElegir(elegido)
            }}
          />
          <Boton tamano="chico" deshabilitado={ocupado} onClick={() => archivo.current?.click()}>
            {c.propia && !c.propia.porOmision ? 'Cambiar' : 'Subir el mío'}
          </Boton>
          {c.propia && !c.propia.porOmision && (
            <Boton
              tamano="chico"
              icono={<IconoBorrar />}
              deshabilitado={ocupado}
              onClick={alQuitar}
            >
              Quitar
            </Boton>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * El dibujo, traído por el cliente y no por la dirección directa en el `src`.
 *
 * La ruta pide permiso como cualquier otra, y un `<img>` no manda el token de la sesión: la
 * alternativa sería abrirla sin permiso o firmar direcciones, y una dirección firmada que
 * alguien reenvía sigue abriendo la hoja de un cliente hasta que vence.
 */
function Vistazo({ imagen, tipo }: { imagen: Casillero['propia']; tipo: TipoHoja }) {
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const id = imagen?.id

  useEffect(() => {
    if (!id) {
      setUrl(null)
      return
    }
    let vivo = true
    let creada: string | undefined
    setFallo(false)
    void api.hojas
      .imagen({ id })
      .then((archivo) => {
        if (!vivo) return
        creada = URL.createObjectURL(archivo as Blob)
        setUrl(creada)
      })
      .catch(() => vivo && setFallo(true))
    return () => {
      vivo = false
      setUrl(null)
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [id])

  return (
    <div className="grid h-48 place-items-center overflow-hidden rounded-base bg-superficie-2">
      {url ? (
        <img
          src={url}
          alt={`Dibujo de ${TIPOS_HOJA_NOMBRE[tipo]}`}
          className="max-h-48 max-w-full object-contain"
        />
      ) : (
        <span className="px-2 text-center text-etiqueta text-texto-tenue">
          {fallo ? 'No se pudo cargar' : id ? '…' : 'Sin dibujo propio'}
        </span>
      )}
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-base border border-borde bg-superficie"
        />
      ))}
    </div>
  )
}
