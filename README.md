# Tune IL årshjul

Årshjul for Tune IL – først håndball, senere også fotball og klubb.

## Status
**Steg 1 (test):** hjul, månedsliste, listevisning, filter på enhet (Tune IL / Håndball / Fotball) og verv, avkrysning (lagres bare lokalt), utskrift. Bruker eksempeldata i `data.js`.

## Plan
1. ✅ Hjul + liste + filter med eksempeloppgaver, lyst/mørkt tema, Mer-meny, skjema for ny/redigert oppgave (lagres lokalt)
2. Supabase: innlogging (kode på e-post), enheter, brukerregister, tilgang og verv
3. Oppgaver i databasen (skjemaet finnes allerede lokalt): avkrysning per sesong, statuser, kommentarer, søk, «mine oppgaver», admin kan lage nye verv
4. Kalenderlenke (iCal) og e-postpåminnelser *(venter)*
5. Klubb og fotball inn, maler, «kopier til neste sesong» (oppgaver nullstilles, datoer kan justeres), offentlig lenke

## Viktige valg
- Sesongen starter i august.
- Oppgaver knyttes til **verv**, ikke personer – nye styremedlemmer arver oppgavene.
- En oppgave kan gjelde én eller flere enheter.
- Tilgang (admin/bruker) og verv er to forskjellige ting.
- Bård og Spond har ikke åpent API – ingen integrasjon foreløpig.

## Kjøre lokalt
```
node tools/serve.js . 5174
```
Åpne http://localhost:5174
