-- =========================================================
-- Tune IL årshjul – steg 4: varsler (forberedt, IKKE slått på)
--
-- Kjøres ÉN gang: SQL Editor → New query → lim inn ALT → Run.
-- Trygt å kjøre på nytt.
--
-- Legger til:
--   - varselinnstillinger per bruker (ukentlig e-post, påminnelse X dager før)
--   - app_settings: hovedbryter for varsler (står AV til dere slår den på)
--   - notification_log: hva som er sendt, så ingen får samme e-post to ganger
-- Ingen e-post sendes før sendejobben er satt opp og bryteren er slått på
-- (se supabase/VARSLER.md).
-- =========================================================

alter table public.members add column if not exists notify_weekly boolean not null default true;
alter table public.members add column if not exists remind_days int[] not null default '{7,1}';

-- Innstillinger for hele årshjulet
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value) values ('varsler', jsonb_build_object(
  'aktiv', false,
  'sesong', '2026/27', 'startAar', 2026, 'startMaaned', 8,
  'appUrl', 'https://tuneilaarshjul.vercel.app'
)) on conflict (key) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon;
drop policy if exists "settings: les" on public.app_settings;
create policy "settings: les" on public.app_settings for select using (public.is_member());
drop policy if exists "settings: hovedadmin" on public.app_settings;
create policy "settings: hovedadmin" on public.app_settings for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Logg over sendte varsler
create table if not exists public.notification_log (
  id        bigserial primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  season    text not null,
  kind      text not null,          -- 'weekly' eller 'reminder-7', 'reminder-1' osv.
  ref       text not null,          -- uke (2026-W45) eller oppgave-nøkkel
  sent_at   timestamptz not null default now(),
  unique (member_id, season, kind, ref)
);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon;
drop policy if exists "log: hovedadmin leser" on public.notification_log;
create policy "log: hovedadmin leser" on public.notification_log for select using (public.is_superadmin());

-- Brukeren endrer sine egne varselinnstillinger (og ingenting annet)
create or replace function public.set_my_notifications(weekly boolean, days int[])
returns void language sql security definer set search_path = public
as $$
  update public.members
  set notify_weekly = weekly,
      remind_days = (select coalesce(array_agg(distinct d order by d desc), '{}') from unnest(days) d where d between 1 and 30)
  where id = public.my_member_id()
$$;
revoke all on function public.set_my_notifications(boolean, int[]) from public, anon;
grant execute on function public.set_my_notifications(boolean, int[]) to authenticated;
