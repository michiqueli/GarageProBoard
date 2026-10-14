import { accesoDeRuta, contrato } from '@gpb/contracts'
import {
  ACCIONES_POR_SUJETO,
  nombreAccion,
  nombreSujeto,
  type Permiso,
  SUJETOS_DE_ROL,
} from '@gpb/core'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoClonar, IconoEditar } from '../../componentes/iconos.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Rol = Awaited<ReturnType<typeof api.roles.listar>>['datos'][number]

/** Qué se está haciendo: nada, un rol desde cero, uno a partir de otro, o modificar. */
type Edicion =
  | null
  | { tipo: 'nuevo' }
  | { tipo: 'clonar'; rol: Rol }
  | { tipo: 'modificar'; rol: Rol }

/** Todas las casillas: con lo que empieza el clon del que puede todo. */
const TODOS: Permiso[] = SUJETOS_DE_ROL.flatMap((sujeto) =>
  ACCIONES_POR_SUJETO[sujeto].map((accion) => ({ accion, sujeto })),
)

const clave = (p: Permiso) => `${p.accion}:${p.sujeto}`

/** «Clientes», con mayúscula: es el nombre de la fila, no parte de una frase. */
function titulo(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function mensajeDe(error: unknown): string {
  if (error instanceof ORPCError) {
    const datos = error.data as { motivo?: string; leFalta?: string[] } | undefined
    if (datos?.motivo) return datos.motivo
    if (datos?.leFalta?.length) {
      return `No podés dar permisos que no tenés: te falta ${datos.leFalta.join(', ')}.`
    }
    return error.message
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.'
}

/**
 * Los roles: qué puede hacer cada uno, y armarlos a medida.
 *
 * Se editan con casillas, una por permiso que tiene sentido —no hay «facturar vehículos»—.
 * Lo que no cabe en una casilla, como «edita sólo las órdenes que tiene asignadas», se
 * muestra y se conserva: no se puede romper sin querer desde acá.
 *
 * Qué rol se puede modificar lo decide la API y lo dice en cada uno: el que puede todo no,
 * y el que tiene quien mira tampoco.
 */
export function PantallaRoles() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeVer = usePuedeUsar(contrato.roles.listar)
  const puedeCrear = usePuedeUsar(contrato.roles.crear)
  const [edicion, setEdicion] = useState<Edicion>(null)

  const listado = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => api.roles.listar(),
    enabled: puedeVer,
  })

  return (
    <Shell
      titulo="Roles"
      requiere={accesoDeRuta(contrato.roles.listar)}
      acciones={
        puedeCrear && !edicion ? (
          <Boton
            accion="global.nuevo"
            variante="principal"
            onClick={() => setEdicion({ tipo: 'nuevo' })}
          >
            Nuevo rol
          </Boton>
        ) : undefined
      }
    >
      {edicion && (
        <Formulario
          key={edicion.tipo === 'nuevo' ? 'nuevo' : `${edicion.tipo}-${edicion.rol.id}`}
          edicion={edicion}
          alTerminar={() => setEdicion(null)}
        />
      )}

      {listado.isPending && <div className="h-40 animate-pulse rounded-base bg-superficie-2" />}
      {listado.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeDe(listado.error)}
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {listado.data?.datos.map((r) => (
          <li key={r.id}>
            <section
              aria-label={r.nombre}
              className="grid h-full gap-2 rounded-base border border-borde bg-superficie p-3"
            >
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="font-display text-dato font-semibold">{r.nombre}</h2>
                <span className="text-etiqueta text-texto-tenue">
                  {r.usuarios === 1 ? '1 usuario' : `${r.usuarios} usuarios`}
                </span>
                {!edicion && (
                  <span className="ml-auto flex gap-2">
                    {!r.noEditable && (
                      <Boton
                        tamano="chico"
                        icono={<IconoEditar />}
                        onClick={() => setEdicion({ tipo: 'modificar', rol: r })}
                      >
                        Modificar
                      </Boton>
                    )}
                    {puedeCrear && (
                      <Boton
                        tamano="chico"
                        icono={<IconoClonar />}
                        onClick={() => setEdicion({ tipo: 'clonar', rol: r })}
                      >
                        Clonar
                      </Boton>
                    )}
                  </span>
                )}
              </header>
              {r.descripcion && <p className="text-etiqueta text-texto-suave">{r.descripcion}</p>}

              {r.todo ? (
                <p className="text-dato font-semibold">Puede todo el sistema</p>
              ) : r.permisos.length === 0 && r.especiales.length === 0 ? (
                <p className="text-dato text-texto-suave">Sin permisos: no ve ninguna pantalla.</p>
              ) : (
                <ResumenPermisos permisos={r.permisos} especiales={r.especiales} />
              )}

              {r.novedad && (
                <NovedadDelSistema
                  rol={r}
                  novedad={r.novedad}
                  puedeDecidir={!r.noEditable && !edicion}
                />
              )}

              {r.noEditable && puedeCrear && (
                <p className="text-etiqueta text-texto-tenue">{r.noEditable}</p>
              )}
            </section>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

/**
 * Lo que el sistema le cambió a un rol predefinido que esta concesionaria había editado.
 * No se aplica solo porque quien lo editó sabía algo que el sistema no sabe: se ofrece, y
 * aplicarlo suma y saca sólo eso, sin deshacer lo que ellos habían cambiado.
 */
function NovedadDelSistema({
  rol,
  novedad,
  puedeDecidir,
}: {
  rol: Rol
  novedad: NonNullable<Rol['novedad']>
  puedeDecidir: boolean
}) {
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const alTerminar = () => cache.invalidateQueries({ queryKey: ['roles', tenantId] })

  const aplicar = useMutation({
    mutationFn: () => api.roles.aplicarNovedad({ id: rol.id }),
    onSuccess: alTerminar,
    meta: { exito: () => `${rol.nombre} quedó en la versión nueva`, error: mensajeDe },
  })
  const dejar = useMutation({
    mutationFn: () => api.roles.descartarNovedad({ id: rol.id }),
    onSuccess: alTerminar,
    meta: { exito: () => `${rol.nombre} quedó como estaba`, error: mensajeDe },
  })
  const ocupado = aplicar.isPending || dejar.isPending

  async function preguntarYAplicar() {
    const titulares =
      rol.usuarios === 0
        ? 'No lo tiene nadie todavía.'
        : rol.usuarios === 1
          ? 'Lo tiene 1 usuario: le vale desde su próximo paso, y le llega un aviso.'
          : `Lo tienen ${rol.usuarios} usuarios: les vale desde su próximo paso, y a cada uno le llega un aviso.`
    const si = await confirmar({
      titulo: `¿Aplicar la versión nueva a ${rol.nombre}?`,
      texto: `Se suma y se saca sólo lo que cambió el sistema; lo que ustedes le habían cambiado queda. ${titulares}`,
      confirmar: 'Aplicar',
    })
    if (si) aplicar.mutate()
  }

  async function preguntarYDejar() {
    const si = await confirmar({
      titulo: `¿Dejar ${rol.nombre} como está?`,
      texto:
        'El rol no cambia y esta versión deja de ofrecerse. Lo que haga falta se lo podés agregar a mano con Modificar.',
      confirmar: 'Dejarlo como está',
      peligro: true,
    })
    if (si) dejar.mutate()
  }

  return (
    <div className="grid gap-1.5 rounded-base border border-atencion p-2 text-etiqueta">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-full bg-atencion px-2 font-semibold text-fondo">
          Versión nueva
        </span>
        <span className="text-texto-suave">
          El sistema cambió este rol. Como ustedes lo habían modificado, no se aplicó solo.
        </span>
      </p>
      {novedad.agrega.length > 0 && (
        <p>
          <span className="text-texto-tenue">Agrega: </span>
          {novedad.agrega.join(', ')}
        </p>
      )}
      {novedad.quita.length > 0 && (
        <p>
          <span className="text-texto-tenue">Saca: </span>
          {novedad.quita.join(', ')}
        </p>
      )}
      {puedeDecidir && (
        <span className="flex flex-wrap gap-2">
          <Boton
            tamano="chico"
            variante="principal"
            deshabilitado={ocupado}
            onClick={preguntarYAplicar}
          >
            Aplicar
          </Boton>
          <Boton tamano="chico" deshabilitado={ocupado} onClick={preguntarYDejar}>
            Dejarlo como está
          </Boton>
        </span>
      )}
    </div>
  )
}

/** Los permisos agrupados por fila: «Clientes: ver, dar de alta». */
function ResumenPermisos({ permisos, especiales }: { permisos: Permiso[]; especiales: string[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-etiqueta">
      {SUJETOS_DE_ROL.filter((s) => permisos.some((p) => p.sujeto === s)).map((sujeto) => (
        <div key={sujeto} className="contents">
          <dt className="text-texto-tenue">{titulo(nombreSujeto(sujeto))}</dt>
          <dd>
            {permisos
              .filter((p) => p.sujeto === sujeto)
              .map((p) => nombreAccion(p.accion))
              .join(', ')}
          </dd>
        </div>
      ))}
      {especiales.map((e) => (
        <dd key={e} className="col-span-2 text-texto-suave italic">
          {e}
        </dd>
      ))}
    </dl>
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
  const primerCampo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    primerCampo.current?.focus()
  }, [])

  const base = edicion.tipo === 'nuevo' ? null : edicion.rol
  const [nombre, setNombre] = useState(
    edicion.tipo === 'modificar'
      ? edicion.rol.nombre
      : edicion.tipo === 'clonar'
        ? `${edicion.rol.nombre} (copia)`
        : '',
  )
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? '')
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(
    () => new Set((base?.todo ? TODOS : (base?.permisos ?? [])).map(clave)),
  )

  const guardar = useMutation({
    mutationFn: () => {
      const permisos = TODOS.filter((p) => marcados.has(clave(p)))
      const datos = { nombre, descripcion, permisos }
      if (edicion.tipo === 'modificar') return api.roles.editar({ ...datos, id: edicion.rol.id })
      return api.roles.crear({
        ...datos,
        basadoEn: edicion.tipo === 'clonar' ? edicion.rol.id : null,
      })
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['roles', tenantId] })
      alTerminar()
    },
    meta: {
      exito: () =>
        edicion.tipo === 'modificar' ? `Rol ${nombre} guardado` : `Rol ${nombre} creado`,
      error: mensajeDe,
    },
  })

  function alternar(p: Permiso) {
    setMarcados((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(clave(p))) nuevo.delete(clave(p))
      else nuevo.add(clave(p))
      return nuevo
    })
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    guardar.mutate()
  }

  const encabezado =
    edicion.tipo === 'nuevo'
      ? 'Nuevo rol'
      : edicion.tipo === 'clonar'
        ? `Nuevo rol a partir de ${edicion.rol.nombre}`
        : `Modificar ${edicion.rol.nombre}`

  return (
    <section
      aria-label={encabezado}
      className="grid gap-3 rounded-base border border-borde bg-superficie p-3"
    >
      <h2 className="font-display text-dato font-semibold">{encabezado}</h2>

      <form id="formulario-rol" onSubmit={enviar} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <Campo
            ref={primerCampo}
            etiqueta="Nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <div className="md:col-span-2">
            <Campo
              etiqueta="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              ayuda="Para qué es: quien asigna roles la lee"
            />
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-base border border-borde">
          {SUJETOS_DE_ROL.map((sujeto) => (
            <fieldset
              key={sujeto}
              className="grid gap-1.5 bg-superficie px-3 py-2 md:grid-cols-[12rem_1fr] md:items-center"
            >
              <legend className="float-left text-dato font-medium md:float-none">
                {titulo(nombreSujeto(sujeto))}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ACCIONES_POR_SUJETO[sujeto].map((accion) => (
                  <label key={accion} className="flex items-center gap-1.5 text-dato">
                    <input
                      type="checkbox"
                      className="accent-marca"
                      checked={marcados.has(clave({ accion, sujeto }))}
                      onChange={() => alternar({ accion, sujeto })}
                    />
                    {nombreAccion(accion)}
                    {accion === 'autorizar' && sujeto === 'Orden' && (
                      <span className="text-etiqueta text-texto-tenue">(entregar sin factura)</span>
                    )}
                    {accion === 'corregir' && sujeto === 'Orden' && (
                      <span className="text-etiqueta text-texto-tenue">
                        (los tiempos del taller)
                      </span>
                    )}
                    {accion === 'administrar' && (
                      <span className="text-etiqueta text-texto-tenue">(todo sobre usuarios)</span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {base && base.especiales.length > 0 && edicion.tipo !== 'nuevo' && (
          <div className="grid gap-1 text-etiqueta">
            <span className="font-medium text-texto-suave">
              Reglas que no se cambian desde acá, y se conservan:
            </span>
            {base.especiales.map((e) => (
              <span key={e} className="text-texto-suave italic">
                {e}
              </span>
            ))}
          </div>
        )}
        {edicion.tipo === 'modificar' && edicion.rol.usuarios > 0 && (
          <p className="text-etiqueta text-atencion">
            {edicion.rol.usuarios === 1
              ? 'Lo tiene 1 usuario: el cambio le vale desde su próximo paso, y le llega un aviso.'
              : `Lo tienen ${edicion.rol.usuarios} usuarios: el cambio les vale desde su próximo paso, y a cada uno le llega un aviso.`}
          </p>
        )}
      </form>

      <div className="flex gap-2">
        <Boton
          accion="global.guardar"
          variante="principal"
          deshabilitado={guardar.isPending}
          onClick={() =>
            (document.getElementById('formulario-rol') as HTMLFormElement | null)?.requestSubmit()
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
