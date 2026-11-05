-- =========================================================
-- Tune IL årshjul – steg 3: offentlig lenke
--
-- Kjøres ÉN gang: SQL Editor → New query → lim inn ALT → Run.
-- Trygt å kjøre på nytt.
--
-- Gjør at oppgaver merket «Vis på offentlig lenke» kan leses uten
-- innlogging. Alle andre oppgaver, brukere, verv og avkrysninger
-- er fortsatt sperret.
-- =========================================================

grant select on public.tasks to anon;

drop policy if exists "tasks: offentlig" on public.tasks;
create policy "tasks: offentlig" on public.tasks
  for select to anon
  using (not deleted and coalesce((data ->> 'public')::boolean, false));
