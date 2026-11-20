-- =========================================================
-- Tune IL årshjul – kalenderår og klubbstyrets årshjul 2027
--
-- Kjøres ÉN gang: SQL Editor → New query → lim inn ALT → Run.
-- Trygt å kjøre på nytt.
--
-- 1. Flytter oppgaver fra sesongen «2026/27» over til kalenderår (2026 eller 2027),
--    og flytter avkrysningene med.
-- 2. Legger inn klubbstyrets møter, årsmøte og sosiale samlinger for 2027.
--    Finnes «Årsmøte i Tune IL» fra før, oppdateres den med riktig dato (18. mars).
-- =========================================================

-- ---------- 1. Sesong → kalenderår ----------

-- Avkrysninger på gjentakende oppgaver: «id@3» betydde fjerde måned fra august. Nå teller vi fra januar.
update public.task_status s set
  season   = case when m.mnd >= 8 then '2026' else '2027' end,
  task_key = regexp_replace(s.task_key, '@\d+', '@' || (m.mnd - 1))
from (
  select season, task_key, ((substring(task_key from '@(\d+)')::int + 7) % 12) + 1 as mnd
  from public.task_status where season = '2026/27' and task_key ~ '@\d+'
) m
where s.season = m.season and s.task_key = m.task_key;

-- Oppgavene: år fra fristen, ellers fra måneden (august–desember = 2026, januar–juli = 2027)
update public.tasks set season = case
    when data ? 'due' then left(data ->> 'due', 4)
    when coalesce((data ->> 'month')::int, 1) >= 8 then '2026'
    else '2027' end
where season = '2026/27';

-- Øvrige avkrysninger følger oppgaven sin
update public.task_status s set season = t.season
from public.tasks t
where s.season = '2026/27' and s.task_id = t.id;

-- Varselinnstillingene: kalenderår
update public.app_settings
set value = value - 'sesong' - 'startAar' - 'startMaaned'
where key = 'varsler';

-- ---------- 2. Klubbstyret 2027 ----------
-- Ansvarlig: Leder i hovedstyret. Synlig for alle med tilgang til Tune IL (klubb).
-- Sosiale samlinger og årsmøtet vises også for håndball og fotball, siden alle med styreroller er invitert.

insert into public.tasks (id, season, units, data) values
('k2027-styremote-feb', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-02-01",
  "sub":[{"id":"s1","title":"Økonomirapport, nov.–des. 2026"},{"id":"s2","title":"Behandling av årsregnskap 2026 før revisjon"},
         {"id":"s3","title":"Vedta budsjett 2027"},{"id":"s4","title":"Fastsette dato for årsmøtet og sende innkalling"}]}$j$),
('k2027-eo-styremote', '2027', '{klubb}', $j${
  "title":"Ekstraordinært styremøte – årsmøteforberedende","type":"mote","role":"leder-klubb","due":"2027-03-01",
  "sub":[{"id":"s1","title":"Vedta årsregnskap 2026"},{"id":"s2","title":"Fastsette saksliste til årsmøtet"},
         {"id":"s3","title":"Gjennomgang og forberedelser av saksunderlag"}]}$j$),
('k2027-sosial-mars', '2027', '{klubb,handball,fotball}', $j${
  "title":"Sosial samling for alle med styreroller","type":"arrangement","role":"leder-klubb","due":"2027-03-12",
  "description":"Alle med styreroller i Tune IL og ansatte inviteres. Bespisning, inspirasjonsdel og sosialt samvær.",
  "sub":[{"id":"s1","title":"Invitere alle med styreroller i Tune IL"},{"id":"s2","title":"Invitere ansatte"},
         {"id":"s3","title":"Bespisning"},{"id":"s4","title":"Inspirasjonsdel"},{"id":"s5","title":"Sosialt samvær"}]}$j$),
('arsmote-klubb', '2027', '{klubb,handball,fotball}', $j${
  "title":"Årsmøte i Tune IL","type":"mote","role":"leder-klubb","due":"2027-03-18","source":"nif",
  "description":"Årsmøtet skal holdes innen utgangen av mars.",
  "sub":[{"id":"p1","title":"Valgkomiteen kontakter kandidater","before":{"amount":2,"unit":"months"}},
         {"id":"p2","title":"Innkalling sendes ut","before":{"amount":1,"unit":"months"}},
         {"id":"p3","title":"Frist for innsending av forslag","before":{"amount":2,"unit":"weeks"}},
         {"id":"p4","title":"Sakliste og dokumenter gjøres tilgjengelig","before":{"amount":1,"unit":"weeks"}},
         {"id":"s1","title":"Årsmeldinger for idrettslaget, gruppene og kontrollkomiteen"},{"id":"s2","title":"Regnskap 2026"},
         {"id":"s3","title":"Budsjett 2027"},{"id":"s4","title":"Eventuelle merkeutdelinger"},{"id":"s5","title":"Valg"}]}$j$),
('k2027-styremote-apr', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-04-05",
  "sub":[{"id":"s1","title":"Økonomirapport, jan.–feb. 2027"},{"id":"s2","title":"Første møte i ny-/gjenvalgt styre: konstituering og arbeidsform"}]}$j$),
('k2027-styremote-mai', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-05-24",
  "sub":[{"id":"s1","title":"Økonomirapport, mars–april 2027"}]}$j$),
('k2027-styremote-aug', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-08-23",
  "sub":[{"id":"s1","title":"Økonomirapport, mai–juni 2027"}]}$j$),
('k2027-sosial-aug', '2027', '{klubb,handball,fotball}', $j${
  "title":"Sosial samling for alle med styreroller","type":"arrangement","role":"leder-klubb","due":"2027-08-27",
  "description":"Alle med styreroller i Tune IL og ansatte inviteres. Bespisning, inspirasjonsdel og sosialt samvær.",
  "sub":[{"id":"s1","title":"Invitere alle med styreroller i Tune IL"},{"id":"s2","title":"Invitere ansatte"},
         {"id":"s3","title":"Bespisning"},{"id":"s4","title":"Inspirasjonsdel"},{"id":"s5","title":"Sosialt samvær"}]}$j$),
('k2027-styremote-sep', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-09-20",
  "sub":[{"id":"s1","title":"Økonomirapport, juli–aug. 2027"}]}$j$),
('k2027-styremote-nov', '2027', '{klubb}', $j${
  "title":"Styremøte – hovedstyret","type":"mote","role":"leder-klubb","due":"2027-11-15",
  "sub":[{"id":"s1","title":"Økonomirapport, sept.–okt. 2027"},{"id":"s2","title":"Oppstart av budsjettarbeidet"},
         {"id":"s3","title":"Fastsette årshjul 2028"}]}$j$)
on conflict (id) do update set season = excluded.season, units = excluded.units, data = excluded.data, deleted = false;
