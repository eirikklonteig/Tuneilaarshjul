/* =========================================================
   Tune IL årshjul – steg 1: hjul, månedsliste og filter
   ========================================================= */
(function () {
  'use strict';

  const D = window.ARSHJUL_DATA;
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];
  const WEEKDAYS = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
  const STATE_KEY = 'arshjul-visning';
  const DONE_KEY = 'arshjul-gjort-' + D.season.label;

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
    const i = seasonMonths.findIndex(s => s.m === today.getMonth() + 1 && s.y === today.getFullYear());
    return i;
  }

  const saved = readJSON(STATE_KEY, {});
  const state = {
    units: Array.isArray(saved.units) ? saved.units.filter(id => unitById[id]) : ['klubb', 'handball'],
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

  // ---------- Hjelpefunksjoner for dato ----------
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function taskMonth(t) { return t.due ? parseDate(t.due).getMonth() + 1 : t.month; }
  function taskIndex(t) { return monthIndexOf(taskMonth(t)); }
  function fmtDate(d, withDay) {
    const s = d.getDate() + '. ' + MONTHS[d.getMonth()].slice(0, 3) + '.';
    return withDay ? WEEKDAYS[d.getDay()] + ' ' + s : s;
  }
  function fmtShort(d) {
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function daysUntil(d) { return Math.round((d - today) / 86400000); }
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
  function isVisible(t) {
    if (!t.units.some(u => state.units.includes(u))) return false;
    if (state.role !== 'alle' && t.role !== state.role) return false;
    if (state.hideDone && done[t.id]) return false;
    return true;
  }
  function sortTasks(a, b) {
    const da = a.due ? parseDate(a.due).getDate() : 32;
    const db = b.due ? parseDate(b.due).getDate() : 32;
    return da - db || a.title.localeCompare(b.title, 'no');
  }
  function tasksForMonth(i) {
    return D.tasks.filter(t => taskIndex(t) === i && isVisible(t)).sort(sortTasks);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function roleLabel(id) {
    const r = roleById[id];
    if (!r) return '';
    return r.name + ' · ' + unitById[r.unit].short;
  }

  // ---------- Filter-UI ----------
  function renderFilters() {
    document.getElementById('season-label').textContent = D.season.label;

    document.getElementById('unit-chips').innerHTML = D.units.map(u => {
      const on = state.units.includes(u.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-action="unit" data-unit="${u.id}" aria-pressed="${on}">
        <span class="chip-check" aria-hidden="true">${on ? '✓' : ''}</span>${esc(u.name)}</button>`;
    }).join('');

    // Verv vises bare for enheter som er slått på
    const sel = document.getElementById('role-select');
    let html = '<option value="alle">Alle verv</option>';
    D.units.filter(u => state.units.includes(u.id)).forEach(u => {
      const rs = D.roles.filter(r => r.unit === u.id);
      if (rs.length) html += `<optgroup label="${esc(u.name)}">` + rs.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('') + '</optgroup>';
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
  const C = 200, R_OUT = 192, R_LABEL = 158, R_IN = 84;
  function pt(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }
  function arc(r1, r2, a1, a2) {
    const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r2} ${r2} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${r1} ${r1} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
  }

  function renderWheel() {
    const svg = document.getElementById('wheel');
    const ti = todayIndex();
    let out = '';

    seasonMonths.forEach((sm, i) => {
      const a1 = i * 30 + 0.8, a2 = (i + 1) * 30 - 0.8;
      const sel = i === state.month;
      const list = tasksForMonth(i);
      const label = `${MONTHS[sm.m - 1]} ${sm.y}, ${list.length} oppgaver`;
      out += `<g class="seg${sel ? ' sel' : ''}${i === ti ? ' now' : ''}" data-month="${i}" role="button" tabindex="0" aria-label="${label}" aria-pressed="${sel}">`;
      out += `<path class="seg-body" d="${arc(R_IN + 4, R_OUT, a1, a2)}"/>`;
      out += `<path class="seg-rim" d="${arc(R_LABEL - 16, R_OUT, a1, a2)}"/>`;
      const [lx, ly] = pt((R_LABEL - 16 + R_OUT) / 2, i * 30 + 15);
      out += `<text class="seg-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${MONTHS_SHORT[sm.m - 1]}</text>`;

      // Prikker: én per oppgave, fargen viser typen
      const rows = [122, 104];
      const perRow = 4, max = perRow * rows.length;
      list.slice(0, max).forEach((t, k) => {
        const row = Math.floor(k / perRow), col = k % perRow;
        const inRow = Math.min(perRow, list.length - row * perRow);
        const spread = 5.6 * (row === 0 ? 1 : 1.2);
        const deg = i * 30 + 15 + (col - (inRow - 1) / 2) * spread;
        const [x, y] = pt(rows[row], deg);
        const more = k === max - 1 && list.length > max;
        out += more
          ? `<text class="seg-more" x="${x.toFixed(1)}" y="${y.toFixed(1)}">+${list.length - max + 1}</text>`
          : `<circle class="dot${done[t.id] ? ' done' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${D.types[t.type].color}"/>`;
      });
      out += '</g>';
    });

    // «Nå»-viser
    if (ti >= 0) {
      const sm = seasonMonths[ti];
      const days = new Date(sm.y, sm.m, 0).getDate();
      const deg = (ti + (today.getDate() - 0.5) / days) * 30;
      const [x1, y1] = pt(R_IN, deg), [x2, y2] = pt(R_OUT + 6, deg);
      out += `<line class="now-hand" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      out += `<circle class="now-dot" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4.5"/>`;
    }

    // Midten
    const sm = seasonMonths[state.month];
    const count = tasksForMonth(state.month).length;
    out += `<circle class="hub" cx="${C}" cy="${C}" r="${R_IN}"/>`;
    out += `<text class="hub-season" x="${C}" y="${C - 30}">${D.season.label}</text>`;
    out += `<text class="hub-month" x="${C}" y="${C + 4}">${MONTHS[sm.m - 1]}</text>`;
    out += `<text class="hub-count" x="${C}" y="${C + 30}">${count === 0 ? 'ingen oppgaver' : count + (count === 1 ? ' oppgave' : ' oppgaver')}</text>`;

    svg.innerHTML = out;
  }

  // ---------- Oppgavekort ----------
  function dueHtml(t) {
    if (t.due) {
      const d = parseDate(t.due);
      const n = daysUntil(d);
      let rel = '';
      if (!done[t.id]) {
        if (n < 0) rel = '<span class="due-late">Forfalt</span>';
        else if (n === 0) rel = '<span class="due-soon">I dag</span>';
        else if (n <= 14) rel = `<span class="due-soon">om ${n} ${n === 1 ? 'dag' : 'dager'}</span>`;
      }
      return `<span class="due">${fmtDate(d, true)}</span>${rel}`;
    }
    if (t.dateTbd) return '<span class="due tbd">Dato kommer</span>';
    return '<span class="due muted">I løpet av måneden</span>';
  }

  function taskCard(t, opts) {
    const tp = D.types[t.type];
    const isDone = !!done[t.id];
    const open = state.open === t.id;
    const unitsHtml = t.units.map(u => `<span class="unit-tag">${esc(unitById[u].short)}</span>`).join('');
    const subCount = t.sub ? t.sub.length : 0;

    let details = '';
    if (open) {
      details += '<div class="task-details">';
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
      const preps = D.tasks.filter(x => x.prepares === t.id);
      preps.forEach(p => {
        details += `<p class="link-note">Forberedes av: <button type="button" class="linklike" data-action="goto" data-task="${p.id}">${esc(p.title)}</button> (${esc(roleLabel(p.role))}${p.due ? ', frist ' + fmtShort(parseDate(p.due)) : ''})</p>`;
      });
      if (t.links) {
        details += '<div class="links">' + t.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('') + '</div>';
      }
      if (isDone) details += `<p class="done-note">Krysset av ${fmtDate(new Date(done[t.id]))}</p>`;
      details += '</div>';
    }

    return `<article class="task${isDone ? ' is-done' : ''}${open ? ' open' : ''}" id="task-${t.id}" style="--type:${tp.color}">
      <button type="button" class="check" data-action="done" data-task="${t.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Fjern avkrysning' : 'Merk som gjort'}: ${esc(t.title)}">${isDone ? '✓' : ''}</button>
      <div class="task-main">
        <button type="button" class="task-head" data-action="open" data-task="${t.id}" aria-expanded="${open}">
          <span class="task-title">${esc(t.title)}</span>
          <span class="task-meta">
            <span class="type-pill">${tp.name}</span>
            ${dueHtml(t)}
          </span>
          <span class="task-meta2">
            <span class="role">${esc(roleLabel(t.role))}</span>
            ${unitsHtml}
            ${subCount ? `<span class="sub-count">${subCount} underoppgaver</span>` : ''}
          </span>
        </button>
        ${details}
      </div>
    </article>`;
  }

  function emptyHtml(i) {
    const sm = seasonMonths[i];
    const any = D.tasks.some(t => taskIndex(t) === i);
    if (sm.m === 7 && !any) return '<p class="empty">Ingen oppgaver i juli. God sommer!</p>';
    return `<p class="empty">Ingen oppgaver ${any ? 'som passer filteret ' : ''}i ${MONTHS[sm.m - 1]}.</p>`;
  }

  function renderMonth() {
    const sm = seasonMonths[state.month];
    document.getElementById('month-title').textContent = MONTHS[sm.m - 1] + ' ' + sm.y;
    const list = tasksForMonth(state.month);
    document.getElementById('month-tasks').innerHTML = list.length ? list.map(t => taskCard(t)).join('') : emptyHtml(state.month);
  }

  function renderList() {
    const ti = todayIndex();
    document.getElementById('view-liste').innerHTML =
      `<h2 class="print-title">Tune IL årshjul · sesong ${D.season.label}</h2>` +
      seasonMonths.map((sm, i) => {
        const list = tasksForMonth(i);
        return `<section class="list-month${i === ti ? ' now' : ''}">
          <h3>${MONTHS[sm.m - 1]} ${sm.y}${i === ti ? ' <span class="now-tag">nå</span>' : ''}</h3>
          <div class="task-list">${list.length ? list.map(t => taskCard(t)).join('') : emptyHtml(i)}</div>
        </section>`;
      }).join('');
  }

  function render() {
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
      state.role = 'alle';
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

  document.getElementById('role-select').addEventListener('change', e => {
    state.role = e.target.value; saveState(); render();
  });
  document.getElementById('hide-done').addEventListener('change', e => {
    state.hideDone = e.target.checked; saveState(); render();
  });

  render();
})();
