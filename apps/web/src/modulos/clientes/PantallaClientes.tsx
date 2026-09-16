import { accesoDeRuta, CONDICIONES_IIBB, contrato, TIPOS_DOCUMENTO } from '@gpb/contracts'
import { cuitValido, formatearCuit, normalizarCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { ResultadoPadron } from '../../componentes/ResultadoPadron.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

// Por id y no importando la ruta: `rutas.tsx` importa esta pantalla.
const ruta = getRouteApi('/con-sesion/clientes')

export type Cliente = Awaited<ReturnType<typeof api.clientes.listar>>['datos'][number]
export type Catalogos = Awaited<ReturnType<typeof api.organizacion.catalogos>>
type TipoDocumento = 80 | 86 | 96
type CondicionIibb = (typeof CONDICIONES_IIBB)[number]

/** Qué se está editando. Uno por vez: el formulario abierto es el único lugar de F2 y Esc. */
type Edicion = null | { cliente?: Cliente }

export const IIBB: Record<CondicionIibb, string> = {
  local: 'Contribuyente local',
  convenio: 'Convenio Multilateral',
  exento: 'Exento',
  no_inscripto: 'No inscripto',
}

/** Consumidor final: lo que es la mayoría de los que entran por el mostrador. */
const CONSUMIDOR_FINAL = 5

/** «30-71234567-1» o «20.123.456», como está impreso en el documento. */
export function formatearDocumento(tipo: number, numero: string): string {
  if (tipo === 96) return numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return formatearCuit(numero)
}

export function nombreTipo(tipo: number): string {
  return TIPOS_DOCUMENTO[tipo as TipoDocumento] ?? 'Documento'
}

/**
 * Los clientes de la concesionaria.
 *
 * Se busca por lo que la persona tiene en la mano: el nombre, el CUIT o el DNI, con o sin
 * guiones. El alta completa con AFIP lo que se pueda, y si el CUIT ya es proveedor, no lo
 * duplica: la API le suma el rol de cliente a la misma identidad fiscal.
 */
export function PantallaClientes() {
  const navegar = ruta.useNavigate()
  const inicial = ruta.useSearch({ select: (s) => s.buscar ?? '' })
  // Lo tipeado vive en estado local y la URL lo copia: ver la pantalla de vehículos.
  const [buscar, setBuscarLocal] = useState(inicial)
  const [conDesactivados, setConDesactivados] = useState(false)
  const [edicion, setEdicion] = useState<Edicion>(null)
  const esEscritorio = useMedia(ES_ESCRITORIO)

  function setBuscar(valor: string) {
    setBuscarLocal(valor)
    void navegar({ search: { buscar: valor || undefined }, replace: true })
  }

  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.clientes.listar)
  const puedeCrear = usePuedeUsar(contrato.clientes.crear)
  const puedeEditar = usePuedeUsar(contrato.clientes.editar)
  const estado = conDesactivados ? 'todos' : 'activos'

  const consulta = useQuery({
    queryKey: ['clientes', tenantId, buscar, estado],
    queryFn: () =>
      api.clientes.listar({ pagina: 1, porPagina: 50, buscar: buscar || undefined, estado }),
    enabled: puedeVer,
  })
  const catalogos = useQuery({
    queryKey: ['catalogos', 'organizacion'],
    queryFn: () => api.organizacion.catalogos(),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: puedeVer,
  })

  const condicion = (codigo: number) =>
    catalogos.data?.condicionesIva.find((c) => c.codigo === codigo)?.descripcion ?? ''

  const datos = consulta.data?.datos ?? []

  return (
    <Shell
      titulo="Clientes"
      requiere={accesoDeRuta(contrato.clientes.listar)}
      acciones={
        puedeCrear && !edicion ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => setEdicion({})}>
            Nuevo cliente
          </Boton>
        ) : undefined
      }
    >
      {edicion && catalogos.data && (
        <Formulario
          key={edicion.cliente?.id ?? 'nuevo'}
          cliente={edicion.cliente}
          catalogos={catalogos.data}
          alTerminar={() => setEdicion(null)}
        />
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <span className="font-mono text-etiqueta text-texto-tenue">
            {consulta.data
              ? `${consulta.data.total} ${consulta.data.total === 1 ? 'cliente' : 'clientes'}`
              : '…'}
          </span>
          <label className="flex items-center gap-2 text-etiqueta text-texto-suave">
            <input
              type="checkbox"
              className="accent-marca"
              checked={conDesactivados}
              onChange={(e) => setConDesactivados(e.target.checked)}
            />
            Incluir desactivados
          </label>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Nombre, CUIT o DNI"
            aria-label="Buscar"
            className="h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-64"
          />
        </header>

        {consulta.isPending && <Esqueleto />}

        {consulta.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {consulta.error instanceof ORPCError && consulta.error.code === 'SIN_PERMISO'
              ? consulta.error.message
              : 'No se pudo traer el listado. Probá refrescar con F5.'}
          </p>
        )}

        {consulta.data && datos.length === 0 && (
          <p className="px-3 py-8 text-center text-dato text-texto-suave">
            {buscar
              ? `Ningún cliente coincide con «${buscar}».`
              : puedeCrear
                ? 'Todavía no hay clientes cargados. Dá de alta el primero con Nuevo cliente.'
                : 'Todavía no hay clientes cargados.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-dato">
              <thead>
                <tr>
                  {[
                    'Nombre o razón social',
                    'Documento',
                    'Condición frente al IVA',
                    'Contacto',
                    '',
                  ].map((c) => (
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
                {datos.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-superficie-2 ${c.activo ? '' : 'text-texto-tenue'}`}
                  >
                    <td className="h-fila border-b border-borde-suave px-3">
                      <span className="flex items-baseline gap-2">
                        <EnlaceFicha cliente={c} />
                        <Marcas cliente={c} />
                      </span>
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                      <span className="text-texto-tenue">{nombreTipo(c.tipoDocumento)}</span>{' '}
                      {formatearDocumento(c.tipoDocumento, c.numeroDocumento)}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                      {condicion(c.condicionIva)}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 text-etiqueta text-texto-suave">
                      {[c.telefono, c.email].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="h-fila border-b border-borde-suave px-3 text-right">
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => setEdicion({ cliente: c })}
                          className="text-etiqueta text-marca hover:underline"
                        >
                          Modificar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((c) => (
              <li
                key={c.id}
                className={`grid gap-0.5 px-3 py-2.5 ${c.activo ? '' : 'text-texto-tenue'}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-dato font-semibold">
                    <EnlaceFicha cliente={c} />
                  </span>
                  <Marcas cliente={c} />
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setEdicion({ cliente: c })}
                      className="ml-auto text-etiqueta text-marca hover:underline"
                    >
                      Modificar
                    </button>
                  )}
                </div>
                <span className="font-mono text-etiqueta text-texto-suave">
                  {nombreTipo(c.tipoDocumento)}{' '}
                  {formatearDocumento(c.tipoDocumento, c.numeroDocumento)}
                </span>
                <span className="text-etiqueta text-texto-tenue">
                  {[condicion(c.condicionIva), c.telefono].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

function EnlaceFicha({ cliente }: { cliente: Cliente }) {
  return (
    <Link
      to="/clientes/$id"
      params={{ id: cliente.id }}
      className="hover:text-marca hover:underline focus-visible:underline"
    >
      {cliente.razonSocial}
    </Link>
  )
}

/** Desactivado y proveedor, en palabras: el color solo no alcanza. */
export function Marcas({ cliente }: { cliente: Cliente }) {
  return (
    <>
      {!cliente.activo && <span className="text-etiqueta text-texto-tenue">Desactivado</span>}
      {cliente.esProveedor && (
        <span className="rounded-full border border-borde px-2 text-etiqueta text-texto-suave">
          También proveedor
        </span>
      )}
    </>
  )
}

export function Formulario({
  cliente,
  catalogos,
  alTerminar,
}: {
  cliente: Cliente | undefined
  catalogos: Catalogos
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const navegar = useNavigate()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const [tipoDocumento, setTipo] = useState<TipoDocumento>(
    (cliente?.tipoDocumento as TipoDocumento | undefined) ?? 80,
  )
  const [numero, setNumero] = useState(
    cliente ? formatearDocumento(cliente.tipoDocumento, cliente.numeroDocumento) : '',
  )
  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? '')
  const [condicionIva, setCondicionIva] = useState(cliente?.condicionIva ?? CONSUMIDOR_FINAL)
  const [domicilio, setDomicilio] = useState(cliente?.domicilio ?? '')
  const [localidad, setLocalidad] = useState(cliente?.localidad ?? '')
  const [codigoPostal, setCodigoPostal] = useState(cliente?.codigoPostal ?? '')
  const [provinciaCodigo, setProvincia] = useState<number | null>(cliente?.provinciaCodigo ?? null)
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [condicionIibb, setIibb] = useState<CondicionIibb>(cliente?.condicionIibb ?? 'no_inscripto')
  const [numeroIibb, setNumeroIibb] = useState(cliente?.numeroIibb ?? '')
  const [observaciones, setObservaciones] = useState(cliente?.observaciones ?? '')
  const [activo, setActivo] = useState(cliente?.activo ?? true)
  const [tocado, setTocado] = useState(false)

  const normalizado = normalizarCuit(numero)
  const esDni = tipoDocumento === 96
  // El documento se revisa acá, antes de mandar: el error vuelve al lado del campo.
  const documentoValido = esDni ? /^[0-9]{7,8}$/.test(normalizado) : cuitValido(normalizado)
  const documentoMal = !cliente && tocado && !documentoValido

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        razonSocial,
        condicionIva,
        domicilio,
        provinciaCodigo,
        localidad,
        codigoPostal,
        email,
        telefono,
        numeroIibb,
        condicionIibb,
        observaciones,
      }
      return cliente
        ? api.clientes.editar({ ...datos, id: cliente.id, activo })
        : api.clientes.crear({ ...datos, tipoDocumento, numeroDocumento: normalizado })
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['clientes', tenantId] })
      alTerminar()
    },
  })

  /**
   * Trae de AFIP lo que se pueda y completa el formulario. No guarda nada: quien carga
   * revisa y confirma.
   */
  const padron = useMutation({
    mutationFn: () => api.padron.consultar({ cuit: normalizado }),
    onSuccess: (c) => {
      setRazonSocial(c.razonSocial)
      // Si escribió un CUIL eligiendo CUIT, lo corrige AFIP y no la persona.
      if (c.tipoClave === 'CUIL') setTipo(86)
      if (c.tipoClave === 'CUIT') setTipo(80)
      if (c.condicionIva.codigo !== null) setCondicionIva(c.condicionIva.codigo)
      if (c.domicilio) {
        setDomicilio(c.domicilio.direccion ?? '')
        setLocalidad(c.domicilio.localidad ?? '')
        setCodigoPostal(c.domicilio.codigoPostal ?? '')
        setProvincia(c.domicilio.provinciaCodigo)
      }
    },
  })

  function consultarPadron() {
    setTocado(true)
    if (!esDni && cuitValido(normalizado)) padron.mutate()
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (!cliente && !documentoValido) return
    guardar.mutate()
  }

  const duplicado =
    guardar.error instanceof ORPCError && guardar.error.code === 'CLIENTE_DUPLICADO'
      ? (guardar.error.data as { id: string; razonSocial: string } | undefined)
      : undefined

  const titulo = cliente ? `Modificar ${cliente.razonSocial}` : 'Nuevo cliente'
  const puedeConsultar = !cliente && !esDni

  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>

      <form id="formulario-cliente" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
        <Selector
          etiqueta="Tipo de documento"
          valor={tipoDocumento}
          onChange={(v) => {
            setTipo(v ?? 80)
            if (v === 96) setCondicionIva(CONSUMIDOR_FINAL)
          }}
          opciones={Object.entries(TIPOS_DOCUMENTO).map(([valor, texto]) => ({
            valor: Number(valor) as TipoDocumento,
            texto,
          }))}
        />
        <Campo
          ref={cliente ? undefined : primerCampo}
          etiqueta={nombreTipo(tipoDocumento)}
          required
          inputMode="numeric"
          disabled={Boolean(cliente)}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onBlur={() => setTocado(true)}
          ayuda={
            cliente
              ? 'No se cambia: otro documento es otra persona'
              : documentoMal
                ? esDni
                  ? 'El DNI son 7 u 8 dígitos'
                  : `Ese ${nombreTipo(tipoDocumento)} no existe: revisá los números`
                : esDni
                  ? 'Con o sin puntos'
                  : 'Con o sin guiones'
          }
          aria-invalid={documentoMal}
        />
        {puedeConsultar ? (
          <div className="grid content-end gap-1">
            <Boton
              accion="clientes.consultarPadron"
              onClick={consultarPadron}
              deshabilitado={padron.isPending}
            >
              {padron.isPending ? 'Consultando a AFIP…' : 'Completar con AFIP'}
            </Boton>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        {puedeConsultar && (padron.isError || padron.data) && (
          <div className="md:col-span-3">
            <ResultadoPadron consulta={padron} avisarCuil={false} />
          </div>
        )}

        <Campo
          ref={cliente ? primerCampo : undefined}
          etiqueta={tipoDocumento === 80 ? 'Razón social' : 'Apellido y nombre'}
          required
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          ayuda={tipoDocumento === 80 ? undefined : 'Como figura en el documento: Gómez, Ana'}
        />
        <Selector
          etiqueta="Condición frente al IVA"
          valor={condicionIva}
          onChange={(v) => setCondicionIva(v ?? CONSUMIDOR_FINAL)}
          opciones={catalogos.condicionesIva.map((c) => ({
            valor: c.codigo,
            texto: c.descripcion,
          }))}
        />
        <Campo
          etiqueta="Teléfono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />

        <Campo
          etiqueta="Domicilio"
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
        />
        <Campo
          etiqueta="Localidad"
          value={localidad}
          onChange={(e) => setLocalidad(e.target.value)}
        />
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Selector
            etiqueta="Provincia"
            valor={provinciaCodigo}
            vacio="Sin especificar"
            onChange={setProvincia}
            opciones={catalogos.provincias.map((p) => ({ valor: p.codigo, texto: p.nombre }))}
          />
          <Campo
            etiqueta="Código postal"
            value={codigoPostal}
            onChange={(e) => setCodigoPostal(e.target.value)}
          />
        </div>

        <Campo
          etiqueta="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Selector
          etiqueta="Ingresos Brutos"
          valor={condicionIibb}
          onChange={(v) => setIibb(v ?? 'no_inscripto')}
          opciones={CONDICIONES_IIBB.map((c) => ({ valor: c, texto: IIBB[c] }))}
        />
        {condicionIibb === 'no_inscripto' ? (
          <div className="hidden md:block" />
        ) : (
          <Campo
            etiqueta="Número de Ingresos Brutos"
            value={numeroIibb}
            onChange={(e) => setNumeroIibb(e.target.value)}
          />
        )}

        <div className="md:col-span-2">
          <Campo
            etiqueta="Observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
        {cliente && (
          <label className="flex items-center gap-2 self-end pb-2 text-dato">
            <input
              type="checkbox"
              className="accent-marca"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Activo
            {!activo && (
              <span className="text-etiqueta text-atencion">no se le va a poder facturar</span>
            )}
          </label>
        )}
      </form>

      {cliente?.esProveedor && (
        <p className="text-etiqueta text-texto-suave">
          También es proveedor: el domicilio y los datos fiscales que cambies acá cambian para los
          dos.
        </p>
      )}

      {duplicado ? (
        <p role="alert" className="flex flex-wrap items-baseline gap-2 text-dato text-critico">
          Ese documento ya está cargado como cliente, a nombre de {duplicado.razonSocial}.
          <button
            type="button"
            onClick={() => {
              alTerminar()
              void navegar({ to: '/clientes/$id', params: { id: duplicado.id } })
            }}
            className="text-etiqueta text-marca hover:underline"
          >
            Abrir su ficha
          </button>
        </p>
      ) : (
        guardar.isError && (
          <p role="alert" className="text-dato text-critico">
            {guardar.error instanceof ORPCError
              ? guardar.error.message
              : 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'}
          </p>
        )
      )}

      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() =>
            (
              document.getElementById('formulario-cliente') as HTMLFormElement | null
            )?.requestSubmit()
          }
        >
          Guardar
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </section>
  )
}

/** Esqueletos con la forma de lo que viene, no un spinner que hace saltar la pantalla. */
function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
