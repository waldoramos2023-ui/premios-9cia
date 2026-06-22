// Genera el script SQL completo para configurar el proyecto dedicado en Supabase:
// esquema + seguridad (RLS) + admins + carga de los 104 voluntarios desde la planilla.
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const wb = XLSX.readFile('Planilla Premios 9a Cia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

const serialToISO = (n) => {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const d = new Date(Math.round((n - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const esc = (s) => String(s).replace(/'/g, "''");
const sqlText = (v) => (v == null || v === '') ? "''" : `'${esc(String(v).trim())}'`;
const sqlDate = (iso) => iso ? `'${iso}'` : 'null';
const sqlInt = (v) => (v == null || v === '') ? 'null' : (parseInt(v, 10));

const ADMINS = ['waldo.ramos@9.cbs.cl', 'waldo.ramos.2023@gmail.com'];

const values = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r[0] == null) continue;
  values.push(
    `(${sqlInt(r[0])}, ${sqlText(r[1])}, ${sqlText(r[8])}, ${sqlDate(serialToISO(r[2]))}, ` +
    `${sqlDate(serialToISO(r[10]))}, ${sqlInt(r[11])}, ${sqlDate(serialToISO(r[12]))}, ${sqlInt(r[13])}, ${sqlText(r[14])})`
  );
}

const sql = `-- =====================================================================
-- App Antigüedad Efectiva · 9ª Compañía "Bomba Yungay" (CBS)
-- Script de configuración para el proyecto Supabase DEDICADO "Novena Cia CBS".
-- Ejecutar completo en: Supabase -> SQL Editor -> New query -> Run.
-- =====================================================================

-- 1) Tabla de voluntarios (refleja las columnas de la planilla)
create table if not exists public.voluntarios (
  id                bigint generated always as identity primary key,
  numero            integer not null unique,
  nombre            text    not null,
  tiempo_actual     text    not null default '',   -- col I: Tiempo_Actual (antigüedad efectiva)
  fecha_ingreso     date,                            -- col C: Ingreso_1
  fecha_prem_ant    date,                            -- col K: Fecha_Prem_Ant
  premio_ant        integer,                         -- col L: Premio_Ant (último premio otorgado)
  fecha_prox_premio date,                            -- col M: Fecha_Prox_Premio (LA fecha correcta)
  prox_premio       integer,                         -- col N: Prox_Premio (años)
  obs               text    not null default '',     -- col O: Observaciones
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2) Tabla de administradores autorizados (por correo)
create table if not exists public.bomba_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- 3) Helper: ¿el usuario autenticado es admin?
create or replace function public.is_bomba_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.bomba_admins
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 4) Trigger updated_at
create or replace function public.bomba_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_voluntarios_updated_at on public.voluntarios;
create trigger trg_voluntarios_updated_at
  before update on public.voluntarios
  for each row execute function public.bomba_set_updated_at();

-- 5) Seguridad por filas (RLS): lectura pública, escritura solo admins
alter table public.voluntarios enable row level security;
alter table public.bomba_admins enable row level security;

drop policy if exists "voluntarios_lectura_publica" on public.voluntarios;
create policy "voluntarios_lectura_publica" on public.voluntarios
  for select to anon, authenticated using (true);

drop policy if exists "voluntarios_insert_admin" on public.voluntarios;
create policy "voluntarios_insert_admin" on public.voluntarios
  for insert to authenticated with check (public.is_bomba_admin());

drop policy if exists "voluntarios_update_admin" on public.voluntarios;
create policy "voluntarios_update_admin" on public.voluntarios
  for update to authenticated using (public.is_bomba_admin()) with check (public.is_bomba_admin());

drop policy if exists "voluntarios_delete_admin" on public.voluntarios;
create policy "voluntarios_delete_admin" on public.voluntarios
  for delete to authenticated using (public.is_bomba_admin());

drop policy if exists "bomba_admins_lectura_propia" on public.bomba_admins;
create policy "bomba_admins_lectura_propia" on public.bomba_admins
  for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

-- 6) Administradores autorizados
insert into public.bomba_admins (email) values
${ADMINS.map((e) => `  ('${e}')`).join(',\n')}
on conflict (email) do nothing;

-- 7) Carga de los 104 voluntarios (desde la planilla, 03/Junio/2026)
insert into public.voluntarios
  (numero, nombre, tiempo_actual, fecha_ingreso, fecha_prem_ant, premio_ant, fecha_prox_premio, prox_premio, obs) values
${values.join(',\n')}
on conflict (numero) do update set
  nombre            = excluded.nombre,
  tiempo_actual     = excluded.tiempo_actual,
  fecha_ingreso     = excluded.fecha_ingreso,
  fecha_prem_ant    = excluded.fecha_prem_ant,
  premio_ant        = excluded.premio_ant,
  fecha_prox_premio = excluded.fecha_prox_premio,
  prox_premio       = excluded.prox_premio,
  obs               = excluded.obs;

-- Listo. Verificación:
select count(*) as voluntarios from public.voluntarios;
`;

writeFileSync('supabase/setup-novena-cia.sql', sql);
console.log('Generado supabase/setup-novena-cia.sql con', values.length, 'voluntarios.');
