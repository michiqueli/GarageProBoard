import { accesoDeRuta, CONDICIONES_IIBB, contrato, TIPOS_DOCUMENTO } from '@gpb/contracts'
import { cuitValido, normalizarCuit } from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoAgregar, IconoEditar } from '../../componentes/iconos.tsx'
import { ResultadoPadron } from '../../componentes/ResultadoPadron.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { formatearDocumento, IIBB, nombreTipo } from '../clientes/PantallaClientes.tsx'
import { PestanasRepuestos } from './Pestanas.tsx'

type Proveedor = Awaited<ReturnType<typeof api.proveedores.listar>>['datos'][number]
type Catalogos = Awaited<ReturnType<typeof api.organizacion.catalogos>>
type TipoDocumento = 80 | 86 | 96
type CondicionIibb = (typeof CONDICIONES_IIBB)[number]

const RESPONSABLE_INSCRIPTO = 1

/**
 * Los proveedores: la fábrica, los distribuidores, la casa de repuestos de la vuelta. Si el
 * CUIT ya es cliente, el alta no lo duplica: le suma el rol a la misma identidad fiscal.
 */
export function PantallaProveedores() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.proveedores.listar)
  const puedeCrear = usePuedeUsar(contrato.proveedores.crear)
  const puedeEditar = usePuedeUsar(contrato.proveedores.editar)
  const [buscar, setBuscar] = useState('')
  const [conInactivos, setConInactivos] = useState(false)
  const [edicion, setEdicion] = useState<null | { proveedor?: Proveedor }>(null)
  const estado = conInactivos ? 'todos' : 'activos'

  const consulta = useQuery({
    queryKey: ['proveedores', tenantId, buscar, estado],
    queryFn: () =>
      api.proveedores.listar({ pagina: 1, porPagina: 100, buscar: buscar || undefined, estado }),
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

  const modificar = (p: Proveedor) =>
    puedeEditar ? (
      <Boton tamano="chico" icono={<IconoEditar />} onClick={() => setEdicion({ proveedor: p })}>
        Modificar
      </Boton>
    ) : null

  return (
    <Shell
      titulo="Proveedores"
      requiere={accesoDeRuta(contrato.proveedores.listar)}
      acciones={
        puedeCrear && !edicion ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            icono={<IconoAgregar />}
            onClick={() => setEdicion({})}
          >
            Nuevo proveedor
          </Boton>
        ) : undefined
      }
    >
      <PestanasRepuestos />
      {edicion && catalogos.data && (
        <FormularioProveedor
          key={edicion.proveedor?.id ?? 'nuevo'}
          proveedor={edicion.proveedor}
          catalogos={catalogos.data}
          alTerminar={() => setEdicion(null)}
        />
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <span className="font-mono text-etiqueta text-texto-tenue">
            {consulta.data
              ? `${consulta.data.total} ${consulta.data.total === 1 ? 'proveedor' : 'proveedores'}`
              : '…'}
          </span>
          <label className="flex items-center gap-2 text-etiqueta text-texto-suave">
            <input
              type="checkbox"
              className="accent-marca"
              checked={conInactivos}
              onChange={(e) => setConInactivos(e.target.checked)}
            />
            Incluir desactivados
          </label>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Razón social o CUIT"
            aria-label="Buscar proveedores"
            className="h-campo w-full rounded-base border border-borde bg-superficie-2 px-2.5 text-dato outline-none placeholder:text-texto-tenue focus-visible:border-marca md:ml-auto md:w-64"
          />
        </header>

        {consulta.isPending && (
          <div className="m-3 h-24 animate-pulse rounded-base bg-superficie-2" />
        )}
        {consulta.isError && (
          <p role="alert" className="px-3 py-3 text-dato text-critico">
            {mensajeGeneral(consulta.error)}
          </p>
        )}
        {consulta.data && datos.length === 0 && (
          <p className="px-3 py-6 text-center text-dato text-texto-suave">
            {buscar
              ? `Ningún proveedor coincide con «${buscar}».`
              : puedeCrear
                ? 'Todavía no hay proveedores. Dá de alta el primero con Nuevo proveedor.'
                : 'Todavía no hay proveedores.'}
          </p>
        )}

        {datos.length > 0 && esEscritorio && (
          <table className="w-full text-dato">
            <thead>
              <tr className="text-left text-etiqueta text-texto-tenue">
                {[
                  'Razón social',
                  'Documento',
                  'Condición frente al IVA',
                  'Condición de pago',
                  'Contacto',
                  '',
                ].map((c) => (
                  <th key={c} className="border-b border-borde px-3 py-1.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-superficie-2 ${p.activo ? '' : 'text-texto-tenue'}`}
                >
                  <td className="h-fila border-b border-borde-suave px-3">
                    {p.razonSocial}
                    {!p.activo && <span className="ml-2 text-etiqueta">Desactivado</span>}
                    {p.esCliente && (
                      <span className="ml-2 rounded-full border border-borde px-2 text-etiqueta text-texto-suave">
                        También cliente
                      </span>
                    )}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta">
                    <span className="text-texto-tenue">{nombreTipo(p.tipoDocumento)}</span>{' '}
                    {formatearDocumento(p.tipoDocumento, p.numeroDocumento)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {condicion(p.condicionIva)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {p.condicionPago ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-etiqueta text-texto-suave">
                    {[p.telefono, p.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 py-1 text-right">
                    {modificar(p)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {datos.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {datos.map((p) => (
              <li key={p.id} className="grid gap-0.5 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-dato font-semibold">{p.razonSocial}</span>
                  <span className="ml-auto">{modificar(p)}</span>
                </div>
                <span className="font-mono text-etiqueta text-texto-suave">
                  {nombreTipo(p.tipoDocumento)}{' '}
                  {formatearDocumento(p.tipoDocumento, p.numeroDocumento)}
                </span>
                <span className="text-etiqueta text-texto-tenue">
                  {[p.condicionPago, p.telefono].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

function FormularioProveedor({
  proveedor,
  catalogos,
  alTerminar,
}: {
  proveedor: Proveedor | undefined
  catalogos: Catalogos
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const [tipoDocumento, setTipo] = useState<TipoDocumento>(
    (proveedor?.tipoDocumento as TipoDocumento | undefined) ?? 80,
  )
  const [numero, setNumero] = useState(
    proveedor ? formatearDocumento(proveedor.tipoDocumento, proveedor.numeroDocumento) : '',
  )
  const [razonSocial, setRazonSocial] = useState(proveedor?.razonSocial ?? '')
  const [condicionIva, setCondicionIva] = useState(proveedor?.condicionIva ?? RESPONSABLE_INSCRIPTO)
  const [domicilio, setDomicilio] = useState(proveedor?.domicilio ?? '')
  const [localidad, setLocalidad] = useState(proveedor?.localidad ?? '')
  const [codigoPostal, setCodigoPostal] = useState(proveedor?.codigoPostal ?? '')
  const [provinciaCodigo, setProvincia] = useState<number | null>(
    proveedor?.provinciaCodigo ?? null,
  )
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '')
  const [email, setEmail] = useState(proveedor?.email ?? '')
  const [condicionIibb, setIibb] = useState<CondicionIibb>(proveedor?.condicionIibb ?? 'local')
  const [numeroIibb, setNumeroIibb] = useState(proveedor?.numeroIibb ?? '')
  const [condicionPago, setCondicionPago] = useState(proveedor?.condicionPago ?? '')
  const [activo, setActivo] = useState(proveedor?.activo ?? true)
  const [tocado, setTocado] = useState(false)

  const normalizado = normalizarCuit(numero)
  const esDni = tipoDocumento === 96
  const documentoValido = esDni ? /^[0-9]{7,8}$/.test(normalizado) : cuitValido(normalizado)
  const documentoMal = !proveedor && tocado && !documentoValido

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
        condicionPago,
      }
      return proveedor
        ? api.proveedores.editar({ ...datos, id: proveedor.id, activo })
        : api.proveedores.crear({ ...datos, tipoDocumento, numeroDocumento: normalizado })
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['proveedores', tenantId] })
      alTerminar()
    },
    meta: {
      exito: () => (proveedor ? `${razonSocial} guardado` : `${razonSocial} dado de alta`),
      error: (error) =>
        error instanceof ORPCError && error.code === 'PROVEEDOR_DUPLICADO'
          ? `Ese documento ya está cargado como proveedor, a nombre de ${(error.data as { razonSocial: string }).razonSocial}.`
          : mensajeGeneral(error),
    },
  })

  const padron = useMutation({
    meta: { error: false },
    mutationFn: () => api.padron.consultar({ cuit: normalizado }),
    onSuccess: (c) => {
      setRazonSocial(c.razonSocial)
      if (c.condicionIva.codigo !== null) setCondicionIva(c.condicionIva.codigo)
      if (c.domicilio) {
        setDomicilio(c.domicilio.direccion ?? '')
        setLocalidad(c.domicilio.localidad ?? '')
        setCodigoPostal(c.domicilio.codigoPostal ?? '')
        setProvincia(c.domicilio.provinciaCodigo)
      }
    },
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (!proveedor && !documentoValido) return
    if (razonSocial.trim().length < 2) return
    if (
      proveedor?.activo &&
      !activo &&
      !(await confirmar({
        titulo: `¿Desactivar a ${proveedor.razonSocial}?`,
        texto:
          'No se le van a poder cargar compras. Su historia queda, y se puede volver a activar.',
        confirmar: 'Desactivar',
        peligro: true,
      }))
    ) {
      return
    }
    guardar.mutate()
  }

  const titulo = proveedor ? `Modificar ${proveedor.razonSocial}` : 'Nuevo proveedor'
  return (
    <section
      aria-label={titulo}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{titulo}</h2>
      <form id="formulario-proveedor" onSubmit={enviar} className="grid gap-3 md:grid-cols-3">
        <Selector
          etiqueta="Tipo de documento"
          valor={tipoDocumento}
          onChange={(v) => setTipo(v ?? 80)}
          opciones={Object.entries(TIPOS_DOCUMENTO).map(([valor, texto]) => ({
            valor: Number(valor) as TipoDocumento,
            texto,
          }))}
        />
        <Campo
          ref={proveedor ? undefined : primerCampo}
          etiqueta={nombreTipo(tipoDocumento)}
          required
          inputMode="numeric"
          disabled={Boolean(proveedor)}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onBlur={() => setTocado(true)}
          ayuda={
            proveedor
              ? 'No se cambia'
              : documentoMal
                ? `Ese ${nombreTipo(tipoDocumento)} no existe: revisá los números`
                : 'Con o sin guiones'
          }
          aria-invalid={documentoMal}
        />
        {!proveedor && !esDni ? (
          <div className="grid content-end">
            <Boton
              accion="clientes.consultarPadron"
              deshabilitado={padron.isPending}
              onClick={() => {
                setTocado(true)
                if (cuitValido(normalizado)) padron.mutate()
              }}
            >
              {padron.isPending ? 'Consultando a AFIP…' : 'Completar con AFIP'}
            </Boton>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        {!proveedor && (padron.isError || padron.data) && (
          <div className="md:col-span-3">
            <ResultadoPadron consulta={padron} avisarCuil={false} />
          </div>
        )}
        <Campo
          ref={proveedor ? primerCampo : undefined}
          etiqueta="Razón social"
          required
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
        />
        <Selector
          etiqueta="Condición frente al IVA"
          valor={condicionIva}
          onChange={(v) => setCondicionIva(v ?? RESPONSABLE_INSCRIPTO)}
          opciones={catalogos.condicionesIva.map((c) => ({
            valor: c.codigo,
            texto: c.descripcion,
          }))}
        />
        <Campo
          etiqueta="Condición de pago"
          value={condicionPago}
          onChange={(e) => setCondicionPago(e.target.value)}
          ayuda="Cuenta corriente 30 días, contado…"
        />
        <Campo
          etiqueta="Teléfono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <Campo
          etiqueta="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <Selector
          etiqueta="Ingresos Brutos"
          valor={condicionIibb}
          onChange={(v) => setIibb(v ?? 'local')}
          opciones={CONDICIONES_IIBB.map((c) => ({ valor: c, texto: IIBB[c] }))}
        />
        {condicionIibb !== 'no_inscripto' && (
          <Campo
            etiqueta="Número de Ingresos Brutos"
            value={numeroIibb}
            onChange={(e) => setNumeroIibb(e.target.value)}
          />
        )}
        {proveedor && (
          <label className="flex items-center gap-2 self-end pb-2 text-dato">
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
      {proveedor?.esCliente && (
        <p className="text-etiqueta text-texto-suave">
          También es cliente: el domicilio y los datos fiscales que cambies acá cambian para los
          dos.
        </p>
      )}
      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() =>
            (
              document.getElementById('formulario-proveedor') as HTMLFormElement | null
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
