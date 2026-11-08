import { MAXIMO_NOMBRE_CATEGORIA_GASTO } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar, preguntar } from '../../componentes/avisos.ts'
import { Boton } from '../../componentes/Boton.tsx'
import { IconoAgregar, IconoEditar } from '../../componentes/iconos.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'

type Listado = Awaited<ReturnType<typeof api.costosUnidad.categorias>>
type Categoria = Listado['datos'][number]

const validar = (v: string) =>
  !v.trim()
    ? 'Escribí el nombre'
    : v.trim().length > MAXIMO_NOMBRE_CATEGORIA_GASTO
      ? `Es largo: hasta ${MAXIMO_NOMBRE_CATEGORIA_GASTO} letras`
      : null

/** En qué se gasta una unidad: cada concesionaria apaga las que no usa y suma las suyas. */
export function CategoriasDeGasto() {
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const cache = useQueryClient()
  const clave = ['stock', tenantId, 'categorias']
  const listado = useQuery({ queryKey: clave, queryFn: () => api.costosUnidad.categorias() })
  const poner = (d: Listado) => cache.setQueryData(clave, d)

  const crear = useMutation({
    mutationFn: (nombre: string) => api.costosUnidad.crearCategoria({ nombre }),
    onSuccess: poner,
    meta: { exito: 'Categoría agregada', error: mensajeGeneral },
  })
  const editar = useMutation({
    mutationFn: (v: { id: string; nombre: string; activo: boolean }) =>
      api.costosUnidad.editarCategoria(v),
    onSuccess: poner,
    meta: { exito: 'Categoría guardada', error: mensajeGeneral },
  })
  const ocupado = crear.isPending || editar.isPending

  async function agregar() {
    const nombre = await preguntar({
      titulo: '¿En qué más se gasta una unidad?',
      confirmar: 'Agregar',
      campo: { etiqueta: 'Categoría', valor: '', validar },
    })
    if (nombre) crear.mutate(nombre.trim())
  }

  async function renombrar(c: Categoria) {
    const nombre = await preguntar({
      titulo: `¿Cómo se llama «${c.nombre}»?`,
      confirmar: 'Cambiar el nombre',
      campo: { etiqueta: 'Categoría', valor: c.nombre, validar },
    })
    if (nombre && nombre.trim() !== c.nombre) {
      editar.mutate({ id: c.id, nombre: nombre.trim(), activo: c.activo })
    }
  }

  async function prenderOApagar(c: Categoria) {
    if (
      c.activo &&
      !(await confirmar({
        titulo: `¿Dejar de usar «${c.nombre}»?`,
        texto: 'No se ofrece más al cargar un gasto. Los que ya la usaron la siguen mostrando.',
        confirmar: 'Dejar de usarla',
        peligro: true,
      }))
    ) {
      return
    }
    editar.mutate({ id: c.id, nombre: c.nombre, activo: !c.activo })
  }

  return (
    <section
      aria-label="Categorías de gasto"
      className="grid max-w-2xl overflow-hidden rounded-base border border-borde bg-superficie"
    >
      <header className="flex items-center justify-between border-b border-borde px-3 py-2">
        <h2 className="font-display text-dato font-semibold">Categorías de gasto</h2>
        <Boton
          tamano="chico"
          icono={<IconoAgregar />}
          deshabilitado={ocupado}
          onClick={() => void agregar()}
        >
          Agregar
        </Boton>
      </header>
      {listado.isPending && <div className="m-3 h-16 animate-pulse rounded-base bg-superficie-2" />}
      {listado.isError && (
        <p role="alert" className="px-3 py-3 text-dato text-critico">
          {mensajeGeneral(listado.error)}
        </p>
      )}
      <ul className="divide-y divide-borde-suave">
        {listado.data?.datos.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-dato"
          >
            <span className={`flex-1 ${c.activo ? '' : 'text-texto-tenue line-through'}`}>
              {c.nombre}
            </span>
            <span className="flex gap-1">
              <Boton
                tamano="chico"
                icono={<IconoEditar />}
                deshabilitado={ocupado}
                onClick={() => void renombrar(c)}
              >
                Cambiar el nombre
              </Boton>
              <Boton
                tamano="chico"
                variante={c.activo ? 'peligro' : 'normal'}
                deshabilitado={ocupado}
                onClick={() => void prenderOApagar(c)}
              >
                {c.activo ? 'Dejar de usar' : 'Volver a usar'}
              </Boton>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
