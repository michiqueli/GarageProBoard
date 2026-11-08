import { accesoDeRuta, contrato } from '@gpb/contracts'
import { numeroDeHoja } from '@gpb/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { confirmar } from '../../componentes/avisos.ts'
import { Boton, clasesBoton } from '../../componentes/Boton.tsx'
import { Campo } from '../../componentes/Campo.tsx'
import { IconoAgregar, IconoBorrar, IconoVolver } from '../../componentes/iconos.tsx'
import { Selector } from '../../componentes/Selector.tsx'
import { CampoRepuesto, type RepuestoElegido } from '../../componentes/SelectorRepuesto.tsx'
import { Shell } from '../../componentes/Shell.tsx'
import { usarSesion } from '../../sesion/almacen.ts'
import { api } from '../../sesion/cliente.ts'
import { mensajeGeneral } from '../../sesion/consultas.ts'
import { useAtajo, useCambiosSinGuardar, useVolver } from '../../teclado/index.ts'
import { ALICUOTAS } from '../caja/comprobantes.ts'

type Ficha = Awaited<ReturnType<typeof api.services.ficha>>
type Alicuota = (typeof ALICUOTAS)[number]['valor']

interface Renglon {
  clave: number
  tipo: 'trabajo' | 'repuesto'
  repuestoId: string | null
  codigo: string | null
  descripcion: string
  cantidad: string
  precio: string
  alicuota: Alicuota
  minutos: string
}

let proxima = 1
const renglonNuevo = (tipo: Renglon['tipo']): Renglon => ({
  clave: proxima++,
  tipo,
  repuestoId: null,
  codigo: null,
  descripcion: '',
  cantidad: '1',
  precio: '0',
  alicuota: 5,
  minutos: '',
})

const sinCeros = (t: string) => (t.includes('.') ? t.replace(/\.?0+$/, '') : t)

const renglonMalo = (r: Renglon) => {
  const cantidad = numeroDeHoja(r.cantidad)
  const minutos = r.minutos.trim() ? numeroDeHoja(r.minutos) : '0'
  return (
    !r.descripcion.trim() ||
    cantidad === null ||
    Number(cantidad) <= 0 ||
    numeroDeHoja(r.precio) === null ||
    minutos === null ||
    !Number.isInteger(Number(minutos))
  )
}

/** Un service nuevo o uno que ya estaba: el mismo formulario. */
export function PantallaEditarService() {
  const { id } = getRouteApi('/con-sesion/taller/services/$id').useParams()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const consulta = useQuery({
    queryKey: ['services', tenantId, 'ficha', id],
    queryFn: () => api.services.ficha({ id }),
  })

  return (
    <Shell
      titulo={consulta.data?.nombre ?? 'Service'}
      requiere={accesoDeRuta(contrato.services.crear)}
    >
      {consulta.isPending && <div className="h-48 animate-pulse rounded-base bg-superficie" />}
      {consulta.isError && (
        <p role="alert" className="text-dato text-critico">
          {mensajeGeneral(consulta.error)}
        </p>
      )}
      {consulta.data && <Formulario key={consulta.data.id} inicial={consulta.data} />}
    </Shell>
  )
}

export function PantallaNuevoService() {
  return (
    <Shell titulo="Nuevo service" requiere={accesoDeRuta(contrato.services.crear)}>
      <Formulario inicial={null} />
    </Shell>
  )
}

function Formulario({ inicial }: { inicial: Ficha | null }) {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const tenantId = usarSesion((e) => e.datos?.tenant.id)
  const volverAlListado = () => void navegar({ to: '/taller/services' })
  useVolver(volverAlListado)

  const [marca, setMarca] = useState(inicial?.marca ?? '')
  const [modelo, setModelo] = useState(inicial?.modelo ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [km, setKm] = useState(inicial?.kilometros?.toString() ?? '')
  const [renglones, setRenglones] = useState<Renglon[]>(() =>
    inicial
      ? inicial.renglones.map((r) => ({
          clave: proxima++,
          tipo: r.tipo,
          repuestoId: r.repuestoId,
          codigo: r.codigo,
          descripcion: r.descripcion,
          cantidad: sinCeros(r.cantidad),
          precio: sinCeros(r.precioUnitario),
          alicuota: r.codigoAlicuota as Alicuota,
          minutos: r.minutos?.toString() ?? '',
        }))
      : [renglonNuevo('trabajo')],
  )
  const [cambios, setCambios] = useState(false)
  const [nuevo, setNuevo] = useState<number | null>(null)
  useCambiosSinGuardar(cambios)

  const tocar =
    <T,>(poner: (v: T) => void) =>
    (v: T) => {
      setCambios(true)
      poner(v)
    }
  const cambiar = (clave: number, parcial: Partial<Renglon>) => {
    setCambios(true)
    setRenglones((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...parcial } : x)))
  }
  const agregar = (tipo: Renglon['tipo']) => {
    setCambios(true)
    const r = renglonNuevo(tipo)
    setNuevo(r.clave)
    setRenglones((xs) => [...xs, r])
  }
  const elegirPieza = (clave: number, p: RepuestoElegido) =>
    cambiar(clave, {
      repuestoId: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      precio: sinCeros(p.precioVenta),
      alicuota: p.codigoAlicuota as Alicuota,
    })

  async function quitar(r: Renglon) {
    if (
      r.descripcion.trim() &&
      !(await confirmar({
        titulo: `¿Quitar «${r.descripcion.trim()}»?`,
        texto: 'Se quita del service cuando guardes.',
        confirmar: 'Quitar',
        peligro: true,
      }))
    ) {
      return
    }
    setCambios(true)
    setRenglones((xs) => xs.filter((x) => x.clave !== r.clave))
  }

  const kmMalo = km.trim() !== '' && !Number.isInteger(Number(numeroDeHoja(km) ?? 'x'))
  const invalido = !nombre.trim() || kmMalo || !renglones.length || renglones.some(renglonMalo)

  const datos = () => ({
    marca: marca.trim() || null,
    modelo: modelo.trim() || null,
    nombre: nombre.trim(),
    kilometros: km.trim() ? Number(numeroDeHoja(km)) : null,
    renglones: renglones.map((r) => ({
      tipo: r.tipo,
      repuestoId: r.repuestoId,
      codigo: r.codigo,
      descripcion: r.descripcion.trim(),
      cantidad: numeroDeHoja(r.cantidad) as string,
      precioUnitario: numeroDeHoja(r.precio) as string,
      codigoAlicuota: r.alicuota,
      minutos: r.tipo === 'trabajo' && r.minutos.trim() ? Number(numeroDeHoja(r.minutos)) : null,
    })),
  })

  const guardar = useMutation({
    mutationFn: (activo: boolean) =>
      inicial
        ? api.services.editar({ ...datos(), id: inicial.id, activo })
        : api.services.crear(datos()),
    onSuccess: async () => {
      setCambios(false)
      await cache.invalidateQueries({ queryKey: ['services', tenantId] })
      volverAlListado()
    },
    meta: { exito: 'Service guardado', error: mensajeGeneral },
  })
  const activo = inicial?.activo ?? true
  const guardable = !invalido && !guardar.isPending

  async function prenderOApagar() {
    if (
      activo &&
      !(await confirmar({
        titulo: `¿Apagar «${nombre.trim()}»?`,
        texto: 'Deja de ofrecerse en las órdenes. Las que ya lo usaron no cambian.',
        confirmar: 'Apagar',
        peligro: true,
      }))
    ) {
      return
    }
    guardar.mutate(!activo)
  }

  useAtajo('global.guardar', () => guardable && guardar.mutate(activo), cambios || !inicial)
  useAtajo('global.nuevo', () => agregar('trabajo'))

  return (
    <>
      <Link to="/taller/services" className={`w-fit ${clasesBoton('normal', 'chico')}`}>
        <IconoVolver />
        Todos los services
      </Link>

      <section
        aria-label="Datos del service"
        className="grid gap-3 rounded-base border border-borde bg-superficie p-3 md:grid-cols-[1fr_1fr_2fr_8rem]"
      >
        <Campo
          etiqueta="Marca"
          ayuda="Vacía, es genérico: se ofrece para cualquier auto"
          value={marca}
          maxLength={60}
          onChange={(e) => tocar(setMarca)(e.target.value)}
        />
        <Campo
          etiqueta="Modelo"
          value={modelo}
          maxLength={80}
          onChange={(e) => tocar(setModelo)(e.target.value)}
        />
        <Campo
          etiqueta="Nombre"
          autoFocus={!inicial}
          placeholder="Service 10.000 km"
          value={nombre}
          maxLength={120}
          onChange={(e) => tocar(setNombre)(e.target.value)}
        />
        <Campo
          etiqueta="Kilómetros"
          inputMode="numeric"
          value={km}
          onChange={(e) => tocar(setKm)(e.target.value)}
        />
      </section>

      <section
        aria-label="Renglones"
        className="overflow-hidden rounded-base border border-borde bg-superficie"
      >
        <header className="border-b border-borde px-3 py-2">
          <h2 className="font-display text-dato font-semibold">Trabajos y repuestos</h2>
        </header>
        {renglones.length === 0 && (
          <p className="px-3 py-4 text-dato text-texto-suave">
            Un service necesita al menos un renglón.
          </p>
        )}
        {renglones.length > 0 && (
          <ol className="grid gap-2 px-3 py-2.5">
            {renglones.map((r, n) => (
              <li
                key={r.clave}
                aria-label={`Renglón ${n + 1}`}
                className="grid items-end gap-2 md:grid-cols-[7rem_1fr_5rem_8rem_6rem_6rem_auto]"
              >
                <Selector
                  etiqueta="Tipo"
                  valor={r.tipo}
                  onChange={(v) =>
                    cambiar(
                      r.clave,
                      v === 'trabajo'
                        ? { tipo: 'trabajo', repuestoId: null, codigo: null }
                        : { tipo: v ?? 'trabajo', minutos: '' },
                    )
                  }
                  opciones={[
                    { valor: 'trabajo' as const, texto: 'Trabajo' },
                    { valor: 'repuesto' as const, texto: 'Repuesto' },
                  ]}
                />
                {r.tipo === 'repuesto' ? (
                  <CampoRepuesto
                    etiqueta="Descripción"
                    valor={r.descripcion}
                    onChange={(texto) => cambiar(r.clave, { descripcion: texto })}
                    codigo={r.codigo}
                    vinculado={Boolean(r.repuestoId)}
                    alElegir={(p) => elegirPieza(r.clave, p)}
                    alSoltar={() => cambiar(r.clave, { repuestoId: null, codigo: null })}
                    autoFocus={nuevo === r.clave}
                  />
                ) : (
                  <Campo
                    etiqueta="Descripción"
                    autoFocus={nuevo === r.clave}
                    value={r.descripcion}
                    onChange={(e) => cambiar(r.clave, { descripcion: e.target.value })}
                  />
                )}
                <Campo
                  etiqueta="Cantidad"
                  inputMode="decimal"
                  value={r.cantidad}
                  onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })}
                />
                <Campo
                  etiqueta="Precio final"
                  inputMode="decimal"
                  value={r.precio}
                  onChange={(e) => cambiar(r.clave, { precio: e.target.value })}
                />
                <Selector
                  etiqueta="IVA"
                  valor={r.alicuota}
                  onChange={(v) => cambiar(r.clave, { alicuota: v ?? 5 })}
                  opciones={ALICUOTAS.map((a) => ({ valor: a.valor, texto: a.texto }))}
                />
                {r.tipo === 'trabajo' ? (
                  <Campo
                    etiqueta="Minutos"
                    inputMode="numeric"
                    value={r.minutos}
                    onChange={(e) => cambiar(r.clave, { minutos: e.target.value })}
                  />
                ) : (
                  <span />
                )}
                <Boton
                  tamano="chico"
                  variante="sutil"
                  icono={<IconoBorrar />}
                  onClick={() => void quitar(r)}
                >
                  Quitar
                </Boton>
              </li>
            ))}
          </ol>
        )}
        <footer className="flex flex-wrap items-center gap-2 border-t border-borde-suave px-3 py-2">
          <Boton
            tamano="chico"
            accion="global.nuevo"
            icono={<IconoAgregar />}
            onClick={() => agregar('trabajo')}
          >
            Trabajo
          </Boton>
          <Boton tamano="chico" icono={<IconoAgregar />} onClick={() => agregar('repuesto')}>
            Repuesto
          </Boton>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {invalido && (
              <span className="text-etiqueta text-critico">
                Falta el nombre, o algún renglón sin descripción, cantidad o precio válidos.
              </span>
            )}
            {inicial && (
              <Boton
                variante={activo ? 'peligro' : 'normal'}
                deshabilitado={invalido || guardar.isPending}
                onClick={() => void prenderOApagar()}
              >
                {activo ? 'Apagar' : 'Volver a usar'}
              </Boton>
            )}
            <Boton
              accion="global.guardar"
              variante="principal"
              deshabilitado={!guardable}
              onClick={() => guardar.mutate(activo)}
            >
              Guardar
            </Boton>
          </span>
        </footer>
      </section>
    </>
  )
}
