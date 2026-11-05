# Oppsett av Supabase for Tune IL årshjul

Gjøres én gang, i nettleseren på supabase.com. Det tar ca. 15 minutter.

## 1. Opprett prosjektet
1. Gå til **supabase.com/dashboard** og trykk **New project**.
2. **Name:** `tune-arshjul`
3. **Database password:** trykk *Generate a password* og lagre det et trygt sted (passordbehandler). Du trenger det sjelden, og det skal **aldri** deles.
4. **Region:** velg **Europe** (for eksempel *West EU (Ireland)* eller *Central EU (Frankfurt)*).
5. Trykk **Create new project** og vent et par minutter.

## 2. Lag databasen
1. Gå til **SQL Editor** (menyen til venstre) og trykk **New query**.
2. Åpne filen `supabase/schema.sql`, kopier **alt** (ca. 340 linjer) og lim det inn.
3. Trykk **Run**. Det skal stå *Success. No rows returned*.
4. Sjekk under **Table Editor** at tabellene finnes, og at `members` har én rad: eklonteig@gmail.com.

## 3. Innlogging med kode
1. **Authentication → Sign In / Providers → Email:** slå av **Confirm email** og trykk **Save**.
   (Da får nye brukere en kode i stedet for en lenke første gang. Det er trygt: bare de som står i brukerregisteret får se noe.)
2. **Authentication → Emails → Templates → Magic Link:**
   - **Subject:** `Din kode til Tune IL årshjul`
   - **Body** (erstatt alt):
     ```html
     <h2>Din kode til Tune IL årshjul</h2>
     <p>Skriv inn denne koden i appen:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>Koden virker i én time. Har du ikke bedt om den, kan du se bort fra e-posten.</p>
     ```
   - Trykk **Save**.
3. **Authentication → URL Configuration:** sett **Site URL** til `https://tuneilaarshjul.vercel.app` og lagre.

## 4. E-post (samme som i Skuddkart)
Supabase sin innebygde e-post sender bare til deg selv, maks 2 i timen. For at andre skal få koden:
1. **Authentication → Emails → SMTP Settings:** slå på **Enable custom SMTP**.
2. Fyll inn det samme som i Skuddkart-prosjektet:
   - **Host:** `smtp.gmail.com` · **Port:** `465`
   - **Username:** Gmail-adressen · **Password:** app-passordet fra Google
   - **Sender email:** Gmail-adressen · **Sender name:** `Tune IL årshjul`
3. Trykk **Save**.

## 5. Send meg adresse og nøkkel
Gå til **Project Settings → API Keys** (eller **Data API**) og send meg:
- **Project URL** (ser ut som `https://abcdefgh.supabase.co`)
- **Publishable key** (begynner med `sb_publishable_`)

Disse to er laget for å ligge i appen. Jeg legger dem inn i `config.js`.

## Aldri del
- **service_role** / **secret**-nøkkelen
- databasepassordet
- app-passordet til e-post

## Tilgangsnivåer
| Nivå | Kan |
|---|---|
| **Leser** | Se oppgavene i enheten og krysse av |
| **Redaktør** | I tillegg opprette og endre oppgaver |
| **Admin** | I tillegg legge til brukere, gi tilgang og lage verv i enheten |
| **Hovedadmin** | Alt, i alle enheter |

Tilgang gis per enhet (Tune IL, Håndball, Fotball). En person kan for eksempel være admin i Håndball og leser i Tune IL.
