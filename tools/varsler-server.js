// ---------- Sendejobb (kjører i Supabase Edge Functions) ----------
// Kalles hver morgen av en tidsplan (pg_cron). Sender:
//   - ukentlig oversikt på mandager (til dem som har det på)
//   - påminnelser X dager før frist (etter hver brukers valg)
// Sender ingenting hvis varsler er slått av i app_settings (aktiv = false).
// ?dry=1 viser hva som ville blitt sendt, uten å sende.

const ENV = (k) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : process.env[k]) || '';

async function db(path, opts) {
  const key = ENV('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${ENV('SUPABASE_URL')}/rest/v1/${path}`, {
    method: (opts && opts.method) || 'GET',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: (opts && opts.prefer) || '' },
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Dagens dato i Norge (uavhengig av serverens tidssone)
function osloToday() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

async function sendMail(to, msg) {
  const nodemailer = (await import('npm:nodemailer@6.9.16')).default;
  const port = Number(ENV('SMTP_PORT') || 465);
  const transport = nodemailer.createTransport({
    host: ENV('SMTP_HOST') || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: ENV('SMTP_USER'), pass: ENV('SMTP_PASS') }
  });
  await transport.sendMail({
    from: `"Tune IL årshjul" <${ENV('SMTP_FROM') || ENV('SMTP_USER')}>`,
    to, subject: msg.subject, text: msg.text, html: msg.html
  });
}

async function run(req) {
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const forceWeekly = url.searchParams.get('ukentlig') === '1';

  // Bare tidsplanen (eller den som kjenner hemmeligheten) får starte jobben
  const secret = ENV('VARSEL_SECRET');
  if (!secret || req.headers.get('x-varsel-secret') !== secret) return json({ feil: 'Ikke tilgang' }, 401);

  const settingsRow = (await db('app_settings?key=eq.varsler&select=value'))[0];
  const S = settingsRow ? settingsRow.value : {};
  if (!S.aktiv && !dry) return json({ hoppet_over: 'Varsler er ikke slått på (app_settings.varsler.aktiv = false)' });

  const season = { label: S.sesong, startYear: S.startAar, startMonth: S.startMaaned };
  const q = encodeURIComponent(season.label);
  const [members, access, memberRoles, roles, units, taskRows, statuses, log] = await Promise.all([
    db('members?active=is.true&select=id,email,name,is_superadmin,notify_weekly,remind_days'),
    db('member_access?select=member_id,unit_id'),
    db('member_roles?select=member_id,role_id'),
    db('roles?select=id,name,unit_id'),
    db('units?select=id,short'),
    db(`tasks?season=eq.${q}&deleted=is.false&select=id,units,data`),
    db(`task_status?season=eq.${q}&status=eq.done&select=task_key`),
    db(`notification_log?season=eq.${q}&select=member_id,kind,ref`)
  ]);
  const tasks = taskRows.map(r => Object.assign({}, r.data, { id: r.id, units: r.units }));
  const done = Object.fromEntries(statuses.map(s => [s.task_key, true]));
  const sent = new Set(log.map(l => `${l.member_id}|${l.kind}|${l.ref}`));
  const unitShort = Object.fromEntries(units.map(u => [u.id, u.short]));
  const roleName = id => { const r = roles.find(x => x.id === id); return r ? `${r.name} · ${unitShort[r.unit_id] || r.unit_id}` : ''; };

  const today = osloToday();
  const isMonday = today.getDay() === 1;
  const week = isoWeek(today);
  const out = [];

  for (const m of members) {
    const roleIds = memberRoles.filter(r => r.member_id === m.id).map(r => r.role_id);
    if (!roleIds.length) continue;
    const myUnits = m.is_superadmin ? units.map(u => u.id) : access.filter(a => a.member_id === m.id).map(a => a.unit_id);
    const plan = ArshjulVarsel.forMember({
      member: m, roleIds, units: myUnits, tasks, done, season, today,
      appUrl: S.appUrl, remindDays: m.remind_days || [], roleName
    });
    const msgs = [];
    if (plan.weekly && m.notify_weekly && (isMonday || forceWeekly)) msgs.push(Object.assign({ ref: week }, plan.weekly));
    plan.reminders.forEach(r => msgs.push(Object.assign({ ref: r.key }, r)));

    for (const msg of msgs) {
      const id = `${m.id}|${msg.kind}|${msg.ref}`;
      if (sent.has(id)) continue;
      const entry = { til: m.email, type: msg.kind, emne: msg.subject };
      if (!dry) {
        try {
          await sendMail(m.email, msg);
          await db('notification_log', { method: 'POST', body: { member_id: m.id, season: season.label, kind: msg.kind, ref: msg.ref }, prefer: 'resolution=ignore-duplicates,return=minimal' });
          sent.add(id);
          entry.sendt = true;
        } catch (err) { entry.feil = String(err.message || err); }
      }
      out.push(entry);
    }
  }
  return json({ dato: ArshjulVarsel.iso(today), proeve: dry, antall: out.length, eposter: out });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

if (typeof Deno !== 'undefined') Deno.serve((req) => run(req).catch(err => json({ feil: String(err.message || err) }, 500)));
else if (typeof module !== 'undefined') module.exports = { run };
