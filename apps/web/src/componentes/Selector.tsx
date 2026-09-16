/** Un desplegable con su etiqueta. Los valores conservan su tipo: un código de AFIP sigue siendo número. */
export function Selector<T extends string | number>({
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
