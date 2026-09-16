import {
  PERMISOS_BACKOFFICE,
  ROL_APP,
  ROL_BACKOFFICE,
  TABLAS_BACKOFFICE,
  TABLAS_BACKOFFICE_GLOBALES,
  TABLAS_CON_TENANT,
  TABLAS_SOLO_LECTURA,
  VAR_TENANT,
} from './tablas.ts'

/**
 * DDL del aislamiento multi-tenant. Es idempotente y se aplica al final de cada
 * corrida de migraciones, no como una migración numerada.
 *
 * La razón: si las políticas fueran una migración inmutable, cada tabla nueva con
 * `tenant_id` exigiría acordarse de escribir su política a mano. Aplicándolas como
 * estado convergente derivado de `TABLAS_CON_TENANT`, la tabla nueva queda protegida
 * sola, y el test de aislamiento verifica que la lista no se haya quedado corta.
 */
export function ddlAislamiento(): string {
  const partes: string[] = []

  partes.push(`
-- El rol de la aplicación. NOLOGIN acá: la contraseña se inyecta desde el entorno
-- con 'pnpm db:app-role' y nunca entra al repositorio.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = '${ROL_APP}') then
    create role ${ROL_APP} nologin nobypassrls;
  end if;
end
$$;

grant usage on schema public to ${ROL_APP};
grant select, insert, update, delete on all tables in schema public to ${ROL_APP};
grant usage, select on all sequences in schema public to ${ROL_APP};
alter default privileges in schema public
  grant select, insert, update, delete on tables to ${ROL_APP};

-- Los módulos contratados los lee la aplicación y los escribe sólo el back-office.
-- RLS no alcanza: filtra qué filas ve cada concesionaria, pero dentro de las suyas la
-- dejaría escribir, y el administrador de un cliente se habilitaría solo lo que no
-- pagó. Va después del grant general, que en cada corrida lo vuelve a dar.
revoke insert, update, delete on ${TABLAS_SOLO_LECTURA.join(', ')} from ${ROL_APP};

-- Las tablas del back-office no existen para la API: ni leerlas puede.
revoke all on ${TABLAS_BACKOFFICE.join(', ')} from ${ROL_APP};`)

  partes.push(`
-- El tenant de la sesión, con el chequeo explícito.
--
-- No alcanza con 'current_setting(...)::uuid' directo. Al terminar una transacción,
-- set_config(..., true) no borra el parámetro: lo revierte a cadena vacía. Así que
-- la primera consulta sin tenant falla con 42704 (parámetro inexistente) y las
-- siguientes con 22P02 (casteo inválido). Las dos fallan cerradas, pero depender de
-- cuál toca es frágil, y ninguna de las dos le dice al que programa qué hizo mal.
create or replace function app_tenant_id() returns uuid
language plpgsql
stable
parallel safe
as $$
declare
  valor text := current_setting('${VAR_TENANT}', true);
begin
  if valor is null or valor = '' then
    raise exception 'Consulta sin tenant en la sesión: envolvela en conTenant()';
  end if;
  return valor::uuid;
end
$$;

grant execute on function app_tenant_id() to ${ROL_APP};`)

  partes.push(`
-- La escotilla del inicio de sesión.
--
-- Autenticarse ocurre **antes** de saber a qué concesionaria pertenece quien entra, así
-- que esta consulta no puede pasar por RLS: no hay tenant contra el cual filtrar. La
-- salida no es aflojar las políticas, es exponer una función que devuelve lo mínimo.
--
-- Recibe un correo y devuelve tres cosas: quién es, de qué concesionaria, y el hash
-- para verificar la contraseña. Nada más — ni el nombre, ni cuántos usuarios hay, ni
-- ninguna otra fila. Y si el correo no existe, no devuelve nada, que es lo mismo que
-- devuelve cuando existe pero está inactivo.
--
-- SECURITY DEFINER con search_path fijo: sin eso, quien pudiera crear un esquema propio
-- podría anteponerlo y hacer que la función resuelva contra sus tablas.
create or replace function autenticar_usuario(p_email text)
returns table (usuario_id uuid, tenant_id uuid, hash_password text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.tenant_id, u.hash_password
    from usuario u
    join tenant t on t.id = u.tenant_id
   where u.email = lower(p_email)
     and u.activo
     and t.activo;
$$;

revoke all on function autenticar_usuario(text) from public;
grant execute on function autenticar_usuario(text) to ${ROL_APP};

-- Ya no se usa: el inicio de sesión dejó de pedir el nombre de la concesionaria. Cada
-- función SECURITY DEFINER es superficie de ataque, así que las que sobran se borran.
drop function if exists tenant_por_slug(text);`)

  partes.push(ddlBackoffice())

  const globales: readonly string[] = TABLAS_BACKOFFICE_GLOBALES

  // El propio tenant se filtra por su clave primaria, no por una columna tenant_id.
  partes.push(politica('tenant', 'id', ROL_APP))

  for (const tabla of TABLAS_CON_TENANT) {
    partes.push(politica(tabla, 'tenant_id', globales.includes(tabla) ? ROL_APP : undefined))
  }

  for (const tabla of TABLAS_BACKOFFICE_GLOBALES) {
    partes.push(`
drop policy if exists backoffice_global on "${tabla}";
create policy backoffice_global on "${tabla}" to ${ROL_BACKOFFICE}
  using (true)
  with check (true);`)
  }

  return partes.join('\n')
}

/**
 * El rol del back-office, **desde cero en cada corrida**: primero se le saca todo y
 * después se le da exactamente lo de `PERMISOS_BACKOFFICE`. Así, sacar una línea de esa
 * lista le saca el permiso, en vez de dejarlo puesto de la corrida anterior.
 *
 * Sin BYPASSRLS. Para dar de alta la empresa y el gerente de una concesionaria usa
 * `conTenant()` como la API, y las políticas de siempre lo contienen. Sólo `tenant` y
 * `tenant_modulo` tienen una política que le muestra todas las concesionarias.
 */
function ddlBackoffice(): string {
  const grants = Object.entries(PERMISOS_BACKOFFICE)
    .map(([tabla, permisos]) => `grant ${permisos.join(', ')} on "${tabla}" to ${ROL_BACKOFFICE};`)
    .join('\n')

  return `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = '${ROL_BACKOFFICE}') then
    create role ${ROL_BACKOFFICE} nologin nobypassrls;
  end if;
end
$$;

grant usage on schema public to ${ROL_BACKOFFICE};
revoke all on all tables in schema public from ${ROL_BACKOFFICE};
${grants}
grant usage, select on all sequences in schema public to ${ROL_BACKOFFICE};
grant execute on function app_tenant_id() to ${ROL_BACKOFFICE};`
}

function politica(tabla: string, columna: string, soloPara?: string): string {
  // El `(select ...)` no es decorativo: envuelta en un subselect, la función se
  // evalúa una vez por consulta en lugar de una vez por fila. Sobre una tabla de
  // órdenes con años de historia, esa diferencia se nota.
  const condicion = `${columna} = (select app_tenant_id())`
  return `
alter table "${tabla}" enable row level security;
alter table "${tabla}" force  row level security;
drop policy if exists aislamiento_tenant on "${tabla}";
create policy aislamiento_tenant on "${tabla}"${soloPara ? ` to ${soloPara}` : ''}
  using      (${condicion})
  with check (${condicion});`
}
