/* =========================================================
   Tune IL årshjul – EKSEMPELDATA (steg 1)
   Dette er testoppgaver for å se hvordan hjulet fungerer.
   Datoene må sjekkes før appen tas i bruk.
   I steg 2–3 flyttes dette til databasen (Supabase).
   ========================================================= */
window.ARSHJUL_DATA = {
  // Sesongen starter i august (håndball går august–juni)
  season: { label: '2026/27', startYear: 2026, startMonth: 8 },

  // Enheter: klubb → grupper (senere også lag)
  units: [
    { id: 'klubb',    name: 'Tune IL',  short: 'Klubb' },
    { id: 'handball', name: 'Håndball', short: 'Håndball', parent: 'klubb' },
    { id: 'fotball',  name: 'Fotball',  short: 'Fotball',  parent: 'klubb' }
  ],

  // Oppgavetyper gir farge og filter
  types: {
    frist:       { name: 'Frist',       color: '#F0504A' },
    mote:        { name: 'Møte',        color: '#4C8DF6' },
    arrangement: { name: 'Arrangement', color: '#A274F2' },
    dugnad:      { name: 'Dugnad',      color: '#F5A524' },
    rutine:      { name: 'Rutine',      color: '#22C383' }
  },

  /* Verv: hvem som har ansvaret. Oppgaver knyttes til verv, ikke til personer.
     Én person kan ha flere verv (f.eks. leder i håndball = håndballeder i hovedstyret).
     styre: false = verv utenfor styret (f.eks. trener) */
  roles: [
    // Hovedstyret (klubb)
    { id: 'leder-klubb',       name: 'Leder',                      unit: 'klubb' },
    { id: 'nestleder-klubb',   name: 'Nestleder',                  unit: 'klubb' },
    { id: 'handballeder',      name: 'Håndballeder',               unit: 'klubb' },
    { id: 'fotballeder',       name: 'Fotballeder',                unit: 'klubb' },
    { id: 'oldboys-leder',     name: 'Oldboys-leder',              unit: 'klubb' },
    { id: 'youngboys-leder',   name: 'Youngboys-leder',            unit: 'klubb' },
    { id: 'daglig-leder',      name: 'Daglig leder',               unit: 'klubb' },
    { id: 'anleggsleder',      name: 'Anleggsleder',               unit: 'klubb' },
    { id: 'ungdomsutvalg-leder', name: 'Ungdomsutvalgsleder',      unit: 'klubb' },
    { id: 'styremedlem-klubb',   name: 'Styremedlem',              unit: 'klubb' },
    { id: 'kontrollkomite',    name: 'Leder kontrollkomiteen',     unit: 'klubb' },
    // Håndballstyret
    { id: 'leder-hb',          name: 'Leder',                      unit: 'handball' },
    { id: 'nestleder-hb',      name: 'Nestleder',                  unit: 'handball' },
    { id: 'okonomi-hb',        name: 'Økonomiansvarlig',           unit: 'handball' },
    { id: 'kiosk-dugnad-hb',   name: 'Kiosk- og dugnadsansvarlig', unit: 'handball' },
    { id: 'hall-materiell-hb', name: 'Hall- og materialansvarlig', unit: 'handball' },
    { id: 'arrangement-hb',    name: 'Arrangementsansvarlig',      unit: 'handball' },
    { id: 'sportslig-hb',      name: 'Sportslig leder',            unit: 'handball' },
    { id: 'trener-hb',         name: 'Trener',                     unit: 'handball', styre: false },
    // Fotballstyret
    { id: 'leder-fb',          name: 'Leder',                      unit: 'fotball' },
    { id: 'nestleder-fb',      name: 'Nestleder',                  unit: 'fotball' },
    { id: 'okonomi-fb',        name: 'Økonomiansvarlig',           unit: 'fotball' },
    { id: 'styremedlem1-fb',   name: 'Styremedlem 1',              unit: 'fotball' },
    { id: 'styremedlem2-fb',   name: 'Styremedlem 2',              unit: 'fotball' },
    { id: 'styremedlem3-fb',   name: 'Styremedlem 3',              unit: 'fotball' },
    { id: 'styremedlem4-fb',   name: 'Styremedlem 4',              unit: 'fotball' }
  ],


  // Kilder som oppgaver kan vise til
  sources: {
    ro:  { label: 'NHF Region Øst – Spilltilbudet 2026-27', url: 'https://www.handball.no/regioner/region-ost/praktisk-info/praktiske-verktoy/spilltilbudet-ro/' },
    nhf: { label: 'NHF – Årshjul for sportslig utvalg', url: 'https://www.handball.no/globalassets/nhf-sentralt/utvikling/klubbhuset/aktivitet-i-klubben/sportslig-ledelse/arshjul_sportslig-utvalg.pdf' },
    nif: { label: 'NIF – Klubbguiden', url: 'https://www.idrettsforbundet.no/klubbguiden/' }
  },

  /* Oppgaver
     units:   hvilke enheter oppgaven gjelder (én eller flere)
     due:     fast dato (ÅÅÅÅ-MM-DD), eller
     month:   bare måned (1–12), evt. med dateTbd: true = «dato kommer»
     sub:     underoppgaver, evt. med frist relativt til hovedoppgaven
     prepares: id til oppgaven denne forbereder (f.eks. trener → styret)
     source:  hvor oppgaven/fristen kommer fra (se sources)
     NB: Frister for 2027 er antatt like som i 2026 – sjekk når regionen publiserer nye. */
  tasks: [
    // ---------- August ----------
    { id: 'lisens', title: 'Lisens for spillere fra 13 år', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 8, source: 'nhf',
      description: 'Alle spillere og dommere må ha løst lisens fra og med kalenderåret de fyller 13 år. Klubben har ansvar for ikke å bruke spillere uten lisens.' },
    { id: 'loppetassen', title: 'Påmelding til Loppetassen og Minirunder (6–8 år) åpner', type: 'frist', units: ['handball'], role: 'sportslig-hb', due: '2026-08-06', source: 'ro',
      description: 'Påmelding i TurneringsAdmin. Hver runde har sin egen frist – følg med i regionens kalender.' },
    { id: 'terminlister', title: 'Terminlistene publiseres – gå gjennom kampene', type: 'rutine', units: ['handball'], role: 'sportslig-hb', due: '2026-08-14', source: 'ro',
      description: 'Endringer i treningstid må være meldt til regionen før kampene publiseres. Få trenere og lagledere til å sjekke sine kamper.' },
    { id: 'treningstider', title: 'Fordeling av treningstider', type: 'rutine', units: ['handball'], role: 'sportslig-hb', due: '2026-08-15',
      description: 'Fordel halltid mellom lagene og send oversikt til trenerne.' },
    { id: 'trenermote-aug', title: 'Trenerforum ved sesongstart', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 8, source: 'nhf',
      sub: [{ title: 'Introduser sportsplanen' }, { title: 'Klubbens verdier og visjon' }, { title: 'Trenerkontrakter' }, { title: 'Informer om trenerkurs' }, { title: 'Registrer trenere og lagledere i SportsAdmin' }] },
    { id: 'politiattest', title: 'Kontroll av politiattester', type: 'rutine', units: ['klubb', 'handball', 'fotball'], role: 'daglig-leder', due: '2026-08-31', source: 'nif',
      description: 'Alle trenere og lagledere som jobber med barn under 18 år skal ha levert godkjent politiattest.' },
    { id: 'sjekk-seriestart', title: 'Sjekkliste før seriestart (uke 36)', type: 'rutine', units: ['handball'], role: 'leder-hb', due: '2026-08-31',
      sub: [{ title: 'Dommerkontakt er registrert' }, { title: 'Fair Play-ansvarlig på hver hjemmekamp' }, { title: 'Arrangementsansvarlig og sekretariat er klart' }, { title: 'Nye spillere: sjekk klubbtilhørighet' }] },

    // ---------- September ----------
    { id: 'infomote-ro', title: 'Infomøte Region Øst for ledere', type: 'mote', units: ['handball'], role: 'sportslig-hb', due: '2026-09-02', source: 'ro',
      description: 'For styreledere, sportslige ledere og daglige ledere. Digitale møter 2., 3., 7. og 8. september (J/G 9–12 og J/G 13+).' },
    { id: 'sa-funksjoner', title: 'Sjekk at dommerkontakt og utdanningskoordinator er registrert i SportsAdmin', type: 'rutine', units: ['handball'], role: 'sportslig-hb', month: 9, source: 'nhf' },
    { id: 'foreldremoter', title: 'Foreldremøte på alle lag', type: 'mote', units: ['handball'], role: 'trener-hb', month: 9, source: 'nhf',
      sub: [{ title: 'Klubbens verdier og visjon' }, { title: 'Foreldrevettregler' }, { title: 'Dugnad' }, { title: 'Økonomi og kontingent' }, { title: 'Sportsplan' }] },
    { id: 'handballskole', title: 'Håndballskole for de minste', type: 'arrangement', units: ['handball'], role: 'arrangement-hb', month: 9 },

    // ---------- Oktober ----------
    { id: 'sportslig-ledermote', title: 'Sportslig leder-møte i regionen', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 10, dateTbd: true, source: 'nhf',
      description: 'Invitasjon kommer fra regionen eller en vertsklubb.' },
    { id: 'infomote-4er', title: 'Infomøte 4-er-håndball (6–8 år) for trenere og lagledere', type: 'mote', units: ['handball'], role: 'trener-hb', month: 10, source: 'ro',
      description: 'Obligatorisk. Møter 8., 12. og 13. oktober og 10. og 11. november.' },
    { id: 'styremote-okt', title: 'Styremøte', type: 'mote', units: ['handball'], role: 'leder-hb', month: 10 },
    { id: 'loddbok', title: 'Salg av loddbok', type: 'dugnad', units: ['klubb', 'handball', 'fotball'], role: 'kiosk-dugnad-hb', due: '2026-10-15',
      description: 'Klubbdugnad. Loddbøkene deles ut til lagene, som selger innen fristen.' },

    // ---------- November ----------
    { id: 'gutteturnering', title: 'Påmelding til Gutteturneringen (5.–6. des.)', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 11, dateTbd: true, source: 'ro' },
    { id: 'trenerforum-nov', title: 'Trenerforum i egen klubb', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 11, source: 'nhf',
      description: 'Oppfølging av trenere og samtale om utvikling.' },
    { id: 'loddbok-oppgjor', title: 'Oppgjør loddbøker', type: 'dugnad', units: ['klubb'], role: 'daglig-leder', due: '2026-11-30' },

    // ---------- Desember ----------
    { id: 'moms-anlegg', title: 'Søknad om momskompensasjon for idrettsanlegg', type: 'frist', units: ['klubb'], role: 'daglig-leder', due: '2026-12-01', source: 'nif' },
    { id: 'lisens-13', title: 'Lisens for de som fyller 13 år neste år', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 12, source: 'nhf' },
    { id: 'juledugnad', title: 'Juledugnad', type: 'dugnad', units: ['handball'], role: 'kiosk-dugnad-hb', month: 12 },
    { id: 'juleavslutning', title: 'Felles juleavslutning for håndballgruppa', type: 'arrangement', units: ['handball'], role: 'arrangement-hb', month: 12, source: 'nhf' },

    // ---------- Januar ----------
    { id: 'idrettsreg', title: 'Idrettsregistrering', type: 'frist', units: ['klubb'], role: 'leder-klubb', month: 1, dateTbd: true, source: 'nif',
      description: 'Rapporter medlemmer og aktive per idrett til NIF.' },
    { id: 'cup-pamelding', title: 'Påmelding til cuper', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 1, source: 'nhf' },
    { id: 'evaluering-host', title: 'Evaluering av høstsesongen med trenerne', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 1, source: 'nhf',
      sub: [{ title: 'Status for hvert lag' }, { title: 'Rekrutteringstiltak' }, { title: 'Revider sportsplanen for neste sesong' }] },

    // ---------- Februar ----------
    { id: 'arsmote-hb', title: 'Årsmøte i håndballgruppa', type: 'mote', units: ['handball'], role: 'leder-hb', month: 2,
      description: 'I fleridrettslag holder gruppene sine årsmøter før klubbens årsmøte.' },
    { id: 'halltid', title: 'Treningstimer i hall for neste sesong', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 2, source: 'nhf',
      sub: [{ title: 'Søk kommunen om halltid' }, { title: 'Planlegg fordeling i gruppa' }] },
    { id: 'trenere-neste', title: 'Skaffe trenere og lagledere til alle lag neste sesong', type: 'rutine', units: ['handball'], role: 'sportslig-hb', month: 2, source: 'nhf' },

    // ---------- Mars ----------
    { id: 'arsmote-klubb', title: 'Årsmøte i Tune IL', type: 'mote', units: ['klubb', 'handball', 'fotball'], role: 'leder-klubb', due: '2027-03-31', source: 'nif',
      description: 'Årsmøtet skal holdes innen utgangen av mars.',
      sub: [
        { title: 'Valgkomiteen kontakter kandidater', before: { months: 2 } },
        { title: 'Innkalling sendes ut', before: { months: 1 } },
        { title: 'Frist for innsending av forslag', before: { days: 14 } },
        { title: 'Sakliste og dokumenter gjøres tilgjengelig', before: { days: 7 } }
      ] },
    { id: 'revisjon', title: 'Revisjon og kontrollkomiteens gjennomgang', type: 'rutine', units: ['klubb'], role: 'kontrollkomite', month: 3 },
    { id: 'kurs-plan', title: 'Kartlegg trener- og dommerkompetanse og planlegg kurs', type: 'rutine', units: ['handball'], role: 'sportslig-hb', month: 3, source: 'nhf',
      sub: [{ title: 'Oversikt over trenerkompetanse' }, { title: 'Oversikt over dommerkompetanse' }, { title: 'Meld kursbehov til regionen' }] },

    // ---------- April ----------
    { id: 'dommer-pamelding', title: 'Påmelding av dommere for neste sesong', type: 'frist', units: ['handball'], role: 'sportslig-hb', due: '2027-05-01', source: 'ro',
      description: 'Åpner 1. april, frist 1. mai. Klubbens dommerkontakt melder på i TurneringsAdmin. Dommerne må ha fullført nødvendige kurs for å telle på kvoten.' },
    { id: 'beach', title: 'Påmelding til Beachdagen og Beachserien', type: 'frist', units: ['handball'], role: 'sportslig-hb', due: '2027-04-11', source: 'ro',
      description: 'I TurneringsAdmin. Spilles i mai/juni.' },
    { id: 'meld-antall-lag', title: 'Meld antall lag til sportslig leder', type: 'frist', units: ['handball'], role: 'trener-hb', due: '2027-04-15', prepares: 'lag-pamelding',
      description: 'Hver trener melder hvor mange lag årgangen trenger neste sesong, og hvilket nivå (J/G 11 år og eldre), så sportslig leder kan melde på lagene.' },
    { id: 'samordnet', title: 'Samordnet rapportering', type: 'frist', units: ['klubb'], role: 'daglig-leder', due: '2027-04-30', source: 'nif' },
    { id: 'nye-styremedl', title: 'Registrer nytt styre i SportsAdmin', type: 'rutine', units: ['klubb', 'handball'], role: 'leder-klubb', month: 4 },
    { id: 'evaluering', title: 'Evaluering av sesongen', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 4, source: 'nhf',
      description: 'Serieslutt 25. april.',
      sub: [{ title: 'Trenerforum' }, { title: 'Felles avslutning' }, { title: 'Revider sportsplanen' }] },

    // ---------- Mai ----------
    { id: 'lag-pamelding', title: 'Påmelding av lag til seriespill', type: 'frist', units: ['handball'], role: 'sportslig-hb', due: '2027-05-01', source: 'ro',
      description: 'Frist kl. 23:59. Vurder nivå for J/G 11 år og eldre, og unngå kampkollisjoner mellom lag. Etter fristen: sjekk at lagene står i riktig klasse og nivå.',
      links: [{ label: 'TurneringsAdmin', url: 'https://ta.nif.no/' }] },
    { id: 'lag-endring', title: 'Siste frist for endring av lagpåmelding', type: 'frist', units: ['handball'], role: 'leder-hb', due: '2027-05-06', source: 'ro',
      description: 'Endringer sendes på e-post til regionskontoret.' },
    { id: 'sarbare', title: 'Følg opp sårbare årganger over sommeren', type: 'rutine', units: ['handball'], role: 'sportslig-hb', month: 5, source: 'nhf',
      description: 'Tilby aktivitet i sommermånedene for årganger som står i fare for å miste spillere.' },
    { id: 'fb-lag', title: 'Påmelding av lag (fotball) – eksempel', type: 'frist', units: ['fotball'], role: 'leder-fb', month: 5, dateTbd: true },

    // ---------- Juni ----------
    { id: 'termin1', title: 'Betal 1. termin av regionseriegebyret', type: 'frist', units: ['handball'], role: 'okonomi-hb', month: 6, dateTbd: true, source: 'ro',
      description: '25 % av gebyret faktureres etter påmelding. Påmeldingen godkjennes først når fakturaen er betalt.' },
    { id: 'handballskole-plan', title: 'Planlegg håndballskole i høstferien', type: 'arrangement', units: ['handball'], role: 'arrangement-hb', month: 6, source: 'nhf' },
    { id: 'fb-cup', title: 'Sommercup (fotball) – eksempel', type: 'arrangement', units: ['fotball'], role: 'leder-fb', month: 6 },

    // ---------- Juli ----------
    { id: 'treningstid-senior', title: 'Meld treningstid for hjemmekamper (senior) til regionen', type: 'frist', units: ['handball'], role: 'leder-hb', due: '2027-07-01', source: 'ro' }
  ]
};
