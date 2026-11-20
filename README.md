# Tune IL årshjul

Årshjul for Tune IL – først håndball, senere også fotball og klubb.

## Status
**Steg 1 (test):** hjul, månedsliste, listevisning, filter på enhet (Tune IL / Håndball / Fotball) og verv, avkrysning (lagres bare lokalt), utskrift. Bruker eksempeldata i `data.js`.

## Plan
1. ✅ Hjul + liste + filter med eksempeloppgaver, lyst/mørkt tema, Mer-meny, skjema for ny/redigert oppgave (lagres lokalt)
2. ✅ Supabase: innlogging (kode på e-post), enheter, brukerregister, tilgang og verv
3. ✅ Oppgaver og avkrysninger i databasen, velkomstside, offentlig lenke (?offentlig), knapper etter tilgang. Gjenstår: statuser, kommentarer, søk
4. Varsler på e-post (ukentlig + påminnelser) ferdig laget, IKKE slått på – se supabase/VARSLER.md. Kalenderabonnement senere.
5. ✅ Kalenderår (januar–desember) med valg av år, «Nytt år» (kopier faste oppgaver, avkrysninger nullstilles), norske helligdager: utregnede og flyttede datoer legges på nærmeste dag før. Klubbstyret 2027 i supabase/steg5-kalenderaar.sql

## Viktige valg
- Årshjulet følger kalenderåret (januar–desember), fordi klubbstyret og økonomien følger året.
- Datoer som regnes ut eller kopieres til et nytt år, flyttes til nærmeste dag før hvis de havner på en helligdag eller søndag. Datoer du skriver inn selv, flyttes ikke (appen sier fra).
- Oppgaver knyttes til **verv**, ikke personer – nye styremedlemmer arver oppgavene.
- En oppgave kan gjelde én eller flere enheter.
- Tilgang (admin/bruker) og verv er to forskjellige ting.
- Bård og Spond har ikke åpent API – ingen integrasjon foreløpig.

## Kjøre lokalt
```
node tools/serve.js . 5174
```
Åpne http://localhost:5174
