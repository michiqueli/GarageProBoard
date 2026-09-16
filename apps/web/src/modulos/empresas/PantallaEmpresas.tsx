import { accesoDeRuta, contrato } from '@gpb/contracts'
import { cuitValido, formatearCuit, normalizarCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Empresa = Awaited<ReturnType<typeof api.organizacion.listar>>['datos'][number]
type Sucursal = Empresa['sucursales'][number]
type PuntoVenta = Sucursal['puntosVenta'][number]
type Catalogos = Awaited<ReturnType<typeof api.organizacion.catalogos>>

/** Qué se está editando. Uno por vez: el formulario abierto es el único lugar de F2 y Esc. */
type Edicion =
  | null
  | { tipo: 'empresa'; empresa?: Empresa }
  | { tipo: 'sucursal'; empresa: Empresa; sucursal?: Sucursal }
  | { tipo: 'puntoVenta'; sucursal: Sucursal; puntoVenta?: PuntoVenta }

const USOS = { facturacion: 'Facturación', remito: 'Remitos', otro: 'Otro' } as const

/** Un error dice qué hacer. El de la sucursal con usuarios, además, a quiénes. */
function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) {
    const usuarios = (error.data as { usuarios?: string[] } | undefined)?.usuarios
    if (usuarios?.length) {
      return `No se puede desactivar: ${usuarios.join(', ')} sólo entran a esta sucursal. Dales acceso a otra desde Usuarios.`
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * Las razones sociales de la concesionaria, con sus sucursales y los puntos de venta de
 * cada una.
 *
 * Se ve el árbol entero porque así lo piensa quien lo carga: «Litoral SAS tiene Casa
 * Central y Rafaela, y Casa Central factura con el punto de venta 2». Una SAS por
 * sucursal es tan normal como una SAS con varias.
 */
export function PantallaEmpresas() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.organizacion.listar)
  const puedeCrear = usePuedeUsar(contrato.organizacion.crearEmpresa)
  const puedeEditar = usePuedeUsar(contrato.organizacion.editarEmpresa)
  const [edicion, setEdicion] = useState<Edicion>(null)

  const listado = useQuery({
    queryKey: ['empresas', tenantId],
    queryFn: () => api.organizacion.listar(),
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

  return (
    <Shell
      titulo="Empresas y sucursales"
      requiere={accesoDeRuta(contrato.organizacion.listar)}
      acciones={
        puedeCrear && !edicion ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            onClick={() => setEdicion({ tipo: 'empresa' })}
          >
            Nueva razón social
          </Boton>
        ) : undefined
      }
    >
      {edicion && catalogos.data && (
        <Formulario
          key={JSON.stringify(edicion)}
          edicion={edicion}
          catalogos={catalogos.data}
          alTerminar={() => setEdicion(null)}
        />
      )}

      {listado.isPending && <Esqueleto />}
      {listado.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeDe(listado.error)}
        </p>
      )}

      {listado.data?.datos.map((e) => (
        <section
          key={e.id}
          aria-label={e.razonSocial}
          className="overflow-hidden rounded-base border border-borde bg-superficie"
        >
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-borde px-3 py-2">
            <h2 className="font-display text-dato font-semibold">{e.razonSocial}</h2>
            <span className="font-mono text-etiqueta text-texto-suave">
              {formatearCuit(e.cuit)}
            </span>
            <span className="text-etiqueta text-texto-tenue">{condicion(e.condicionIva)}</span>
            {puedeEditar && (
              <span className="ml-auto flex gap-2">
                <Enlace onClick={() => setEdicion({ tipo: 'empresa', empresa: e })}>
                  Modificar
                </Enlace>
                {puedeCrear && (
                  <Enlace onClick={() => setEdicion({ tipo: 'sucursal', empresa: e })}>
                    Nueva sucursal
                  </Enlace>
                )}
              </span>
            )}
          </header>

          {e.sucursales.length === 0 ? (
            <p className="px-3 py-4 text-dato text-texto-suave">
              Todavía no tiene sucursales. Sin una, no se puede facturar con esta razón social.
            </p>
          ) : (
            <ul className="divide-y divide-borde-suave">
              {e.sucursales.map((s) => (
                <li key={s.id} className="grid gap-1.5 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <b className="text-dato font-medium">{s.nombre}</b>
                    {s.activa ? (
                      <span className="rounded-full border border-ok px-2 text-etiqueta font-semibold text-ok">
                        Activa
                      </span>
                    ) : (
                      <span className="text-etiqueta text-texto-tenue">Desactivada</span>
                    )}
                    <span className="text-etiqueta text-texto-tenue">
                      {[s.localidad, s.domicilio].filter(Boolean).join(' · ')}
                      {s.usuarios > 0 &&
                        ` · ${s.usuarios} ${s.usuarios === 1 ? 'usuario' : 'usuarios'}`}
                    </span>
                    {puedeEditar && (
                      <span className="ml-auto flex gap-2">
                        <Enlace
                          onClick={() => setEdicion({ tipo: 'sucursal', empresa: e, sucursal: s })}
                        >
                          Modificar
                        </Enlace>
                        {puedeCrear && (
                          <Enlace onClick={() => setEdicion({ tipo: 'puntoVenta', sucursal: s })}>
                            Nuevo punto de venta
                          </Enlace>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {s.puntosVenta.length === 0 && (
                      <span className="text-etiqueta text-atencion">
                        Sin punto de venta: todavía no factura
                      </span>
                    )}
                    {s.puntosVenta.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!puedeEditar}
                        onClick={() =>
                          setEdicion({ tipo: 'puntoVenta', sucursal: s, puntoVenta: p })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-base border px-2 py-0.5 text-etiqueta ${
                          p.activo
                            ? 'border-borde text-texto'
                            : 'border-borde-suave text-texto-tenue line-through'
                        } enabled:hover:bg-superficie-2`}
                      >
                        <span className="font-mono">{String(p.numero).padStart(4, '0')}</span>
                        {USOS[p.uso]}
                        {p.modo === 'CAEA' && <span className="text-texto-suave">CAEA</span>}
                        {p.predeterminado && (
                          <span className="font-semibold text-marca">predeterminado</span>
                        )}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </Shell>
  )
}

function Formulario({
  edicion,
  catalogos,
  alTerminar,
}: {
  edicion: NonNullable<Edicion>
  catalogos: Catalogos
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const guardar = useMutation({
    mutationFn: (enviar: () => Promise<unknown>) => enviar(),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['empresas', tenantId] })
      alTerminar()
    },
  })

  const titulo =
    edicion.tipo === 'empresa'
      ? edicion.empresa
        ? `Modificar ${edicion.empresa.razonSocial}`
        : 'Nueva razón social'
      : edicion.tipo === 'sucursal'
        ? edicion.sucursal
          ? `Modificar la sucursal ${edicion.sucursal.nombre}`
          : `Nueva sucursal de ${edicion.empresa.razonSocial}`
        : edicion.puntoVenta
          ? `Punto de venta ${String(edicion.puntoVenta.numero).padStart(4, '0')}`
          : `Nuevo punto de venta de ${edicion.sucursal.nombre}`

  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      {edicion.tipo === 'empresa' && (
        <FormEmpresa
          empresa={edicion.empresa}
          catalogos={catalogos}
          primerCampo={primerCampo}
          guardar={guardar.mutate}
        />
      )}
      {edicion.tipo === 'sucursal' && (
        <FormSucursal
          empresa={edicion.empresa}
          sucursal={edicion.sucursal}
          catalogos={catalogos}
          primerCampo={primerCampo}
          guardar={guardar.mutate}
        />
      )}
      {edicion.tipo === 'puntoVenta' && (
        <FormPuntoVenta
          sucursal={edicion.sucursal}
          puntoVenta={edicion.puntoVenta}
          primerCampo={primerCampo}
          guardar={guardar.mutate}
        />
      )}

      {guardar.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeDe(guardar.error)}
        </p>
      )}

      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          onClick={() =>
            (
              document.getElementById('formulario-organizacion') as HTMLFormElement | null
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

type Guardar = (enviar: () => Promise<unknown>) => void
type RefCampo = React.RefObject<HTMLInputElement | null>

function FormEmpresa({
  empresa,
  catalogos,
  primerCampo,
  guardar,
}: {
  empresa: Empresa | undefined
  catalogos: Catalogos
  primerCampo: RefCampo
  guardar: Guardar
}) {
  const [cuit, setCuit] = useState(empresa ? formatearCuit(empresa.cuit) : '')
  const [razonSocial, setRazonSocial] = useState(empresa?.razonSocial ?? '')
  const [nombreFantasia, setNombreFantasia] = useState(empresa?.nombreFantasia ?? '')
  const [condicionIva, setCondicionIva] = useState(empresa?.condicionIva ?? 1)
  const [inicioActividades, setInicio] = useState(empresa?.inicioActividades ?? '')
  const [domicilioFiscal, setDomicilio] = useState(empresa?.domicilioFiscal ?? '')
  const [provinciaCodigo, setProvincia] = useState<number | null>(empresa?.provinciaCodigo ?? null)
  const [convenioMultilateral, setConvenio] = useState(empresa?.convenioMultilateral ?? false)
  const [numeroIibb, setIibb] = useState(empresa?.numeroIibb ?? '')
  const [tocado, setTocado] = useState(false)

  // El dígito verificador se revisa acá, antes de mandar: el error vuelve al lado del
  // campo y no como un rechazo genérico del servidor.
  const cuitMal = !empresa && tocado && !cuitValido(cuit)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (!empresa && !cuitValido(cuit)) return

    const datos = {
      razonSocial,
      nombreFantasia,
      condicionIva,
      inicioActividades: inicioActividades || null,
      domicilioFiscal,
      provinciaCodigo,
      convenioMultilateral,
      numeroIibb,
    }
    guardar(() =>
      empresa
        ? api.organizacion.editarEmpresa({ ...datos, id: empresa.id })
        : api.organizacion.crearEmpresa({ ...datos, cuit: normalizarCuit(cuit) }),
    )
  }

  return (
    <form id="formulario-organizacion" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
      <Campo
        ref={empresa ? undefined : primerCampo}
        etiqueta="CUIT"
        required
        inputMode="numeric"
        disabled={Boolean(empresa)}
        value={cuit}
        onChange={(e) => setCuit(e.target.value)}
        onBlur={() => setTocado(true)}
        ayuda={
          empresa
            ? 'No se cambia: otro CUIT es otra empresa'
            : cuitMal
              ? 'Ese CUIT no existe: revisá los números'
              : 'Con o sin guiones'
        }
        aria-invalid={cuitMal}
      />
      <Campo
        ref={empresa ? primerCampo : undefined}
        etiqueta="Razón social"
        required
        value={razonSocial}
        onChange={(e) => setRazonSocial(e.target.value)}
      />
      <Campo
        etiqueta="Nombre de fantasía"
        value={nombreFantasia}
        onChange={(e) => setNombreFantasia(e.target.value)}
      />
      <Selector
        etiqueta="Condición frente al IVA"
        valor={condicionIva}
        onChange={(v) => setCondicionIva(v ?? 1)}
        opciones={catalogos.condicionesIva.map((c) => ({ valor: c.codigo, texto: c.descripcion }))}
      />
      <Campo
        etiqueta="Inicio de actividades"
        type="date"
        value={inicioActividades}
        onChange={(e) => setInicio(e.target.value)}
      />
      <Campo
        etiqueta="Número de Ingresos Brutos"
        value={numeroIibb}
        onChange={(e) => setIibb(e.target.value)}
      />
      <Campo
        etiqueta="Domicilio fiscal"
        value={domicilioFiscal}
        onChange={(e) => setDomicilio(e.target.value)}
      />
      <Selector
        etiqueta="Provincia"
        valor={provinciaCodigo}
        vacio="Sin especificar"
        onChange={setProvincia}
        opciones={catalogos.provincias.map((p) => ({ valor: p.codigo, texto: p.nombre }))}
      />
      <label className="flex items-center gap-2 self-end pb-2 text-dato">
        <input
          type="checkbox"
          className="accent-marca"
          checked={convenioMultilateral}
          onChange={(e) => setConvenio(e.target.checked)}
        />
        Convenio Multilateral
      </label>
    </form>
  )
}

function FormSucursal({
  empresa,
  sucursal,
  catalogos,
  primerCampo,
  guardar,
}: {
  empresa: Empresa
  sucursal: Sucursal | undefined
  catalogos: Catalogos
  primerCampo: RefCampo
  guardar: Guardar
}) {
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '')
  const [domicilio, setDomicilio] = useState(sucursal?.domicilio ?? '')
  const [localidad, setLocalidad] = useState(sucursal?.localidad ?? '')
  const [provinciaCodigo, setProvincia] = useState<number | null>(sucursal?.provinciaCodigo ?? null)
  const [telefono, setTelefono] = useState(sucursal?.telefono ?? '')
  const [activa, setActiva] = useState(sucursal?.activa ?? true)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const datos = { nombre, domicilio, localidad, provinciaCodigo, telefono }
    guardar(() =>
      sucursal
        ? api.organizacion.editarSucursal({ ...datos, id: sucursal.id, activa })
        : api.organizacion.crearSucursal({ ...datos, empresaId: empresa.id }),
    )
  }

  return (
    <form id="formulario-organizacion" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
      <Campo
        ref={primerCampo}
        etiqueta="Nombre"
        required
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        ayuda={`De ${empresa.razonSocial}`}
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
      <Selector
        etiqueta="Provincia"
        valor={provinciaCodigo}
        vacio="Sin especificar"
        onChange={setProvincia}
        opciones={catalogos.provincias.map((p) => ({ valor: p.codigo, texto: p.nombre }))}
      />
      <Campo etiqueta="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      {sucursal && (
        <label className="flex items-center gap-2 self-end pb-2 text-dato">
          <input
            type="checkbox"
            className="accent-marca"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
          />
          Activa
          {!activa && (
            <span className="text-etiqueta text-atencion">
              nadie va a poder entrar a esta sucursal
            </span>
          )}
        </label>
      )}
    </form>
  )
}

function FormPuntoVenta({
  sucursal,
  puntoVenta,
  primerCampo,
  guardar,
}: {
  sucursal: Sucursal
  puntoVenta: PuntoVenta | undefined
  primerCampo: RefCampo
  guardar: Guardar
}) {
  const [numero, setNumero] = useState(puntoVenta ? String(puntoVenta.numero) : '')
  const [uso, setUso] = useState<PuntoVenta['uso']>(puntoVenta?.uso ?? 'facturacion')
  const [modo, setModo] = useState<PuntoVenta['modo']>(puntoVenta?.modo ?? 'CAE')
  // El primero de la sucursal para ese uso nace predeterminado: si no, no factura sola.
  const [predeterminado, setPredeterminado] = useState(
    puntoVenta?.predeterminado ?? !sucursal.puntosVenta.some((p) => p.activo && p.predeterminado),
  )
  const [activo, setActivo] = useState(puntoVenta?.activo ?? true)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    guardar(() =>
      puntoVenta
        ? api.organizacion.editarPuntoVenta({
            id: puntoVenta.id,
            uso,
            modo,
            predeterminado,
            activo,
          })
        : api.organizacion.crearPuntoVenta({
            sucursalId: sucursal.id,
            numero: Number(numero),
            uso,
            modo,
            predeterminado,
          }),
    )
  }

  return (
    <form id="formulario-organizacion" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
      <Campo
        ref={puntoVenta ? undefined : primerCampo}
        etiqueta="Número"
        type="number"
        min={1}
        max={99999}
        required
        disabled={Boolean(puntoVenta)}
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        ayuda={puntoVenta ? 'Es el de AFIP: no se cambia' : 'El que te dio AFIP al darlo de alta'}
      />
      <Selector
        etiqueta="Uso"
        valor={uso}
        onChange={(v) => setUso(v ?? 'facturacion')}
        opciones={Object.entries(USOS).map(([valor, texto]) => ({
          valor: valor as PuntoVenta['uso'],
          texto,
        }))}
      />
      <Selector
        etiqueta="Modo"
        valor={modo}
        onChange={(v) => setModo(v ?? 'CAE')}
        opciones={[
          { valor: 'CAE' as const, texto: 'CAE: comprobante por comprobante' },
          { valor: 'CAEA' as const, texto: 'CAEA: lote por adelantado' },
        ]}
      />
      <label className="flex items-center gap-2 text-dato">
        <input
          type="checkbox"
          className="accent-marca"
          checked={predeterminado}
          onChange={(e) => setPredeterminado(e.target.checked)}
        />
        Es el que usa {sucursal.nombre} para {USOS[uso].toLowerCase()}
      </label>
      {puntoVenta && (
        <label className="flex items-center gap-2 text-dato">
          <input
            type="checkbox"
            className="accent-marca"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Activo
        </label>
      )}
    </form>
  )
}

function Selector<T extends string | number>({
  etiqueta,
  valor,
  opciones,
  vacio,
  onChange,
}: {
  etiqueta: string
  valor: T | null
  opciones: Array<{ valor: T; texto: string }>
  vacio?: string
  onChange: (valor: T | null) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="text-etiqueta font-medium text-texto-suave">{etiqueta}</span>
      <select
        value={valor === null ? '' : String(valor)}
        onChange={(e) => {
          const elegida = opciones.find((o) => String(o.valor) === e.target.value)
          onChange(elegida ? elegida.valor : null)
        }}
        className="h-campo rounded-base border border-borde bg-superficie-2 px-2 text-dato text-texto"
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={String(o.valor)} value={String(o.valor)}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

function Enlace({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-etiqueta text-marca hover:underline">
      {children}
    </button>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-base bg-superficie-2" />
      ))}
    </div>
  )
}
