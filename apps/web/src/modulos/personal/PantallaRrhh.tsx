import { accesoDeRuta, contrato, type Puesto } from '@gpb/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { confirmar, notificar, preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { clicEnFila, FILA_CLICABLE } from '../../componentes/filas.ts'
import {
  IconoBorrar,
  IconoCertificado,
  IconoEditar,
  IconoImprimir,
} from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'
import { useFilasConTeclado, useFlechasPestanas } from '../../teclado/index.ts'
import { imprimirCredenciales, mensajeDe, nombrePuesto, OPCIONES_PUESTO } from './personal.ts'

// Por id y no importando la ruta: `rutas.tsx` importa esta pantalla, y el camino inverso
// armaría un ciclo.
const ruta = getRouteApi('/con-sesion/rrhh')

type Empleado = Awaited<ReturnType<typeof api.personal.listar>>['datos'][number]

const PESTANAS = ['personal', 'asistencia'] as const
type Pestana = (typeof PESTANAS)[number]

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })

/** Qué se está editando: nada, un alta, o alguien que ya está. */
type Edicion = null | { tipo: 'alta' } | { tipo: 'edicion'; empleado: Empleado }

/**
 * Recursos humanos.
 *
 * Por ahora una sola pestaña construida —el personal con sus credenciales— y la de asistencia
 * anunciada y atenuada, igual que hace el menú con las secciones que todavía no están: el mapa
 * se muestra entero desde el principio, así quien entra sabe dónde va a estar lo que falta.
 *
 * El personal **no es la lista de usuarios**. Usuarios es quién entra al sistema; esto es quién
 * trabaja en la concesionaria, que es casi siempre más gente: el lavador ficha todos los días y
 * no tiene cuenta. Ver `docs/tecnicos/usuarios-y-roles.md`.
 */
export function PantallaRrhh() {
  const navegar = ruta.useNavigate()
  const pestana = ruta.useSearch({ select: (s) => s.ver ?? 'personal' })

  const irA = (destino: Pestana) => void navegar({ search: { ver: destino } })
  useFlechasPestanas(PESTANAS, pestana, irA)

  return (
    <Shell titulo="Recursos humanos" requiere={accesoDeRuta(contrato.personal.listar)}>
      <nav aria-label="Secciones de recursos humanos" className="flex gap-1 border-b border-borde">
        <Pestania activa={pestana === 'personal'} onClick={() => irA('personal')}>
          Personal
        </Pestania>
        <Pestania activa={pestana === 'asistencia'} onClick={() => irA('asistencia')}>
          Asistencia
        </Pestania>
      </nav>

      {pestana === 'personal' ? <Personal /> : <Asistencia />}
    </Shell>
  )
}

function Pestania({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick?: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? 'page' : undefined}
      className={`border-b-2 px-3 py-1.5 text-dato ${
        activa
          ? 'border-marca font-semibold text-texto'
          : 'border-transparent text-texto-suave hover:text-texto'
      }`}
    >
      {children}
    </button>
  )
}

function Personal() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.personal.listar)
  const puedeCrear = usePuedeUsar(contrato.personal.crear)
  const puedeEditar = usePuedeUsar(contrato.personal.editar)

  const [buscar, setBuscar] = useState('')
  const [puesto, setPuesto] = useState<Puesto | null>(null)
  const [conCredencial, setConCredencial] = useState<'todos' | 'con' | 'sin'>('todos')
  const [estado, setEstado] = useState<'activos' | 'todos'>('activos')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [edicion, setEdicion] = useState<Edicion>(null)

  const listado = useQuery({
    queryKey: ['personal', tenantId, { buscar, puesto, conCredencial, estado }],
    queryFn: () =>
      api.personal.listar({
        porPagina: 200,
        ...(buscar.trim() ? { buscar: buscar.trim() } : {}),
        ...(puesto ? { puesto } : {}),
        credencial: conCredencial,
        estado,
      }),
    enabled: puedeVer,
  })

  const filas = useMemo(() => listado.data?.datos ?? [], [listado.data])

  /**
   * Abrir un empleado es abrir su formulario: no tiene ficha aparte, porque no hay nada que
   * mirar que no se pueda cambiar ahí mismo. Lo usan Enter y el clic en la fila, que tienen
   * que hacer lo mismo — el cursor de la fila ya promete que algo pasa al hacer clic.
   */
  const abrirFicha = (e: Empleado) => {
    if (puedeEditar) setEdicion({ tipo: 'edicion', empleado: e })
  }

  const { activa, propsFila } = useFilasConTeclado(filas, abrirFicha)
  const marcada = activa !== null ? filas[activa] : undefined

  const cache = useQueryClient()
  const invalidar = () => cache.invalidateQueries({ queryKey: ['personal', tenantId] })

  const emitir = useMutation({
    mutationFn: (entrada: { id: string; motivo?: string }) =>
      api.personal.emitirCredencial(entrada),
    onSuccess: invalidar,
    meta: {
      exito: (datos: unknown) =>
        `Credencial emitida para ${(datos as Empleado).razonSocial}. Ya se puede imprimir`,
      error: mensajeDe,
    },
  })

  const revocar = useMutation({
    mutationFn: (entrada: { id: string; motivo: string }) =>
      api.personal.revocarCredencial(entrada),
    onSuccess: invalidar,
    meta: {
      exito: (datos: unknown) => `${(datos as Empleado).razonSocial} ya no puede fichar`,
      error: mensajeDe,
    },
  })

  /**
   * Emitir, con el paso que importa: si ya tenía una vigente, la nueva **revoca la anterior**,
   * así que no se hace sin decir por qué. Es lo que después explica un fichaje raro.
   */
  async function emitirCredencial(e: Empleado) {
    if (!e.credencial) {
      emitir.mutate({ id: e.id })
      return
    }
    const motivo = await preguntar({
      titulo: `¿Reemplazar la credencial de ${e.razonSocial}?`,
      texto: 'La que tiene ahora deja de fichar en el momento. Se emite una nueva para imprimir.',
      confirmar: 'Emitir una nueva',
      peligro: true,
      campo: {
        etiqueta: 'Por qué se reemplaza',
        valor: '',
        validar: (v) => (v.trim() ? null : 'Escribí por qué: la perdió, se arruinó, se la robaron'),
      },
    })
    if (motivo) emitir.mutate({ id: e.id, motivo })
  }

  async function revocarCredencial(e: Empleado) {
    const motivo = await preguntar({
      titulo: `¿Revocar la credencial de ${e.razonSocial}?`,
      texto: 'Queda sin poder fichar hasta que se le emita otra.',
      confirmar: 'Revocar',
      peligro: true,
      campo: {
        etiqueta: 'Por qué se revoca',
        valor: '',
        validar: (v) => (v.trim() ? null : 'Escribí por qué'),
      },
    })
    if (motivo) revocar.mutate({ id: e.id, motivo })
  }

  /**
   * Imprime los tildados. Sin ninguno tildado imprime la lista entera que se está viendo —que
   * es el caso del primer día, con el filtro en «sin credencial»— y pregunta antes, porque son
   * hojas de verdad saliendo de una impresora.
   */
  async function imprimir() {
    const elegidos = filas.filter((e) => marcados.has(e.id) && e.credencial)
    if (elegidos.length > 0) {
      await imprimirCredenciales(elegidos.map((e) => e.id))
      return
    }
    const conCred = filas.filter((e) => e.credencial)
    if (conCred.length === 0) {
      notificar.info('Nadie de la lista tiene credencial vigente. Emitila primero, con F4.')
      return
    }
    const si = await confirmar({
      titulo: `¿Imprimir ${conCred.length} credencial${conCred.length === 1 ? '' : 'es'}?`,
      texto: 'Son las de toda la lista que estás viendo. Salen diez por hoja, para recortar.',
      confirmar: 'Imprimir',
    })
    if (si) await imprimirCredenciales(conCred.map((e) => e.id))
  }

  function alternarMarca(id: string, tildado: boolean) {
    setMarcados((previos) => {
      const nuevo = new Set(previos)
      if (tildado) nuevo.add(id)
      else nuevo.delete(id)
      return nuevo
    })
  }

  const cuantosConCredencial = filas.filter((e) => e.credencial).length

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Campo
            etiqueta="Buscar"
            data-lista
            placeholder="Nombre, legajo o documento"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <Selector
          etiqueta="Puesto"
          valor={puesto}
          vacio="Todos"
          onChange={setPuesto}
          opciones={OPCIONES_PUESTO}
        />
        <Selector
          etiqueta="Credencial"
          valor={conCredencial}
          onChange={(v) => setConCredencial(v ?? 'todos')}
          opciones={[
            { valor: 'todos', texto: 'Todas' },
            { valor: 'con', texto: 'Con credencial' },
            { valor: 'sin', texto: 'Sin credencial' },
          ]}
        />
        <Selector
          etiqueta="Estado"
          valor={estado}
          onChange={(v) => setEstado(v ?? 'activos')}
          opciones={[
            { valor: 'activos', texto: 'Los que trabajan' },
            { valor: 'todos', texto: 'Con los dados de baja' },
          ]}
        />

        <div className="ml-auto flex flex-wrap gap-2">
          {puedeEditar && (
            <>
              <Boton
                accion="personal.emitirCredencial"
                deshabilitado={!marcada || emitir.isPending}
                onClick={() => marcada && void emitirCredencial(marcada)}
              >
                {marcada?.credencial ? 'Reemplazar credencial' : 'Emitir credencial'}
              </Boton>
              <Boton
                accion="personal.revocarCredencial"
                variante="peligro"
                deshabilitado={!marcada?.credencial || revocar.isPending}
                onClick={() => marcada && void revocarCredencial(marcada)}
              >
                Revocar credencial
              </Boton>
            </>
          )}
          <Boton accion="global.imprimir" icono={<IconoImprimir />} onClick={() => void imprimir()}>
            Imprimir credenciales
          </Boton>
          {puedeCrear && !edicion && (
            <Boton
              accion="global.nuevo"
              variante="principal"
              onClick={() => setEdicion({ tipo: 'alta' })}
            >
              Nuevo empleado
            </Boton>
          )}
        </div>
      </div>

      {edicion && (
        <Formulario
          key={edicion.tipo === 'alta' ? 'alta' : edicion.empleado.id}
          edicion={edicion}
          alTerminar={() => setEdicion(null)}
        />
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">
            Quién trabaja en la concesionaria
          </h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {listado.data ? `${listado.data.total} · ${cuantosConCredencial} con credencial` : '…'}
          </span>
          {marcados.size > 0 && (
            <span className="text-etiqueta text-texto-suave">
              {marcados.size} tildado{marcados.size === 1 ? '' : 's'} para imprimir
            </span>
          )}
        </header>

        {listado.isPending && <Esqueleto />}
        {listado.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {mensajeDe(listado.error)}
          </p>
        )}
        {listado.data && filas.length === 0 && (
          <div className="grid justify-items-start gap-2 px-3 py-6">
            <p className="text-dato text-texto-suave">
              {buscar || puesto || conCredencial !== 'todos'
                ? 'Nadie con esos filtros. Probá con menos.'
                : 'Todavía no hay nadie cargado. El personal es el que ficha: los mecánicos, y también el que sólo marca entrada.'}
            </p>
            {puedeCrear && !buscar && (
              <Boton variante="principal" onClick={() => setEdicion({ tipo: 'alta' })}>
                Cargar al primero
              </Boton>
            )}
          </div>
        )}

        {listado.data && filas.length > 0 && esEscritorio && (
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr>
                {['', 'Legajo', 'Nombre', 'Puesto', 'Sucursal', 'Credencial', 'Estado', ''].map(
                  (c, i) => (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: dos encabezados van vacíos
                      key={`${c}-${i}`}
                      className="border-b border-borde bg-superficie-2 px-3 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-texto-tenue uppercase"
                    >
                      {c}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((e, i) => (
                <tr
                  key={e.id}
                  className={FILA_CLICABLE}
                  {...propsFila(i)}
                  onClick={clicEnFila(() => abrirFicha(e))}
                >
                  <td className="h-fila border-b border-borde-suave pl-3">
                    <input
                      type="checkbox"
                      className="accent-marca"
                      aria-label={`Imprimir la credencial de ${e.razonSocial}`}
                      disabled={!e.credencial}
                      checked={marcados.has(e.id)}
                      onChange={(ev) => alternarMarca(e.id, ev.target.checked)}
                    />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono tabular-nums">
                    {e.legajo}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <span className="font-medium">{e.razonSocial}</span>
                    {e.usuario && (
                      <span className="ml-2 text-etiqueta text-texto-tenue">{e.usuario.email}</span>
                    )}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {nombrePuesto(e.puesto)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {e.sucursal ?? '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Credencial empleado={e} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Estado activo={e.activo} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 py-1 text-right">
                    <Acciones
                      empleado={e}
                      puedeEditar={puedeEditar}
                      onEditar={() => setEdicion({ tipo: 'edicion', empleado: e })}
                      onEmitir={() => void emitirCredencial(e)}
                      onRevocar={() => void revocarCredencial(e)}
                      onImprimir={() => void imprimirCredenciales([e.id])}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {listado.data && filas.length > 0 && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {filas.map((e, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se abre con ↑ ↓ y Enter (useFilasConTeclado), y la tarjeta tiene sus propios botones
              <li
                key={e.id}
                className={`grid gap-1 px-3 py-2.5 ${FILA_CLICABLE}`}
                {...propsFila(i)}
                onClick={clicEnFila(() => abrirFicha(e))}
              >
                <div className="flex items-baseline gap-2">
                  <input
                    type="checkbox"
                    className="accent-marca"
                    aria-label={`Imprimir la credencial de ${e.razonSocial}`}
                    disabled={!e.credencial}
                    checked={marcados.has(e.id)}
                    onChange={(ev) => alternarMarca(e.id, ev.target.checked)}
                  />
                  <span className="font-medium">{e.razonSocial}</span>
                  <span className="ml-auto">
                    <Estado activo={e.activo} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-suave">
                  Legajo {e.legajo} · {nombrePuesto(e.puesto)}
                  {e.sucursal ? ` · ${e.sucursal}` : ''}
                </span>
                <Credencial empleado={e} />
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Acciones
                    empleado={e}
                    puedeEditar={puedeEditar}
                    onEditar={() => setEdicion({ tipo: 'edicion', empleado: e })}
                    onEmitir={() => void emitirCredencial(e)}
                    onRevocar={() => void revocarCredencial(e)}
                    onImprimir={() => void imprimirCredenciales([e.id])}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/**
 * Sin credencial reclama algo —hay que emitirla— así que va en píldora llena. Con credencial es
 * el curso normal: contorneada. Nunca sólo el color.
 */
function Credencial({ empleado }: { empleado: Empleado }) {
  if (!empleado.credencial) {
    return (
      <span className="inline-flex rounded-full bg-atencion px-2 text-etiqueta font-semibold text-fondo">
        Sin credencial
      </span>
    )
  }
  return (
    <span className="inline-flex items-baseline gap-1.5 text-etiqueta text-texto-suave">
      <span className="rounded-full border border-ok px-2 font-semibold text-ok">Vigente</span>
      <span>desde el {FECHA.format(new Date(empleado.credencial.emitidaEn))}</span>
    </span>
  )
}

function Estado({ activo }: { activo: boolean }) {
  return activo ? (
    <span className="text-etiqueta text-texto-suave">Trabaja acá</span>
  ) : (
    <span className="text-etiqueta text-texto-tenue">Dado de baja</span>
  )
}

function Acciones({
  empleado,
  puedeEditar,
  onEditar,
  onEmitir,
  onRevocar,
  onImprimir,
}: {
  empleado: Empleado
  puedeEditar: boolean
  onEditar: () => void
  onEmitir: () => void
  onRevocar: () => void
  onImprimir: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {/*
        Reimprimir la de uno solo, sin pasar por tildar y usar el botón de arriba. Es el caso
        de todos los días —se le rompió la funda, la dejó en el otro pantalón— y no hace falta
        emitir otra: la credencial es la misma, lo que se repone es el cartón.

        No pide permiso de edición: imprimir no cambia nada, y el que puede ver el personal
        puede sacar la tarjeta de alguien que ya la tiene.
      */}
      {empleado.credencial && (
        <Boton tamano="chico" icono={<IconoImprimir />} onClick={onImprimir}>
          Imprimir
        </Boton>
      )}
      {puedeEditar && empleado.activo && (
        <Boton tamano="chico" icono={<IconoCertificado />} onClick={onEmitir}>
          {empleado.credencial ? 'Reemplazar' : 'Emitir'}
        </Boton>
      )}
      {puedeEditar && empleado.credencial && (
        <Boton tamano="chico" variante="peligro" icono={<IconoBorrar />} onClick={onRevocar}>
          Revocar
        </Boton>
      )}
      {puedeEditar && (
        <Boton tamano="chico" icono={<IconoEditar />} onClick={onEditar}>
          Modificar
        </Boton>
      )}
    </div>
  )
}

function Formulario({
  edicion,
  alTerminar,
}: {
  edicion: NonNullable<Edicion>
  alTerminar: () => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const existente = edicion.tipo === 'edicion' ? edicion.empleado : null
  const primerCampo = useRef<HTMLInputElement>(null)

  const [tipoDocumento, setTipoDocumento] = useState<86 | 96>(
    (existente?.tipoDocumento as 86 | 96) ?? 86,
  )
  const [numeroDocumento, setNumeroDocumento] = useState(existente?.numeroDocumento ?? '')
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [apellido, setApellido] = useState(existente?.apellido ?? '')
  const [legajo, setLegajo] = useState(existente?.legajo ?? '')
  const [puesto, setPuesto] = useState<Puesto>(existente?.puesto ?? 'mecanico')
  const [sucursalId, setSucursalId] = useState<string | null>(existente?.sucursalId ?? null)
  const [convenio, setConvenio] = useState(existente?.convenio ?? '')
  const [categoria, setCategoria] = useState(existente?.categoria ?? '')
  const [fechaIngreso, setFechaIngreso] = useState(existente?.fechaIngreso ?? '')
  const [fechaEgreso, setFechaEgreso] = useState(existente?.fechaEgreso ?? '')
  const [email, setEmail] = useState(existente?.email ?? '')
  const [telefono, setTelefono] = useState(existente?.telefono ?? '')
  const [activo, setActivo] = useState(existente?.activo ?? true)

  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const opciones = useQuery({
    queryKey: ['personal', tenantId, 'opciones'],
    queryFn: () => api.personal.opciones(),
  })

  // Con una sola sucursal no hay nada que elegir.
  const unica = opciones.data?.sucursales.length === 1 ? opciones.data.sucursales[0] : null
  useEffect(() => {
    if (unica && sucursalId === null) setSucursalId(unica.id)
  }, [unica, sucursalId])

  /**
   * El nombre traído del padrón, que es el mismo caño que usa el alta de clientes. Ahorra
   * tipearlo y, sobre todo, lo escribe como lo escribe AFIP: el día de la liquidación de
   * sueldos, un apellido con una tilde distinta es un rechazo.
   */
  const padron = useMutation({
    mutationFn: () => api.padron.consultar({ cuit: numeroDocumento }),
    onSuccess: (datos) => {
      const [ape, nom] = datos.razonSocial.split(',')
      if (ape) setApellido(ape.trim())
      if (nom) setNombre(nom.trim())
      if (!nom)
        notificar.info(`AFIP lo tiene como «${datos.razonSocial}». Separá nombre y apellido.`)
    },
    meta: { error: mensajeDe },
  })

  const datos = () => ({
    nombre,
    apellido,
    legajo,
    puesto,
    sucursalId,
    convenio: convenio.trim() || null,
    categoria: categoria.trim() || null,
    fechaIngreso: fechaIngreso || null,
    email: email.trim() || null,
    telefono: telefono.trim() || null,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (existente) {
        return api.personal.editar({
          ...datos(),
          id: existente.id,
          activo,
          fechaEgreso: fechaEgreso || null,
        })
      }
      return api.personal.crear({ ...datos(), tipoDocumento, numeroDocumento })
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['personal', tenantId] })
      alTerminar()
    },
    meta: {
      exito: () =>
        !existente
          ? `${apellido}, ${nombre} dado de alta. Emitile la credencial con F4`
          : existente.activo && !activo
            ? `${existente.razonSocial} dado de baja${existente.credencial ? ': se le revocó la credencial' : ''}`
            : `Cambios guardados en ${existente.razonSocial}`,
      error: mensajeDe,
    },
  })

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (guardar.isPending) return
    if (
      existente?.activo &&
      !activo &&
      !(await confirmar({
        titulo: `¿Dar de baja a ${existente.razonSocial}?`,
        texto: existente.credencial
          ? 'Se le revoca la credencial y deja de poder fichar. Su trabajo queda en las órdenes.'
          : 'Deja de aparecer para asignarle órdenes. Su trabajo queda en las órdenes.',
        confirmar: 'Dar de baja',
        peligro: true,
      }))
    ) {
      return
    }
    guardar.mutate()
  }

  return (
    <form
      onSubmit={enviar}
      aria-label={existente ? `Modificar a ${existente.razonSocial}` : 'Nuevo empleado'}
      className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">
        {existente ? existente.razonSocial : 'Nuevo empleado'}
      </h2>

      <div className="grid gap-3 md:grid-cols-4">
        {existente ? (
          <Campo
            etiqueta="Documento"
            value={`${existente.tipoDocumento === 96 ? 'DNI' : 'CUIL'} ${existente.numeroDocumento}`}
            disabled
            ayuda="No se cambia: otro documento es otra persona"
          />
        ) : (
          <>
            <Selector
              etiqueta="Tipo"
              valor={tipoDocumento}
              onChange={(v) => setTipoDocumento(v ?? 86)}
              opciones={[
                { valor: 86 as const, texto: 'CUIL' },
                { valor: 96 as const, texto: 'DNI' },
              ]}
            />
            <div className="grid content-end gap-1">
              <Campo
                ref={primerCampo}
                etiqueta={tipoDocumento === 96 ? 'DNI' : 'CUIL'}
                inputMode="numeric"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value.replace(/\D/g, ''))}
                ayuda={tipoDocumento === 96 ? '7 u 8 dígitos' : '11 dígitos, sin guiones'}
              />
              {tipoDocumento === 86 && (
                <Boton
                  variante="sutil"
                  tamano="chico"
                  deshabilitado={numeroDocumento.length !== 11 || padron.isPending}
                  onClick={() => padron.mutate()}
                >
                  {padron.isPending ? 'Consultando…' : 'Traer el nombre de AFIP'}
                </Boton>
              )}
            </div>
          </>
        )}
        <Campo
          {...(existente ? { ref: primerCampo } : {})}
          etiqueta="Apellido"
          required
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
        />
        <Campo
          etiqueta="Nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Campo
          etiqueta="Legajo"
          required
          value={legajo}
          onChange={(e) => setLegajo(e.target.value)}
          ayuda="Es lo que se tipea cuando el QR no se lee"
        />
        <Selector
          etiqueta="Puesto"
          valor={puesto}
          onChange={(v) => setPuesto(v ?? 'otro')}
          opciones={OPCIONES_PUESTO}
        />
        <Selector
          etiqueta="Sucursal"
          valor={sucursalId}
          vacio="Todas"
          onChange={setSucursalId}
          opciones={(opciones.data?.sucursales ?? []).map((s) => ({
            valor: s.id,
            texto: s.nombre,
          }))}
        />
        <Campo
          etiqueta="Entró el"
          type="date"
          value={fechaIngreso}
          onChange={(e) => setFechaIngreso(e.target.value)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Campo
          etiqueta="Convenio"
          value={convenio}
          onChange={(e) => setConvenio(e.target.value)}
          ayuda="SMATA, o vacío si está fuera de convenio"
        />
        <Campo
          etiqueta="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <Campo
          etiqueta="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo etiqueta="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>

      {existente && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-dato">
            <input
              type="checkbox"
              className="accent-marca"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Trabaja en la concesionaria
            {!activo && (
              <span className="text-etiqueta text-atencion">
                queda dado de baja y se le revoca la credencial
              </span>
            )}
          </label>
          {!activo && (
            <Campo
              etiqueta="Se fue el"
              type="date"
              value={fechaEgreso}
              onChange={(e) => setFechaEgreso(e.target.value)}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton accion="global.guardar" variante="principal" onClick={() => void enviar()}>
          {existente ? 'Guardar cambios' : 'Dar de alta'}
        </Boton>
        <Boton accion="global.cancelar" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}

/**
 * Quién entró y quién salió, por día.
 *
 * Es de sólo lectura a propósito: las marcas salen del reloj de la entrada y **corregirlas a
 * mano es otra cosa** —lleva motivo y queda auditado, regla 3 del documento de taller—. Hasta
 * que esa pantalla exista, lo que se ve acá es lo que pasó.
 */
function Asistencia() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))

  const dia = useQuery({
    queryKey: ['asistencia', tenantId, fecha],
    queryFn: () => api.fichaje.asistencia({ fecha }),
  })

  const presentes = dia.data?.datos.filter((j) => j.entrada && !j.salida).length ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Campo
          etiqueta="Día"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value || fecha)}
        />
      </div>

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Entradas y salidas</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {dia.data ? `${dia.data.datos.length} · ${presentes} adentro` : '…'}
          </span>
        </header>

        {dia.isPending && <Esqueleto />}
        {dia.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {mensajeDe(dia.error)}
          </p>
        )}
        {dia.data && dia.data.datos.length === 0 && (
          <p className="px-3 py-6 text-dato text-texto-suave">
            Nadie fichó ese día. Las marcas salen del reloj de la entrada: si todavía no hay ninguno
            registrado, no hay de dónde salgan.
          </p>
        )}

        {dia.data && dia.data.datos.length > 0 && (
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr>
                {['Legajo', 'Nombre', 'Entró', 'Salió', 'Estuvo', ''].map((c) => (
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
              {dia.data.datos.map((j) => (
                <tr key={j.id} className="hover:bg-superficie-2">
                  <td className="h-fila border-b border-borde-suave px-3 font-mono tabular-nums">
                    {j.legajo}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-medium">
                    {j.nombre}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono tabular-nums">
                    {j.entrada ? HORA.format(new Date(j.entrada)) : '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono tabular-nums">
                    {j.salida ? HORA.format(new Date(j.salida)) : '—'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {j.minutos === null ? '' : enHoras(j.minutos)}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    {j.entrada && !j.salida && (
                      <span className="inline-flex rounded-full bg-ok px-2 text-etiqueta font-semibold text-fondo">
                        Adentro
                      </span>
                    )}
                    {j.fuente === 'auto' && (
                      <span className="text-etiqueta text-atencion">Cerrada automáticamente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })

/** «7 h 45 min». Lo que se mira de una jornada es cuánto, no los minutos sueltos. */
function enHoras(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}
