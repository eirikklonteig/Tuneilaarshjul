# Varsler på e-post – oppsett og aktivering

Varslene er **ferdig laget, men ikke slått på**. Ingen e-post sendes før alle stegene under er gjort **og** hovedbryteren er slått på.

Det som sendes:
- **Ukentlig e-post** (mandager): frister de neste 30 dagene, det som er forfalt uten avkrysning, og oppgaver «i løpet av måneden». Sendes bare når det er noe å vise.
- **Påminnelse før frist**: X dager før en frist (hver bruker velger 14/7/3/1 dager under ☰ → Varsler).

Hvem får e-post: brukere som har et **verv** som er ansvarlig for oppgaven, og som har tilgang til enheten. Hver bruker kan skru av selv.

## Steg A – nå (for å se hvordan det blir)
1. **SQL Editor → New query:** lim inn hele `supabase/steg4-varsler.sql` → **Run**.
2. Logg inn i appen → ☰ → **Varsler** → **Forhåndsvis e-postene**. Admin kan velge hvem det forhåndsvises for.

Ingenting sendes i steg A.

## Steg B – sett opp sendejobben (når dere er klare)
1. **Edge Functions → Deploy a new function → Via Editor**
   - Navn: `varsler`
   - Lim inn hele innholdet i `supabase/functions/varsler/index.ts` → **Deploy**.
2. Åpne funksjonen → **Settings**: slå **av** «Enforce JWT verification» (vi bruker en egen hemmelig nøkkel i stedet) → Save.
3. **Edge Functions → Secrets** – legg inn:
   | Navn | Verdi |
   |---|---|
   | `VARSEL_SECRET` | En lang tilfeldig tekst du finner på (f.eks. 30 tegn) |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | Gmail-adressen (samme som for innloggingskodene) |
   | `SMTP_PASS` | App-passordet fra Google |
   | `SMTP_FROM` | Samme Gmail-adresse |

   (Vil dere sende fra Tune-kontoen i Microsoft 365: `smtp.office365.com`, port `587`, og IT må slå på «Authenticated SMTP» for kontoen.)

## Steg C – prøvekjøring (sender fortsatt ingenting)
I **SQL Editor**, bytt ut `HEMMELIG` med verdien fra `VARSEL_SECRET` og kjør:
```sql
select net.http_post(
  url := 'https://jbqwjjzqarrzkngdjqaj.supabase.co/functions/v1/varsler?dry=1&ukentlig=1',
  headers := jsonb_build_object('x-varsel-secret', 'HEMMELIG')
);
```
(Hvis `net` ikke finnes: **Database → Extensions** → slå på **pg_net**.)
Se resultatet under **Edge Functions → varsler → Logs / Invocations** – der står hvem som *ville* fått e-post.

## Steg D – slå på
1. **Database → Extensions:** slå på **pg_cron** og **pg_net**.
2. **SQL Editor** (bytt ut `HEMMELIG`):
   ```sql
   -- Kjør sendejobben hver morgen kl. 07:00 norsk vintertid (06:00 UTC)
   select cron.schedule('arshjul-varsler', '0 6 * * *', $$
     select net.http_post(
       url := 'https://jbqwjjzqarrzkngdjqaj.supabase.co/functions/v1/varsler',
       headers := jsonb_build_object('x-varsel-secret', 'HEMMELIG')
     );
   $$);

   -- Hovedbryteren
   update public.app_settings set value = jsonb_set(value, '{aktiv}', 'true') where key = 'varsler';
   ```

## Slå av igjen
```sql
update public.app_settings set value = jsonb_set(value, '{aktiv}', 'false') where key = 'varsler';
```
(Tidsplanen kan stå – jobben sender ingenting når bryteren er av. Fjerne helt: `select cron.unschedule('arshjul-varsler');`)

## Ny sesong
I `app_settings` → `varsler` endres `sesong`, `startAar` når ny sesong opprettes.

## Endre innholdet i e-postene
Innholdet ligger i `varsel.js` (brukes både av appen og sendejobben). Etter endring:
```
node tools/lag-varselfunksjon.js
```
og lim inn den nye `supabase/functions/varsler/index.ts` i Supabase på nytt (steg B.1).
