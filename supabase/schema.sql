-- =========================================================
-- Tune IL årshjul – database i Supabase (steg 2)
--
-- Kjøres ÉN gang i Supabase: SQL Editor → New query → lim inn ALT → Run.
-- Trygt å kjøre på nytt: alt opprettes bare hvis det ikke finnes.
--
-- Tabeller:
--   units          – enheter: Tune IL (klubb), Håndball, Fotball (senere lag)
--   roles          – verv, f.eks. «Sportslig leder» i Håndball
--   members        – brukere (navn og e-post)
--   member_access  – tilgang per enhet: admin, redaktør eller leser
--   member_roles   – hvilke verv en bruker har
--   tasks          – oppgavene i årshjulet (brukes fra steg 3)
--   task_status    – avkrysninger per sesong (brukes fra steg 3)
--
-- Tilgang (Row Level Security):
--   Uten innlogging: ingenting.
--   Leser:    ser oppgavene i enheten og kan krysse av.
--   Redaktør: kan også opprette og endre oppgaver i enheten.
--   Admin:    kan også legge til brukere og verv i enheten.
--   Hovedadmin (superadmin): alt, i alle enheter.
-- =========================================================

-- ---------- Tabeller ----------

create table if not exists public.units (
  id      text primary key,
  name    text not null,
  short   text not null,
  parent  text references public.units (id),
  sort    int  not null default 0
);

create table if not exists public.roles (
  id         text primary key default ('v' || substr(md5(random()::text), 1, 10)),
  unit_id    text not null references public.units (id),
  name       text not null,
  styre      boolean not null default true,      -- false = verv utenfor styret, f.eks. trener
  sort       int not null default 100,
  active     boolean not null default true,      -- skjules i stedet for å slettes
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  is_superadmin boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists members_email on public.members (lower(email));

create table if not exists public.member_access (
  member_id uuid not null references public.members (id) on delete cascade,
  unit_id   text not null references public.units (id),
  level     text not null check (level in ('admin', 'editor', 'reader')),
  primary key (member_id, unit_id)
);

create table if not exists public.member_roles (
  member_id uuid not null references public.members (id) on delete cascade,
  role_id   text not null references public.roles (id) on delete cascade,
  primary key (member_id, role_id)
);

create table if not exists public.tasks (
  id         text primary key,                 -- samme id som i appen
  season     text not null,                    -- f.eks. '2026/27'
  units      text[] not null,                  -- hvilke enheter oppgaven gjelder
  data       jsonb not null,                   -- tittel, type, frist, verv, underoppgaver …
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists tasks_season on public.tasks (season);

create table if not exists public.task_status (
  season     text not null,
  task_key   text not null,                    -- oppgave-id, evt. med @måned for gjentakende
  task_id    text not null references public.tasks (id) on delete cascade,
  status     text not null default 'done' check (status in ('done', 'progress', 'na')),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (season, task_key)
);

-- ---------- Hjelpefunksjoner for tilgang ----------

create or replace function public.current_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Brukeren som er logget inn (bare aktive brukere)
create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.members where lower(email) = public.current_email() and active limit 1 $$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_superadmin from public.members where id = public.my_member_id()), false) $$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public
as $$ select public.my_member_id() is not null $$;

create or replace function public.can_read_unit(u text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.member_access where member_id = public.my_member_id() and unit_id = u
  )
$$;

create or replace function public.can_edit_unit(u text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.member_access
    where member_id = public.my_member_id() and unit_id = u and level in ('admin', 'editor')
  )
$$;

create or replace function public.is_unit_admin(u text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.member_access
    where member_id = public.my_member_id() and unit_id = u and level = 'admin'
  )
$$;

-- Er brukeren admin i minst én enhet?
create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.member_access where member_id = public.my_member_id() and level = 'admin'
  )
$$;

-- Kan jeg se denne brukeren? Meg selv, brukere i mine enheter,
-- og admins ser hele registeret (så de kan gi eksisterende brukere tilgang)
create or replace function public.can_see_member(m uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_any_admin() or m = public.my_member_id() or exists (
    select 1 from public.member_access a
    where a.member_id = m and public.can_read_unit(a.unit_id)
  )
$$;

-- Kan jeg endre denne brukeren? Hovedadmin, admin i en av brukerens enheter,
-- eller en admin når brukeren ikke har tilgang noe sted ennå (nylig lagt til)
create or replace function public.can_admin_member(m uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_superadmin()
    or exists (select 1 from public.member_access a where a.member_id = m and public.is_unit_admin(a.unit_id))
    or (public.is_any_admin() and not exists (select 1 from public.member_access a where a.member_id = m))
$$;

create or replace function public.can_read_task(us text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from unnest(us) u where public.can_read_unit(u)) $$;

create or replace function public.can_edit_task(us text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from unnest(us) u where public.can_edit_unit(u)) $$;

-- Tidsstempel og hvem som endret, settes automatisk
create or replace function public.touch()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := public.current_email();
  return new;
end
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch();

drop trigger if exists task_status_touch on public.task_status;
create trigger task_status_touch before insert or update on public.task_status
  for each row execute function public.touch();

-- E-post lagres alltid med små bokstaver
create or replace function public.lower_email()
returns trigger language plpgsql
as $$ begin new.email := lower(trim(new.email)); return new; end $$;

drop trigger if exists members_lower_email on public.members;
create trigger members_lower_email before insert or update on public.members
  for each row execute function public.lower_email();

-- Bare hovedadmin kan gjøre andre til hovedadmin
create or replace function public.guard_superadmin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- (gjelder bare fra appen – i SQL Editor er ingen logget inn, og da er det lov)
  if new.is_superadmin and (tg_op = 'INSERT' or not old.is_superadmin)
     and public.current_email() <> '' and not public.is_superadmin() then
    raise exception 'Bare hovedadmin kan gi hovedadmin-tilgang';
  end if;
  return new;
end
$$;

drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update on public.members
  for each row execute function public.guard_superadmin();

-- ---------- Tilgangsregler (Row Level Security) ----------

alter table public.units         enable row level security;
alter table public.roles         enable row level security;
alter table public.members       enable row level security;
alter table public.member_access enable row level security;
alter table public.member_roles  enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_status   enable row level security;

revoke all on public.units, public.roles, public.members, public.member_access,
  public.member_roles, public.tasks, public.task_status from anon;

-- Enheter: alle brukere ser dem, bare hovedadmin endrer
drop policy if exists "units: les" on public.units;
create policy "units: les" on public.units for select using (public.is_member());
drop policy if exists "units: hovedadmin" on public.units;
create policy "units: hovedadmin" on public.units for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Verv: alle brukere ser dem, admin i enheten oppretter og endrer
drop policy if exists "roles: les" on public.roles;
create policy "roles: les" on public.roles for select using (public.is_member());
drop policy if exists "roles: opprett" on public.roles;
create policy "roles: opprett" on public.roles for insert with check (public.is_unit_admin(unit_id));
drop policy if exists "roles: endre" on public.roles;
create policy "roles: endre" on public.roles for update
  using (public.is_unit_admin(unit_id)) with check (public.is_unit_admin(unit_id));
drop policy if exists "roles: slett" on public.roles;
create policy "roles: slett" on public.roles for delete using (public.is_unit_admin(unit_id));

-- Brukere
drop policy if exists "members: les" on public.members;
create policy "members: les" on public.members for select using (public.can_see_member(id));
drop policy if exists "members: opprett" on public.members;
create policy "members: opprett" on public.members for insert with check (public.is_any_admin());
drop policy if exists "members: endre" on public.members;
create policy "members: endre" on public.members for update
  using (public.can_admin_member(id)) with check (public.can_admin_member(id));
drop policy if exists "members: slett" on public.members;
create policy "members: slett" on public.members for delete using (public.is_superadmin());

-- Tilgang per enhet
drop policy if exists "access: les" on public.member_access;
create policy "access: les" on public.member_access for select
  using (member_id = public.my_member_id() or public.can_read_unit(unit_id));
drop policy if exists "access: admin" on public.member_access;
create policy "access: admin" on public.member_access for all
  using (public.is_unit_admin(unit_id)) with check (public.is_unit_admin(unit_id));

-- Verv per bruker
drop policy if exists "member_roles: les" on public.member_roles;
create policy "member_roles: les" on public.member_roles for select using (public.can_see_member(member_id));
drop policy if exists "member_roles: admin" on public.member_roles;
create policy "member_roles: admin" on public.member_roles for all
  using (public.is_unit_admin((select unit_id from public.roles where id = role_id)))
  with check (public.is_unit_admin((select unit_id from public.roles where id = role_id)));

-- Oppgaver
drop policy if exists "tasks: les" on public.tasks;
create policy "tasks: les" on public.tasks for select using (public.can_read_task(units));
drop policy if exists "tasks: opprett" on public.tasks;
create policy "tasks: opprett" on public.tasks for insert with check (public.can_edit_task(units));
drop policy if exists "tasks: endre" on public.tasks;
create policy "tasks: endre" on public.tasks for update
  using (public.can_edit_task(units)) with check (public.can_edit_task(units));
drop policy if exists "tasks: slett" on public.tasks;
create policy "tasks: slett" on public.tasks for delete using (public.can_edit_task(units));

-- Avkrysninger: alle som ser oppgaven kan krysse av
drop policy if exists "status: les" on public.task_status;
create policy "status: les" on public.task_status for select
  using (public.can_read_task((select units from public.tasks where id = task_id)));
drop policy if exists "status: skriv" on public.task_status;
create policy "status: skriv" on public.task_status for all
  using (public.can_read_task((select units from public.tasks where id = task_id)))
  with check (public.can_read_task((select units from public.tasks where id = task_id)));

-- ---------- Startdata ----------

insert into public.units (id, name, short, parent, sort) values
  ('klubb', 'Tune IL', 'Klubb', null, 0),
  ('handball', 'Håndball', 'Håndball', 'klubb', 1),
  ('fotball', 'Fotball', 'Fotball', 'klubb', 2)
on conflict (id) do nothing;

insert into public.roles (id, unit_id, name, styre, sort) values
  ('leder-klubb', 'klubb', 'Leder', true, 0),
  ('nestleder-klubb', 'klubb', 'Nestleder', true, 1),
  ('handballeder', 'klubb', 'Håndballeder', true, 2),
  ('fotballeder', 'klubb', 'Fotballeder', true, 3),
  ('oldboys-leder', 'klubb', 'Oldboys-leder', true, 4),
  ('youngboys-leder', 'klubb', 'Youngboys-leder', true, 5),
  ('daglig-leder', 'klubb', 'Daglig leder', true, 6),
  ('anleggsleder', 'klubb', 'Anleggsleder', true, 7),
  ('ungdomsutvalg-leder', 'klubb', 'Ungdomsutvalgsleder', true, 8),
  ('styremedlem-klubb', 'klubb', 'Styremedlem', true, 9),
  ('kontrollkomite', 'klubb', 'Leder kontrollkomiteen', true, 10),
  ('leder-hb', 'handball', 'Leder', true, 11),
  ('nestleder-hb', 'handball', 'Nestleder', true, 12),
  ('okonomi-hb', 'handball', 'Økonomiansvarlig', true, 13),
  ('kiosk-dugnad-hb', 'handball', 'Kiosk- og dugnadsansvarlig', true, 14),
  ('hall-materiell-hb', 'handball', 'Hall- og materialansvarlig', true, 15),
  ('arrangement-hb', 'handball', 'Arrangementsansvarlig', true, 16),
  ('sportslig-hb', 'handball', 'Sportslig leder', true, 17),
  ('trener-hb', 'handball', 'Trener', false, 18),
  ('leder-fb', 'fotball', 'Leder', true, 19),
  ('nestleder-fb', 'fotball', 'Nestleder', true, 20),
  ('okonomi-fb', 'fotball', 'Økonomiansvarlig', true, 21),
  ('styremedlem1-fb', 'fotball', 'Styremedlem 1', true, 22),
  ('styremedlem2-fb', 'fotball', 'Styremedlem 2', true, 23),
  ('styremedlem3-fb', 'fotball', 'Styremedlem 3', true, 24),
  ('styremedlem4-fb', 'fotball', 'Styremedlem 4', true, 25)
on conflict (id) do nothing;

-- Første bruker: hovedadmin med admin-tilgang i alle enheter
insert into public.members (email, name, is_superadmin)
select 'eklonteig@gmail.com', 'Eirik Klonteig', true
where not exists (select 1 from public.members where lower(email) = 'eklonteig@gmail.com');

insert into public.member_access (member_id, unit_id, level)
select m.id, u.id, 'admin' from public.members m cross join public.units u
where lower(m.email) = 'eklonteig@gmail.com'
on conflict do nothing;
