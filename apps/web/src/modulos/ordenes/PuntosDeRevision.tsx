import { contrato } from '@gpb/contracts'
import {
  MAXIMO_NOMBRE_PUNTO,
  SECCION_EN_TALLER,
  SECCIONES_REVISION,
  SECCIONES_REVISION_NOMBRE,
  type SeccionRevision,
} from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar, preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoAgregar, IconoBajar, IconoEditar, IconoSubir } from '../../componentes/iconos.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { usePuedeUsar } from '../../sesion/permisos.ts'

type Punto = Awaited<ReturnType<typeof api.revision.listar>>['datos'][number]

const validarNombre = (v: string) =>
  !v.trim()
    ? 'Escribí qué se revisa'
    : v.trim().length > MAXIMO_NOMBRE_PUNTO
      ? `El nombre es corto: hasta ${MAXIMO_NOMBRE_PUNTO} letras`
      : null

/**
 * Los puntos que se revisan cuando entra un auto, la otra mitad de la hoja.
 *
 * Vienen los de la hoja de VW, y cada taller **apaga los que no hace, los ordena y agrega los
 * suyos**. No se borran: un punto apagado deja de aparecer en la recepción, pero las órdenes que
 * ya lo contestaron lo siguen mostrando con el nombre que tenía.
 */
export function PuntosDeRevision() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const puedeConfigurar = usePuedeUsar(contrato.revision.crear)
  const cache = useQueryClient()
  const clave = ['revision', tenantId]

  const listado = useQuery({ queryKey: clave, queryFn: () => api.revision.listar() })
  const poner = (datos: Awaited<ReturnType<typeof api.revision.listar>>) =>
    cache.setQueryData(clave, datos)

  const crear = useMutation({
    mutationFn: (v: { seccion: SeccionRevision; nombre: string }) => api.revision.crear(v),
    onSuccess: poner,
    meta: { exito: 'Punto agregado', error: mensajeGeneral },
  })
  const editar = useMutation({
    // El aviso depende de qué se cambió, y `exito` sólo ve la respuesta: viaja con ella.
    mutationFn: async (v: { id: string; nombre: string; activo: boolean; aviso: string }) => ({
      datos: await api.revision.editar({ id: v.id, nombre: v.nombre, activo: v.activo }),
      aviso: v.aviso,
    }),
    onSuccess: (r) => poner(r.datos),
    meta: { exito: (r) => (r as { aviso: string }).aviso, error: mensajeGeneral },
  })
  const mover = useMutation({
    mutationFn: (v: { id: string; hacia: 'arriba' | 'abajo' }) => api.revision.mover(v),
    onSuccess: poner,
    meta: { error: mensajeGeneral },
  })
  const ocupado = crear.isPending || editar.isPending || mover.isPending

  async function agregar(seccion: SeccionRevision) {
    const nombre = await preguntar({
      titulo: `¿Qué más se revisa en ${SECCIONES_REVISION_NOMBRE[seccion].toLowerCase()}?`,
      texto: 'Va al final de la sección. Después lo podés subir.',
      confirmar: 'Agregar',
      campo: { etiqueta: 'Qué se revisa', valor: '', validar: validarNombre },
    })
    if (nombre) crear.mutate({ seccion, nombre: nombre.trim() })
  }

  async function renombrar(p: Punto) {
    const nombre = await preguntar({
      titulo: `¿Cómo se llama «${p.nombre}»?`,
      texto: 'Las órdenes que ya lo revisaron siguen con el nombre de antes.',
      confirmar: 'Cambiar el nombre',
      campo: { etiqueta: 'Qué se revisa', valor: p.nombre, validar: validarNombre },
    })
    if (nombre && nombre.trim() !== p.nombre) {
      editar.mutate({ id: p.id, nombre: nombre.trim(), activo: p.activo, aviso: 'Nombre cambiado' })
    }
  }

  async function prenderOApagar(p: Punto) {
    if (
      p.activo &&
      !(await confirmar({
        titulo: `¿Dejar de revisar «${p.nombre}»?`,
        texto:
          'No aparece más en la recepción. Las órdenes que ya lo revisaron lo siguen mostrando, ' +
          'y lo podés volver a prender cuando quieras.',
        confirmar: 'Dejar de revisarlo',
        peligro: true,
      }))
    ) {
      return
    }
    editar.mutate({
      id: p.id,
      nombre: p.nombre,
      activo: !p.activo,
      aviso: p.activo ? 'El punto dejó de revisarse' : 'El punto vuelve a revisarse',
    })
  }

  return (
    <section aria-label="Puntos de la revisión" className="grid gap-3">
      <header className="grid gap-1">
        <h2 className="font-display text-ui font-semibold">Puntos de la revisión</h2>
        <p className="max-w-3xl text-dato text-texto-suave">
          Lo que se mira cuando entra un auto, con un semáforo: bien, para reparar o urgente. Lo que
          queda en ámbar o en rojo se le puede presupuestar al cliente desde la orden. Apagá lo que
          tu taller no revisa y agregá lo propio.
        </p>
      </header>

      {listado.isPending && (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-base bg-superficie" />
      )}
      {listado.isError && (
        <p role="alert" className="text-dato text-critico">
          No se pudieron cargar los puntos. {mensajeGeneral(listado.error)}
        </p>
      )}

      {listado.data && (
        <div className="grid gap-3 lg:grid-cols-2">
          {SECCIONES_REVISION.map((seccion) => {
            const puntos = listado.data.datos.filter((p) => p.seccion === seccion)
            return (
              <section
                key={seccion}
                aria-label={SECCIONES_REVISION_NOMBRE[seccion]}
                className="grid content-start overflow-hidden rounded-base border border-borde bg-superficie"
              >
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde px-3 py-2">
                  <h3 className="font-display text-dato font-semibold">
                    {SECCIONES_REVISION_NOMBRE[seccion]}
                  </h3>
                  {seccion === SECCION_EN_TALLER && (
                    <span className="text-etiqueta text-texto-tenue">
                      Se completa en el taller, con prueba de ruta
                    </span>
                  )}
                  {puedeConfigurar && (
                    <span className="ml-auto">
                      <Boton
                        tamano="chico"
                        icono={<IconoAgregar />}
                        deshabilitado={ocupado}
                        onClick={() => void agregar(seccion)}
                      >
                        Agregar
                      </Boton>
                    </span>
                  )}
                </header>
                <ul className="divide-y divide-borde-suave">
                  {puntos.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 text-dato"
                    >
                      <span className={`flex-1 ${p.activo ? '' : 'text-texto-tenue line-through'}`}>
                        {p.nombre}
                        {p.propio && (
                          <span className="ml-2 text-etiqueta text-texto-tenue no-underline">
                            · propio
                          </span>
                        )}
                      </span>
                      {!p.activo && (
                        <span className="text-etiqueta text-texto-tenue">No se revisa</span>
                      )}
                      {puedeConfigurar && (
                        <span className="flex flex-wrap gap-1">
                          <Boton
                            tamano="chico"
                            icono={<IconoSubir />}
                            deshabilitado={ocupado || i === 0}
                            onClick={() => mover.mutate({ id: p.id, hacia: 'arriba' })}
                          >
                            Subir
                          </Boton>
                          <Boton
                            tamano="chico"
                            icono={<IconoBajar />}
                            deshabilitado={ocupado || i === puntos.length - 1}
                            onClick={() => mover.mutate({ id: p.id, hacia: 'abajo' })}
                          >
                            Bajar
                          </Boton>
                          <Boton
                            tamano="chico"
                            icono={<IconoEditar />}
                            deshabilitado={ocupado}
                            onClick={() => void renombrar(p)}
                          >
                            Nombre
                          </Boton>
                          <Boton
                            tamano="chico"
                            variante={p.activo ? 'normal' : 'principal'}
                            deshabilitado={ocupado}
                            onClick={() => void prenderOApagar(p)}
                          >
                            {p.activo ? 'Apagar' : 'Prender'}
                          </Boton>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
