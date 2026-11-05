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
    frist:       { name: 'Frist',       color: '#BE312F' },
    mote:        { name: 'Møte',        color: '#2F6FBE' },
    arrangement: { name: 'Arrangement', color: '#7A3FB0' },
    dugnad:      { name: 'Dugnad',      color: '#E08A00' },
    rutine:      { name: 'Rutine',      color: '#00965E' }
  },

  // Verv: hvem som har ansvaret. Oppgaver knyttes til verv, ikke til personer.
  roles: [
    { id: 'leder-klubb',  name: 'Leder',                 unit: 'klubb' },
    { id: 'kasserer',     name: 'Kasserer',              unit: 'klubb' },
    { id: 'politiattest', name: 'Politiattestansvarlig', unit: 'klubb' },
    { id: 'valgkomite',   name: 'Valgkomiteen',          unit: 'klubb' },
    { id: 'leder-hb',     name: 'Leder',                 unit: 'handball' },
    { id: 'sportslig-hb', name: 'Sportslig leder',       unit: 'handball' },
    { id: 'dugnad-hb',    name: 'Dugnadsansvarlig',      unit: 'handball' },
    { id: 'dommer-hb',    name: 'Dommerkontakt',         unit: 'handball' },
    { id: 'trener-hb',    name: 'Trener',                unit: 'handball' },
    { id: 'leder-fb',     name: 'Leder',                 unit: 'fotball' },
    { id: 'sportslig-fb', name: 'Sportslig leder',       unit: 'fotball' }
  ],

  /* Oppgaver
     units:   hvilke enheter oppgaven gjelder (én eller flere)
     due:     fast dato (ÅÅÅÅ-MM-DD), eller
     month:   bare måned (1–12), evt. med dateTbd: true = «dato kommer»
     sub:     underoppgaver, evt. med frist relativt til hovedoppgaven
     prepares: id til oppgaven denne forbereder (f.eks. trener → styret) */
  tasks: [
    // August
    { id: 'trenermote-aug', title: 'Felles trener- og ledermøte', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 8,
      description: 'Oppstartsmøte for sesongen: sportsplan, treningstider, utstyr og forventninger.' },
    { id: 'treningstider', title: 'Fordeling av treningstider', type: 'rutine', units: ['handball'], role: 'sportslig-hb', due: '2026-08-15',
      description: 'Fordel halltid mellom lagene og send oversikt til trenerne.' },
    { id: 'politiattest', title: 'Kontroll av politiattester', type: 'rutine', units: ['klubb', 'handball', 'fotball'], role: 'politiattest', due: '2026-08-31',
      description: 'Alle trenere og lagledere som jobber med barn under 18 år skal ha levert godkjent politiattest.',
      links: [{ label: 'Politiattest – Klubbguiden', url: 'https://www.idrettsforbundet.no/klubbguiden/politiattest/' }] },
    { id: 'sjekk-seriestart', title: 'Sjekkliste før seriestart', type: 'rutine', units: ['handball'], role: 'leder-hb', month: 9,
      sub: [{ title: 'Dommerkontakt er registrert' }, { title: 'Trenere har gjennomført nødvendig utdanning' }, { title: 'Fair Play-ansvarlig på hver hjemmekamp' }, { title: 'Arrangementsansvarlig og sekretariat er klart' }] },

    // September
    { id: 'foreldremoter', title: 'Foreldremøte på alle lag', type: 'mote', units: ['handball'], role: 'trener-hb', month: 9,
      sub: [{ title: 'Klubbens verdier' }, { title: 'Foreldrevettregler' }, { title: 'Dugnad' }, { title: 'Økonomi og kontingent' }, { title: 'Sportsplan' }] },
    { id: 'handballskole', title: 'Håndballskole for de minste', type: 'arrangement', units: ['handball'], role: 'sportslig-hb', month: 9 },

    // Oktober
    { id: 'styremote-okt', title: 'Styremøte', type: 'mote', units: ['handball'], role: 'leder-hb', month: 10 },
    { id: 'loddbok', title: 'Salg av loddbok', type: 'dugnad', units: ['klubb', 'handball', 'fotball'], role: 'dugnad-hb', due: '2026-10-15',
      description: 'Klubbdugnad. Loddbøkene deles ut til lagene, som selger innen fristen.' },

    // November
    { id: 'cup-pamelding', title: 'Påmelding til cup', type: 'frist', units: ['handball'], role: 'sportslig-hb', month: 11, dateTbd: true },
    { id: 'loddbok-oppgjor', title: 'Oppgjør loddbøker', type: 'dugnad', units: ['klubb'], role: 'kasserer', due: '2026-11-30' },

    // Desember
    { id: 'moms-anlegg', title: 'Søknad om momskompensasjon for idrettsanlegg', type: 'frist', units: ['klubb'], role: 'kasserer', due: '2026-12-01',
      links: [{ label: 'Momskompensasjon – Klubbguiden', url: 'https://www.idrettsforbundet.no/klubbguiden/' }] },
    { id: 'juledugnad', title: 'Juledugnad', type: 'dugnad', units: ['handball'], role: 'dugnad-hb', month: 12 },

    // Januar
    { id: 'idrettsreg', title: 'Idrettsregistrering', type: 'frist', units: ['klubb'], role: 'leder-klubb', month: 1, dateTbd: true,
      description: 'Rapporter medlemmer og aktive per idrett til NIF.' },
    { id: 'seriereglement', title: 'Innmelding av forslag til seriereglement', type: 'frist', units: ['handball'], role: 'leder-hb', due: '2027-01-15' },

    // Februar
    { id: 'arsmote-hb', title: 'Årsmøte i håndballgruppa', type: 'mote', units: ['handball'], role: 'leder-hb', month: 2,
      description: 'I fleridrettslag holder gruppene sine årsmøter før klubbens årsmøte.' },

    // Mars
    { id: 'arsmote-klubb', title: 'Årsmøte i Tune IL', type: 'mote', units: ['klubb', 'handball', 'fotball'], role: 'leder-klubb', due: '2027-03-31',
      description: 'Årsmøtet skal holdes innen utgangen av mars.',
      sub: [
        { title: 'Valgkomiteen kontakter kandidater', before: { months: 2 } },
        { title: 'Innkalling sendes ut', before: { months: 1 } },
        { title: 'Frist for innsending av forslag', before: { days: 14 } },
        { title: 'Sakliste og dokumenter gjøres tilgjengelig', before: { days: 7 } }
      ] },
    { id: 'revisjon', title: 'Revisjon og kontrollutvalg', type: 'rutine', units: ['klubb'], role: 'kasserer', month: 3 },

    // April
    { id: 'meld-antall-lag', title: 'Meld antall lag til sportslig leder', type: 'frist', units: ['handball'], role: 'trener-hb', due: '2027-04-15', prepares: 'lag-pamelding',
      description: 'Hver trener melder hvor mange lag årgangen trenger neste sesong, så sportslig leder kan melde på lagene.' },
    { id: 'samordnet', title: 'Samordnet rapportering', type: 'frist', units: ['klubb'], role: 'kasserer', due: '2027-04-30' },
    { id: 'nye-styremedl', title: 'Registrer nytt styre i SportsAdmin', type: 'rutine', units: ['klubb', 'handball'], role: 'leder-klubb', month: 4 },

    // Mai
    { id: 'lag-pamelding', title: 'Påmelding av lag til seriespill', type: 'frist', units: ['handball'], role: 'sportslig-hb', due: '2027-05-01',
      links: [{ label: 'SportsAdmin', url: 'https://sa.nif.no/' }] },
    { id: 'dommer-pamelding', title: 'Påmelding av dommere', type: 'frist', units: ['handball'], role: 'dommer-hb', due: '2027-05-01' },
    { id: 'fb-lag', title: 'Påmelding av lag (fotball) – eksempel', type: 'frist', units: ['fotball'], role: 'sportslig-fb', month: 5, dateTbd: true },

    // Juni
    { id: 'evaluering', title: 'Evaluering av sesongen', type: 'mote', units: ['handball'], role: 'sportslig-hb', month: 6,
      sub: [{ title: 'Revider sportsplanen' }, { title: 'Kartlegg trenere og lagledere for neste sesong' }, { title: 'Sårbare årganger over sommeren' }] },
    { id: 'dommerkontakt-sa', title: 'Registrer dommerkontakt i SportsAdmin', type: 'frist', units: ['handball'], role: 'dommer-hb', due: '2027-06-01' },
    { id: 'fb-cup', title: 'Sommercup (fotball) – eksempel', type: 'arrangement', units: ['fotball'], role: 'leder-fb', month: 6 }
  ]
};
