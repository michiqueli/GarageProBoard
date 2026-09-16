import { accesoDeRuta, contrato } from '@gpb/contracts'
import { formatearCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

const ruta = getRouteApi('/con-sesion/empresas/$id/certificado-afip')

type Estado = Awaited<ReturnType<typeof api.certificados.estado>>
type Prueba = Awaited<ReturnType<typeof api.certificados.probar>>

const MONOTRIBUTO = 6
const DIA = 86_400_000

/** «24/02/2028», en la hora de Argentina. */
function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

const ENTORNO = { produccion: 'Producción', homologacion: 'Homologación' } as const

/** Qué hacer con cada certificado que no sirve. */
function motivoRechazo(motivo: string, estado: Estado): string {
  const { razonSocial, cuit } = estado.empresa
  switch (motivo) {
    case 'ILEGIBLE':
      return 'Eso no es un certificado. Subí el archivo .crt que descargaste de ARCA.'
    case 'NO_ES_DE_AFIP':
      return 'Ese certificado no lo emitió AFIP. Descargalo de «Administración de Certificados Digitales».'
    case 'NO_CORRESPONDE_AL_PEDIDO':
      return 'Ese certificado es de otro pedido. En ARCA, cargá el pedido que descargaste acá y bajá el certificado que te dé.'
    case 'OTRO_CUIT':
      return `Ese certificado es de otro CUIT. Entrá a ARCA con la clave fiscal de ${razonSocial} (${formatearCuit(cuit)}).`
    case 'VENCIDO':
      return 'Ese certificado está vencido. Generá uno nuevo en ARCA con el mismo pedido.'
    case 'TODAVIA_NO_VIGENTE':
      return 'Ese certificado todavía no está vigente. Revisá la fecha de la computadora o probá en unos minutos.'
    default:
      return 'El certificado no sirve para esta empresa.'
  }
}

function mensajeDe(error: unknown, estado?: Estado): ReactNode {
  if (error instanceof ORPCError) {
    const datos = error.data as { motivo?: string; detalle?: string } | undefined
    if (error.code === 'CERTIFICADO_RECHAZADO' && datos?.motivo && estado) {
      return motivoRechazo(datos.motivo, estado)
    }
    if (error.code === 'AFIP_NO_ACEPTA') {
      return (
        <>
          AFIP no dejó facturar con este certificado. Casi siempre es el paso 4: la relación tiene
          que estar hecha con el <b>computador</b>, no con el CUIT.
          {datos?.detalle && (
            <span className="mt-1 block font-mono text-etiqueta">AFIP dijo: {datos.detalle}</span>
          )}
        </>
      )
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/pkcs10' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/**
 * El asistente del certificado de AFIP de una razón social. Ver
 * `docs/tecnicos/afip-certificados.md`.
 *
 * Quien lo usa suele ser el contador o el administrativo, no alguien que sabe qué es un
 * CSR: los pasos van en el orden en que se hacen en ARCA, con los nombres de los menús
 * de ARCA, y cada error dice qué hacer. El sistema hace la parte técnica: genera la
 * clave, que no se descarga nunca, y revisa el certificado antes de aceptarlo.
 */
export function PantallaCertificadoAfip() {
  const { id } = ruta.useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.certificados.estado)
  const cache = useQueryClient()
  const clave = ['certificado-afip', tenantId, id]
  const [prueba, setPrueba] = useState<Prueba | null>(null)
  const [renovando, setRenovando] = useState(false)

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => api.certificados.estado({ empresaId: id }),
    enabled: puedeVer,
  })
  const estado = consulta.data

  const actualizar = (nuevo: Estado) => cache.setQueryData(clave, nuevo)

  const probar = useMutation({
    mutationFn: () => api.certificados.probar({ empresaId: id }),
    onSuccess: (r) => {
      setPrueba(r)
      setRenovando(false)
      actualizar(r.estado)
    },
  })

  const activo = estado?.activo
  const pendiente = estado?.pendiente
  // En qué paso está: sin pedido, el 1; con pedido sin certificado, el 2 y 3; con
  // certificado, del 4 al 6, que se hacen en ARCA y se confirman con la prueba.
  const paso = !pendiente ? 1 : !pendiente.conCertificado ? 2 : 4
  const mostrarAsistente = !activo || pendiente || renovando

  return (
    <Shell titulo="Certificado de AFIP" requiere={accesoDeRuta(contrato.certificados.estado)}>
      <Link to="/empresas" className="w-fit text-etiqueta text-marca hover:underline">
        ← Empresas y sucursales
      </Link>

      {consulta.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {consulta.error instanceof ORPCError && consulta.error.code === 'NO_ENCONTRADA'
            ? 'Esa razón social no existe. Elegila desde Empresas y sucursales.'
            : mensajeDe(consulta.error)}
        </p>
      )}

      {estado && (
        <>
          <section
            aria-label="Certificado activo"
            className="grid gap-2 rounded-base border border-borde bg-superficie px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-dato font-semibold">{estado.empresa.razonSocial}</h2>
              <span className="font-mono text-etiqueta text-texto-suave">
                {formatearCuit(estado.empresa.cuit)}
              </span>
            </div>
            {activo ? (
              <Activo
                activo={activo}
                probando={probar.isPending}
                // Con un certificado nuevo sin probar, la prueba es la del paso 6.
                alProbar={pendiente?.conCertificado ? undefined : () => probar.mutate()}
                alRenovar={!pendiente && !renovando ? () => setRenovando(true) : undefined}
              />
            ) : (
              <p className="text-dato text-atencion">
                Todavía no factura: falta el certificado. Seguí los pasos de abajo.
              </p>
            )}
            {probar.isError && !pendiente?.conCertificado && (
              <p role="alert" className="text-dato text-critico">
                {mensajeDe(probar.error, estado)}
              </p>
            )}
          </section>

          {prueba && <ResultadoPrueba prueba={prueba} />}

          {mostrarAsistente && (
            <ol aria-label="Pasos" className="grid gap-2">
              <Paso numero={1} titulo="Crear el pedido de certificado" paso={paso}>
                <PasoPedido
                  estado={estado}
                  alTerminar={(nuevo) => {
                    setPrueba(null)
                    actualizar(nuevo)
                  }}
                />
              </Paso>

              <Paso numero={2} titulo="Crear el computador en ARCA" paso={paso} tambienActual={3}>
                <ol className="grid list-decimal gap-1 pl-5 text-dato">
                  <li>Entrá a ARCA con la clave fiscal de {estado.empresa.razonSocial}.</li>
                  <li>
                    Abrí <b>Administración de Certificados Digitales</b>. Si no aparece, agregalo
                    desde <b>Administrador de Relaciones de Clave Fiscal</b>.
                  </li>
                  <li>
                    Agregá un alias con el nombre <b>{pendiente?.alias ?? 'del pedido'}</b>, cargá
                    el pedido que descargaste y descargá el certificado (.crt).
                  </li>
                </ol>
              </Paso>

              <Paso numero={3} titulo="Subir el certificado" paso={paso} tambienActual={2}>
                <PasoCertificado estado={estado} alTerminar={actualizar} />
              </Paso>

              <Paso numero={4} titulo="Activar la facturación electrónica" paso={paso}>
                <ol className="grid list-decimal gap-1 pl-5 text-dato">
                  <li>
                    En ARCA, <b>Administrador de Relaciones de Clave Fiscal</b> → Nueva relación.
                  </li>
                  <li>
                    Buscá ARCA → WebServices → <b>Facturación Electrónica</b>.
                  </li>
                </ol>
                <p className="rounded-base border border-atencion px-3 py-2 text-dato font-semibold text-atencion">
                  El representante es el computador «{pendiente?.alias ?? 'del pedido'}», no el
                  CUIT. Es el error más común: con el CUIT parece hecho, y AFIP rechaza igual.
                </p>
              </Paso>

              <Paso numero={5} titulo="Crear el punto de venta" paso={paso}>
                <p className="text-dato">
                  En ARCA, <b>Administración de puntos de venta y domicilios</b> → nuevo punto de
                  venta, con el sistema{' '}
                  <b>
                    {estado.empresa.condicionIva === MONOTRIBUTO
                      ? 'Factura Electrónica - Monotributo - Web Services'
                      : 'RECE para aplicativo y web services'}
                  </b>
                  . Usá uno nuevo para este sistema: si otro programa factura con el mismo número,
                  se pisan. Después cargalo en{' '}
                  <Link to="/empresas" className="text-marca hover:underline">
                    Empresas y sucursales
                  </Link>
                  .
                </p>
              </Paso>

              <Paso numero={6} titulo="Probar contra AFIP" paso={paso}>
                <p className="text-dato text-texto-suave">
                  Inicia sesión en AFIP y trae los puntos de venta habilitados. No emite nada.
                  {activo && ' Si sale bien, este certificado reemplaza al activo.'}
                </p>
                <div>
                  <Boton
                    variante={paso === 4 ? 'principal' : 'normal'}
                    deshabilitado={!pendiente?.conCertificado || probar.isPending}
                    onClick={() => probar.mutate()}
                  >
                    {probar.isPending ? 'Probando con AFIP…' : 'Probar contra AFIP'}
                  </Boton>
                </div>
                {probar.isError && pendiente?.conCertificado && (
                  <p role="alert" className="text-dato text-critico">
                    {mensajeDe(probar.error, estado)}
                  </p>
                )}
              </Paso>
            </ol>
          )}
        </>
      )}
    </Shell>
  )
}

function Activo({
  activo,
  probando,
  alProbar,
  alRenovar,
}: {
  activo: NonNullable<Estado['activo']>
  probando: boolean
  alProbar: (() => void) | undefined
  alRenovar: (() => void) | undefined
}) {
  const hasta = activo.vigenteHasta ? new Date(activo.vigenteHasta) : null
  const dias = hasta ? Math.floor((hasta.getTime() - Date.now()) / DIA) : null
  const vencido = dias !== null && dias < 0

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {vencido ? (
        <span className="rounded-full bg-critico px-2 text-etiqueta font-semibold text-fondo">
          Vencido
        </span>
      ) : (
        <span className="rounded-full border border-ok px-2 text-etiqueta font-semibold text-ok">
          Activo
        </span>
      )}
      <span className="text-dato">
        Computador <b>{activo.alias}</b>
        {activo.entorno && ` · ${ENTORNO[activo.entorno]}`}
        {hasta && ` · vence el ${fecha(hasta.toISOString())}`}
      </span>
      {dias !== null && !vencido && dias <= 30 && (
        <span className="text-etiqueta font-semibold text-atencion">
          Faltan {dias} {dias === 1 ? 'día' : 'días'}: renovalo ahora, sin cortar la facturación
        </span>
      )}
      {vencido && (
        <span className="text-etiqueta font-semibold text-critico">
          No se puede facturar hasta renovarlo
        </span>
      )}
      <span className="ml-auto flex gap-2">
        {alProbar && (
          <Boton variante="sutil" deshabilitado={probando} onClick={alProbar}>
            {probando ? 'Probando…' : 'Probar'}
          </Boton>
        )}
        {alRenovar && <Boton onClick={alRenovar}>Renovar</Boton>}
      </span>
    </div>
  )
}

function Paso({
  numero,
  titulo,
  paso,
  tambienActual,
  children,
}: {
  numero: number
  titulo: string
  paso: number
  /** El 2 y el 3 van juntos: se sube el certificado apenas se lo descarga de ARCA. */
  tambienActual?: number
  children: ReactNode
}) {
  const hecho = numero < paso && tambienActual !== paso
  const actual = numero === paso || tambienActual === paso || (paso === 4 && numero > 4)
  return (
    <li
      aria-label={`Paso ${numero}: ${titulo}`}
      aria-current={actual ? 'step' : undefined}
      className={`grid gap-2 rounded-base border bg-superficie px-3 py-2.5 ${
        actual ? 'border-marca' : 'border-borde'
      }`}
    >
      <h3 className="flex items-center gap-2 text-dato font-semibold">
        <span
          className={`inline-flex size-5 items-center justify-center rounded-full text-etiqueta ${
            hecho
              ? 'bg-ok text-fondo'
              : actual
                ? 'bg-marca text-fondo'
                : 'border border-borde text-texto-suave'
          }`}
        >
          {hecho ? '✓' : numero}
        </span>
        <span className={hecho ? 'text-texto-suave' : ''}>{titulo}</span>
      </h3>
      {(actual || numero === 1) && children}
    </li>
  )
}

function PasoPedido({ estado, alTerminar }: { estado: Estado; alTerminar: (e: Estado) => void }) {
  const pendiente = estado.pendiente
  const [alias, setAlias] = useState(pendiente?.alias ?? 'garageproboard')
  const [otro, setOtro] = useState(false)

  const pedir = useMutation({
    mutationFn: () => api.certificados.pedir({ empresaId: estado.empresa.id, alias }),
    onSuccess: (nuevo) => {
      setOtro(false)
      alTerminar(nuevo)
      if (nuevo.pendiente) descargar(`${nuevo.pendiente.alias}.csr`, nuevo.pendiente.pedido)
    },
  })

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    pedir.mutate()
  }

  if (pendiente && !otro) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-dato">
        <span>
          Pedido <b>{pendiente.alias}</b>, generado el {fecha(pendiente.creadoEn)}.
        </span>
        <button
          type="button"
          onClick={() => descargar(`${pendiente.alias}.csr`, pendiente.pedido)}
          className="text-marca hover:underline"
        >
          Descargar el pedido (.csr)
        </button>
        <button
          type="button"
          onClick={() => setOtro(true)}
          className="text-etiqueta text-texto-suave hover:underline"
        >
          Generar otro
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="grid gap-2">
      <p className="text-dato text-texto-suave">
        El sistema genera la clave y el pedido. La clave queda guardada cifrada y no hace falta
        descargarla: ARCA no la pide.
        {otro && ' El pedido anterior deja de servir.'}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo
          etiqueta="Nombre del computador en ARCA"
          required
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          ayuda="Letras, números o guiones, sin espacios"
        />
        <button
          type="submit"
          disabled={pedir.isPending}
          className="h-campo rounded-base border border-marca bg-marca-suave px-3 text-dato font-semibold text-marca disabled:opacity-40"
        >
          {pedir.isPending ? 'Generando…' : 'Generar y descargar el pedido'}
        </button>
      </div>
      {pedir.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeDe(pedir.error, estado)}
        </p>
      )}
    </form>
  )
}

function PasoCertificado({
  estado,
  alTerminar,
}: {
  estado: Estado
  alTerminar: (e: Estado) => void
}) {
  const pendiente = estado.pendiente
  const cargar = useMutation({
    mutationFn: (certificado: string) =>
      api.certificados.cargar({ empresaId: estado.empresa.id, certificado }),
    onSuccess: alTerminar,
  })

  if (pendiente?.conCertificado) {
    return (
      <p className="text-dato">
        Certificado de {pendiente.entorno ? ENTORNO[pendiente.entorno].toLowerCase() : 'AFIP'},
        vigente hasta el {pendiente.vigenteHasta ? fecha(pendiente.vigenteHasta) : '—'}. Falta
        probarlo.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-dato">
        <span className="text-etiqueta text-texto-suave">El archivo .crt que te dio ARCA</span>
        <input
          type="file"
          accept=".crt,.pem,.cer"
          disabled={!pendiente || cargar.isPending}
          onChange={async (e) => {
            const archivo = e.target.files?.[0]
            if (archivo) cargar.mutate(await archivo.text())
            e.target.value = ''
          }}
          className="text-dato file:mr-3 file:h-campo file:rounded-base file:border file:border-borde file:bg-superficie-2 file:px-3 file:text-texto disabled:opacity-40"
        />
      </label>
      {cargar.isPending && <p className="text-dato text-texto-suave">Revisando el certificado…</p>}
      {cargar.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeDe(cargar.error, estado)}
        </p>
      )}
    </div>
  )
}

function ResultadoPrueba({ prueba }: { prueba: Prueba }) {
  const habilitados = prueba.puntosDeVenta.filter((p) => !p.bloqueado && !p.dadoDeBaja)
  return (
    <section
      aria-label="Resultado de la prueba"
      className="grid gap-2 rounded-base border border-ok bg-superficie px-3 py-2.5"
    >
      <p className="text-dato font-semibold text-ok">
        AFIP aceptó el certificado: ya se puede facturar con él.
      </p>
      {prueba.faltanEnAfip.length > 0 && (
        <p role="alert" className="text-dato text-atencion">
          {prueba.faltanEnAfip.length === 1 ? 'El punto de venta' : 'Los puntos de venta'}{' '}
          {prueba.faltanEnAfip.map((n) => String(n).padStart(4, '0')).join(', ')}{' '}
          {prueba.faltanEnAfip.length === 1 ? 'está cargado' : 'están cargados'} acá pero AFIP no
          {prueba.faltanEnAfip.length === 1 ? ' lo tiene habilitado' : ' los tiene habilitados'}{' '}
          para web services. Revisá el paso 5.
        </p>
      )}
      {habilitados.length === 0 ? (
        <p className="text-dato text-atencion">
          AFIP no tiene ningún punto de venta para web services en este CUIT. Creá uno (paso 5).
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {prueba.puntosDeVenta.map((p) => (
            <li
              key={p.numero}
              className={`inline-flex items-center gap-1.5 rounded-base border px-2 py-0.5 text-etiqueta ${
                p.bloqueado || p.dadoDeBaja
                  ? 'border-borde-suave text-texto-tenue line-through'
                  : 'border-borde'
              }`}
            >
              <span className="font-mono">{String(p.numero).padStart(4, '0')}</span>
              {p.cargado ? (
                <span className="text-ok">cargado</span>
              ) : (
                <span className="text-texto-suave">sin cargar</span>
              )}
              {p.bloqueado && <span>bloqueado</span>}
              {p.dadoDeBaja && <span>dado de baja</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
