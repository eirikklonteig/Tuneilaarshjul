/* =========================================================
   Tune IL årshjul – steg 1: hjul, månedsliste og filter
   ========================================================= */
(function () {
  'use strict';

  const D = window.ARSHJUL_DATA;
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];
  const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const STATE_KEY = 'arshjul-visning';
  const DONE_KEY = 'arshjul-gjort-' + D.season.label;
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const unitById = Object.fromEntries(D.units.map(u => [u.id, u]));
  const roleById = Object.fromEntries(D.roles.map(r => [r.id, r]));
  const taskById = Object.fromEntries(D.tasks.map(t => [t.id, t]));

  // ---------- Lagring (bare på denne enheten i steg 1) ----------
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privat modus o.l. */ }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sesongens 12 måneder, fra startmåned
  const seasonMonths = Array.from({ length: 12 }, (_, i) => {
    const m0 = (D.season.startMonth - 1 + i) % 12;
    const y = D.season.startYear + Math.floor((D.season.startMonth - 1 + i) / 12);
    return { m: m0 + 1, y };
  });
  function monthIndexOf(m) { return (m - D.season.startMonth + 12) % 12; }
  function todayIndex() {
    return seasonMonths.findIndex(s => s.m === today.getMonth() + 1 && s.y === today.getFullYear());
  }

  const saved = readJSON(STATE_KEY, {});
  const state = {
    units: Array.isArray(saved.units) && saved.units.some(id => unitById[id]) ? saved.units.filter(id => unitById[id]) : ['klubb', 'handball'],
    role: saved.role && (saved.role === 'alle' || roleById[saved.role]) ? saved.role : 'alle',
    view: saved.view === 'liste' ? 'liste' : 'hjul',
    hideDone: !!saved.hideDone,
    month: todayIndex() >= 0 ? todayIndex() : 0,
    open: null
  };
  let done = readJSON(DONE_KEY, {});

  function saveState() {
    writeJSON(STATE_KEY, { units: state.units, role: state.role, view: state.view, hideDone: state.hideDone });
  }

  // ---------- Dato ----------
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function taskMonth(t) { return t.due ? parseDate(t.due).getMonth() + 1 : t.month; }
  function taskIndex(t) { return monthIndexOf(taskMonth(t)); }
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
  function subDate(task, sub) {
    if (!task.due || !sub.before) return null;
    const d = parseDate(task.due);
    if (sub.before.months) d.setMonth(d.getMonth() - sub.before.months);
    if (sub.before.days) d.setDate(d.getDate() - sub.before.days);
    return d;
  }
  function relText(before) {
    if (before.months) return before.months + (before.months === 1 ? ' måned' : ' måneder') + ' før';
    if (before.days % 7 === 0) { const w = before.days / 7; return w + (w === 1 ? ' uke' : ' uker') + ' før'; }
    return before.days + ' dager før';
  }

  // ---------- Filtrering ----------
  function matchesFilter(t) {
    if (!t.units.some(u => state.units.includes(u))) return false;
    if (state.role !== 'alle' && t.role !== state.role) return false;
    return true;
  }
  function isVisible(t) { return matchesFilter(t) && !(state.hideDone && done[t.id]); }
  function sortTasks(a, b) {
    const da = a.due ? parseDate(a.due).getDate() : 32;
    const db = b.due ? parseDate(b.due).getDate() : 32;
    return da - db || a.title.localeCompare(b.title, 'no');
  }
  function tasksForMonth(i, all) {
    return D.tasks.filter(t => taskIndex(t) === i && (all ? matchesFilter(t) : isVisible(t))).sort(sortTasks);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function roleLabel(id) {
    const r = roleById[id];
    return r ? r.name + ' · ' + unitById[r.unit].short : '';
  }

  // ---------- Toppen: fremdrift og neste frister ----------
  function renderHero() {
    document.getElementById('season-label').textContent = D.season.label;

    const mine = D.tasks.filter(matchesFilter);
    const nDone = mine.filter(t => done[t.id]).length;
    const pct = mine.length ? Math.round(nDone / mine.length * 100) : 0;
    document.getElementById('season-progress').innerHTML =
      `<span><b>${nDone}</b> av ${mine.length} gjort</span><span class="progress-bar"><i style="width:${pct}%"></i></span><span>${pct} %</span>`;

    const dated = mine.filter(t => t.due && !done[t.id]).map(t => ({ t, d: parseDate(t.due) }));
    const late = dated.filter(x => x.d < today).sort((a, b) => a.d - b.d);
    const next = dated.filter(x => x.d >= today).sort((a, b) => a.d - b.d).slice(0, late.length ? 4 : 5);

    let html = '';
    if (late.length) {
      const first = late[0].t;
      html += `<button type="button" class="up-card late" data-action="goto" data-task="${first.id}" style="--type:${D.types.frist.color}">
        <span class="up-when">${late.length} ${late.length === 1 ? 'forfalt frist' : 'forfalte frister'}</span>
        <span class="up-title">${esc(first.title)}${late.length > 1 ? ' m.fl.' : ''}</span>
        <span class="up-meta">Ikke krysset av</span></button>`;
    }
    html += next.map(({ t, d }) => `<button type="button" class="up-card" data-action="goto" data-task="${t.id}" style="--type:${D.types[t.type].color}">
        <span class="up-when">${untilText(daysUntil(d))}</span>
        <span class="up-title">${esc(t.title)}</span>
        <span class="up-meta">${fmtDay(d)} · ${esc(roleById[t.role].name)}</span></button>`).join('');
    document.getElementById('upcoming').innerHTML = html || '<p class="up-empty">Ingen kommende frister for dette filteret.</p>';
  }

  // ---------- Filter-UI ----------
  function renderFilters() {
    document.getElementById('unit-chips').innerHTML = D.units.map(u => {
      const on = state.units.includes(u.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-action="unit" data-unit="${u.id}" aria-pressed="${on}">
        <span class="chip-check" aria-hidden="true">${on ? '✓' : ''}</span>${esc(u.name)}</button>`;
    }).join('');

    // Verv vises bare for enheter som er slått på
    const sel = document.getElementById('role-select');
    let html = '<option value="alle">Alle verv</option>';
    D.units.filter(u => state.units.includes(u.id)).forEach(u => {
      const opt = r => `<option value="${r.id}">${esc(r.name)}</option>`;
      const styre = D.roles.filter(r => r.unit === u.id && r.styre !== false);
      const andre = D.roles.filter(r => r.unit === u.id && r.styre === false);
      const styreNavn = u.id === 'klubb' ? 'hovedstyret' : 'styret';
      if (styre.length) html += `<optgroup label="${esc(u.name)} – ${styreNavn}">` + styre.map(opt).join('') + '</optgroup>';
      if (andre.length) html += `<optgroup label="${esc(u.name)} – andre">` + andre.map(opt).join('') + '</optgroup>';
    });
    sel.innerHTML = html;
    if (state.role !== 'alle' && !state.units.includes(roleById[state.role].unit)) state.role = 'alle';
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
  // Vinkel for en dato i hjulet
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
    const start = new Date(D.season.startYear, D.season.startMonth - 1, 1);
    for (let d = new Date(start); ; d.setDate(d.getDate() + 7)) {
      const a = dateAngle(d);
      if (a === null) break;
      const [x1, y1] = pt(R_OUT + 3, a), [x2, y2] = pt(R_OUT + 7, a);
      out += `<line class="tick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    }

    seasonMonths.forEach((sm, i) => {
      const a1 = i * 30 + 0.7, a2 = (i + 1) * 30 - 0.7;
      const sel = i === state.month;
      const list = tasksForMonth(i);
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
          const t = list[k];
          const [x, y] = pt(row.r, i * 30 + 15 + (c - (inRow - 1) / 2) * row.s);
          const more = k === max - 1 && list.length > max;
          out += more
            ? `<text class="seg-more" x="${f(x)}" y="${f(y)}">+${list.length - max + 1}</text>`
            : `<circle class="dot${done[t.id] ? ' done' : ''}" cx="${f(x)}" cy="${f(y)}" r="5.2" fill="${D.types[t.type].color}"/>`;
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
    const all = tasksForMonth(state.month, true);
    const nDone = all.filter(t => done[t.id]).length;
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
  function dateBox(t) {
    if (t.due) {
      const d = parseDate(t.due);
      return `<span class="datebox"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></span>`;
    }
    return `<span class="datebox nodate"><b>${t.dateTbd ? '?' : '–'}</b><span>${MONTHS_SHORT[t.month - 1]}</span></span>`;
  }
  function badge(t) {
    if (done[t.id]) return '';
    if (t.dateTbd) return '<span class="badge tbd">Dato kommer</span>';
    if (!t.due) return '';
    const n = daysUntil(parseDate(t.due));
    if (n < 0) return '<span class="badge late">Forfalt</span>';
    if (n <= 14) return `<span class="badge soon">${untilText(n)}</span>`;
    return '';
  }

  function taskCard(t) {
    const tp = D.types[t.type];
    const isDone = !!done[t.id];
    const open = state.open === t.id;
    // Vis enhetene bare når de sier noe mer enn vervet gjør
    const roleUnit = roleById[t.role] && roleById[t.role].unit;
    const showUnits = !(t.units.length === 1 && t.units[0] === roleUnit);
    const unitsHtml = !showUnits ? '' : t.units.map(u => `<span class="unit-tag">${esc(unitById[u].short)}</span>`).join('');
    const subCount = t.sub ? t.sub.length : 0;

    let details = '';
    if (open) {
      details += '<div class="task-details">';
      if (t.due) details += `<p class="detail-due">Frist ${fmtLong(parseDate(t.due))}</p>`;
      else if (t.dateTbd) details += `<p class="detail-due">Dato kommer (${MONTHS[t.month - 1]})</p>`;
      if (t.description) details += `<p>${esc(t.description)}</p>`;
      if (t.sub) {
        details += '<h4>Underoppgaver</h4><ul class="subs">' + t.sub.map(s => {
          const sd = subDate(t, s);
          const when = s.before ? `<span class="sub-when">${relText(s.before)}${sd ? ' · ca. ' + fmtShort(sd) : ''}</span>` : '';
          return `<li><span>${esc(s.title)}</span>${when}</li>`;
        }).join('') + '</ul>';
      }
      if (t.prepares && taskById[t.prepares]) {
        const p = taskById[t.prepares];
        details += `<p class="link-note">Forbereder: <button type="button" class="linklike" data-action="goto" data-task="${p.id}">${esc(p.title)}</button> (${esc(roleLabel(p.role))})</p>`;
      }
      D.tasks.filter(x => x.prepares === t.id).forEach(p => {
        details += `<p class="link-note">Forberedes av: <button type="button" class="linklike" data-action="goto" data-task="${p.id}">${esc(p.title)}</button> (${esc(roleLabel(p.role))}${p.due ? ', frist ' + fmtShort(parseDate(p.due)) : ''})</p>`;
      });
      if (t.links) {
        details += '<div class="links">' + t.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('') + '</div>';
      }
      if (t.source && D.sources && D.sources[t.source]) {
        const s = D.sources[t.source];
        details += `<p class="source-note">Kilde: <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></p>`;
      }
      if (isDone) details += `<p class="done-note">✓ Krysset av ${fmtDay(new Date(done[t.id]))}</p>`;
      details += '</div>';
    }

    return `<article class="task${isDone ? ' is-done' : ''}${open ? ' open' : ''}" id="task-${t.id}" style="--type:${tp.color}">
      <button type="button" class="task-head" data-action="open" data-task="${t.id}" aria-expanded="${open}">
        ${dateBox(t)}
        <span class="task-body">
          <span class="task-title">${esc(t.title)}</span>
          <span class="task-meta">
            <span class="type-pill">${tp.name}</span>
            <span class="role">${esc(roleLabel(t.role))}</span>
            ${badge(t)}
          </span>
          ${unitsHtml || subCount ? `<span class="task-meta">
            ${unitsHtml}
            ${subCount ? `<span class="sub-count">${subCount} underoppgaver</span>` : ''}
          </span>` : ''}
        </span>
      </button>
      <button type="button" class="check" data-action="done" data-task="${t.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Fjern avkrysning' : 'Merk som gjort'}: ${esc(t.title)}">${CHECK_SVG}</button>
      ${details}
    </article>`;
  }

  function emptyHtml(i) {
    const sm = seasonMonths[i];
    const any = D.tasks.some(t => taskIndex(t) === i);
    if (sm.m === 7 && !any) return '<p class="empty">Ingen oppgaver i juli. God sommer! ☀️</p>';
    return `<p class="empty">Ingen oppgaver ${any ? 'som passer filteret ' : ''}i ${MONTHS[sm.m - 1]}.</p>`;
  }

  function renderMonth() {
    const sm = seasonMonths[state.month];
    document.getElementById('month-title').textContent = MONTHS[sm.m - 1] + ' ' + sm.y;
    const all = tasksForMonth(state.month, true);
    const nDone = all.filter(t => done[t.id]).length;
    document.getElementById('month-sub').textContent = all.length
      ? `${all.length} ${all.length === 1 ? 'oppgave' : 'oppgaver'} · ${nDone} gjort`
      : 'Ingen oppgaver';
    const list = tasksForMonth(state.month);
    document.getElementById('month-tasks').innerHTML = list.length ? list.map(taskCard).join('') : emptyHtml(state.month);
  }

  function renderList() {
    const ti = todayIndex();
    document.getElementById('view-liste').innerHTML =
      `<h2 class="print-title">Tune IL årshjul · sesong ${D.season.label}</h2>` +
      seasonMonths.map((sm, i) => {
        const list = tasksForMonth(i);
        return `<section class="list-month${i === ti ? ' now' : ''}">
          <h3>${MONTHS[sm.m - 1]} ${sm.y}${i === ti ? ' <span class="now-tag">Nå</span>' : ''} <small>${list.length || ''}</small></h3>
          <div class="task-list">${list.length ? list.map(taskCard).join('') : emptyHtml(i)}</div>
        </section>`;
      }).join('');
  }

  function render() {
    renderHero();
    renderFilters();
    document.getElementById('view-hjul').hidden = state.view !== 'hjul';
    document.getElementById('view-liste').hidden = state.view !== 'liste';
    if (state.view === 'hjul') { renderWheel(); renderMonth(); } else { renderList(); }
  }

  // ---------- Hendelser ----------
  function setMonth(i) {
    state.month = (i + 12) % 12;
    state.open = null;
    render();
  }

  document.addEventListener('click', e => {
    const seg = e.target.closest('.seg');
    if (seg) return setMonth(Number(seg.dataset.month));

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
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
      const id = el.dataset.task;
      if (done[id]) delete done[id]; else done[id] = new Date().toISOString();
      writeJSON(DONE_KEY, done); render();
    } else if (a === 'goto') {
      const t = taskById[el.dataset.task];
      if (!t.units.some(u => state.units.includes(u))) state.units = D.units.map(u => u.id).filter(u => t.units.includes(u) || state.units.includes(u));
      if (state.role !== 'alle' && state.role !== t.role) state.role = 'alle';
      state.hideDone = false;
      if (state.view === 'hjul') state.month = taskIndex(t);
      state.open = t.id;
      saveState(); render();
      const card = document.getElementById('task-' + t.id);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (a === 'print') {
      const prev = state.view;
      state.view = 'liste'; state.open = null; render();
      setTimeout(() => { window.print(); state.view = prev; render(); }, 50);
    }
  });

  document.addEventListener('keydown', e => {
    const seg = e.target.closest && e.target.closest('.seg');
    if (seg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setMonth(Number(seg.dataset.month)); }
    if (state.view === 'hjul' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
      if (e.key === 'ArrowLeft') setMonth(state.month - 1);
      if (e.key === 'ArrowRight') setMonth(state.month + 1);
    }
  });

  // ---------- Rulle på hjulet ----------
  // Dra rundt hjulet (finger eller mus), eller bruk musehjulet.
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

  // Mus (PC)
  wheelEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (!onRing(svgPoint(e.clientX, e.clientY))) return;
    dragging = true;
    wheelEl.classList.add('dragging');
    dragTo(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', e => { if (dragging && e.pointerType !== 'touch') dragTo(e.clientX, e.clientY); });
  window.addEventListener('pointerup', () => { dragging = false; wheelEl.classList.remove('dragging'); });

  // Finger (mobil): bare når fingeren starter på ringen, ellers scroller siden som vanlig
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

  // Musehjul / styreflate
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

  render();
})();
