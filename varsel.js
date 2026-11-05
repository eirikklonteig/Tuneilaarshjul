/* =========================================================
   Tune IL årshjul – innhold i varsel-e-poster
   Brukes to steder:
   - i appen (forhåndsvisning under ☰ → Varsler)
   - i sendejobben i Supabase (supabase/functions/varsler)
   Ren JavaScript uten avhengigheter.
   ========================================================= */
(function (root) {
  'use strict';

  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const STEP = { yearly: 0, once: 0, quarterly: 3, bimonthly: 2, monthly: 1 };
  const TYPE = {
    frist: { name: 'Frist', color: '#F0504A' }, mote: { name: 'Møte', color: '#4C8DF6' },
    arrangement: { name: 'Arrangement', color: '#A274F2' }, dugnad: { name: 'Dugnad', color: '#F5A524' },
    rutine: { name: 'Rutine', color: '#22C383' }
  };
  const UPCOMING_DAYS = 30;

  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayDiff(a, b) { return Math.round((a - b) / 86400000); }
  function fmtDay(d) { return d.getDate() + '. ' + MONTHS[d.getMonth()]; }
  function fmtLong(d) { return WEEKDAYS[d.getDay()] + ' ' + fmtDay(d); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function shiftBack(date, amount, unit) {
    const d = new Date(date);
    if (unit === 'months') d.setMonth(d.getMonth() - amount);
    else d.setDate(d.getDate() - amount * (unit === 'weeks' ? 7 : 1));
    return d;
  }

  // Sesongens måneder og forekomster (samme regler som i appen)
  function seasonMonths(season) {
    return Array.from({ length: 12 }, (_, i) => {
      const m0 = (season.startMonth - 1 + i) % 12;
      return { m: m0 + 1, y: season.startYear + Math.floor((season.startMonth - 1 + i) / 12) };
    });
  }
  function expand(tasks, season) {
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    const months = seasonMonths(season);
    const idxOf = m => (m - season.startMonth + 12) % 12;
    function due(t, seen) {
      if (!t) return null;
      if (t.rel) {
        seen = seen || new Set();
        if (seen.has(t.id)) return null;
        seen.add(t.id);
        const base = due(byId[t.rel.task], seen);
        return base ? shiftBack(base, t.rel.amount, t.rel.unit) : null;
      }
      return t.due ? parseDate(t.due) : null;
    }
    const out = [];
    tasks.forEach(t => {
      const base = due(t);
      const m = base ? base.getMonth() + 1 : t.month;
      if (!m) return;
      const start = idxOf(m);
      const step = STEP[t.repeat] || 0;
      const idxs = step ? Array.from({ length: 12 }, (_, i) => i).filter(i => ((i - start) % step + 12) % step === 0) : [start];
      idxs.forEach(i => {
        let d = null;
        if (base) {
          if (i === start) d = base;
          else { const sm = months[i]; d = new Date(sm.y, sm.m - 1, Math.min(base.getDate(), new Date(sm.y, sm.m, 0).getDate())); }
        }
        out.push({ t, idx: i, month: months[i], due: d, key: step ? `${t.id}@${i}` : t.id });
      });
    });
    return out;
  }

  // ---------- E-postmal ----------
  function shell(title, inner, footer) {
    return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1a15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8e4">
<tr><td style="background:#0f3b2b;background:linear-gradient(160deg,#00965E,#0f3b2b);padding:20px 24px;color:#ffffff">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Tune IL årshjul</div>
<div style="font-size:21px;font-weight:700;margin-top:4px">${esc(title)}</div></td></tr>
<tr><td style="padding:20px 24px 8px">${inner}</td></tr>
<tr><td style="padding:12px 24px 22px;font-size:12px;color:#61706a;border-top:1px solid #eef1ef">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  }
  function itemRow(o, info, today) {
    const tp = TYPE[o.t.type] || TYPE.rutine;
    const when = o.due ? fmtLong(o.due) : `i løpet av ${MONTHS[o.month.m - 1]}`;
    const n = o.due ? dayDiff(o.due, today) : null;
    const rel = n == null ? '' : n < 0 ? `${-n} ${-n === 1 ? 'dag' : 'dager'} siden` : n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dager`;
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eef1ef">
<div style="font-size:15px;font-weight:600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${tp.color};margin-right:8px;vertical-align:middle"></span>${esc(o.t.title)}${o.t.parentTitle ? `<span style="font-weight:400;color:#61706a"> – del av «${esc(o.t.parentTitle)}»</span>` : ''}</div>
<div style="font-size:13px;color:#61706a;margin-top:3px;padding-left:16px">${esc(when)}${rel ? ' · ' + rel : ''} · ${esc(info.roleName(o.t.role))}</div></td></tr>`;
  }
  function section(title, color, rows) {
    if (!rows) return '';
    return `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${color};margin:14px 0 2px">${esc(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  }
  function button(url, text) {
    return `<p style="margin:22px 0 8px"><a href="${esc(url)}" style="display:inline-block;background:#00965E;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${esc(text)}</a></p>`;
  }
  function footer(info, member) {
    const roles = info.memberRoles.map(info.roleName).join(', ');
    return `Du får denne e-posten fordi du har ${roles ? 'vervet ' + esc(roles) : 'tilgang til årshjulet'}. Du kan skru av e-postene under ☰ → Varsler i <a href="${esc(info.appUrl)}" style="color:#00744a">årshjulet</a>.`;
  }

  // Brukerens oppgaver: hovedoppgaver for vervet + underoppgaver som er gitt til vervet
  function items(opts) {
    const readable = opts.tasks.filter(t => t.units.some(u => opts.units.includes(u)));
    const out = [];
    expand(readable, opts.season).forEach(o => {
      if (opts.roleIds.includes(o.t.role) && !opts.done[o.key]) out.push(o);
      (o.t.sub || []).forEach((s, i) => {
        if (!s.role || s.role === o.t.role || !opts.roleIds.includes(s.role)) return;
        const key = `${o.key}~${s.id || 's' + i}`;
        if (opts.done[key]) return;
        const b = s.before ? (s.before.unit ? s.before : s.before.months ? { amount: s.before.months, unit: 'months' } : { amount: s.before.days, unit: 'days' }) : null;
        out.push({
          t: { id: o.t.id, title: s.title, parentTitle: o.t.title, type: o.t.type, role: s.role, description: '' },
          idx: o.idx, month: o.month, key,
          due: o.due ? (b ? shiftBack(o.due, b.amount, b.unit) : o.due) : null
        });
      });
    });
    return out;
  }

  /* Lag e-poster for én bruker.
     opts: { member: {name}, roleIds: [...], units: [...lesbare enheter], tasks, done: {key: true},
             season: {label, startYear, startMonth}, today: Date, appUrl, remindDays: [7,1],
             roleName(id) → 'Sportslig leder · Håndball' } */
  function forMember(opts) {
    const today = new Date(opts.today); today.setHours(0, 0, 0, 0);
    const info = { appUrl: opts.appUrl, roleName: opts.roleName, memberRoles: opts.roleIds };
    const occ = items(opts);
    const first = (opts.member.name || '').split(' ')[0];

    const late = occ.filter(o => o.due && dayDiff(o.due, today) < 0).sort((a, b) => a.due - b.due);
    const next = occ.filter(o => o.due && dayDiff(o.due, today) >= 0 && dayDiff(o.due, today) <= UPCOMING_DAYS).sort((a, b) => a.due - b.due);
    const thisMonth = occ.filter(o => !o.due && o.month.m === today.getMonth() + 1 && o.month.y === today.getFullYear());

    let weekly = null;
    const count = late.length + next.length + thisMonth.length;
    if (count) {
      const subject = next.length
        ? `Årshjulet: ${next.length} ${next.length === 1 ? 'frist' : 'frister'} de neste ${UPCOMING_DAYS} dagene`
        : late.length ? `Årshjulet: ${late.length} ${late.length === 1 ? 'oppgave' : 'oppgaver'} ikke krysset av` : 'Årshjulet: oppgaver denne måneden';
      const inner = `<p style="margin:0 0 6px;font-size:15px">Hei ${esc(first)}!</p>
<p style="margin:0 0 4px;font-size:15px;color:#3b4842">Her er oversikten over oppgavene dine i årshjulet.</p>
${section('Forfalt – ikke krysset av', '#BE312F', late.map(o => itemRow(o, info, today)).join(''))}
${section(`De neste ${UPCOMING_DAYS} dagene`, '#00744a', next.map(o => itemRow(o, info, today)).join(''))}
${section(`I løpet av ${MONTHS[today.getMonth()]}`, '#61706a', thisMonth.map(o => itemRow(o, info, today)).join(''))}
${button(opts.appUrl, 'Åpne årshjulet')}
<p style="margin:0;font-size:13px;color:#61706a">Husk å krysse av når en oppgave er gjort.</p>`;
      const text = [`Hei ${first}!`, '', 'Oversikt over oppgavene dine i årshjulet:', '']
        .concat(late.length ? ['FORFALT – IKKE KRYSSET AV'].concat(late.map(o => `- ${o.t.title} (${fmtDay(o.due)})`), ['']) : [])
        .concat(next.length ? [`DE NESTE ${UPCOMING_DAYS} DAGENE`].concat(next.map(o => `- ${o.t.title} (${fmtDay(o.due)})`), ['']) : [])
        .concat(thisMonth.length ? [`I LØPET AV ${MONTHS[today.getMonth()].toUpperCase()}`].concat(thisMonth.map(o => `- ${o.t.title}`), ['']) : [])
        .concat([`Åpne årshjulet: ${opts.appUrl}`]).join('\n');
      weekly = { kind: 'weekly', subject, html: shell(subject.replace('Årshjulet: ', ''), inner, footer(info)), text, count };
    }

    const reminders = [];
    (opts.remindDays || []).forEach(days => {
      occ.filter(o => o.due && dayDiff(o.due, today) === days).forEach(o => {
        const subject = `Påminnelse: «${o.t.title}» – frist ${days === 1 ? 'i morgen' : `om ${days} dager`}`;
        const inner = `<p style="margin:0 0 6px;font-size:15px">Hei ${esc(first)}!</p>
<p style="margin:0 0 4px;font-size:15px;color:#3b4842">Denne oppgaven har frist ${esc(fmtLong(o.due))} (${days === 1 ? 'i morgen' : `om ${days} dager`}):</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRow(o, info, today)}</table>
${o.t.description ? `<p style="margin:12px 0 0;font-size:14px;color:#3b4842;white-space:pre-line">${esc(o.t.description)}</p>` : ''}
${button(opts.appUrl, 'Åpne årshjulet')}
<p style="margin:0;font-size:13px;color:#61706a">Er den allerede gjort? Kryss den av i årshjulet, så slipper du flere påminnelser.</p>`;
        reminders.push({ kind: 'reminder-' + days, key: o.key, subject, html: shell('Påminnelse', inner, footer(info)),
          text: `Hei ${first}!\n\n«${o.t.title}» har frist ${fmtLong(o.due)}.\n\nÅpne årshjulet: ${opts.appUrl}` });
      });
    });

    return { weekly, reminders, upcoming: next, late };
  }

  // Neste oppgave med fast frist – brukes til å vise et eksempel på en påminnelse
  function sampleReminder(opts) {
    const today = new Date(opts.today); today.setHours(0, 0, 0, 0);
    const o = items(opts).filter(x => x.due && dayDiff(x.due, today) >= 0).sort((a, b) => a.due - b.due)[0];
    if (!o) return null;
    const days = (opts.remindDays && opts.remindDays[0]) || 7;
    const fakeToday = new Date(o.due); fakeToday.setDate(fakeToday.getDate() - days);
    const r = forMember(Object.assign({}, opts, { today: fakeToday, remindDays: [days] }));
    return r.reminders.find(x => x.key === o.key) || null;
  }

  const api = { expand, forMember, sampleReminder, iso, UPCOMING_DAYS };
  root.ArshjulVarsel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
