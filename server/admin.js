/* Root User platform tools (mounted by server/api.js):

     Recycle bin        GET  /api/admin/bin                list (search q, type key, from/to date, offset/limit)
                        GET  /api/admin/bin/:id            one entry with its full record (preview)
                        POST /api/admin/bin/:id/restore    { overwrite } — 409 { error: 'exists' } when the id is taken again
                        POST /api/admin/bin/batch/restore  { batch, overwrite } — everything removed by one save
                        POST /api/admin/bin/:id/purge      { confirm: true } — delete one entry for ever
                        POST /api/admin/bin/empty          { phrase } — delete every entry for ever
                        POST /api/admin/bin/settings       { days } — auto-purge age (default 90)
     Demo data          GET  /api/admin/demo               { allowed }
                        POST /api/admin/demo/load          { phrase } — backup, then the demo school (Root User kept)
                        POST /api/admin/demo/reset         { phrase } — backup, then the first-run state (Root User and identity kept)
     Payment claims     POST /api/pay/claims/:id/verify · /reject (fees: edit) — see server/pay.js
     Password requests  the IT office is told by SMS / e-mail (server/lib/notify.js) when a request arrives;
                        POST /api/public/pwstatus { id, phone } shows the requester its status.

   Every operation is audited. Demo load and reset are refused when ALLOW_DEMO_LOAD=false. */
'use strict';
const config = require('./config');
const bin = require('./bin');
const backup = require('./backup');
const notify = require('./lib/notify');
const { appendAudit } = require('./public');
const { institutionDefaults } = require('./defaults');
const { asciiDigits } = require('./lib/hash');

const DEMO_PHRASE = 'ডেমো ডেটা লোড করুন';
const RESET_PHRASE = 'সব ডেটা মুছে ফেলুন';
const EMPTY_PHRASE = 'বিন খালি করুন';
const KEY_BN = {
  students: 'শিক্ষার্থী', teachers: 'শিক্ষক', staff: 'কর্মী', users: 'ব্যবহারকারী', userRoles: 'ব্যবহারকারীর ভূমিকা', invoices: 'বিল', payments: 'পরিশোধ',
  notices: 'নোটিশ', exams: 'পরীক্ষা', classes: 'শ্রেণি', subjects: 'বিষয়', materials: 'পাঠ উপকরণ', marks: 'নম্বর', attendance: 'হাজিরা', homework: 'বাড়ির কাজ',
  admissions: 'ভর্তির আবেদন', journal: 'জাবেদা ভাউচার', guardianLinks: 'অভিভাবক সংযোগ', leaves: 'ছুটি', payroll: 'বেতন', documents: 'নথি', certificates: 'সনদ',
  serviceRequests: 'সেবার আবেদন', calendar: 'ক্যালেন্ডার', routine: 'রুটিন', syllabus: 'পাঠ্যসূচি', examPapers: 'প্রশ্নপত্র', qbank: 'প্রশ্ন ব্যাংক', incidents: 'আচরণ নোট', achievements: 'অর্জন',
  jobs: 'নিয়োগ বিজ্ঞপ্তি', jobApplications: 'চাকরির আবেদন', payClaims: 'TrxID দাবি', pwRequests: 'পাসওয়ার্ড অনুরোধ', feeStructure: 'ফি কাঠামো', concessions: 'ছাড়',
};

function makeAdmin({ state, store, log, auth }) {
  const days = async () => { try { const d = await store.getMeta('recycleBinDays'); return +d > 0 ? +d : bin.DEFAULT_DAYS; } catch (_) { return bin.DEFAULT_DAYS; } };
  const who = req => { const u = state.user(req.user.id); return u ? u.username || u.name : req.user.id; };
  const audit = (get, req, action, detail) => appendAudit(get('audit'), { role: 'SYSTEM', action, entity: 'system', detail }, req.ip, req.user.id);

  /* ---------- recycle bin ---------- */
  async function list(req, res) {
    const q = String(req.query.q || '').trim().toLowerCase(), key = String(req.query.key || ''), from = String(req.query.from || ''), to = String(req.query.to || '');
    const all = state.get(bin.KEY) || [];
    const counts = {};
    for (const e of all) counts[e.key] = (counts[e.key] || 0) + 1;
    const hit = all.filter(e => (!key || e.key === key) && (!from || String(e.deletedAt).slice(0, 10) >= from) && (!to || String(e.deletedAt).slice(0, 10) <= to)
      && (!q || `${e.label} ${e.recId} ${e.deletedByName} ${e.key} ${KEY_BN[e.key] || ''}`.toLowerCase().includes(q)));
    const off = Math.max(0, +req.query.offset || 0), lim = Math.min(200, Math.max(1, +req.query.limit || 50));
    res.json({ total: hit.length, all: all.length, items: hit.slice(off, off + lim).map(bin.summary), keys: Object.entries(counts).map(([k, n]) => ({ key: k, label: KEY_BN[k] || k, n })).sort((a, b) => b.n - a.n), days: await days(), batchSizes: batchSizes(all, hit.slice(off, off + lim)) });
  }
  const batchSizes = (all, shown) => { const want = new Set(shown.map(e => e.batch)), o = {}; for (const e of all) if (want.has(e.batch)) o[e.batch] = (o[e.batch] || 0) + 1; return o; };
  function one(req, res) {
    const e = (state.get(bin.KEY) || []).find(x => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'not_found' });
    // secrets stay on the server even for the Root User (a restored account keeps its password hash)
    let record = e.record;
    if (record && typeof record === 'object' && !Array.isArray(record) && ('pwHash' in record || 'demoKey' in record)) { record = { ...record }; delete record.pwHash; delete record.demoKey; }
    if (e.kind === 'key' && Array.isArray(record)) record = record.map(r => (r && typeof r === 'object' && 'pwHash' in r ? (({ pwHash: _, demoKey: __, ...x }) => x)(r) : r));
    res.json({ ...e, record, typeLabel: KEY_BN[e.key] || e.key, exists: bin.exists(e, state.get(e.key)) });
  }
  /** Put entries back; returns { restored: [id], conflicts: [id] }. */
  async function restoreEntries(req, ids, overwrite) {
    const out = { restored: [], conflicts: [] };
    await state.mutate(get => {
      out.restored = []; out.conflicts = [];
      const list = get(bin.KEY) || [], put = {}, cur = k => (k in put ? put[k] : get(k));
      // oldest first, so a record deleted twice comes back in its latest form
      for (const e of list.filter(x => ids.includes(x.id)).reverse()) {
        if (bin.exists(e, cur(e.key)) && !overwrite) { out.conflicts.push(e.id); continue; }
        put[e.key] = bin.reinsert(e, cur(e.key)); out.restored.push(e.id);
      }
      if (!out.restored.length) return {};
      const done = new Set(out.restored), back = list.filter(x => done.has(x.id));
      put[bin.KEY] = list.filter(x => !done.has(x.id));
      put.audit = audit(get, req, 'BIN_RESTORE', `রিসাইকেল বিন থেকে ফেরত: ${back.slice(0, 8).map(e => `${KEY_BN[e.key] || e.key} “${e.label}”`).join(', ')}${back.length > 8 ? ` ও আরও ${back.length - 8}টি` : ''}${overwrite ? ' (একই আইডির বর্তমান রেকর্ডের ওপরে)' : ''} · ${who(req)}`);
      return put;
    }, req.user.id);
    return out;
  }
  async function restore(req, res) {
    const e = (state.get(bin.KEY) || []).find(x => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'not_found' });
    const r = await restoreEntries(req, [e.id], req.body?.overwrite === true);
    if (r.conflicts.length) return res.status(409).json({ error: 'exists', key: e.key, recId: e.recId });
    res.json({ ok: true, ...r });
  }
  async function restoreBatch(req, res) {
    const b = String(req.body?.batch || ''); if (!b) return res.status(400).json({ error: 'bad_request' });
    const ids = (state.get(bin.KEY) || []).filter(x => x.batch === b).map(x => x.id);
    if (!ids.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, ...(await restoreEntries(req, ids, req.body?.overwrite === true)) });
  }
  async function purge(req, res) {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'confirm_required' });
    let found = null;
    await state.mutate(get => {
      const list = get(bin.KEY) || []; found = list.find(x => x.id === req.params.id); if (!found) return {};
      return { [bin.KEY]: list.filter(x => x.id !== found.id), audit: audit(get, req, 'BIN_PURGE', `রিসাইকেল বিন থেকে স্থায়ীভাবে মুছে ফেলা: ${KEY_BN[found.key] || found.key} “${found.label}” · ${who(req)}`) };
    }, req.user.id);
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  }
  async function empty(req, res) {
    if (String(req.body?.phrase || '').trim() !== EMPTY_PHRASE) return res.status(400).json({ error: 'phrase', phrase: EMPTY_PHRASE });
    let n = 0;
    await state.mutate(get => { n = (get(bin.KEY) || []).length; if (!n) return {}; return { [bin.KEY]: [], audit: audit(get, req, 'BIN_EMPTY', `রিসাইকেল বিন খালি করা হয়েছে: ${n}টি রেকর্ড স্থায়ীভাবে মুছে ফেলা · ${who(req)}`) }; }, req.user.id);
    res.json({ ok: true, removed: n });
  }
  async function settings(req, res) {
    const d = Math.round(+req.body?.days);
    if (!(d >= 1 && d <= 3650)) return res.status(400).json({ error: 'bad_days' });
    const old = await days();
    await store.setMeta('recycleBinDays', d);
    await state.mutate(get => ({ audit: audit(get, req, 'BIN_SETTINGS', `রিসাইকেল বিনের স্বয়ংক্রিয় মুছে ফেলা: ${old} → ${d} দিন · ${who(req)}`) }), req.user.id);
    await autoPurge();
    res.json({ ok: true, days: d });
  }
  /** Entries older than the configured age are removed (hourly and at start-up). */
  async function autoPurge() {
    const d = await days();
    const old = bin.expired(state.get(bin.KEY), d); if (!old.length) return 0;
    const gone = new Set(old.map(e => e.id));
    await state.mutate(get => ({ [bin.KEY]: (get(bin.KEY) || []).filter(e => !gone.has(e.id)), audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'BIN_AUTO_PURGE', entity: 'system', detail: `রিসাইকেল বিন: ${d} দিনের পুরোনো ${old.length}টি রেকর্ড স্বয়ংক্রিয়ভাবে মুছে ফেলা হয়েছে` }, '', null) }), 'SYSTEM');
    log.info(`[bin] auto-purged ${old.length} entries older than ${d} days`);
    return old.length;
  }

  /* ---------- demo data / start afresh ---------- */
  let busy = false;
  const demoInfo = (req, res) => res.json({ allowed: config.allowDemoLoad, demoPhrase: DEMO_PHRASE, resetPhrase: RESET_PHRASE, emptyPhrase: EMPTY_PHRASE });
  /** Sign out every session, then give the Root User (this request) a fresh one. */
  async function signOutAll(req, res, ids, rootId) {
    for (const id of new Set(ids)) await store.deleteUserSessions(id, '');
    await auth.startSession(req, res, rootId);
  }
  async function guarded(req, res, phrase, fn) {
    if (!config.allowDemoLoad) return res.status(403).json({ error: 'disabled' });
    if (String(req.body?.phrase || '').trim() !== phrase) return res.status(400).json({ error: 'phrase', phrase });
    if (busy) return res.status(409).json({ error: 'busy' });
    busy = true;
    try {
      await state.drain();
      const b = await backup.createBackup(store, { kind: phrase === DEMO_PHRASE ? 'predemo' : 'prereset', log });
      backup.pruneBackups(config.backupDir, config.backupKeepDays, log);
      await fn(b);
    } catch (e) { log.error('[admin] demo/reset failed', e.stack || e.message); if (!res.headersSent) res.status(500).json({ error: 'server_error' }); }
    finally { busy = false; }
  }
  const rootRecord = uid => { const u = { ...state.user(uid) }; delete u.mustChange; return { ...u, active: true, pwDefault: false }; };

  async function loadDemo(req, res) {
    await guarded(req, res, DEMO_PHRASE, async b => {
      const { buildDemo } = require('./seed/build');
      const before = state.users().map(u => u.id), me = rootRecord(req.user.id);
      const { state: demo, logins } = await buildDemo({ log: m => log.info(`[demo] ${m}`) });
      // the current Root User replaces the demo's Root User account (same password, nobody is locked out)
      const demoRoot = demo.users.find(u => demo.userRoles.some(r => r.userId === u.id && r.role === 'ADMIN'));
      const renamed = [];
      demo.users.forEach(u => { if (u !== demoRoot && String(u.username).toLowerCase() === String(me.username).toLowerCase()) { renamed.push([u.username, `${u.username}_demo`]); u.username = `${u.username}_demo`; } });
      const rootId = demoRoot.id;
      Object.assign(demoRoot, { name: me.name, nameBn: me.nameBn, username: me.username, email: me.email, phone: me.phone, photo: me.photo || null, pwHash: me.pwHash, pwDefault: false, loginPolicy: me.loginPolicy || 'v1', active: true });
      delete demoRoot.mustChange;
      const out = logins.map(l => (l[1] === 'root' ? ['রুট ব্যবহারকারী (আপনি)', me.username, 'আপনার বর্তমান পাসওয়ার্ড'] : renamed.find(r => r[0] === l[1]) ? [l[0], `${l[1]}_demo`, l[2]] : l));
      demo[bin.KEY] = []; demo.payIntents = []; demo.payClaims = demo.payClaims || [];
      demo.audit = appendAudit(demo.audit, { role: 'SYSTEM', action: 'DEMO_LOAD', entity: 'system', detail: `রুট ব্যবহারকারী ${me.username} ডেমো ডেটা লোড করেছেন (আগের ডেটার ব্যাকআপ: ${b.name}); অন্য সব সেশন বন্ধ` }, req.ip, rootId);
      await state.replaceAll(demo, req.user.id);
      await store.setMeta('setup', { at: new Date().toISOString(), demo: true, by: me.username });
      await signOutAll(req, res, [...before, ...demo.users.map(u => u.id)], rootId);
      log.info(`[admin] demo data loaded by ${me.username} (backup ${b.name})`);
      res.json({ ok: true, backup: b.name, rootId, logins: out, note: 'অন্য শিক্ষক: ইউজার নেম + Demo@2026dhee · শিক্ষার্থী: স্টুডেন্ট আইডি + রেজিস্ট্রেশন নম্বর · অভিভাবক: মোবাইল নম্বর (দুটোই)' });
    });
  }

  async function resetAll(req, res) {
    await guarded(req, res, RESET_PHRASE, async b => {
      const before = state.users().map(u => u.id), me = rootRecord(req.user.id);
      const school = state.get('school') || {}, now = new Date();
      const st = institutionDefaults({ name: school.name, nameBn: school.nameBn, type: school.type, eiin: school.eiin }, now);
      st.school = { ...st.school, ...school };                       // the institution's identity (names, logo, stamp, merchant numbers …)
      if (state.get('theme')) st.theme = state.get('theme');
      st.users = [me]; st.userRoles = [{ userId: me.id, role: 'ADMIN' }];
      st.meta.seq = Math.max(1001, +String(me.id).replace(/\D/g, '') || 0);
      const was = state.get('meta') || {}; if (was.setupAt) st.meta.setupAt = was.setupAt;
      st[bin.KEY] = []; st.payClaims = []; st.payIntents = [];
      st.audit = appendAudit([], { role: 'SYSTEM', action: 'DATA_RESET', entity: 'system', detail: `রুট ব্যবহারকারী ${me.username} সব ডেটা মুছে নতুন করে শুরু করেছেন (প্রতিষ্ঠানের পরিচয় রাখা হয়েছে; আগের ডেটার ব্যাকআপ: ${b.name}); অন্য সব সেশন বন্ধ` }, req.ip, me.id);
      await state.replaceAll(st, req.user.id);
      await signOutAll(req, res, before, me.id);
      log.info(`[admin] data reset by ${me.username} (backup ${b.name})`);
      res.json({ ok: true, backup: b.name, rootId: me.id });
    });
  }

  /* ---------- password-help requests ---------- */
  /** Tell the IT office (config.itOffice or IT_OFFICE_PHONE / IT_OFFICE_EMAIL) that requests arrived. */
  async function notifyOffice(reqs) {
    if (!reqs || !reqs.length) return;
    const c = (state.get('config') || {}).itOffice || {}, school = state.get('school') || {};
    if (c.notify === false) return;
    const phone = c.phone || process.env.IT_OFFICE_PHONE || '', email = c.email || process.env.IT_OFFICE_EMAIL || '';
    const text = `${school.shortName || school.nameBn || ''}: পাসওয়ার্ড সহায়তার নতুন অনুরোধ ${reqs.map(r => `${r.id}${r.userId ? '' : ' (অজানা অ্যাকাউন্ট)'}`).join(', ')}। পাসওয়ার্ড ডেস্কে দেখুন।`;
    for (const [kind, to] of [['sms', phone], ['email', email]]) {
      if (!to) continue;
      try { const r = await notify.send(kind, to, text, 'পাসওয়ার্ড সহায়তার অনুরোধ'); if (!r.ok) log.warn(`[pwdesk] office ${kind} not sent: ${r.reason}`); } catch (e) { log.warn(`[pwdesk] office ${kind} failed: ${e.message}`); }
    }
  }
  /** Public status of a request: id + the mobile number of the account (or the one typed in the request). */
  function pwStatus(body) {
    const id = String(body.id || '').trim().toUpperCase(), ph = asciiDigits(String(body.phone || '')).replace(/\D/g, '').slice(-10);
    if (!id || ph.length < 10) return { found: false };
    const r = (state.get('pwRequests') || []).find(x => String(x.id).toUpperCase() === id);
    if (!r) return { found: false };
    const u = r.userId && state.user(r.userId);
    const phones = [u && u.phone, r.given].map(p => asciiDigits(String(p || '')).replace(/\D/g, '').slice(-10));
    if (!phones.includes(ph)) return { found: false };
    return { found: true, id: r.id, status: r.status, at: r.at, doneAt: r.doneAt || null };
  }

  /** Collections the server relies on (an older database may lack them): learners can only append to an existing key. */
  async function ensureKeys() {
    if (!state.users().length) return;
    const add = {};
    for (const k of ['payClaims', 'pwRequests']) if (!Array.isArray(state.get(k))) add[k] = [];
    if (Object.keys(add).length) await state.mutate(() => add, 'SYSTEM');
  }

  return { ensureKeys, list, one, restore, restoreBatch, purge, empty, settings, autoPurge, demoInfo, loadDemo, resetAll, notifyOffice, pwStatus };
}

module.exports = { makeAdmin, DEMO_PHRASE, RESET_PHRASE, EMPTY_PHRASE, KEY_BN };
