/**
 * La auditoría que **no depende de que nadie se acuerde**: un trigger por tabla que
 * escribe en `auditoria_cambio` la fila entera, antes y después.
 *
 * Es la misma idea que RLS y por el mismo motivo. `auditar()` en la API cuenta lo que pasó
 * con las palabras del negocio y eso no lo reemplaza nada —«Jorge Pérez autorizó 1 y
 * rechazó 1, por WhatsApp» no sale de comparar dos fotos de una fila—, pero depende de que
 * cada operación nueva llame. Con veinte módulos más por delante, esa disciplina no escala.
 *
 * Las dos conviven y **ninguna esconde a la otra**: la pantalla tiene una pestaña para cada
 * una. Intentar fundirlas en una sola fila fue el primer intento y se cae con el caso más
 * común: «el cliente» son dos tablas (`entidad_comercial` y `cliente`), así que no hay *una*
 * fila del trigger a la que pegarle la narración.
 *
 * Como las listas de acá se aplican como estado convergente en cada corrida de migraciones,
 * la tabla de un módulo nuevo queda cubierta con sólo clasificarla — y un test verifica que
 * no quede ninguna sin clasificar.
 */

import type { TABLAS_CON_TENANT } from './tablas.ts'

type Operacion = 'insert' | 'update' | 'delete'

export interface TablaAuditada {
  tabla: (typeof TABLAS_CON_TENANT)[number]
  /**
   * Columnas que **nunca** entran al registro. Una auditoría que copia el hash de la
   * contraseña o la clave privada de un certificado convierte la bitácora en el archivo
   * más valioso de la base.
   */
  sinColumnas?: readonly string[]
  /**
   * Qué operaciones se registran. Por omisión las tres.
   *
   * Hay tablas donde lo que interesa es justamente lo que no debería pasar: en un libro de
   * sólo agregar, el dato es que alguien borró una línea.
   */
  solo?: readonly Operacion[]
  /**
   * Condición extra para el `update`. Sin esto, una tabla que cambia con cada venta
   * llenaría la auditoría de ruido y taparía lo que hay que mirar.
   */
  cuandoActualiza?: string
  /** Por qué está acotada, cuando lo está. Se escribe en el DDL. */
  nota?: string
}

/** Columnas que se omiten en todas: no son el cambio, son la fila. */
export const COLUMNAS_OMITIDAS = ['id', 'tenant_id', 'creado_en', 'actualizado_en'] as const

export const TABLAS_AUDITADAS: readonly TablaAuditada[] = [
  { tabla: 'empresa' },
  { tabla: 'sucursal' },
  { tabla: 'punto_venta' },
  {
    tabla: 'certificado_afip',
    sinColumnas: ['clave_privada_cifrada'],
    nota: 'La clave privada, ni cifrada: la auditoría no es lugar para un secreto.',
  },
  { tabla: 'comprobante' },
  {
    tabla: 'comprobante_renglon',
    solo: ['update', 'delete'],
    nota: 'Un renglón de un comprobante emitido no se toca. Lo que importa es enterarse si pasa.',
  },
  {
    tabla: 'hoja_imagen',
    nota:
      'El dibujo sobre el que firma el cliente. Lo que interesa es quién cambió la hoja y ' +
      'cuándo: una fila borrada acá deja órdenes firmadas apuntando a un dibujo que no está.',
  },
  { tabla: 'orden' },
  {
    tabla: 'vehiculo_pendiente',
    nota: 'Lo que se le recomendó y no autorizó, y quién lo descartó y por qué: es lo que se discute cuando falla lo que se había avisado.',
  },
  {
    tabla: 'orden_firma',
    nota: 'Quién firmó, cuándo, y quién la puso a firmar: si alguien dice que no firmó, se mira acá.',
  },
  {
    tabla: 'orden_espera',
    nota: 'Cuándo se puso en espera un auto, por qué y quién la cerró: es lo que explica por qué estuvo seis días.',
  },
  {
    tabla: 'motivo_espera',
    nota: 'Los motivos con los que se explica el tiempo muerto: apagar uno cambia lo que el taller puede decir.',
  },
  {
    tabla: 'orden_foto',
    nota: 'Quién sacó cada foto del auto y quién la dio de baja: una foto que falta es la que alguien quería que faltara.',
  },
  { tabla: 'orden_presupuesto' },
  {
    tabla: 'revision_punto',
    nota:
      'Qué se revisa cuando entra un auto. Apagar un punto es dejar de mirarlo en todos los ' +
      'autos que vengan, y eso tiene que tener nombre y fecha.',
  },
  { tabla: 'repuesto' },
  {
    tabla: 'repuesto_codigo_barras',
    nota: 'Qué código se le asoció a qué pieza y quién: si una caja no coincide con la orden, se mira acá.',
  },
  {
    tabla: 'repuesto_stock',
    cuandoActualiza:
      'old.ubicacion is distinct from new.ubicacion or old.minimo is distinct from new.minimo',
    nota: 'La cantidad cambia con cada venta y su bitácora es movimiento_stock. Acá, dónde está y cuál es el mínimo.',
  },
  {
    tabla: 'movimiento_stock',
    solo: ['delete'],
    nota: 'El libro de stock es de sólo agregar: el dato es que alguien borre una línea.',
  },
  { tabla: 'pedido_repuestos' },
  { tabla: 'compra' },
  { tabla: 'entidad_comercial' },
  { tabla: 'cliente' },
  { tabla: 'proveedor' },
  { tabla: 'empleado' },
  {
    tabla: 'credencial',
    nota: 'Quién emitió y quién revocó una credencial, y cuándo. Es la mitad de poder explicar un fichaje raro.',
  },
  {
    tabla: 'estacion_fichaje',
    sinColumnas: ['token_hash'],
    nota: 'El token no entra: con él se ficha sin sesión, así que en la auditoría sería la fila más valiosa de la base.',
  },
  {
    tabla: 'jornada',
    solo: ['update', 'delete'],
    nota: 'Marcar entrada es lo normal y no se audita. Lo que sí: que alguien cambie o borre una marca después.',
  },
  {
    tabla: 'sesion_trabajo',
    solo: ['update', 'delete'],
    cuandoActualiza: 'old.fin is not null',
    nota: 'Cerrar una sesión abierta es un escaneo más. Tocar una ya cerrada es corregir mano de obra, y eso no pasa sin quedar escrito.',
  },
  {
    tabla: 'ajuste_sesion',
    nota: 'Cada corrección de tiempo con su antes, su después y el motivo: es lo que contesta «¿quién me sacó dos horas?».',
  },
  { tabla: 'marca' },
  { tabla: 'modelo' },
  { tabla: 'vehiculo' },
  { tabla: 'titularidad' },
  {
    tabla: 'usuario',
    sinColumnas: ['hash_password'],
    nota: 'El hash de la contraseña no entra. Que se la cambiaron se ve igual, porque el hash cambia.',
  },
  { tabla: 'rol' },
  { tabla: 'usuario_rol' },
  { tabla: 'usuario_sucursal' },
  { tabla: 'dispositivo' },
  {
    tabla: 'agenda_cupo',
    nota: 'Cuántos turnos entran por franja: si un jueves se agendó de más, se ve quién había cambiado el cupo.',
  },
  {
    tabla: 'turno',
    nota: 'Quién agendó, quién lo movió de día y quién lo canceló: es lo que se discute cuando el cliente dice que tenía turno.',
  },
  {
    tabla: 'visita',
    solo: ['update', 'delete'],
    nota: 'Anotar a quien llega es lo normal. Lo que sí: a quién se lo derivó, quién lo agarró y cómo terminó, que es lo que se discute cuando un cliente dice que esperó una hora.',
  },
]

/**
 * Las que no llevan trigger, **con el motivo escrito**. El motivo importa más que la lista:
 * dentro de un año, «¿por qué los renglones de una orden no están?» se contesta acá.
 */
export const TABLAS_SIN_AUDITAR: Readonly<
  Partial<Record<(typeof TABLAS_CON_TENANT)[number], string>>
> = {
  comprobante_secuencia: 'Es un contador. Lo que numera ya se audita entero.',
  orden_secuencia: 'Es un contador: la numeración sin huecos se verifica en las órdenes.',
  repuestos_secuencia: 'Es un contador: lo numerado se audita en el pedido y en la compra.',
  visita_secuencia: 'Es un contador: el número del día es para llamar, no un comprobante.',
  orden_item:
    'La orden se guarda entera en cada edición, así que auditar el renglón sería una fila por ' +
    'renglón en cada guardado. Lo material —el total y el estado— cambia en la orden, y lo ' +
    'presupuestado queda en orden_presupuesto.',
  pedido_repuestos_item: 'Mismo caso que orden_item: el pedido se guarda entero.',
  compra_renglon: 'Mismo caso: la compra se guarda entera y su total queda en la compra.',
  usuario_config: 'Preferencias propias: el tema de cada uno no es un cambio que alguien audite.',
  usuario_atajo: 'El mapa de teclas es de quien lo usa, y de nadie más.',
  auditoria: 'Auditar la auditoría es una recursión, y la aplicación no puede borrarla.',
  auditoria_cambio: 'Ídem, y encima ésta ni siquiera la puede escribir.',
  sesion:
    'Los ingresos se leen de acá tal cual, que es más completo. Auditarla sería una fila por ' +
    'renovación, cada quince minutos, por usuario.',
  tenant_modulo: 'La escribe el back-office, con su propia auditoría y su propio rol.',
  aviso: 'Marcar como leído un aviso propio no es un cambio que nadie audite.',
  evento_escaneo:
    'Es la bitácora cruda de cada escaneo, y auditar una bitácora es una recursión. Lo que hay ' +
    'que poder contestar —«yo fiché»— se contesta leyéndola, no auditándola.',
}

/** Nombres de columna que huelen a secreto: el test se planta si alguna queda adentro. */
export const COLUMNAS_SECRETAS = /pass|hash|secret|clave_privada|token|cifrad/i

/**
 * DDL de la auditoría por trigger. Idempotente, como el del aislamiento, y por el mismo
 * motivo: se aplica al final de cada corrida de migraciones y converge al estado de estas
 * listas, en vez de quedar congelado en una migración numerada.
 */
export function ddlAuditoria(rolApp: string): string {
  const partes: string[] = []

  partes.push(`
-- «razon_social» → «razonSocial». La auditoría habla el vocabulario de la aplicación y no
-- el de Postgres, para que la misma pantalla cuente con las mismas frases lo que escribió
-- el trigger y lo que escribió la API.
create or replace function camelizar_clave(nombre text) returns text
language plpgsql
immutable
parallel safe
as $$
declare
  partes text[] := string_to_array(nombre, '_');
  salida text := partes[1];
  i int;
begin
  for i in 2 .. coalesce(array_length(partes, 1), 1) loop
    salida := salida || upper(left(partes[i], 1)) || substr(partes[i], 2);
  end loop;
  return salida;
end
$$;

create or replace function camelizar_fila(datos jsonb, excluir text[]) returns jsonb
language sql
immutable
parallel safe
as $$
  select case when datos is null then null
              else coalesce(jsonb_object_agg(camelizar_clave(clave), valor), '{}'::jsonb)
         end
    from jsonb_each(coalesce(datos, '{}'::jsonb)) as campos(clave, valor)
   where not (clave = any(excluir));
$$;`)

  partes.push(`
-- El trigger.
--
-- SECURITY DEFINER a propósito: el rol de la aplicación **no puede escribir**
-- auditoria_cambio, y una bitácora que el mismo proceso auditado puede reescribir no
-- prueba nada. La única manera de que entre una fila es cambiando un dato de verdad.
--
-- Quién y desde dónde salen de las variables de sesión que fija conTenant(). Si no hay
-- —una migración, una semilla—, la fila igual se escribe, sin autor. Perder el cambio
-- porque no sabemos quién fue sería exactamente al revés.
create or replace function auditar_cambio() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  excluir text[] := array[${COLUMNAS_OMITIDAS.map((c) => `'${c}'`).join(', ')}]
                    || coalesce(string_to_array(TG_ARGV[0], ','), '{}'::text[]);
  fila_antes jsonb;
  fila_despues jsonb;
  origen jsonb;
  v_accion text;
begin
  if TG_OP = 'INSERT' then
    v_accion := 'alta';
    fila_despues := camelizar_fila(to_jsonb(new), excluir);
  elsif TG_OP = 'UPDATE' then
    v_accion := 'modificacion';
    fila_antes := camelizar_fila(to_jsonb(old), excluir);
    fila_despues := camelizar_fila(to_jsonb(new), excluir);
    -- Guardar la fila no es cambiarla: sin esto, cada «guardar» sin tocar nada dejaría
    -- una línea, y la auditoría se vuelve ilegible justo cuando hay que leerla.
    if fila_antes = fila_despues then
      return null;
    end if;
  else
    v_accion := 'baja';
    fila_antes := camelizar_fila(to_jsonb(old), excluir);
  end if;

  origen := to_jsonb(coalesce(new, old));

  insert into auditoria_cambio
    (tenant_id, usuario_id, tabla, registro_id, accion, antes, despues, ip, transaccion)
  values (
    (origen ->> 'tenant_id')::uuid,
    nullif(current_setting('app.usuario_id', true), '')::uuid,
    TG_TABLE_NAME,
    (origen ->> 'id')::uuid,
    v_accion,
    fila_antes,
    fila_despues,
    nullif(current_setting('app.ip', true), ''),
    pg_current_xact_id()::text
  );

  return null;
end
$$;

-- La tabla la lee la aplicación y no la escribe. Va después del grant general del
-- aislamiento, que en cada corrida se lo vuelve a dar.
revoke insert, update, delete on auditoria_cambio from ${rolApp};`)

  for (const t of TABLAS_AUDITADAS) {
    partes.push(triggersDe(t))
  }

  return partes.join('\n')
}

function triggersDe(t: TablaAuditada): string {
  const excluidas = (t.sinColumnas ?? []).join(',')
  const operaciones = t.solo ?? ['insert', 'update', 'delete']
  const nota = t.nota ? `\n-- ${t.nota}` : ''
  const partes: string[] = [nota]

  // El `update` con condición va en su propio trigger: `when` se aplica al trigger entero,
  // y en uno que también atiende `insert` la condición no podría nombrar `old`.
  const conCondicion = Boolean(t.cuandoActualiza)
  const sinCondicion = operaciones.filter((o) => !(conCondicion && o === 'update'))

  if (sinCondicion.length > 0) {
    partes.push(`
drop trigger if exists auditar_${t.tabla} on "${t.tabla}";
create trigger auditar_${t.tabla}
  after ${sinCondicion.join(' or ')} on "${t.tabla}"
  for each row execute function auditar_cambio('${excluidas}');`)
  }

  if (conCondicion && operaciones.includes('update')) {
    partes.push(`
drop trigger if exists auditar_${t.tabla}_cambio on "${t.tabla}";
create trigger auditar_${t.tabla}_cambio
  after update on "${t.tabla}"
  for each row when (${t.cuandoActualiza})
  execute function auditar_cambio('${excluidas}');`)
  }

  return partes.join('\n')
}
