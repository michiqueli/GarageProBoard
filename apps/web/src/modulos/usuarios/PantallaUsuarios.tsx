import { accesoDeRuta, contrato } from '@gpb/contracts'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { ES_ESCRITORIO, useMedia } from '../../ganchos/useMedia.ts'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Usuario = Awaited<ReturnType<typeof api.usuarios.listar>>['datos'][number]

/** Qué se está editando: nada, un alta, o un usuario existente. */
type Edicion = null | { tipo: 'alta' } | { tipo: 'edicion'; usuario: Usuario }

const FECHA = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Un error dice qué hacer. El de un rol que no se puede asignar trae qué permisos
 * faltan: «No podés asignar Gerente» a secas deja a quien intenta sin saber por qué.
 */
function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) {
    const datos = error.data as { rol?: string; leFalta?: string[] } | undefined
    if (datos?.rol && datos.leFalta?.length) {
      return `No podés asignar ${datos.rol}: te falta ${datos.leFalta.join(', ')}.`
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * Los usuarios de la concesionaria: quién entra, con qué rol y a qué sucursales.
 *
 * La pantalla muestra lo que la API va a permitir —qué roles se pueden asignar, a quién se
 * puede modificar— pero **no lo decide**: las reglas las aplica el servidor. Acá se
 * deshabilita y se explica, para que nadie arme un alta que le van a rechazar.
 */
export function PantallaUsuarios() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const esEscritorio = useMedia(ES_ESCRITORIO)
  const puedeVer = usePuedeUsar(contrato.usuarios.listar)
  const puedeCrear = usePuedeUsar(contrato.usuarios.crear)
  const puedeEditar = usePuedeUsar(contrato.usuarios.editar)
  const [edicion, setEdicion] = useState<Edicion>(null)
  const [password, setPassword] = useState<{ email: string; clave: string } | null>(null)

  const listado = useQuery({
    queryKey: ['usuarios', tenantId],
    queryFn: () => api.usuarios.listar(),
    enabled: puedeVer,
  })

  function abrir(nueva: Edicion) {
    setPassword(null)
    setEdicion(nueva)
  }

  return (
    <Shell
      titulo="Usuarios"
      requiere={accesoDeRuta(contrato.usuarios.listar)}
      acciones={
        puedeCrear && !edicion ? (
          <Boton accion="global.nuevo" variante="principal" onClick={() => abrir({ tipo: 'alta' })}>
            Nuevo usuario
          </Boton>
        ) : undefined
      }
    >
      {password && (
        <section
          role="status"
          className="grid gap-2 rounded-base border border-ok bg-superficie px-3 py-3"
        >
          <p className="text-dato">
            <b>{password.email}</b> entra con esta contraseña. Pasásela en persona o por un mensaje
            aparte: no se vuelve a mostrar.
          </p>
          <output className="w-fit rounded-base border border-borde bg-superficie-2 px-3 py-1.5 font-mono text-ui select-all">
            {password.clave}
          </output>
        </section>
      )}

      {edicion && (
        <Formulario
          key={edicion.tipo === 'alta' ? 'alta' : edicion.usuario.id}
          edicion={edicion}
          alTerminar={(resultado) => {
            setEdicion(null)
            if (resultado) setPassword(resultado)
          }}
        />
      )}

      <section className="overflow-hidden rounded-base border border-borde bg-superficie">
        <header className="flex items-center gap-2.5 border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Quién entra al sistema</h2>
          <span className="font-mono text-etiqueta text-texto-tenue">
            {listado.data ? `${listado.data.datos.length} usuarios` : '…'}
          </span>
        </header>

        {listado.isPending && <Esqueleto />}
        {listado.isError && (
          <p role="alert" className="px-3 py-6 text-dato text-critico">
            {mensajeDe(listado.error)}
          </p>
        )}

        {listado.data && esEscritorio && (
          <table className="w-full border-collapse text-dato">
            <thead>
              <tr>
                {['Usuario', 'Roles', 'Sucursales', 'Estado', 'Último acceso', ''].map((c) => (
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
              {listado.data.datos.map((u) => (
                <tr key={u.id} className="hover:bg-superficie-2">
                  <td className="h-fila border-b border-borde-suave px-3">
                    <span className="font-medium">
                      {u.apellido}, {u.nombre}
                    </span>
                    <span className="ml-2 text-etiqueta text-texto-tenue">{u.email}</span>
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {u.roles.map((r) => r.nombre).join(', ') || <SinRol />}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-texto-suave">
                    {u.sucursales.map((s) => s.nombre).join(', ')}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3">
                    <Estado activo={u.activo} />
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 font-mono text-etiqueta text-texto-suave">
                    {u.ultimoAcceso ? FECHA.format(new Date(u.ultimoAcceso)) : 'Nunca'}
                  </td>
                  <td className="h-fila border-b border-borde-suave px-3 text-right">
                    <AccionFila
                      usuario={u}
                      puedeEditar={puedeEditar}
                      onEditar={() => abrir({ tipo: 'edicion', usuario: u })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {listado.data && !esEscritorio && (
          <ul className="divide-y divide-borde-suave">
            {listado.data.datos.map((u) => (
              <li key={u.id} className="grid gap-1 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">
                    {u.apellido}, {u.nombre}
                  </span>
                  <span className="ml-auto">
                    <Estado activo={u.activo} />
                  </span>
                </div>
                <span className="text-etiqueta text-texto-tenue">{u.email}</span>
                <span className="text-etiqueta text-texto-suave">
                  {u.roles.map((r) => r.nombre).join(', ') || 'Sin rol'} ·{' '}
                  {u.sucursales.map((s) => s.nombre).join(', ')}
                </span>
                <div>
                  <AccionFila
                    usuario={u}
                    puedeEditar={puedeEditar}
                    onEditar={() => abrir({ tipo: 'edicion', usuario: u })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/**
 * Lo que se puede hacer con cada usuario. Si no se puede, se dice por qué en vez de
 * mostrar un botón que la API va a rechazar.
 */
function AccionFila({
  usuario,
  puedeEditar,
  onEditar,
}: {
  usuario: Usuario
  puedeEditar: boolean
  onEditar: () => void
}) {
  const miId = usarSesion((e) => e.datos?.usuario.id)
  if (!puedeEditar) return null
  if (usuario.id === miId) {
    return <span className="text-etiqueta text-texto-tenue">Sos vos</span>
  }
  if (!usuario.editable) {
    return (
      <span className="text-etiqueta text-texto-tenue" title="Tiene permisos que vos no tenés">
        Tiene más permisos
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onEditar}
      className="h-campo rounded-base border border-borde px-2.5 text-dato text-texto-suave hover:bg-superficie-2 hover:text-texto"
    >
      Modificar
    </button>
  )
}

function Formulario({
  edicion,
  alTerminar,
}: {
  edicion: NonNullable<Edicion>
  alTerminar: (password?: { email: string; clave: string }) => void
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const existente = edicion.tipo === 'edicion' ? edicion.usuario : null
  const primerCampo = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [apellido, setApellido] = useState(existente?.apellido ?? '')
  const [activo, setActivo] = useState(existente?.activo ?? true)
  const [roles, setRoles] = useState<Set<string>>(new Set(existente?.roles.map((r) => r.id)))
  const [sucursales, setSucursales] = useState<Set<string>>(
    new Set(existente?.sucursales.map((s) => s.id)),
  )

  useEffect(() => {
    // Se entra tipeando: el foco arranca en el primer campo.
    primerCampo.current?.focus()
  }, [])

  const opciones = useQuery({
    queryKey: ['usuarios', tenantId, 'opciones'],
    queryFn: () => api.usuarios.opciones(),
  })

  // Con una sola sucursal no hay nada que elegir: queda marcada.
  const unicaSucursal = opciones.data?.sucursales.length === 1 ? opciones.data.sucursales[0] : null
  useEffect(() => {
    if (unicaSucursal && sucursales.size === 0) setSucursales(new Set([unicaSucursal.id]))
  }, [unicaSucursal, sucursales.size])

  const invalidar = () => cache.invalidateQueries({ queryKey: ['usuarios', tenantId] })

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombre,
        apellido,
        rolIds: [...roles],
        sucursalIds: [...sucursales],
      }
      if (existente) {
        await api.usuarios.editar({ ...datos, id: existente.id, activo })
        return undefined
      }
      const { usuario, passwordInicial } = await api.usuarios.crear({ ...datos, email })
      return { email: usuario.email, clave: passwordInicial }
    },
    onSuccess: async (password) => {
      await invalidar()
      alTerminar(password)
    },
    meta: {
      exito: () =>
        !existente
          ? `${nombre} ${apellido} dado de alta`
          : existente.activo && !activo
            ? `${existente.email} dado de baja: se cerraron sus sesiones`
            : `Cambios guardados en ${existente.email}`,
      error: mensajeDe,
    },
  })

  const regenerar = useMutation({
    mutationFn: async () => {
      if (!existente) throw new Error('Sin usuario')
      const { usuario, passwordInicial } = await api.usuarios.nuevaPassword({ id: existente.id })
      return { email: usuario.email, clave: passwordInicial }
    },
    onSuccess: async (password) => {
      await invalidar()
      alTerminar(password)
    },
    meta: { exito: 'Contraseña nueva generada', error: mensajeDe },
  })

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (guardar.isPending) return
    if (
      existente?.activo &&
      !activo &&
      !(await confirmar({
        titulo: `¿Dar de baja a ${existente.nombre} ${existente.apellido}?`,
        texto:
          'No va a poder entrar al sistema y se cierran sus sesiones abiertas. Se puede volver a habilitar.',
        confirmar: 'Dar de baja',
        peligro: true,
      }))
    ) {
      return
    }
    guardar.mutate()
  }

  async function generarPassword() {
    if (
      existente &&
      (await confirmar({
        titulo: `¿Generar una contraseña nueva para ${existente.email}?`,
        texto: 'La que tiene ahora deja de servir y se cierran sus sesiones.',
        confirmar: 'Generar contraseña nueva',
        peligro: true,
      }))
    ) {
      regenerar.mutate()
    }
  }

  function alternar(conjunto: Set<string>, id: string, marcado: boolean) {
    const nuevo = new Set(conjunto)
    if (marcado) nuevo.add(id)
    else nuevo.delete(id)
    return nuevo
  }

  return (
    <form
      onSubmit={enviar}
      aria-label={existente ? `Modificar a ${existente.email}` : 'Nuevo usuario'}
      className="grid gap-4 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">
        {existente ? `${existente.apellido}, ${existente.nombre}` : 'Nuevo usuario'}
      </h2>

      <div className="grid gap-3 md:grid-cols-3">
        {existente ? (
          <Campo etiqueta="Correo" value={existente.email} disabled ayuda="No se cambia" />
        ) : (
          <Campo
            ref={primerCampo}
            etiqueta="Correo"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            ayuda="Con este correo entra al sistema"
          />
        )}
        <Campo
          {...(existente ? { ref: primerCampo } : {})}
          etiqueta="Nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Apellido"
          required
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
        />
      </div>

      {opciones.isPending && <Esqueleto />}
      {opciones.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-etiqueta font-medium text-texto-suave">Roles</legend>
            {opciones.data.roles.map((r) => {
              // Uno que ya tiene y no se podría asignar se deja marcado y fijo: quitarlo
              // tampoco se puede, porque a ese usuario no se lo podría ni abrir.
              const bloqueado = r.leFalta.length > 0
              return (
                <label
                  key={r.id}
                  className={`flex items-start gap-2 text-dato ${bloqueado ? 'text-texto-tenue' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-marca"
                    checked={roles.has(r.id)}
                    disabled={bloqueado}
                    onChange={(e) => setRoles(alternar(roles, r.id, e.target.checked))}
                  />
                  <span>
                    {r.nombre}
                    {bloqueado && (
                      <span className="block text-etiqueta">
                        No lo podés asignar: te falta {r.leFalta.join(', ')}.
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </fieldset>

          <fieldset className="grid content-start gap-1">
            <legend className="mb-1 text-etiqueta font-medium text-texto-suave">
              Sucursales a las que entra
            </legend>
            {opciones.data.sucursales.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-dato">
                <input
                  type="checkbox"
                  className="accent-marca"
                  checked={sucursales.has(s.id)}
                  onChange={(e) => setSucursales(alternar(sucursales, s.id, e.target.checked))}
                />
                {s.nombre}
                <span className="text-etiqueta text-texto-tenue">{s.razonSocial}</span>
              </label>
            ))}

            {existente && (
              <label className="mt-3 flex items-center gap-2 text-dato">
                <input
                  type="checkbox"
                  className="accent-marca"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                Puede entrar al sistema
                {!activo && (
                  <span className="text-etiqueta text-atencion">
                    queda dado de baja y se cierran sus sesiones
                  </span>
                )}
              </label>
            )}
          </fieldset>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton accion="global.guardar" variante="principal" onClick={() => void enviar()}>
          {existente ? 'Guardar cambios' : 'Dar de alta'}
        </Boton>
        <Boton accion="global.cancelar" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
        {existente && (
          <span className="ml-auto">
            <Boton variante="sutil" onClick={() => void generarPassword()}>
              Generar contraseña nueva
            </Boton>
          </span>
        )}
      </div>
    </form>
  )
}

function Estado({ activo }: { activo: boolean }) {
  // Activo es lo normal: contorneado. Dado de baja no reclama nada: sin píldora.
  return activo ? (
    <span className="inline-flex rounded-full border border-ok px-2 text-etiqueta font-semibold text-ok">
      Activo
    </span>
  ) : (
    <span className="text-etiqueta text-texto-tenue">Dado de baja</span>
  )
}

function SinRol() {
  return <span className="text-etiqueta text-atencion">Sin rol: no ve ninguna pantalla</span>
}

function Esqueleto() {
  return (
    <div className="grid gap-px p-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-fila animate-pulse rounded-[2px] bg-superficie-2" />
      ))}
    </div>
  )
}
