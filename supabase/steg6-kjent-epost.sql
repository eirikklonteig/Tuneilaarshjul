-- =========================================================
-- Tune IL årshjul – bare registrerte e-postadresser får kode
--
-- Kjøres ÉN gang: SQL Editor → New query → lim inn ALT → Run.
-- Trygt å kjøre på nytt.
--
-- Appen spør denne funksjonen før den sender innloggingskode.
-- Står e-postadressen ikke i brukerregisteret (eller brukeren er deaktivert),
-- sier appen fra i stedet for å sende kode. Funksjonen svarer bare ja eller nei,
-- og viser ingen navn eller andre opplysninger.
-- =========================================================

create or replace function public.is_registered_email(e text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.members where lower(email) = lower(trim(e)) and active)
$$;

revoke all on function public.is_registered_email(text) from public;
grant execute on function public.is_registered_email(text) to anon, authenticated;
