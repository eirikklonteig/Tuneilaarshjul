/* =========================================================
   Tune IL årshjul – hjul, månedsliste, filter og oppgaveskjema
   Foreløpig lagres alt på denne enheten (localStorage).
   ========================================================= */
(function () {
  'use strict';

  const D = window.ARSHJUL_DATA;
  const VERSION = '0.7';
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];
  const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const STATE_KEY = 'arshjul-visning';
  const DONE_KEY = 'arshjul-gjort-' + D.season.label;
  const TASKS_KEY = 'arshjul-oppgaver-' + D.season.label;
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const REPEAT = {
    yearly:    { step: 0, label: 'Hvert år' },
    once:      { step: 0, label: 'Bare denne sesongen' },
    quarterly: { step: 3, label: 'Hvert kvartal' },
    bimonthly: { step: 2, label: 'Annenhver måned' },
    monthly:   { step: 1, label: 'Hver måned' }
  };
  const UNIT_WORD = { days: ['dag', 'dager'], weeks: ['uke', 'uker'], months: ['måned', 'måneder'] };

  const unitById = Object.fromEntries(D.units.map(u => [u.id, u]));
  let roleById = Object.fromEntries(D.roles.map(r => [r.id, r]));

  // ---------- Lagring ----------
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privat modus o.l. */ }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sesongens 12 måneder, fra startmåned
  const seasonMonths = Array.from({ length: 12 }, (_, i) => {
    const m0 = (D.season.startMonth - 1 + i) % 12;
    const y = D.season.startYear + Math.floor((D.season.startMonth - 1 + i) / 12);
    return { m: m0 + 1, y };
  });
  const seasonStart = new Date(seasonMonths[0].y, seasonMonths[0].m - 1, 1);
  const seasonEnd = new Date(seasonMonths[11].y, seasonMonths[11].m, 0);
  function monthIndexOf(m) { return (m - D.season.startMonth + 12) % 12; }
  function todayIndex() {
    return seasonMonths.findIndex(s => s.m === today.getMonth() + 1 && s.y === today.getFullYear());
  }

  // Oppgaver: egne endringer på denne enheten, ellers eksempeldataene
  let customized = !!readJSON(TASKS_KEY, null);
  let tasks = readJSON(TASKS_KEY, null) || clone(D.tasks);
  let taskById = {};
  let occ = [];   // forekomster: én per oppgave per måned den gjelder

  const saved = readJSON(STATE_KEY, {});
  const state = {
    units: Array.isArray(saved.units) && saved.units.some(id => unitById[id]) ? saved.units.filter(id => unitById[id]) : ['klubb', 'handball'],
    role: saved.role && (saved.role === 'alle' || saved.role === 'mine' || roleById[saved.role]) ? saved.role : 'alle',
    view: saved.view === 'liste' ? 'liste' : 'hjul',
    hideDone: !!saved.hideDone,
    month: todayIndex() >= 0 ? todayIndex() : 0,
    open: null
  };
  let done = readJSON(DONE_KEY, {});
  let doneBy = {};          // hvem som krysset av (e-post), fra databasen
  let tasksLoaded = false;  // er oppgavene hentet fra databasen?
  const PUBLIC = /[?&]offentlig\b/.test(location.search);

  function saveState() {
    writeJSON(STATE_KEY, { units: state.units, role: state.role, view: state.view, hideDone: state.hideDone });
  }
  // Lagre endrede/slettede oppgaver: i databasen når man er innlogget, ellers lokalt
  function saveTasks(changed, removed) {
    rebuild();
    persistTasks(changed || [], removed || []);
  }

  // ---------- Dato ----------
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDay(d) { return d.getDate() + '. ' + MONTHS[d.getMonth()]; }
  function fmtLong(d) { return WEEKDAYS[d.getDay()] + ' ' + fmtDay(d) + ' ' + d.getFullYear(); }
  function fmtShort(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); }
  function daysUntil(d) { return Math.round((d - today) / 86400000); }
  function untilText(n) {
    if (n < 0) return Math.abs(n) === 1 ? 'i går' : `${Math.abs(n)} dager siden`;
    if (n === 0) return 'i dag';
    if (n === 1) return 'i morgen';
    if (n < 14) return `om ${n} dager`;
    if (n < 60) return `om ${Math.round(n / 7)} uker`;
    return `om ${Math.round(n / 30)} mnd`;
  }
  function shiftBack(date, amount, unit) {
    const d = new Date(date);
    if (unit === 'months') d.setMonth(d.getMonth() - amount);
    else d.setDate(d.getDate() - amount * (unit === 'weeks' ? 7 : 1));
    return d;
  }
  function amountText(amount, unit) {
    const w = UNIT_WORD[unit] || UNIT_WORD.days;
    return amount + ' ' + (Number(amount) === 1 ? w[0] : w[1]);
  }
  // Gamle underoppgaver bruker { months } / { days }
  function subBefore(s) {
    if (!s.before) return null;
    if (s.before.unit) return s.before;
    if (s.before.months) return { amount: s.before.months, unit: 'months' };
    if (s.before.days % 7 === 0) return { amount: s.before.days / 7, unit: 'weeks' };
    return { amount: s.before.days, unit: 'days' };
  }

  // Fristen til en oppgave (følger kjeden hvis den er relativ til en annen oppgave)
  function resolveDue(t, seen) {
    if (!t) return null;
    if (t.rel) {
      seen = seen || new Set();
      if (seen.has(t.id)) return null;
      seen.add(t.id);
      const base = resolveDue(taskById[t.rel.task], seen);
      return base ? shiftBack(base, t.rel.amount, t.rel.unit) : null;
    }
    return t.due ? parseDate(t.due) : null;
  }

  // ---------- Forekomster (gjentakelse) ----------
  function rebuild() {
    taskById = Object.fromEntries(tasks.map(t => [t.id, t]));
    occ = [];
    tasks.forEach(t => {
      const base = resolveDue(t);
      const m = base ? base.getMonth() + 1 : t.month;
      if (!m) return;
      const start = monthIndexOf(m);
      const step = (REPEAT[t.repeat] || REPEAT.yearly).step;
      const idxs = step ? Array.from({ length: 12 }, (_, i) => i).filter(i => ((i - start) % step + 12) % step === 0) : [start];
      idxs.forEach(i => {
        let due = null;
        if (base) {
          if (i === start) due = base;
          else {
            const sm = seasonMonths[i];
            const last = new Date(sm.y, sm.m, 0).getDate();
            due = new Date(sm.y, sm.m - 1, Math.min(base.getDate(), last));
          }
        }
        occ.push({
          t, idx: i, due,
          key: step ? `${t.id}@${i}` : t.id,
          opens: !step && t.opens ? parseDate(t.opens) : null
        });
      });
    });
  }

  // ---------- Filtrering ----------
  function matchesFilter(t) {
    if (!t.units.some(u => state.units.includes(u))) return false;
    if (state.role === 'mine') return myRoleIds().includes(t.role);
    if (state.role !== 'alle' && t.role !== state.role) return false;
    return true;
  }
  function isVisible(o) { return matchesFilter(o.t) && !(state.hideDone && done[o.key]); }
  function sortOcc(a, b) {
    const da = a.due ? a.due.getDate() : 32;
    const db = b.due ? b.due.getDate() : 32;
    return da - db || a.t.title.localeCompare(b.t.title, 'no');
  }
  function occForMonth(i, all) {
    return occ.filter(o => o.idx === i && (all ? matchesFilter(o.t) : isVisible(o))).sort(sortOcc);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function roleLabel(id) {
    const r = roleById[id];
    return r ? r.name + ' · ' + unitById[r.unit].short : '';
  }

  // ---------- Toppen: fremdrift og neste frister ----------
  function renderHero() {
    document.getElementById('season-label').textContent = D.season.label;

    const mine = occ.filter(o => matchesFilter(o.t));
    const nDone = mine.filter(o => done[o.key]).length;
    const pct = mine.length ? Math.round(nDone / mine.length * 100) : 0;
    document.getElementById('season-progress').innerHTML =
      `<span><b>${nDone}</b> av ${mine.length} gjort</span><span class="progress-bar"><i style="width:${pct}%"></i></span><span>${pct} %</span>`;

    const dated = mine.filter(o => o.due && !done[o.key]);
    const late = dated.filter(o => o.due < today).sort((a, b) => a.due - b.due);
    const next = dated.filter(o => o.due >= today).sort((a, b) => a.due - b.due).slice(0, late.length ? 4 : 5);

    let html = '';
    if (late.length) {
      const first = late[0];
      html += `<button type="button" class="up-card late" data-action="goto" data-task="${esc(first.key)}" style="--type:${D.types.frist.color}">
        <span class="up-when">${late.length} ${late.length === 1 ? 'forfalt frist' : 'forfalte frister'}</span>
        <span class="up-title">${esc(first.t.title)}${late.length > 1 ? ' m.fl.' : ''}</span>
        <span class="up-meta">Ikke krysset av</span></button>`;
    }
    html += next.map(o => `<button type="button" class="up-card" data-action="goto" data-task="${esc(o.key)}" style="--type:${D.types[o.t.type].color}">
        <span class="up-when">${untilText(daysUntil(o.due))}</span>
        <span class="up-title">${esc(o.t.title)}</span>
        <span class="up-meta">${fmtDay(o.due)} · ${esc(roleById[o.t.role] ? roleById[o.t.role].name : '')}</span></button>`).join('');
    document.getElementById('upcoming').innerHTML = html || '<p class="up-empty">Ingen kommende frister for dette filteret.</p>';
  }

  // ---------- Filter-UI ----------
  function roleOptions(onlyUnits) {
    let html = '';
    D.units.filter(u => !onlyUnits || onlyUnits.includes(u.id)).forEach(u => {
      const opt = r => `<option value="${r.id}">${esc(r.name)}</option>`;
      const styre = D.roles.filter(r => r.unit === u.id && r.styre !== false);
      const andre = D.roles.filter(r => r.unit === u.id && r.styre === false);
      const styreNavn = u.id === 'klubb' ? 'hovedstyret' : 'styret';
      if (styre.length) html += `<optgroup label="${esc(u.name)} – ${styreNavn}">` + styre.map(opt).join('') + '</optgroup>';
      if (andre.length) html += `<optgroup label="${esc(u.name)} – andre">` + andre.map(opt).join('') + '</optgroup>';
    });
    return html;
  }

  function renderFilters() {
    // Bare enheter brukeren har tilgang til
    const readable = readableUnits();
    if (readable.length) {
      state.units = state.units.filter(u => readable.includes(u));
      if (!state.units.length) state.units = readable.slice();
    }
    document.getElementById('unit-chips').innerHTML = D.units.filter(u => readable.includes(u.id)).map(u => {
      const on = state.units.includes(u.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-action="unit" data-unit="${u.id}" aria-pressed="${on}">
        <span class="chip-check" aria-hidden="true">${on ? '✓' : ''}</span>${esc(u.name)}</button>`;
    }).join('');

    const sel = document.getElementById('role-select');
    const mineOpt = myRoleIds().length ? '<option value="mine">★ Mine verv</option>' : '';
    sel.innerHTML = '<option value="alle">Alle verv</option>' + mineOpt + roleOptions(state.units);
    if (state.role === 'mine' && !mineOpt) state.role = 'alle';
    if (state.role !== 'alle' && state.role !== 'mine' && (!roleById[state.role] || !state.units.includes(roleById[state.role].unit))) state.role = 'alle';
    sel.value = state.role;

    document.getElementById('hide-done').checked = state.hideDone;

    document.getElementById('legend').innerHTML = Object.values(D.types)
      .map(tp => `<span class="legend-item"><i style="background:${tp.color}"></i>${tp.name}</span>`).join('');

    document.querySelectorAll('[data-action="view"]').forEach(b => {
      const on = b.dataset.view === state.view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
  }

  // ---------- Hjulet (SVG) ----------
  const C = 200, R_OUT = 194, R_RIM = 160, R_IN = 82;
  function pt(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }
  function f(n) { return n.toFixed(2); }
  function arc(r1, r2, a1, a2) {
    const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${f(x1)} ${f(y1)} A${r2} ${r2} 0 ${large} 1 ${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} A${r1} ${r1} 0 ${large} 0 ${f(x4)} ${f(y4)}Z`;
  }
  // Bane for buet månedsnavn – snus i nedre halvdel så teksten ikke står på hodet
  function labelPath(i) {
    const mid = i * 30 + 15;
    const bottom = mid > 90 && mid < 270;
    const r = bottom ? (R_RIM + R_OUT) / 2 + 4.5 : (R_RIM + R_OUT) / 2 - 4.5;
    const a1 = i * 30 + 1, a2 = (i + 1) * 30 - 1;
    const [x1, y1] = pt(r, bottom ? a2 : a1), [x2, y2] = pt(r, bottom ? a1 : a2);
    return `M${f(x1)} ${f(y1)} A${r} ${r} 0 0 ${bottom ? 0 : 1} ${f(x2)} ${f(y2)}`;
  }
  function dateAngle(d) {
    const i = seasonMonths.findIndex(s => s.m === d.getMonth() + 1 && s.y === d.getFullYear());
    if (i < 0) return null;
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return (i + (d.getDate() - 0.5) / days) * 30;
  }

  function renderWheel() {
    const svg = document.getElementById('wheel');
    const ti = todayIndex();
    let out = `<defs>
      <linearGradient id="selGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1FD68A"/><stop offset="1" stop-color="#00965E"/></linearGradient>
      ${seasonMonths.map((_, i) => `<path id="lp${i}" d="${labelPath(i)}"/>`).join('')}
    </defs>`;

    // Ukestreker langs kanten
    for (let d = new Date(seasonStart); ; d.setDate(d.getDate() + 7)) {
      const a = dateAngle(d);
      if (a === null) break;
      const [x1, y1] = pt(R_OUT + 3, a), [x2, y2] = pt(R_OUT + 7, a);
      out += `<line class="tick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    }

    seasonMonths.forEach((sm, i) => {
      const a1 = i * 30 + 0.7, a2 = (i + 1) * 30 - 0.7;
      const sel = i === state.month;
      const list = occForMonth(i);
      const label = `${MONTHS[sm.m - 1]} ${sm.y}, ${list.length} oppgaver`;
      out += `<g class="seg${sel ? ' sel' : ''}${i === ti ? ' now' : ''}" data-month="${i}" role="button" tabindex="0" aria-label="${label}" aria-pressed="${sel}">`;
      out += `<path class="seg-body" d="${arc(R_IN + 5, R_RIM - 2, a1, a2)}"/>`;
      out += `<path class="seg-rim" d="${arc(R_RIM, R_OUT, a1, a2)}"/>`;
      out += `<text class="seg-label"><textPath href="#lp${i}" startOffset="50%" text-anchor="middle">${MONTHS_SHORT[sm.m - 1]}</textPath></text>`;

      // Prikker: én per oppgave, fargen viser typen
      const rows = [{ r: 142, n: 5, s: 5.0 }, { r: 123, n: 4, s: 5.9 }, { r: 104, n: 3, s: 7.0 }];
      const max = rows.reduce((s, r) => s + r.n, 0);
      let k = 0;
      for (const row of rows) {
        const inRow = Math.min(row.n, list.length - k);
        for (let c = 0; c < inRow; c++, k++) {
          const o = list[k];
          const [x, y] = pt(row.r, i * 30 + 15 + (c - (inRow - 1) / 2) * row.s);
          const more = k === max - 1 && list.length > max;
          out += more
            ? `<text class="seg-more" x="${f(x)}" y="${f(y)}">+${list.length - max + 1}</text>`
            : `<circle class="dot${done[o.key] ? ' done' : ''}" cx="${f(x)}" cy="${f(y)}" r="5.2" fill="${D.types[o.t.type].color}"/>`;
        }
      }
      out += '</g>';
    });

    // «Nå»-viser
    const nowA = dateAngle(today);
    if (nowA !== null) {
      const [x1, y1] = pt(R_IN + 2, nowA), [x2, y2] = pt(R_OUT + 5, nowA);
      out += `<line class="now-hand" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      out += `<circle class="now-dot" cx="${f(x2)}" cy="${f(y2)}" r="5"/>`;
    }

    // Midten: valgt måned og fremdrift for måneden
    const sm = seasonMonths[state.month];
    const all = occForMonth(state.month, true);
    const nDone = all.filter(o => done[o.key]).length;
    const rP = R_IN - 7, circ = 2 * Math.PI * rP;
    const frac = all.length ? nDone / all.length : 0;
    out += `<circle class="hub" cx="${C}" cy="${C}" r="${R_IN}"/>`;
    out += `<circle class="hub-track" cx="${C}" cy="${C}" r="${rP}"/>`;
    if (frac > 0) out += `<circle class="hub-progress" cx="${C}" cy="${C}" r="${rP}" stroke-dasharray="${f(circ)}" stroke-dashoffset="${f(circ * (1 - frac))}" transform="rotate(-90 ${C} ${C})"/>`;
    out += `<text class="hub-season" x="${C}" y="${C - 28}">${sm.y}</text>`;
    out += `<text class="hub-month" x="${C}" y="${C + 2}">${MONTHS[sm.m - 1]}</text>`;
    out += `<text class="hub-count" x="${C}" y="${C + 28}">${all.length === 0 ? 'ingen oppgaver' : `${nDone} av ${all.length} gjort`}</text>`;

    svg.innerHTML = out;
  }

  // ---------- Oppgavekort ----------
  function dateBox(o) {
    if (o.due) return `<span class="datebox"><b>${o.due.getDate()}</b><span>${MONTHS_SHORT[o.due.getMonth()]}</span></span>`;
    const m = seasonMonths[o.idx].m;
    return `<span class="datebox nodate"><b>${o.t.dateTbd ? '?' : '–'}</b><span>${MONTHS_SHORT[m - 1]}</span></span>`;
  }
  function badge(o) {
    if (done[o.key]) return '';
    if (o.t.dateTbd) return '<span class="badge tbd">Dato kommer</span>';
    if (!o.due) return '';
    if (o.opens && o.opens <= today && o.due >= today) return '<span class="badge open">Åpen nå</span>';
    const n = daysUntil(o.due);
    if (n < 0) return '<span class="badge late">Forfalt</span>';
    if (n <= 14) return `<span class="badge soon">${untilText(n)}</span>`;
    return '';
  }

  function taskCard(o) {
    const t = o.t;
    const tp = D.types[t.type] || D.types.rutine;
    const isDone = !!done[o.key];
    const open = state.open === o.key;
    const roleUnit = roleById[t.role] && roleById[t.role].unit;
    const showUnits = !(t.units.length === 1 && t.units[0] === roleUnit);
    const unitsHtml = !showUnits ? '' : t.units.map(u => `<span class="unit-tag">${esc(unitById[u].short)}</span>`).join('');
    const subCount = t.sub ? t.sub.length : 0;
    const rep = t.repeat && REPEAT[t.repeat] && REPEAT[t.repeat].step ? `<span class="repeat-tag">↻ ${REPEAT[t.repeat].label.toLowerCase()}</span>` : '';

    let details = '';
    if (open) {
      details += '<div class="task-details">';
      if (o.opens) details += `<p class="detail-due">Åpner ${fmtLong(o.opens)}<br>Frist ${fmtLong(o.due)}</p>`;
      else if (o.due) details += `<p class="detail-due">Frist ${fmtLong(o.due)}</p>`;
      else if (t.dateTbd) details += `<p class="detail-due">Dato kommer (${MONTHS[seasonMonths[o.idx].m - 1]})</p>`;
      if (t.rel && taskById[t.rel.task]) details += `<p class="link-note">Fristen er ${amountText(t.rel.amount, t.rel.unit)} før <button type="button" class="linklike" data-action="goto" data-task="${esc(t.rel.task)}">${esc(taskById[t.rel.task].title)}</button></p>`;
      if (t.repeat && t.repeat !== 'yearly') details += `<p class="link-note">Gjentakelse: ${REPEAT[t.repeat].label.toLowerCase()}</p>`;
      if (t.description) details += `<p class="desc">${esc(t.description)}</p>`;
      if (t.sub && t.sub.length) {
        details += '<h4>Underoppgaver</h4><ul class="subs">' + t.sub.map(s => {
          const b = subBefore(s);
          const sd = b && o.due ? shiftBack(o.due, b.amount, b.unit) : null;
          const when = b ? `<span class="sub-when">${amountText(b.amount, b.unit)} før${sd ? ' · ca. ' + fmtShort(sd) : ''}</span>` : '';
          return `<li><span>${esc(s.title)}</span>${when}</li>`;
        }).join('') + '</ul>';
      }
      const prepTarget = t.prepares && !(t.rel && t.rel.task === t.prepares) ? taskById[t.prepares] : null;
      if (prepTarget) {
        details += `<p class="link-note">Forbereder: <button type="button" class="linklike" data-action="goto" data-task="${esc(prepTarget.id)}">${esc(prepTarget.title)}</button> (${esc(roleLabel(prepTarget.role))})</p>`;
      }
      tasks.filter(x => x.prepares === t.id || (x.rel && x.rel.task === t.id)).forEach(p => {
        const pd = resolveDue(p);
        details += `<p class="link-note">Forberedes av: <button type="button" class="linklike" data-action="goto" data-task="${esc(p.id)}">${esc(p.title)}</button> (${esc(roleLabel(p.role))}${pd ? ', frist ' + fmtShort(pd) : ''})</p>`;
      });
      if (t.links && t.links.length) {
        details += '<div class="links">' + t.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a>`).join('') + '</div>';
      }
      const holders = roleHolders(t.role);
      if (holders.length) details += `<p class="link-note">Ansvarlig: <b>${holders.map(esc).join(', ')}</b> (${esc(roleLabel(t.role))})</p>`;
      if (t.source && D.sources && D.sources[t.source]) {
        const s = D.sources[t.source];
        details += `<p class="source-note">Kilde: <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></p>`;
      }
      if (t.public && mode() !== 'public') details += `<p class="link-note">🌐 Vises på den offentlige lenken</p>`;
      if (isDone) {
        const by = memberName(doneBy[o.key]);
        details += `<p class="done-note">✓ Krysset av ${fmtDay(new Date(done[o.key]))}${by ? ' av ' + esc(by) : ''}</p>`;
      }
      if (canEditTask(t)) details += `<div class="task-actions">
        <button type="button" class="btn-small" data-action="edit" data-task="${esc(t.id)}">Rediger</button>
        <button type="button" class="btn-small" data-action="copy" data-task="${esc(t.id)}">Kopier</button>
      </div>`;
      details += '</div>';
    }

    return `<article class="task${isDone ? ' is-done' : ''}${open ? ' open' : ''}" id="task-${esc(o.key)}" style="--type:${tp.color}">
      <button type="button" class="task-head" data-action="open" data-task="${esc(o.key)}" aria-expanded="${open}">
        ${dateBox(o)}
        <span class="task-body">
          <span class="task-title">${esc(t.title)}</span>
          <span class="task-meta">
            <span class="type-pill">${tp.name}</span>
            <span class="role">${esc(roleLabel(t.role))}</span>
            ${badge(o)}
          </span>
          ${unitsHtml || subCount || rep ? `<span class="task-meta">
            ${unitsHtml}${rep}
            ${subCount ? `<span class="sub-count">${subCount} ${subCount === 1 ? 'underoppgave' : 'underoppgaver'}</span>` : ''}
          </span>` : ''}
        </span>
      </button>
      ${canTick() ? `<button type="button" class="check" data-action="done" data-task="${esc(o.key)}" aria-pressed="${isDone}" aria-label="${isDone ? 'Fjern avkrysning' : 'Merk som gjort'}: ${esc(t.title)}">${CHECK_SVG}</button>` : '<span></span>'}
      ${details}
    </article>`;
  }

  function addButton(i) {
    if (!canAddTasks()) return '';
    const m = MONTHS[seasonMonths[i].m - 1];
    return `<button type="button" class="add-inline" data-action="new" data-month="${i}"><span>+</span> Legg til i ${m}</button>`;
  }
  function emptyHtml(i) {
    const sm = seasonMonths[i];
    const any = occ.some(o => o.idx === i);
    if (sm.m === 7 && !any) return '<p class="empty">Ingen oppgaver i juli. God sommer! ☀️</p>';
    return `<p class="empty">Ingen oppgaver ${any ? 'som passer filteret ' : ''}i ${MONTHS[sm.m - 1]}.</p>`;
  }

  function renderMonth() {
    const sm = seasonMonths[state.month];
    document.getElementById('month-title').textContent = MONTHS[sm.m - 1] + ' ' + sm.y;
    const all = occForMonth(state.month, true);
    const nDone = all.filter(o => done[o.key]).length;
    document.getElementById('month-sub').textContent = all.length
      ? `${all.length} ${all.length === 1 ? 'oppgave' : 'oppgaver'} · ${nDone} gjort`
      : 'Ingen oppgaver';
    const list = occForMonth(state.month);
    document.getElementById('month-tasks').innerHTML = emptyWheelBanner() + (list.length ? list.map(taskCard).join('') : emptyHtml(state.month)) + addButton(state.month);
  }

  // Tomt årshjul i databasen: tilby å hente oppgaver
  function emptyWheelBanner() {
    if (mode() !== 'cloud' || tasks.length) return '';
    if (!canAddTasks()) return '<div class="banner"><b>Årshjulet er tomt</b><p>Det er ingen oppgaver her ennå. En administrator legger dem inn.</p></div>';
    const local = readJSON(TASKS_KEY, null);
    return `<div class="banner">
      <b>Årshjulet er tomt</b>
      <p>Start med eksempeloppgavene (NHF Region Øst, NIF og sportslig utvalg) og tilpass dem${local ? ', eller last opp oppgavene du har lagt inn på denne enheten' : ''}.</p>
      <div class="banner-actions">
        <button type="button" class="btn-primary" data-action="import" data-val="seed">Hent ${D.tasks.length} eksempeloppgaver</button>
        ${local ? `<button type="button" class="btn-secondary" data-action="import" data-val="local">Last opp mine ${local.length} lokale</button>` : ''}
      </div>
    </div>`;
  }

  // Før innlogging o.l.: blekt hjul og en melding i stedet for oppgavene
  function gateHtml(m) {
    if (m === 'welcome') return `
      <h2>Velkommen til årshjulet</h2>
      <p>Her finner styret, trenere og tillitsvalgte i Tune IL de faste oppgavene og fristene gjennom sesongen – og hvem som har ansvaret.</p>
      <p>Logg inn med e-postadressen din for å se oppgavene. Du får en kode på e-post – ingen passord.</p>
      <button type="button" class="btn-primary wide" data-action="login-open">Logg inn</button>
      <a class="gate-link" href="?offentlig">Se det offentlige årshjulet →</a>`;
    if (m === 'loading') return `<h2>Henter årshjulet …</h2><p>Et øyeblikk.</p>`;
    if (m === 'nomember') return `
      <h2>Ikke registrert ennå</h2>
      <p>Du er logget inn som <b>${esc(session.email)}</b>, men denne adressen er ikke lagt inn i årshjulet.</p>
      <p>Be en administrator i klubben eller gruppa legge deg til, så får du tilgang.</p>
      <button type="button" class="btn-secondary wide" data-action="logout">Logg ut</button>`;
    if (m === 'error') return `
      <h2>Kunne ikke hente årshjulet</h2>
      <p>${esc(cloudError || 'Ukjent feil')}. Sjekk nettet og prøv igjen.</p>
      <button type="button" class="btn-primary wide" data-action="cloud-reload">Prøv igjen</button>`;
    return '';
  }

  function renderList() {
    const ti = todayIndex();
    document.getElementById('view-liste').innerHTML =
      `<h2 class="print-title">Tune IL årshjul · sesong ${D.season.label}</h2>` +
      seasonMonths.map((sm, i) => {
        const list = occForMonth(i);
        return `<section class="list-month${i === ti ? ' now' : ''}">
          <h3>${MONTHS[sm.m - 1]} ${sm.y}${i === ti ? ' <span class="now-tag">Nå</span>' : ''} <small>${list.length || ''}</small></h3>
          <div class="task-list">${list.length ? list.map(taskCard).join('') : emptyHtml(i)}${addButton(i)}</div>
        </section>`;
      }).join('');
  }

  function render() {
    const m = mode();
    document.body.dataset.mode = m;
    document.getElementById('season-label').textContent = D.season.label;
    document.body.classList.toggle('can-add', canAddTasks());
    const gate = gateHtml(m);
    document.getElementById('gate').innerHTML = gate;
    if (gate) {
      // Bare et blekt, tomt hjul bak meldingen
      document.getElementById('view-hjul').hidden = false;
      document.getElementById('view-liste').hidden = true;
      renderWheel();
      return;
    }
    renderHero();
    renderFilters();
    document.getElementById('view-hjul').hidden = state.view !== 'hjul';
    document.getElementById('view-liste').hidden = state.view !== 'liste';
    if (state.view === 'hjul') { renderWheel(); renderMonth(); } else { renderList(); }
  }

  // ---------- Lyst / mørkt tema ----------
  const THEME_KEY = 'arshjul-tema';
  const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function themePref() {
    try { return localStorage.getItem(THEME_KEY) || 'lys'; } catch (e) { return 'lys'; }
  }
  function applyTheme() {
    const p = themePref();
    const dark = p === 'mork' || (p === 'auto' && darkQuery && darkQuery.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#133327' : '#e4f4ec';
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { applyTheme(); });

  // ---------- Små meldinger ----------
  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  // ---------- Filer: kalender og sikkerhetskopi ----------
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsDate(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function downloadIcs() {
    const list = occ.filter(o => matchesFilter(o.t) && o.due);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tune IL//Arshjul//NO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Tune IL årshjul'];
    list.forEach(o => {
      const end = new Date(o.due); end.setDate(end.getDate() + 1);
      const desc = [roleLabel(o.t.role), o.t.description || ''].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT', `UID:${o.key.replace('@', '-')}-${D.season.label.replace('/', '-')}@tune-arshjul`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(o.due)}`, `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${icsEscape(o.t.title)}`, `DESCRIPTION:${icsEscape(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    download('tune-arshjul-' + D.season.label.replace('/', '-') + '.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
    toast(`${list.length} frister lagt i kalenderfilen`);
  }
  function downloadBackup() {
    const data = { app: 'tune-arshjul', version: VERSION, season: D.season.label, exported: new Date().toISOString(), tasks, done };
    download('tune-arshjul-oppgaver-' + isoDate(today) + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Sikkerhetskopi lastet ned');
  }

  // ---------- Ikoner ----------
  const ICONS = {
    sun: '<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    auto: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function ico(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`; }
  const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  function row(icon, title, sub, opts) {
    opts = opts || {};
    const tag = opts.action ? 'button' : 'div';
    const attrs = opts.action ? ` type="button" data-action="${opts.action}"` : '';
    const right = opts.soon ? `<span class="soon-pill">${opts.soon}</span>` : (opts.action ? CHEV : '');
    return `<${tag} class="row${opts.danger ? ' danger' : ''}${opts.soon ? ' disabled' : ''}"${attrs}>
      <span class="row-icon">${ico(icon)}</span>
      <span class="row-text"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right}</${tag}>`;
  }

  // =========================================================
  // Innlogging og brukerregister (Supabase)
  // Innlogging med kode på e-post. Vi snakker med Supabase med vanlig fetch.
  // =========================================================
  const CFG = window.ARSHJUL_CONFIG || {};
  const SB_URL = (CFG.supabaseUrl || '').replace(/\/$/, '');
  const SB_KEY = CFG.supabaseKey || '';
  const cloudReady = !!(SB_URL && SB_KEY);
  const SESSION_KEY = 'arshjul-innlogging';
  const LEVELS = { admin: 'Admin', editor: 'Redaktør', reader: 'Leser' };
  const LEVEL_HELP = { admin: 'kan også legge til brukere og verv', editor: 'kan opprette og endre oppgaver', reader: 'ser oppgavene og kan krysse av' };
  ICONS.logout = '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>';
  ICONS.shield = '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>';
  ICONS.back = '<path d="M15 5l-7 7 7 7"/>';

  let session = readJSON(SESSION_KEY, null);  // { access_token, refresh_token, expires_at, email }
  let cloud = null;   // { me, members, access, memberRoles, roles, units }
  let cloudError = '';
  let moreView = 'main';
  let login = { step: 'email', email: '', busy: false, msg: '' };
  let userDraft = null;
  let userSearch = '';
  const builtInRoles = D.roles.slice();

  async function authCall(path, body, token) {
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(`${SB_URL}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(json.msg || json.error_description || json.message || `Feil ${res.status}`); err.status = res.status; throw err; }
    return json;
  }
  function storeSession(json) {
    session = {
      access_token: json.access_token, refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      email: ((json.user && json.user.email) || (session && session.email) || '').toLowerCase()
    };
    writeJSON(SESSION_KEY, session);
  }
  async function validToken() {
    if (!session) return null;
    if (Date.now() < session.expires_at - 60000) return session.access_token;
    try {
      storeSession(await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
      return session.access_token;
    } catch (err) {
      if (err.status) { logoutLocal(); toast('Innloggingen har gått ut. Logg inn på nytt under ☰.'); }
      return null;
    }
  }
  async function rest(path, opts) {
    const { method = 'GET', body, prefer } = opts || {};
    const token = await validToken();
    if (!token) throw new Error('Ikke logget inn');
    const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (json && json.message) || `Feil ${res.status}`;
      throw new Error(/row-level security/.test(msg) ? 'Du har ikke tilgang til å gjøre dette.' : /members_email/.test(msg) ? 'Det finnes allerede en bruker med denne e-postadressen.' : msg);
    }
    return json;
  }

  // Hent brukere, tilgang og verv. Databasen viser bare det brukeren har lov til å se.
  async function loadCloud() {
    if (!cloudReady || !session) return;
    try {
      const [members, access, memberRoles, roles, units] = await Promise.all([
        rest('members?select=id,email,name,is_superadmin,active&order=name'),
        rest('member_access?select=member_id,unit_id,level'),
        rest('member_roles?select=member_id,role_id'),
        rest('roles?select=id,unit_id,name,styre,sort,active&order=sort,name'),
        rest('units?select=id,name,short,parent,sort&order=sort')
      ]);
      const me = members.find(m => m.email === session.email && m.active) || null;
      cloud = { me, members, access, memberRoles, roles, units };
      cloudError = '';
      applyCloudRoles();
      if (me) await loadTasks();
    } catch (err) {
      cloudError = err.message;
    }
    render();
    if (document.getElementById('more').open) renderMore();
  }
  // Vervene fra databasen erstatter de innebygde
  function applyCloudRoles() {
    if (!cloud || !cloud.roles.length) return;
    D.roles = cloud.roles.filter(r => r.active).map(r => ({ id: r.id, name: r.name, unit: r.unit_id, styre: r.styre }));
    roleById = Object.fromEntries(builtInRoles.map(r => [r.id, r]).concat(cloud.roles.map(r => [r.id, { id: r.id, name: r.name, unit: r.unit_id, styre: r.styre }])));
  }
  // ---------- Modus og tilgang ----------
  // public: offentlig lenke · local: uten database · welcome/loading/nomember/error: før innhold · cloud: innlogget
  function mode() {
    if (PUBLIC) return 'public';
    if (!cloudReady) return 'local';
    if (!session) return 'welcome';
    if (!cloud) return cloudError ? 'error' : 'loading';
    if (!cloud.me) return 'nomember';
    if (!tasksLoaded) return cloudError ? 'error' : 'loading';
    return 'cloud';
  }
  function canEditUnit(u) {
    const m = mode();
    if (m === 'local') return true;
    if (m !== 'cloud') return false;
    const a = myAccess(u);
    return a === 'admin' || a === 'editor';
  }
  function canEditTask(t) { return t.units.some(canEditUnit); }
  function canAddTasks() { return D.units.some(u => canEditUnit(u.id)); }
  function canTick() { const m = mode(); return m === 'local' || m === 'cloud'; }
  function readableUnits() {
    return mode() === 'cloud' ? D.units.filter(u => myAccess(u.id)).map(u => u.id) : D.units.map(u => u.id);
  }
  function memberName(email) {
    if (!email || !cloud) return '';
    const m = cloud.members.find(x => x.email === email);
    return m ? m.name : email;
  }

  // ---------- Oppgaver i databasen ----------
  const SEASON_Q = encodeURIComponent(D.season.label);
  function rowToTask(r) { return Object.assign({}, r.data, { id: r.id, units: r.units }); }
  function taskToRow(t) {
    const data = Object.assign({}, t);
    delete data.id; delete data.units;
    return { id: t.id, season: D.season.label, units: t.units, data };
  }
  async function loadTasks() {
    const [rows, st] = await Promise.all([
      rest(`tasks?season=eq.${SEASON_Q}&deleted=is.false&select=id,units,data`),
      rest(`task_status?season=eq.${SEASON_Q}&select=task_key,status,updated_at,updated_by`)
    ]);
    tasks = rows.map(rowToTask);
    done = {}; doneBy = {};
    st.forEach(x => { if (x.status === 'done') { done[x.task_key] = x.updated_at; doneBy[x.task_key] = x.updated_by; } });
    tasksLoaded = true;
    lastLoad = Date.now();
    rebuild();
  }
  let lastLoad = 0;
  async function loadPublic() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/tasks?season=eq.${SEASON_Q}&select=id,units,data`, { headers: { apikey: SB_KEY } });
      const rows = res.ok ? await res.json() : [];
      tasks = rows.map(rowToTask);
    } catch (err) { tasks = []; }
    tasksLoaded = true;
    rebuild(); render();
  }
  async function persistTasks(changed, removed) {
    const m = mode();
    if (m === 'local') { writeJSON(TASKS_KEY, tasks); customized = true; return; }
    if (m !== 'cloud') return;
    try {
      if (changed.length) await rest('tasks', { method: 'POST', body: changed.map(taskToRow), prefer: 'resolution=merge-duplicates,return=minimal' });
      for (const id of removed) await rest(`tasks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    } catch (err) {
      toast('Kunne ikke lagre: ' + err.message);
      try { await loadTasks(); } catch (e) { /* vises ved neste forsøk */ }
      render();
    }
  }
  async function setDone(key, on) {
    const o = occ.find(x => x.key === key);
    if (!o) return;
    if (on) { done[key] = new Date().toISOString(); doneBy[key] = session && session.email; }
    else { delete done[key]; delete doneBy[key]; }
    render();
    if (mode() === 'local') { writeJSON(DONE_KEY, done); return; }
    try {
      if (on) await rest('task_status', { method: 'POST', body: { season: D.season.label, task_key: key, task_id: o.t.id, status: 'done' }, prefer: 'resolution=merge-duplicates,return=minimal' });
      else await rest(`task_status?season=eq.${SEASON_Q}&task_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', prefer: 'return=minimal' });
    } catch (err) {
      toast('Kunne ikke lagre avkrysningen: ' + err.message);
      try { await loadTasks(); } catch (e) { /* ignorer */ }
      render();
    }
  }
  // Første gang: hent eksempeloppgavene eller de lokale oppgavene inn i databasen
  async function importTasks(source) {
    const local = readJSON(TASKS_KEY, null);
    const list = (source === 'local' && local ? local : clone(D.tasks)).filter(t => t.units.some(canEditUnit));
    if (!list.length) return toast('Ingen oppgaver du har lov til å legge inn.');
    try {
      await rest('tasks', { method: 'POST', body: list.map(taskToRow), prefer: 'resolution=merge-duplicates,return=minimal' });
      if (source === 'local') {
        const ids = new Set(list.map(t => t.id));
        const localDone = readJSON(DONE_KEY, {});
        const st = Object.keys(localDone).map(k => ({ season: D.season.label, task_key: k, task_id: k.split('@')[0], status: 'done' })).filter(s => ids.has(s.task_id));
        if (st.length) await rest('task_status', { method: 'POST', body: st, prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      await loadTasks();
      render();
      toast(`${list.length} oppgaver er lagt inn i årshjulet`);
    } catch (err) { toast('Kunne ikke legge inn: ' + err.message); }
  }

  function logoutLocal() {
    tasks = []; done = {}; doneBy = {}; tasksLoaded = false;
    session = null; cloud = null;
    writeJSON(SESSION_KEY, null);
    D.roles = builtInRoles.slice();
    roleById = Object.fromEntries(builtInRoles.map(r => [r.id, r]));
    if (state.role === 'mine') state.role = 'alle';
    render();
  }

  // Hjelpere for tilgang og verv
  function myAccess(unit) {
    if (!cloud || !cloud.me) return null;
    if (cloud.me.is_superadmin) return 'admin';
    const a = cloud.access.find(x => x.member_id === cloud.me.id && x.unit_id === unit);
    return a ? a.level : null;
  }
  function isSuper() { return !!(cloud && cloud.me && cloud.me.is_superadmin); }
  function isAnyAdmin() { return isSuper() || !!(cloud && cloud.me && cloud.access.some(a => a.member_id === cloud.me.id && a.level === 'admin')); }
  function myRoleIds() { return cloud && cloud.me ? cloud.memberRoles.filter(r => r.member_id === cloud.me.id).map(r => r.role_id) : []; }
  function roleHolders(roleId) {
    if (!cloud) return [];
    return cloud.memberRoles.filter(r => r.role_id === roleId)
      .map(r => cloud.members.find(m => m.id === r.member_id)).filter(m => m && m.active).map(m => m.name);
  }
  function memberAccess(id) { return cloud.access.filter(a => a.member_id === id); }
  function memberRoleIds(id) { return cloud.memberRoles.filter(r => r.member_id === id).map(r => r.role_id); }
  function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''); }
  function unitName(id) { return (unitById[id] || {}).name || id; }

  function sheetHead(title, back) {
    return `<div class="sheet-head">
      ${back ? `<button type="button" class="icon-btn" data-action="more-view" data-val="${back}" aria-label="Tilbake">${ico('back')}</button>` : ''}
      <h2>${esc(title)}</h2>
      <button type="button" class="icon-btn" data-action="close-more" aria-label="Lukk">${ico('close')}</button>
    </div>`;
  }

  // Profil-delen i Mer
  function profileHtml() {
    if (!cloudReady) return `<div class="group">${row('user', 'Logg inn', 'Kommer straks – databasen settes opp nå', { soon: 'Snart' })}</div>`;
    if (!session) return `<div class="group">${row('user', 'Logg inn', 'Med kode på e-post – ingen passord å huske', { action: 'login' })}</div>`;
    if (cloudError) return `<div class="group">${row('user', esc(session.email), 'Kunne ikke hente data: ' + esc(cloudError), {})}${row('reset', 'Prøv igjen', '', { action: 'cloud-reload' })}${row('logout', 'Logg ut', '', { action: 'logout' })}</div>`;
    if (!cloud) return `<div class="group">${row('user', esc(session.email), 'Henter …', {})}</div>`;
    if (!cloud.me) return `<div class="group">
      ${row('user', esc(session.email), 'Denne e-postadressen er ikke registrert i årshjulet. Be en administrator legge deg til.', {})}
      ${row('logout', 'Logg ut', '', { action: 'logout' })}</div>`;
    const me = cloud.me;
    const acc = me.is_superadmin ? '<span class="lvl admin">Hovedadmin</span>'
      : memberAccess(me.id).map(a => `<span class="lvl ${a.level}">${esc(unitName(a.unit_id))}: ${LEVELS[a.level]}</span>`).join('');
    const roles = myRoleIds().map(id => roleById[id]).filter(Boolean).map(r => `${esc(r.name)} · ${esc(unitName(r.unit))}`).join(', ');
    return `<div class="group">
      <div class="profile">
        <span class="avatar">${esc(initials(me.name))}</span>
        <span class="row-text"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></span>
      </div>
      <div class="profile-meta">
        <div class="lvls">${acc || '<span class="lvl">Ingen tilgang ennå</span>'}</div>
        <small>${roles ? 'Verv: ' + roles : 'Ingen verv registrert'}</small>
      </div>
      ${myRoleIds().length ? row('star', 'Vis bare mine oppgaver', 'Velger «Mine verv» i filteret', { action: 'show-mine' }) : ''}
      ${row('logout', 'Logg ut', '', { action: 'logout' })}
    </div>`;
  }

  // ---------- Innlogging ----------
  function renderLogin() {
    const L = login;
    document.getElementById('more-content').innerHTML = `
      ${sheetHead('Logg inn', 'main')}
      <div class="group pad">
        ${L.step === 'email' ? `
          <p class="lead">Skriv e-postadressen din, så sender vi deg en engangskode. Du trenger ikke passord.</p>
          <label class="field"><span>E-post</span><input type="email" id="login-email" value="${esc(L.email)}" autocomplete="email" inputmode="email" placeholder="navn@eksempel.no"></label>
          <button type="button" class="btn-primary wide" data-action="send-code"${L.busy ? ' disabled' : ''}>${L.busy ? 'Sender …' : 'Send kode'}</button>
        ` : `
          <p class="lead">Vi har sendt en kode til <b>${esc(L.email)}</b>. Sjekk også søppelpost.</p>
          <label class="field"><span>Kode fra e-posten</span><input type="text" id="login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" class="code-input"></label>
          <button type="button" class="btn-primary wide" data-action="verify-code"${L.busy ? ' disabled' : ''}>${L.busy ? 'Logger inn …' : 'Logg inn'}</button>
          <div class="login-links">
            <button type="button" class="linklike" data-action="send-code">Send ny kode</button>
            <button type="button" class="linklike" data-action="login-change">Bruk en annen e-post</button>
          </div>
        `}
        ${L.msg ? `<p class="form-error" role="alert">${esc(L.msg)}</p>` : ''}
      </div>`;
    setTimeout(() => { const el = document.getElementById(L.step === 'email' ? 'login-email' : 'login-code'); if (el) el.focus(); }, 50);
  }
  async function sendCode() {
    const input = document.getElementById('login-email');
    const email = (input ? input.value : login.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { login.msg = 'Skriv en gyldig e-postadresse.'; return renderLogin(); }
    login = { step: login.step, email, busy: true, msg: '' }; renderLogin();
    try {
      await authCall('otp', { email, create_user: true });
      login = { step: 'code', email, busy: false, msg: '' };
      toast('Koden er sendt');
    } catch (err) {
      login.busy = false;
      login.msg = err.status === 429 ? 'For mange forsøk. Vent litt og prøv igjen.' : 'Kunne ikke sende kode: ' + err.message;
    }
    renderLogin();
  }
  async function verifyCode() {
    const token = (document.getElementById('login-code').value || '').replace(/\D/g, '');
    if (token.length < 6) { login.msg = 'Skriv inn hele koden fra e-posten.'; return renderLogin(); }
    login.busy = true; login.msg = ''; renderLogin();
    try {
      storeSession(await authCall('verify', { type: 'email', email: login.email, token }));
      login = { step: 'email', email: '', busy: false, msg: '' };
      moreView = 'main';
      cloud = null; renderMore();
      await loadCloud();
      toast(cloud && cloud.me ? `Velkommen, ${cloud.me.name.split(' ')[0]}!` : 'Du er logget inn');
    } catch (err) {
      login.busy = false;
      login.msg = 'Koden virket ikke. Sjekk at den er riktig, eller be om en ny.';
      renderLogin();
    }
  }

  // ---------- Brukerregister ----------
  function lvlChips(id) {
    const m = cloud.members.find(x => x.id === id);
    if (m && m.is_superadmin) return '<span class="lvl admin">Hovedadmin</span>';
    const acc = memberAccess(id);
    return acc.length ? acc.map(a => `<span class="lvl ${a.level}">${esc((unitById[a.unit_id] || {}).short || a.unit_id)}: ${LEVELS[a.level]}</span>`).join('') : '<span class="lvl">Ingen tilgang</span>';
  }
  function renderUsers() {
    const q = userSearch.trim().toLowerCase();
    const list = cloud.members.filter(m => !q || m.name.toLowerCase().includes(q) || m.email.includes(q));
    document.getElementById('more-content').innerHTML = `
      ${sheetHead('Brukere og tilgang', 'main')}
      <div class="users-tools">
        <input type="search" id="user-search" placeholder="Søk etter navn eller e-post" value="${esc(userSearch)}">
        <button type="button" class="btn-primary" data-action="user-new">+ Ny bruker</button>
      </div>
      <div class="group">
        ${list.length ? list.map(m => {
          const roles = memberRoleIds(m.id).map(id => roleById[id]).filter(Boolean).map(r => r.name).join(', ');
          return `<button type="button" class="row user-row${m.active ? '' : ' inactive'}" data-action="user-open" data-val="${m.id}">
            <span class="avatar">${esc(initials(m.name))}</span>
            <span class="row-text"><b>${esc(m.name)}${m.active ? '' : ' (deaktivert)'}</b><small>${esc(m.email)}</small>
              <span class="lvls">${lvlChips(m.id)}</span>${roles ? `<small>${esc(roles)}</small>` : ''}</span>${CHEV}</button>`;
        }).join('') : '<p class="empty-row">Ingen brukere funnet.</p>'}
      </div>
      <p class="hint pad-x">Admin kan legge til brukere og gi tilgang i enhetene de selv er admin for. Brukeren logger inn med e-postadressen sin.</p>`;
  }
  // ---------- Invitasjon ----------
  // Appen sender ingen e-post selv: vi lager en ferdig tekst som admin sender fra sin egen e-post.
  function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function inviteFor(id) {
    const m = cloud.members.find(x => x.id === id);
    if (!m) return null;
    const first = m.name.split(' ')[0];
    const acc = m.is_superadmin ? ['Hovedadmin (full tilgang)'] : memberAccess(id).map(a => `${unitName(a.unit_id)}: ${LEVELS[a.level]}`);
    const roles = memberRoleIds(id).map(r => roleById[r]).filter(Boolean).map(r => `${r.name} (${unitName(r.unit)})`);
    const lines = [
      `Hei ${first}!`,
      '',
      'Du er lagt til i Tune IL årshjul – klubbens oversikt over faste oppgaver og frister gjennom sesongen, og hvem som har ansvaret.',
      '',
      `Tilgang: ${acc.join(', ') || 'kommer'}`
    ];
    if (roles.length) lines.push(`Verv: ${roles.join(', ')}`);
    lines.push(
      '',
      'Slik logger du inn:',
      `1. Gå til ${appUrl()}`,
      `2. Trykk «Logg inn» og skriv inn e-postadressen din: ${m.email}`,
      '3. Du får en kode på e-post (sjekk søppelpost hvis den ikke kommer). Skriv inn koden – du trenger ikke passord.',
      '',
      'Tips: Legg siden til på hjemskjermen på mobilen, så har du årshjulet lett tilgjengelig.',
      '',
      'Hilsen',
      cloud.me ? cloud.me.name : 'Tune IL'
    );
    return { email: m.email, subject: 'Du er lagt til i Tune IL årshjul', body: lines.join('\n') };
  }
  function inviteBox(id, highlight) {
    const inv = inviteFor(id);
    if (!inv) return '';
    return `<div class="invite-box${highlight ? ' highlight' : ''}">
      <b>${highlight ? 'Gi beskjed til brukeren' : 'Invitasjon'}</b>
      <p>Brukeren får ingen e-post automatisk. Gi beskjed selv – her er en ferdig tekst du kan kopiere.</p>
      <div class="invite-actions">
        <button type="button" class="btn-secondary" data-action="invite-copy" data-val="${esc(id)}">Kopier tekst</button>
      </div>
      <details class="invite-preview"><summary>Se teksten</summary><pre>${esc(inv.body)}</pre></details>
    </div>`;
  }

  function openUser(id) {
    const m = id ? cloud.members.find(x => x.id === id) : null;
    const access = {};
    D.units.forEach(u => { access[u.id] = ''; });
    if (m) memberAccess(m.id).forEach(a => { access[a.unit_id] = a.level; });
    userDraft = {
      id: m ? m.id : null, name: m ? m.name : '', email: m ? m.email : '',
      is_superadmin: m ? m.is_superadmin : false, active: m ? m.active : true,
      access, roles: new Set(m ? memberRoleIds(m.id) : []), armed: false, busy: false, msg: ''
    };
    moreView = 'user'; renderMore();
  }
  function renderUserEdit() {
    const d = userDraft;
    const unitBlock = u => {
      const canAdmin = myAccess(u.id) === 'admin';
      const lvl = d.access[u.id] || '';
      const roles = cloud.roles.filter(r => r.unit_id === u.id && (r.active || d.roles.has(r.id)));
      return `<div class="unit-block${canAdmin ? '' : ' locked'}">
        <div class="unit-block-head"><b>${esc(u.name)}</b>${canAdmin ? '' : '<small>Bare admin i denne enheten kan endre</small>'}</div>
        <div class="seg-tabs" role="group" aria-label="Tilgang i ${esc(u.name)}">
          ${[['', 'Ingen'], ['reader', 'Leser'], ['editor', 'Redaktør'], ['admin', 'Admin']].map(([v, l]) =>
            `<button type="button" class="${lvl === v ? 'on' : ''}" data-action="user-lvl" data-unit="${u.id}" data-val="${v}"${canAdmin ? '' : ' disabled'} aria-pressed="${lvl === v}">${l}</button>`).join('')}
        </div>
        ${lvl ? `<p class="hint">${LEVELS[lvl]} ${LEVEL_HELP[lvl]}.</p>` : ''}
        ${roles.length ? `<div class="role-checks">${roles.map(r => `<label class="role-check${d.roles.has(r.id) ? ' on' : ''}">
            <input type="checkbox" data-role-check="${r.id}"${d.roles.has(r.id) ? ' checked' : ''}${canAdmin ? '' : ' disabled'}>
            <span>${esc(r.name)}${r.styre ? '' : ' <small>(utenfor styret)</small>'}</span></label>`).join('')}</div>` : ''}
      </div>`;
    };
    document.getElementById('more-content').innerHTML = `
      ${sheetHead(d.id ? 'Rediger bruker' : 'Ny bruker', 'users')}
      <div class="task-form">
        <label class="field"><span>Navn</span><input type="text" id="u-name" value="${esc(d.name)}" autocomplete="off" placeholder="Fornavn Etternavn"></label>
        <label class="field"><span>E-post (brukes til innlogging)</span><input type="email" id="u-email" value="${esc(d.email)}" autocomplete="off" inputmode="email" placeholder="navn@eksempel.no"></label>
        <fieldset class="form-block">
          <legend>Tilgang og verv</legend>
          <p class="hint">Velg tilgang per enhet, og huk av vervene personen har.</p>
          ${D.units.map(unitBlock).join('')}
        </fieldset>
        ${isSuper() ? `<label class="toggle"><input type="checkbox" id="u-super"${d.is_superadmin ? ' checked' : ''}><span class="toggle-track" aria-hidden="true"></span><span>Hovedadmin (full tilgang til alt)</span></label>` : ''}
        ${isSuper() && d.id ? `<label class="toggle"><input type="checkbox" id="u-active"${d.active ? ' checked' : ''}><span class="toggle-track" aria-hidden="true"></span><span>Aktiv (kan logge inn)</span></label>` : ''}
        ${d.msg ? `<p class="form-error" role="alert">${esc(d.msg)}</p>` : ''}
        ${d.id ? inviteBox(d.id, d.justCreated) : ''}
        <div class="form-actions">
          ${isSuper() && d.id && d.id !== cloud.me.id ? `<button type="button" class="btn-danger" data-action="user-delete">${d.armed ? 'Trykk igjen for å slette' : 'Slett bruker'}</button>` : '<span></span>'}
          <div class="form-actions-right">
            <button type="button" class="btn-secondary" data-action="more-view" data-val="users">Avbryt</button>
            <button type="button" class="btn-primary" data-action="user-save"${d.busy ? ' disabled' : ''}>${d.busy ? 'Lagrer …' : 'Lagre'}</button>
          </div>
        </div>
      </div>`;
  }
  function readUserForm() {
    const d = userDraft;
    const v = id => { const el = document.getElementById(id); return el ? el : null; };
    if (v('u-name')) d.name = v('u-name').value;
    if (v('u-email')) d.email = v('u-email').value;
    if (v('u-super')) d.is_superadmin = v('u-super').checked;
    if (v('u-active')) d.active = v('u-active').checked;
  }
  async function saveUser() {
    readUserForm();
    const d = userDraft;
    const name = d.name.trim(), email = d.email.trim().toLowerCase();
    const fail = msg => { d.msg = msg; d.busy = false; renderUserEdit(); };
    if (!name) return fail('Skriv inn navnet.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Skriv en gyldig e-postadresse.');
    if (!d.id && !Object.values(d.access).some(Boolean) && !d.is_superadmin) return fail('Gi tilgang til minst én enhet.');
    d.busy = true; d.msg = ''; renderUserEdit();
    try {
      let id = d.id;
      const fields = { name, email };
      if (isSuper()) { fields.is_superadmin = d.is_superadmin; if (d.id) fields.active = d.active; }
      if (id) {
        const old = cloud.members.find(m => m.id === id);
        if (old.name !== name || old.email !== email || (isSuper() && (old.is_superadmin !== d.is_superadmin || old.active !== d.active))) {
          await rest(`members?id=eq.${id}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
        }
      } else {
        const rows = await rest('members', { method: 'POST', body: fields, prefer: 'return=representation' });
        id = rows[0].id;
      }
      // Tilgang: bare enheter jeg er admin for
      const oldAcc = d.id ? memberAccess(d.id) : [];
      for (const u of D.units) {
        if (myAccess(u.id) !== 'admin') continue;
        const want = d.access[u.id] || '';
        const had = (oldAcc.find(a => a.unit_id === u.id) || {}).level || '';
        if (want === had) continue;
        if (!want) await rest(`member_access?member_id=eq.${id}&unit_id=eq.${u.id}`, { method: 'DELETE', prefer: 'return=minimal' });
        else await rest('member_access', { method: 'POST', body: { member_id: id, unit_id: u.id, level: want }, prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      // Verv: bare i enheter jeg er admin for
      const oldRoles = new Set(d.id ? memberRoleIds(d.id) : []);
      for (const r of cloud.roles) {
        if (myAccess(r.unit_id) !== 'admin') continue;
        const want = d.roles.has(r.id), had = oldRoles.has(r.id);
        if (want === had) continue;
        if (want) await rest('member_roles', { method: 'POST', body: { member_id: id, role_id: r.id }, prefer: 'resolution=ignore-duplicates,return=minimal' });
        else await rest(`member_roles?member_id=eq.${id}&role_id=eq.${encodeURIComponent(r.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      }
      await loadCloud();
      if (d.id) { toast('Brukeren er lagret'); moreView = 'users'; renderMore(); }
      else {
        // Ny bruker: vis invitasjonen med en gang
        toast(`${name} er lagt til – send en invitasjon`);
        openUser(id);
        userDraft.justCreated = true;
        renderUserEdit();
        const box = document.querySelector('.invite-box');
        if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (err) { fail(err.message); }
  }
  async function deleteUser() {
    const d = userDraft;
    if (!d.armed) { readUserForm(); d.armed = true; return renderUserEdit(); }
    try {
      await rest(`members?id=eq.${d.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      await loadCloud();
      toast('Brukeren er slettet');
      moreView = 'users'; renderMore();
    } catch (err) { d.msg = err.message; d.armed = false; renderUserEdit(); }
  }

  // ---------- Verv ----------
  function renderRoles() {
    const units = (cloud.units.length ? cloud.units : D.units);
    document.getElementById('more-content').innerHTML = `
      ${sheetHead('Verv', 'main')}
      <p class="hint pad-x">Oppgaver knyttes til verv. Når noen går av, gir du vervet til den nye personen under «Brukere og tilgang». Verv som ikke brukes lenger, skjules i stedet for å slettes.</p>
      ${units.map(u => {
        const canAdmin = myAccess(u.id) === 'admin';
        const roles = cloud.roles.filter(r => r.unit_id === u.id);
        const roleRow = r => `<div class="role-row${r.active ? '' : ' inactive'}">
          <input type="text" value="${esc(r.name)}" data-role-name="${esc(r.id)}"${canAdmin ? '' : ' disabled'} aria-label="Navn på verv">
          <label class="mini-toggle" title="I styret"><input type="checkbox" data-role-styre="${esc(r.id)}"${r.styre ? ' checked' : ''}${canAdmin ? '' : ' disabled'}><span>Styret</span></label>
          <label class="mini-toggle" title="Vises i appen"><input type="checkbox" data-role-active="${esc(r.id)}"${r.active ? ' checked' : ''}${canAdmin ? '' : ' disabled'}><span>Aktiv</span></label>
          <small class="role-holders">${esc(roleHolders(r.id).join(', ') || '–')}</small>
        </div>`;
        return `<section class="sheet-section">
          <h3>${esc(u.name)}${canAdmin ? '' : ' · bare visning'}</h3>
          <div class="group pad roles-group">
            ${roles.map(roleRow).join('') || '<p class="hint">Ingen verv ennå.</p>'}
            ${canAdmin ? `<div class="role-add">
              <input type="text" id="new-role-${u.id}" placeholder="Nytt verv, f.eks. Dommerkontakt">
              <label class="mini-toggle"><input type="checkbox" id="new-role-styre-${u.id}" checked><span>Styret</span></label>
              <button type="button" class="btn-add" data-action="role-add" data-unit="${u.id}">Legg til</button>
            </div>` : ''}
          </div>
        </section>`;
      }).join('')}`;
  }
  async function patchRole(id, body) {
    try {
      await rest(`roles?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      await loadCloud();
      toast('Vervet er oppdatert');
    } catch (err) { toast(err.message); renderMore(); }
  }
  async function addRole(unit) {
    const input = document.getElementById('new-role-' + unit);
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const styre = document.getElementById('new-role-styre-' + unit).checked;
    const sort = Math.max(0, ...cloud.roles.map(r => r.sort || 0)) + 1;
    try {
      await rest('roles', { method: 'POST', body: { unit_id: unit, name, styre, sort }, prefer: 'return=minimal' });
      await loadCloud();
      toast(`«${name}» er lagt til`);
    } catch (err) { toast(err.message); }
  }

  // Felter i Mer-panelet
  document.getElementById('more').addEventListener('input', e => {
    if (e.target.id === 'user-search') {
      userSearch = e.target.value;
      const pos = e.target.selectionStart;
      renderUsers();
      const el = document.getElementById('user-search'); el.focus(); el.setSelectionRange(pos, pos);
    }
  });
  document.getElementById('more').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.roleCheck && userDraft) {
      readUserForm();
      if (t.checked) userDraft.roles.add(t.dataset.roleCheck); else userDraft.roles.delete(t.dataset.roleCheck);
      renderUserEdit();
    }
    if (t.dataset.roleName) { const v = t.value.trim(); if (v) patchRole(t.dataset.roleName, { name: v }); }
    if (t.dataset.roleStyre) patchRole(t.dataset.roleStyre, { styre: t.checked });
    if (t.dataset.roleActive) patchRole(t.dataset.roleActive, { active: t.checked });
  });
  document.getElementById('more').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'login-email') { e.preventDefault(); sendCode(); }
    if (e.target.id === 'login-code') { e.preventDefault(); verifyCode(); }
    if (e.target.id && e.target.id.startsWith('new-role-') && !e.target.id.startsWith('new-role-styre')) { e.preventDefault(); addRole(e.target.id.slice(9)); }
  });

  function handleCloudAction(a, el) {
    const val = el.dataset.val;
    if (a === 'login') { login = { step: 'email', email: '', busy: false, msg: '' }; moreView = 'login'; renderMore(); return true; }
    if (a === 'send-code') { sendCode(); return true; }
    if (a === 'verify-code') { verifyCode(); return true; }
    if (a === 'login-change') { login = { step: 'email', email: login.email, busy: false, msg: '' }; renderLogin(); return true; }
    if (a === 'logout') {
      const token = session && session.access_token;
      logoutLocal();
      if (token) authCall('logout', {}, token).catch(() => {});
      moreView = 'main'; renderMore(); toast('Du er logget ut'); return true;
    }
    if (a === 'cloud-reload') { cloudError = ''; cloud = null; renderMore(); loadCloud(); return true; }
    if (a === 'show-mine') { state.role = 'mine'; saveState(); closeDialog('more'); render(); return true; }
    if (a === 'more-view') { moreView = val; armed = null; renderMore(); return true; }
    if (a === 'users') { moreView = 'users'; renderMore(); return true; }
    if (a === 'roles') { moreView = 'roles'; renderMore(); return true; }
    if (a === 'user-open') { openUser(val); return true; }
    if (a === 'user-new') { openUser(null); return true; }
    if (a === 'user-lvl') { readUserForm(); userDraft.access[el.dataset.unit] = val; userDraft.armed = false; renderUserEdit(); return true; }
    if (a === 'user-save') { saveUser(); return true; }
    if (a === 'user-delete') { deleteUser(); return true; }
    if (a === 'role-add') { addRole(el.dataset.unit); return true; }
    if (a === 'invite-copy') {
      const inv = inviteFor(val);
      if (!inv) return true;
      const text = `${inv.subject}\n\n${inv.body}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => toast('Teksten er kopiert – lim den inn i SMS, Spond eller e-post'), () => toast('Kunne ikke kopiere – åpne «Se teksten» og kopier selv'));
      return true;
    }
    return false;
  }

  // ---------- «Mer»-panelet ----------
  let armed = null;   // to-trinns bekreftelse: 'reset-done' | 'reset-tasks'

  function renderMore() {
    if (moreView === 'login') return renderLogin();
    if (moreView === 'users') return renderUsers();
    if (moreView === 'user') return renderUserEdit();
    if (moreView === 'roles') return renderRoles();
    const p = themePref();
    const nDone = Object.keys(done).length;
    const themeBtn = (val, icon, label) => `<button type="button" data-action="theme" data-theme-val="${val}" class="${p === val ? 'on' : ''}" aria-pressed="${p === val}">${ico(icon)}${label}</button>`;
    const guide = (q, body) => `<details><summary>${q}</summary><div class="guide-body">${body}</div></details>`;

    document.getElementById('more-content').innerHTML = `
      <div class="sheet-head">
        <h2>Mer</h2>
        <button type="button" class="icon-btn" data-action="close-more" aria-label="Lukk">${ico('close')}</button>
      </div>

      <section class="sheet-section">
        <h3>Utseende</h3>
        <div class="group">
          <div class="segmented" role="group" aria-label="Tema">
            ${themeBtn('lys', 'sun', 'Lys')}${themeBtn('mork', 'moon', 'Mørk')}${themeBtn('auto', 'auto', 'Automatisk')}
          </div>
        </div>
      </section>

      <section class="sheet-section">
        <h3>Min profil</h3>
        ${profileHtml()}
      </section>

      <section class="sheet-section">
        <h3>Varsler</h3>
        <div class="group">
          ${row('mail', 'Ukentlig e-post', 'Dine frister de neste 30 dagene – du velger selv om du vil ha den', { soon: 'Steg 4' })}
          ${row('bell', 'Påminnelse og purring', 'Før fristen, og når en frist har passert uten avkrysning', { soon: 'Steg 4' })}
          ${row('link', 'Abonner i kalenderen', 'Fristene oppdateres automatisk i Outlook, Google og iPhone', { soon: 'Steg 4' })}
        </div>
      </section>

      <section class="sheet-section">
        <h3>Oppgaver og data</h3>
        <div class="group">
          ${canAddTasks() ? row('plus', 'Ny oppgave', 'Legg til en oppgave i årshjulet', { action: 'new' }) : ''}
          ${mode() === 'cloud' ? row('link', 'Kopier offentlig lenke', 'Viser bare oppgaver merket «Vis på offentlig lenke» – uten innlogging', { action: 'share-public' }) : ''}
          ${canTick() ? row('cal', 'Last ned kalenderfil', 'Fristene som passer filteret nå, som .ics-fil', { action: 'ics' }) : ''}
          ${canTick() ? row('print', 'Skriv ut / lagre som PDF', 'Hele sesongen som liste', { action: 'print' }) : ''}
          ${canTick() ? row('save', 'Last ned sikkerhetskopi', 'Alle oppgaver og avkrysninger som fil', { action: 'backup' }) : ''}
          ${mode() === 'local' ? row('reset', armed === 'reset-done' ? 'Trykk igjen for å nullstille' : 'Nullstill avkrysninger', nDone ? `${nDone} avkrysset på denne enheten` : 'Ingen avkrysninger ennå', { action: 'reset-done', danger: true }) : ''}
          ${mode() === 'local' && customized ? row('trash', armed === 'reset-tasks' ? 'Trykk igjen – endringene dine slettes' : 'Tilbakestill til eksempeloppgavene', 'Fjerner oppgavene du har lagt til eller endret', { action: 'reset-tasks', danger: true }) : ''}
          ${!canTick() ? row('cal', 'Kalender, utskrift og sikkerhetskopi', 'Når du er logget inn', { soon: 'Logg inn' }) : ''}
        </div>
      </section>

      <section class="sheet-section">
        <h3>Administrasjon</h3>
        <div class="group">
          ${isAnyAdmin()
            ? row('users', 'Brukere og tilgang', 'Legg til brukere, gi admin-, redaktør- eller lesetilgang, og fordel verv', { action: 'users' }) +
              row('tag', 'Verv', 'Opprett, endre navn eller skjul verv', { action: 'roles' })
            : row('users', 'Brukere og tilgang', 'For administratorer – logg inn først', { soon: 'Admin' }) +
              row('tag', 'Verv', 'For administratorer – logg inn først', { soon: 'Admin' })}
          ${row('copy', 'Ny sesong', 'Velg hvilke faste oppgaver som skal være med – avkrysninger nullstilles', { soon: 'Steg 5' })}
        </div>
      </section>

      <section class="sheet-section">
        <h3>Brukerveiledning</h3>
        <div class="group guide">
          ${guide('Slik leser du hjulet', `<ul>
            <li>Hjulet starter i august, som håndballsesongen.</li>
            <li>Hver prikk er en oppgave. Fargen viser typen: frist, møte, arrangement, dugnad eller rutine.</li>
            <li>Den røde streken viser hvor vi er i året i dag.</li>
            <li>Ringen i midten fylles etter hvert som månedens oppgaver krysses av.</li></ul>`)}
          ${guide('Bla mellom måneder', `<ul>
            <li>Trykk på en måned i hjulet.</li>
            <li>Dra fingeren (eller musa) rundt hjulet.</li>
            <li>Rull med musehjulet, eller bruk pilene ved månedsnavnet.</li></ul>`)}
          ${guide('Filtrer på klubb, gruppe og verv', `<p>Knappene <b>Tune IL</b>, <b>Håndball</b> og <b>Fotball</b> slås av og på – du kan se én, to eller alle. Velg et verv for å se bare de oppgavene vervet har ansvar for.</p>`)}
          ${guide('Oppgavene', `<ul>
            <li>Trykk på en oppgave for å se beskrivelse, underoppgaver, lenker og kilde.</li>
            <li>Trykk på sirkelen til høyre for å krysse av.</li>
            <li>Datoboksen: <b>30 NOV</b> = fast frist, <b>? NOV</b> = dato kommer, <b>– NOV</b> = i løpet av måneden.</li>
            <li><b>↻</b> betyr at oppgaven gjentas, for eksempel hver måned. Hver gang krysses av for seg.</li>
            <li>«Forberedes av» viser oppgaver som må gjøres først, for eksempel at trenerne melder antall lag før lagene meldes på.</li></ul>`)}
          ${guide('Legge til og endre oppgaver', `<ul>
            <li>Trykk på <b>+</b> nede til høyre, eller «Legg til i …» under en måned.</li>
            <li>Åpne en oppgave og trykk <b>Rediger</b> eller <b>Kopier</b>.</li>
            <li>Fristen kan være en fast dato, bare en måned, «dato kommer», en periode (åpner–frist) eller et antall dager/uker før en annen oppgave.</li>
            <li>Bare redaktører og admins kan legge til og endre oppgaver, og bare i sine egne enheter.</li>
            <li>Huk av «Vis på offentlig lenke» for oppgaver som foreldre og trenere bør se uten å logge inn.</li></ul>`)}
          ${guide('Neste frister', `<p>Øverst ser du de neste fristene og frister som har passert uten å bli krysset av. Trykk på et kort for å gå til oppgaven.</p>`)}
        </div>
      </section>

      <section class="sheet-section">
        <h3>Om</h3>
        <div class="group about">
          <div><b>Tune IL årshjul</b> · testversjon ${VERSION}</div>
          <div>Frister fra NHF Region Øst og NIF må sjekkes hver sesong.</div>
          <div>Oppgaver og avkrysninger lagres i klubbens database og deles med alle som har tilgang.</div>
        </div>
      </section>`;
  }
  function openDialog(id) {
    const dlg = document.getElementById(id);
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function closeDialog(id) {
    const dlg = document.getElementById(id);
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  }
  function openMore(view) { armed = null; moreView = view || 'main'; renderMore(); openDialog('more'); }
  ['more', 'task-form'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) closeDialog(id); });
  });

  // ---------- Oppgaveskjema ----------
  let draft = null;
  let formError = '';
  let deleteArmed = false;

  function newId() { return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function draftFromTask(t) {
    const kind = t.rel ? 'rel' : t.opens ? 'period' : t.due ? 'date' : t.dateTbd ? 'tbd' : 'month';
    const due = resolveDue(t);
    return {
      id: t.id, title: t.title, description: t.description || '', type: t.type,
      units: t.units.slice(), role: t.role, kind,
      due: t.due || '', opens: t.opens || '',
      month: due ? due.getMonth() + 1 : (t.month || seasonMonths[state.month].m),
      relTask: t.rel ? t.rel.task : '', relAmount: t.rel ? t.rel.amount : 2, relUnit: t.rel ? t.rel.unit : 'weeks',
      repeat: t.repeat || 'yearly',
      sub: (t.sub || []).map(s => { const b = subBefore(s); return { title: s.title, amount: b ? b.amount : '', unit: b ? b.unit : 'days' }; }),
      links: (t.links || []).map(l => ({ label: l.label || '', url: l.url || '' })),
      prepares: t.prepares || '', source: t.source || '', public: !!t.public
    };
  }
  function blankDraft(monthIdx) {
    const editable = D.units.map(u => u.id).filter(canEditUnit);
    const pref = state.units.filter(u => editable.includes(u));
    const units = pref.includes('handball') ? ['handball'] : pref.length ? [pref[0]] : editable.slice(0, 1);
    return {
      id: null, title: '', description: '', type: 'frist', units,
      role: state.role !== 'alle' && state.role !== 'mine' ? state.role : '', kind: 'month',
      due: '', opens: '', month: seasonMonths[monthIdx].m,
      relTask: '', relAmount: 2, relUnit: 'weeks', repeat: 'yearly',
      sub: [], links: [], prepares: '', source: '', public: false
    };
  }

  function openForm(d) {
    draft = d; formError = ''; deleteArmed = false;
    renderForm();
    openDialog('task-form');
    setTimeout(() => { const el = document.querySelector('#task-form [data-field="title"]'); if (el && !draft.id) el.focus(); }, 50);
  }

  function relCandidates() {
    return tasks
      .filter(t => t.id !== draft.id)
      .map(t => ({ t, d: resolveDue(t) }))
      .filter(x => x.d && !(x.t.rel && x.t.rel.task === draft.id))
      .sort((a, b) => a.d - b.d);
  }

  function renderForm() {
    const d = draft;
    const isEdit = !!d.id;
    const min = isoDate(seasonStart), max = isoDate(seasonEnd);
    const kinds = [['date', 'Dato'], ['month', 'Måned'], ['tbd', 'Dato kommer'], ['period', 'Periode'], ['rel', 'Før oppgave']];
    const monthOpts = seasonMonths.map(sm => `<option value="${sm.m}"${sm.m === Number(d.month) ? ' selected' : ''}>${MONTHS[sm.m - 1]} ${sm.y}</option>`).join('');
    const unitSel = (name, val) => `<select data-field="${name}">${Object.keys(UNIT_WORD).map(u => `<option value="${u}"${u === val ? ' selected' : ''}>${UNIT_WORD[u][1]}</option>`).join('')}</select>`;
    const relOpts = '<option value="">Velg oppgave …</option>' + relCandidates().map(x => `<option value="${esc(x.t.id)}"${x.t.id === d.relTask ? ' selected' : ''}>${fmtShort(x.d)} – ${esc(x.t.title)}</option>`).join('');
    const prepOpts = '<option value="">Ingen</option>' + tasks.filter(t => t.id !== d.id).slice().sort((a, b) => a.title.localeCompare(b.title, 'no'))
      .map(t => `<option value="${esc(t.id)}"${t.id === d.prepares ? ' selected' : ''}>${esc(t.title)}</option>`).join('');
    const repeatLocked = d.kind === 'rel' || d.kind === 'period';

    let when = '';
    if (d.kind === 'date') when = `<label class="field"><span>Frist</span><input type="date" data-field="due" value="${esc(d.due)}" min="${min}" max="${max}"></label>`;
    if (d.kind === 'month' || d.kind === 'tbd') when = `<label class="field"><span>Måned</span><select data-field="month">${monthOpts}</select></label>
      <p class="hint">${d.kind === 'tbd' ? 'Vises med «?» til datoen er kjent. Rediger oppgaven og velg «Dato» når den kommer.' : 'Oppgaven gjøres en gang i løpet av måneden.'}</p>`;
    if (d.kind === 'period') when = `<div class="field-row">
        <label class="field"><span>Åpner</span><input type="date" data-field="opens" value="${esc(d.opens)}" min="${min}" max="${max}"></label>
        <label class="field"><span>Frist</span><input type="date" data-field="due" value="${esc(d.due)}" min="${min}" max="${max}"></label></div>
      <p class="hint">For eksempel dommerpåmelding: åpner 1. april, frist 1. mai.</p>`;
    if (d.kind === 'rel') when = `<div class="field-row rel-row">
        <label class="field narrow"><span>Antall</span><input type="number" min="0" max="365" inputmode="numeric" data-field="relAmount" value="${esc(d.relAmount)}"></label>
        <label class="field narrow"><span>&nbsp;</span>${unitSel('relUnit', d.relUnit)}</label>
        <span class="rel-word">før</span></div>
      <label class="field"><span>Oppgave</span><select data-field="relTask">${relOpts}</select></label>
      <p class="hint">Fristen flytter seg automatisk hvis den andre oppgaven får ny dato. Oppgaven vises også som «Forberedes av» på den andre.</p>`;

    document.getElementById('task-form-content').innerHTML = `
      <div class="sheet-head">
        <h2>${isEdit ? 'Rediger oppgave' : 'Ny oppgave'}</h2>
        <button type="button" class="icon-btn" data-action="close-form" aria-label="Lukk">${ico('close')}</button>
      </div>
      <form class="task-form" novalidate>
        <label class="field"><span>Tittel</span><input type="text" data-field="title" value="${esc(d.title)}" placeholder="F.eks. Påmelding av lag til seriespill" maxlength="120" autocomplete="off"></label>

        <div class="field"><span>Type</span>
          <div class="opt-chips">${Object.entries(D.types).map(([k, tp]) => `<button type="button" class="opt-chip${d.type === k ? ' on' : ''}" data-action="f-type" data-val="${k}" style="--type:${tp.color}" aria-pressed="${d.type === k}"><i></i>${tp.name}</button>`).join('')}</div>
        </div>

        <div class="field"><span>Gjelder</span>
          <div class="opt-chips">${D.units.map(u => `<button type="button" class="opt-chip unit${d.units.includes(u.id) ? ' on' : ''}" data-action="f-unit" data-val="${u.id}" aria-pressed="${d.units.includes(u.id)}"${canEditUnit(u.id) ? '' : ' disabled title="Du er ikke redaktør eller admin her"'}>${d.units.includes(u.id) ? '✓ ' : ''}${esc(u.name)}</button>`).join('')}</div>
        </div>

        <label class="field"><span>Ansvarlig verv</span>
          <select data-field="role"><option value="">Velg verv …</option>${roleOptions()}</select></label>

        <fieldset class="form-block">
          <legend>Når</legend>
          <div class="seg-tabs" role="group" aria-label="Type frist">${kinds.map(([k, l]) => `<button type="button" class="${d.kind === k ? 'on' : ''}" data-action="f-kind" data-val="${k}" aria-pressed="${d.kind === k}">${l}</button>`).join('')}</div>
          ${when}
          <label class="field"><span>Gjentas</span>
            <select data-field="repeat"${repeatLocked ? ' disabled' : ''}>${Object.entries(REPEAT).map(([k, r]) => `<option value="${k}"${k === (repeatLocked ? 'yearly' : d.repeat) ? ' selected' : ''}>${r.label}</option>`).join('')}</select></label>
          <p class="hint">${repeatLocked ? 'Perioder og frister før en annen oppgave gjentas hvert år.' : '«Hvert år» og «hver måned» o.l. tas med til neste sesong. «Bare denne sesongen» gjør ikke det.'}</p>
        </fieldset>

        <label class="field"><span>Beskrivelse</span><textarea data-field="description" rows="3" placeholder="Hva skal gjøres, og hvordan?">${esc(d.description)}</textarea></label>

        <fieldset class="form-block">
          <legend>Underoppgaver</legend>
          ${d.sub.map((s, i) => `<div class="sub-row">
            <input type="text" data-sub="${i}" data-key="title" value="${esc(s.title)}" placeholder="Underoppgave">
            <div class="sub-when-row">
              <input type="number" min="0" max="365" inputmode="numeric" data-sub="${i}" data-key="amount" value="${esc(s.amount)}" placeholder="–" aria-label="Antall før">
              <select data-sub="${i}" data-key="unit">${Object.keys(UNIT_WORD).map(u => `<option value="${u}"${u === s.unit ? ' selected' : ''}>${UNIT_WORD[u][1]} før</option>`).join('')}</select>
              <button type="button" class="icon-btn small" data-action="f-sub-del" data-val="${i}" aria-label="Fjern underoppgave">${ico('close')}</button>
            </div></div>`).join('')}
          <button type="button" class="btn-add" data-action="f-sub-add">+ Underoppgave</button>
          ${d.sub.length ? '<p class="hint">Antall før er valgfritt – f.eks. «4 uker før» hovedoppgavens frist.</p>' : ''}
        </fieldset>

        <fieldset class="form-block">
          <legend>Lenker</legend>
          ${d.links.map((l, i) => `<div class="link-row">
            <input type="text" data-link="${i}" data-key="label" value="${esc(l.label)}" placeholder="Navn, f.eks. TurneringsAdmin">
            <input type="url" data-link="${i}" data-key="url" value="${esc(l.url)}" placeholder="https://…" inputmode="url">
            <button type="button" class="icon-btn small" data-action="f-link-del" data-val="${i}" aria-label="Fjern lenke">${ico('close')}</button></div>`).join('')}
          <button type="button" class="btn-add" data-action="f-link-add">+ Lenke</button>
          <p class="hint">Lenke til skjema, regelverk eller dokument i Bård.</p>
        </fieldset>

        ${d.kind !== 'rel' ? `<label class="field"><span>Forbereder oppgave (valgfritt)</span><select data-field="prepares">${prepOpts}</select></label>` : ''}

        <label class="toggle form-toggle">
          <input type="checkbox" data-check="public"${d.public ? ' checked' : ''}>
          <span class="toggle-track" aria-hidden="true"></span>
          <span><b>Vis på offentlig lenke</b><br><small>For ting foreldre og trenere bør vite om, f.eks. påmeldingsfrister, dugnad og håndballskole. Uten navn på ansvarlige.</small></span>
        </label>

        ${formError ? `<p class="form-error" role="alert">${esc(formError)}</p>` : ''}

        <div class="form-actions">
          ${isEdit ? `<button type="button" class="btn-danger" data-action="f-delete">${deleteArmed ? 'Trykk igjen for å slette' : 'Slett'}</button>` : '<span></span>'}
          <div class="form-actions-right">
            <button type="button" class="btn-secondary" data-action="close-form">Avbryt</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Lagre' : 'Legg til'}</button>
          </div>
        </div>
      </form>`;
    const roleSel = document.querySelector('#task-form [data-field="role"]');
    if (roleSel) roleSel.value = d.role || '';
  }

  // Les verdier fra feltene inn i utkastet (uten å tegne skjemaet på nytt)
  document.getElementById('task-form').addEventListener('input', e => {
    if (!draft) return;
    const el = e.target;
    if (el.dataset.field) draft[el.dataset.field] = el.value;
    if (el.dataset.check) draft[el.dataset.check] = el.checked;
    if (el.dataset.sub !== undefined) draft.sub[Number(el.dataset.sub)][el.dataset.key] = el.value;
    if (el.dataset.link !== undefined) draft.links[Number(el.dataset.link)][el.dataset.key] = el.value;
  });
  document.getElementById('task-form').addEventListener('submit', e => { e.preventDefault(); saveDraft(); });

  function fail(msg) { formError = msg; renderForm(); const el = document.querySelector('.form-error'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  function saveDraft() {
    const d = draft;
    const title = d.title.trim();
    if (!title) return fail('Oppgaven må ha en tittel.');
    if (!d.units.length) return fail('Velg minst én enhet oppgaven gjelder.');
    if (!d.role) return fail('Velg hvilket verv som har ansvaret.');
    const inSeason = s => { if (!s) return false; const x = parseDate(s); return x >= seasonStart && x <= seasonEnd; };
    const range = `${fmtDay(seasonStart)} ${seasonStart.getFullYear()} – ${fmtDay(seasonEnd)} ${seasonEnd.getFullYear()}`;

    const t = { id: d.id || newId(), title, type: d.type, units: D.units.map(u => u.id).filter(u => d.units.includes(u)), role: d.role };
    if (d.description.trim()) t.description = d.description.trim();
    if (d.kind === 'date') {
      if (!inSeason(d.due)) return fail(`Velg en dato i sesongen (${range}).`);
      t.due = d.due;
    } else if (d.kind === 'month' || d.kind === 'tbd') {
      t.month = Number(d.month);
      if (d.kind === 'tbd') t.dateTbd = true;
    } else if (d.kind === 'period') {
      if (!inSeason(d.opens) || !inSeason(d.due)) return fail(`Velg både åpner- og fristdato i sesongen (${range}).`);
      if (d.opens > d.due) return fail('Åpner-datoen må være før fristen.');
      t.opens = d.opens; t.due = d.due;
    } else if (d.kind === 'rel') {
      const amount = Number(d.relAmount);
      if (!d.relTask || !taskById[d.relTask]) return fail('Velg hvilken oppgave fristen skal regnes fra.');
      if (!(amount >= 0)) return fail('Skriv inn hvor lang tid før.');
      t.rel = { task: d.relTask, amount, unit: d.relUnit };
      t.prepares = d.relTask;
      const base = resolveDue(taskById[d.relTask]);
      const due = base ? shiftBack(base, amount, d.relUnit) : null;
      if (!due || due < seasonStart) return fail('Fristen havner før sesongstart. Velg kortere tid.');
      t.month = due.getMonth() + 1;
    }
    if (d.kind !== 'rel' && d.kind !== 'period' && d.repeat !== 'yearly') t.repeat = d.repeat;
    if (d.kind !== 'rel' && d.prepares) t.prepares = d.prepares;
    const subs = d.sub.filter(s => s.title.trim()).map(s => {
      const o = { title: s.title.trim() };
      if (s.amount !== '' && Number(s.amount) > 0) o.before = { amount: Number(s.amount), unit: s.unit };
      return o;
    });
    if (subs.length) t.sub = subs;
    const links = d.links.filter(l => l.url.trim()).map(l => {
      let url = l.url.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      return { label: l.label.trim() || url.replace(/^https?:\/\//i, '').split('/')[0], url };
    });
    if (links.length) t.links = links;
    if (d.source) t.source = d.source;
    if (d.public) t.public = true;
    if (!t.units.some(canEditUnit)) return fail('Du kan bare lage oppgaver i enheter der du er redaktør eller admin.');

    const i = tasks.findIndex(x => x.id === t.id);
    if (i >= 0) {
      // Avkrysninger for gjentakende oppgaver hører til månedene – fjern dem hvis gjentakelsen endres
      const old = tasks[i];
      if ((old.repeat || 'yearly') !== (t.repeat || 'yearly')) clearDone(t.id);
      tasks[i] = t;
    } else tasks.push(t);
    saveTasks([t]);

    closeDialog('task-form');
    // Vis oppgaven der den havnet
    const first = occ.filter(o => o.t.id === t.id).sort((a, b) => (a.idx >= state.month ? a.idx : a.idx + 12) - (b.idx >= state.month ? b.idx : b.idx + 12))[0];
    if (!t.units.some(u => state.units.includes(u))) state.units = D.units.map(u => u.id).filter(u => t.units.includes(u) || state.units.includes(u));
    if (state.role !== 'alle' && state.role !== t.role) state.role = 'alle';
    if (first) { state.month = first.idx; state.open = first.key; }
    saveState(); render();
    const card = first && document.getElementById('task-' + first.key);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(i >= 0 ? 'Oppgaven er lagret' : 'Oppgaven er lagt til');
  }

  function clearDone(taskId) {
    Object.keys(done).forEach(k => { if (k === taskId || k.startsWith(taskId + '@')) { delete done[k]; delete doneBy[k]; } });
    if (mode() === 'local') writeJSON(DONE_KEY, done);
    else if (mode() === 'cloud') rest(`task_status?season=eq.${SEASON_Q}&task_id=eq.${encodeURIComponent(taskId)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
  }

  function deleteTask(id) {
    // Oppgaver som var regnet fra denne får fast dato i stedet
    const changed = [];
    tasks.forEach(t => {
      if (t.id === id) return;
      let touched = false;
      if (t.rel && t.rel.task === id) {
        const due = resolveDue(t);
        delete t.rel;
        if (due) { t.due = isoDate(due); delete t.month; }
        touched = true;
      }
      if (t.prepares === id) { delete t.prepares; touched = true; }
      if (touched) changed.push(t);
    });
    tasks = tasks.filter(t => t.id !== id);
    Object.keys(done).forEach(k => { if (k === id || k.startsWith(id + '@')) { delete done[k]; delete doneBy[k]; } });
    if (mode() === 'local') writeJSON(DONE_KEY, done);
    saveTasks(changed.filter(canEditTask), [id]);
    state.open = null;
    closeDialog('task-form');
    render();
    toast('Oppgaven er slettet');
  }

  // ---------- Hendelser ----------
  function setMonth(i) {
    state.month = (i + 12) % 12;
    state.open = null;
    render();
  }
  function findOcc(ref) {
    const exact = occ.find(o => o.key === ref);
    if (exact) return exact;
    const list = occ.filter(o => o.t.id === ref);
    return list.find(o => o.idx === state.month) || list.sort((a, b) => a.idx - b.idx)[0];
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#wheel .seg')) return setMonth(Number(e.target.closest('.seg').dataset.month));

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const val = el.dataset.val;

    // Skjemaet
    if (a.startsWith('f-') && draft) {
      if (a === 'f-type') draft.type = val;
      else if (a === 'f-unit') draft.units = draft.units.includes(val) ? draft.units.filter(u => u !== val) : draft.units.concat(val);
      else if (a === 'f-kind') {
        draft.kind = val;
        if ((val === 'date' || val === 'period') && !draft.due) {
          const sm = seasonMonths.find(s => s.m === Number(draft.month)) || seasonMonths[state.month];
          draft.due = isoDate(new Date(sm.y, sm.m - 1, 1));
        }
      }
      else if (a === 'f-sub-add') draft.sub.push({ title: '', amount: '', unit: 'weeks' });
      else if (a === 'f-sub-del') draft.sub.splice(Number(val), 1);
      else if (a === 'f-link-add') draft.links.push({ label: '', url: '' });
      else if (a === 'f-link-del') draft.links.splice(Number(val), 1);
      else if (a === 'f-delete') {
        if (!deleteArmed) { deleteArmed = true; renderForm(); return; }
        return deleteTask(draft.id);
      }
      formError = '';
      renderForm();
      if (a === 'f-sub-add' || a === 'f-link-add') {
        const inputs = document.querySelectorAll(a === 'f-sub-add' ? '[data-sub][data-key="title"]' : '[data-link][data-key="label"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }
      return;
    }

    if (a === 'unit') {
      const id = el.dataset.unit;
      if (state.units.includes(id)) {
        if (state.units.length === 1) return; // minst én enhet må være på
        state.units = state.units.filter(u => u !== id);
      } else {
        state.units = D.units.map(u => u.id).filter(u => u === id || state.units.includes(u));
      }
      saveState(); render();
    } else if (a === 'view') {
      state.view = el.dataset.view; state.open = null; saveState(); render();
    } else if (a === 'prev') setMonth(state.month - 1);
    else if (a === 'next') setMonth(state.month + 1);
    else if (a === 'open') {
      state.open = state.open === el.dataset.task ? null : el.dataset.task; render();
    } else if (a === 'done') {
      const key = el.dataset.task;
      if (canTick()) setDone(key, !done[key]);
    } else if (a === 'import') {
      el.disabled = true; el.textContent = 'Legger inn …';
      importTasks(el.dataset.val);
    } else if (a === 'login-open') {
      openMore('login');
      login = { step: 'email', email: '', busy: false, msg: '' };
      renderMore();
    } else if (a === 'share-public') {
      const url = location.origin + location.pathname + '?offentlig';
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => toast('Lenken er kopiert'), () => toast(url));
    } else if (a === 'goto') {
      const o = findOcc(el.dataset.task);
      if (!o) return;
      const t = o.t;
      if (!t.units.some(u => state.units.includes(u))) state.units = D.units.map(u => u.id).filter(u => t.units.includes(u) || state.units.includes(u));
      if (state.role !== 'alle' && state.role !== t.role) state.role = 'alle';
      state.hideDone = false;
      if (state.view === 'hjul') state.month = o.idx;
      state.open = o.key;
      saveState(); render();
      const card = document.getElementById('task-' + o.key);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (a === 'new') {
      if (!canAddTasks()) return;
      closeDialog('more');
      openForm(blankDraft(el.dataset.month !== undefined ? Number(el.dataset.month) : state.month));
    } else if (a === 'edit') {
      const t = taskById[el.dataset.task];
      if (t) openForm(draftFromTask(t));
    } else if (a === 'copy') {
      const t = taskById[el.dataset.task];
      if (!t) return;
      const d = draftFromTask(t);
      d.id = null; d.title = t.title + ' (kopi)';
      openForm(d);
    } else if (a === 'close-form') closeDialog('task-form');
    else if (handleCloudAction(a, el)) return;
    else if (a === 'more') openMore();
    else if (a === 'close-more') closeDialog('more');
    else if (a === 'theme') {
      try { localStorage.setItem(THEME_KEY, el.dataset.themeVal); } catch (err) { /* ignorer */ }
      applyTheme(); renderMore();
    } else if (a === 'ics') downloadIcs();
    else if (a === 'backup') downloadBackup();
    else if (a === 'reset-done' || a === 'reset-tasks') {
      if (armed !== a) { armed = a; renderMore(); return; }
      armed = null;
      if (a === 'reset-done') { done = {}; writeJSON(DONE_KEY, done); toast('Avkrysningene er nullstilt'); }
      else {
        try { localStorage.removeItem(TASKS_KEY); } catch (err) { /* ignorer */ }
        tasks = clone(D.tasks); customized = false; rebuild();
        toast('Eksempeloppgavene er tilbake');
      }
      state.open = null; render(); renderMore();
    } else if (a === 'print') {
      closeDialog('more');
      const prev = state.view;
      state.view = 'liste'; state.open = null; render();
      setTimeout(() => { window.print(); state.view = prev; render(); }, 50);
    }
  });

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    const seg = e.target.closest && e.target.closest('.seg');
    if (seg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setMonth(Number(seg.dataset.month)); }
    if (state.view === 'hjul' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
      if (e.key === 'ArrowLeft') setMonth(state.month - 1);
      if (e.key === 'ArrowRight') setMonth(state.month + 1);
    }
  });

  // ---------- Rulle på hjulet ----------
  const wheelEl = document.getElementById('wheel');
  function svgPoint(clientX, clientY) {
    const m = wheelEl.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x - C, y: p.y - C };
  }
  function onRing(p) { return p && Math.hypot(p.x, p.y) >= R_IN; }
  function monthAt(p) {
    let deg = Math.atan2(p.x, -p.y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return Math.floor(deg / 30) % 12;
  }
  let dragging = false;
  function dragTo(clientX, clientY) {
    const p = svgPoint(clientX, clientY);
    if (!p) return;
    const i = monthAt(p);
    if (i !== state.month) { state.month = i; state.open = null; render(); }
  }
  wheelEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (!onRing(svgPoint(e.clientX, e.clientY))) return;
    dragging = true;
    wheelEl.classList.add('dragging');
    dragTo(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', e => { if (dragging && e.pointerType !== 'touch') dragTo(e.clientX, e.clientY); });
  window.addEventListener('pointerup', () => { dragging = false; wheelEl.classList.remove('dragging'); });
  wheelEl.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || !onRing(svgPoint(t.clientX, t.clientY))) return;
    dragging = true;
    wheelEl.classList.add('dragging');
  }, { passive: true });
  wheelEl.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    dragTo(t.clientX, t.clientY);
  }, { passive: false });
  wheelEl.addEventListener('touchend', () => { dragging = false; wheelEl.classList.remove('dragging'); });
  let wheelAcc = 0, wheelTimer = null;
  wheelEl.addEventListener('wheel', e => {
    e.preventDefault();
    wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheelAcc) >= 60) {
      setMonth(state.month + (wheelAcc > 0 ? 1 : -1));
      wheelAcc = 0;
    }
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAcc = 0; }, 200);
  }, { passive: false });

  document.getElementById('role-select').addEventListener('change', e => {
    state.role = e.target.value; saveState(); render();
  });
  document.getElementById('hide-done').addEventListener('change', e => {
    state.hideDone = e.target.checked; saveState(); render();
  });

  // Med database: start tomt og hent oppgavene etter innlogging
  if (PUBLIC || cloudReady) { tasks = []; done = {}; }
  rebuild();
  render();
  if (PUBLIC) loadPublic();
  else if (cloudReady && session) loadCloud();

  // Hent endringer fra andre når appen åpnes igjen (maks hvert 30. sekund)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode() === 'cloud' && Date.now() - lastLoad > 30000 && !document.querySelector('dialog[open]')) {
      loadTasks().then(render).catch(() => {});
    }
  });
})();
