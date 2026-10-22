/* JSON API (mounted at /api). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { makeAuth } = require('./auth');
const pub = require('./public');
const backup = require('./backup');
const { Window, Guard, tooMany } = require('./lib/ratelimit');
const { asciiDigits } = require('./lib/hash');
const { makeAdmin } = require('./admin');
const pay = require('./pay');
const rootops = require('./lib/rootops');
const { makeQuiz } = require('./quiz');
const { makeRecheck } = require('./recheck');

function makeApi({ state, store, log, health }) {
  const api = express.Router();
  const auth = makeAuth(state, store, log);
  const admin = makeAdmin({ state, store, log, auth });
  admin.ensureKeys().then(() => admin.autoPurge()).catch(e => log.error('[bin] start-up check failed', e.message));
  setInterval(() => admin.autoPurge().catch(e => log.error('[bin] purge failed', e.message)), 3600e3).unref();
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // Writes must be JSON from this site (blocks cross-site form posts; SameSite cookies do the rest).
  api.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    const origin = req.headers.origin;
    if (origin && req.path !== '/pay/webhook') { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'bad_origin' }); } catch (_) { return res.status(403).json({ error: 'bad_origin' }); } }
    next();
  });
  // the raw body is kept for the payment gateway's HMAC signature (POST /api/pay/webhook)
  api.use(express.json({ limit: config.jsonLimit, verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/pay/webhook')) req.rawBody = Buffer.from(buf); } }));
  api.use(wrap(auth.session));

  /* --- rate limits (see server/lib/ratelimit.js) --- */
  const pubWin = new Window({ max: 120, windowMs: 10 * 60e3 });              // every public endpoint, per IP
  const lookupWin = new Window({ max: 60, windowMs: 10 * 60e3 });            // public look-ups, per IP
  const lookupMiss = new Guard({ max: 15, windowMs: 15 * 60e3, lockMs: 15 * 60e3, maxLockMs: 864e5 });   // look-ups that found nothing (guessing)
  const submitWin = new Window({ max: 20, windowMs: 10 * 60e3 });
  const otpIp = new Window({ max: 10, windowMs: 3600e3 });
  const otpAcct = new Window({ max: 5, windowMs: 3600e3 });
  const otpBad = new Guard({ max: 10, windowMs: 15 * 60e3, lockMs: 15 * 60e3, maxLockMs: 864e5 });
  const limit = win => (req, res, next) => { const w = win.hit(req.ip); if (w) return tooMany(res, w); next(); };
  const limitPub = limit(pubWin);
  // maintenance mode (Root User → সিস্টেম → রক্ষণাবেক্ষণ): 503 for everyone kept out (server/lib/rootops.js)
  api.use(rootops.maintenanceGuard(state));

  /** Health check for monitors and the reverse proxy: 200 when the database answers, 503 otherwise. */
  api.get('/health', wrap(async (req, res) => {
    let db = 'ok';
    try { await Promise.race([store.ping(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))]); } catch (e) { db = 'down'; }
    const last = backup.listBackups()[0];
    res.status(db === 'ok' && !health.stopping ? 200 : 503).json({ ok: db === 'ok' && !health.stopping, server: 'dhee', db, driver: store.name, setup: state.users().length > 0, uptime: Math.round(process.uptime()), stopping: !!health.stopping, lastBackup: last ? last.createdAt : null, time: new Date().toISOString() });
  }));

  /** Boot payload: the user's view of the state when signed in, the public subset otherwise. */
  api.get('/state', (req, res) => {
    const setup = state.users().length === 0;
    const u = req.user;
    // maintenance: whoever is kept out receives only names, logo and colours for the maintenance page
    const maint = setup ? null : rootops.maintenanceInfo(state, u ? u.id : null), out = maint && (maint.blockedSystem || (maint.blockedSite && !u));
    const body = { server: 'dhee', version: 3, setup, userId: u ? u.id : null, mustChange: !!(u && u.mustChange), revs: state.revs(), maintenance: maint, about: rootops.about(),
      stats: setup || out ? null : pub.publicStats(state),   // counts for the homepage "একনজরে প্রতিষ্ঠান" (no records)
      state: setup ? null : out ? rootops.maintenanceView(state) : (u ? (u.mustChange ? state.minimalView(u.id) : state.viewFor(u.id)) : pub.publicView(state)) };
    res.type('json').send(JSON.stringify(body));
  });

  /** Changed keys only (logged-in pull for multi-tab freshness). */
  api.get('/state/revs', auth.requireUser, (req, res) => res.json({ revs: state.revs() }));
  api.post('/state/pull', auth.requireUser, auth.requireFreshPassword, (req, res) => {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.slice(0, 300).map(String) : [];
    res.type('json').send(JSON.stringify({ revs: state.revs(), state: state.viewKeys(req.user.id, keys) }));
  });

  /** First run: create the institution and its Root User (only while no user exists). */
  api.post('/setup', limitPub, wrap(auth.setup));

  /** Save changed top-level keys. Body: { changes: { key: value }, deletes: [key], revs: { key: baseRev } }. */
  api.put('/state', auth.requireUser, auth.requireFreshPassword, wrap(async (req, res) => {
    if (!state.users().length) return res.status(409).json({ error: 'setup_required' });
    const { changes, deletes, revs, as } = req.body || {};
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return res.status(400).json({ error: 'bad_request' });
    // A save is a diff against the view the browser loaded. If that view belonged to another account (sign-in changed
    // without reloading), applying it would turn everything outside that narrower view into deletions — refuse it.
    if (as !== undefined && as !== req.user.id) return res.status(409).json({ error: 'view_mismatch' });
    const ctx = state.context(req.user.id);
    if (!ctx.staff && +req.headers['content-length'] > config.userJsonMaxMb * 1048576) return res.status(413).json({ error: 'too_large' });
    const r = await state.applyClient(changes, Array.isArray(deletes) ? deletes : [], req.user.id, { revs: revs && typeof revs === 'object' ? revs : {}, ip: req.ip });
    res.json({ ok: true, ...r });
  }));

  /* --- auth --- */
  api.post('/login', limitPub, wrap(auth.login));
  api.post('/logout', wrap(auth.logout));
  api.get('/session', (req, res) => res.json({ userId: req.user ? req.user.id : null, mustChange: !!(req.user && req.user.mustChange) }));
  api.post('/password', auth.requireUser, wrap(auth.changePassword));
  api.post('/users/:id/password', auth.requireUser, auth.requireFreshPassword, wrap(auth.resetPassword));

  /* --- public flows --- */
  api.post('/public/lookup', limitPub, limit(lookupWin), (req, res) => {
    if (!state.users().length) return res.json({});
    const wait = lookupMiss.locked(req.ip); if (wait) return tooMany(res, wait);
    const r = pub.lookup(state, req.body || {}, auth.ensurePubId(req, res));
    // nothing found: count it — many misses in a row look like someone guessing roll/registration numbers
    const miss = r.found === false || r.ok === false || (r.hydrate && !Object.values(r.hydrate).some(v => Array.isArray(v) && v.length));
    if (miss) { const lock = lookupMiss.fail(req.ip); if (lock) { log.warn('[public] look-ups locked', { ip: req.ip, seconds: lock }); return tooMany(res, lock); } }
    res.status(r.error ? 400 : 200).json(r);
  });
  /** Public result views (class list / school summary / merit list) — only those switched on, only their allowed fields. */
  api.post('/public/results', limitPub, limit(lookupWin), (req, res) => { const r = pub.resultBoard(state, req.body || {}); res.status(r.status).json(r.body); });
  api.post('/public/submit', limitPub, limit(submitWin), wrap(async (req, res) => {
    if (!state.users().length) return res.status(409).json({ error: 'setup_required' });
    const r = await pub.submit(state, req.body || {}, { pubId: auth.ensurePubId(req, res), ip: req.ip });
    if (r.rejected.length) log.warn(`[public] rejected: ${r.rejected.join(', ')}`);
    const { pwNew, ...rest } = r;
    if (pwNew && pwNew.length) admin.notifyOffice(pwNew).catch(e => log.warn('[pwdesk] notify failed', e.message));
    res.json({ ok: true, ...rest });
  }));
  /** Status of a password-help request (public reset page): request id + mobile number. */
  api.post('/public/pwstatus', limitPub, limit(lookupWin), (req, res) => {
    const wait = lookupMiss.locked(req.ip); if (wait) return tooMany(res, wait);
    const r = admin.pwStatus(req.body || {});
    if (!r.found) { const lock = lookupMiss.fail(req.ip); if (lock) return tooMany(res, lock); }
    res.json(r);
  });
  const acct = id => asciiDigits(String(id || '')).trim().toLowerCase().slice(0, 120);
  api.post('/public/otp/request', limitPub, wrap(async (req, res) => {
    const w = otpIp.hit(req.ip) || otpAcct.hit(acct(req.body?.id)); if (w) return tooMany(res, w);
    res.json(await pub.otpRequest(state, req.body || {}, { ip: req.ip }));
  }));
  api.post('/public/otp/verify', limitPub, wrap(async (req, res) => {
    const k = acct(req.body?.id), wait = Math.max(otpBad.locked(req.ip), otpBad.locked(`a:${k}`)); if (wait) return tooMany(res, wait);
    const r = await pub.otpVerify(state, req.body || {}, { ip: req.ip });
    if (r.ok) { await store.deleteUserSessions(r.userId, ''); otpBad.success(`a:${k}`); }
    else if (r.reason === 'wrong' || r.reason === 'expired') { const l = Math.max(otpBad.fail(req.ip), otpBad.fail(`a:${k}`)); if (l) return tooMany(res, l); }
    res.json({ ok: r.ok, reason: r.reason, message: r.message });
  }));

  /* --- backups (Root User only) --- */
  const rootOnly = (req, res, next) => (req.user && state.isRoot(req.user.id) ? next() : res.status(403).json({ error: 'forbidden' }));
  api.get('/admin/backups', auth.requireUser, auth.requireFreshPassword, rootOnly, (req, res) => {
    res.json({ dir: config.backupDir, keepDays: config.backupKeepDays, auto: config.backupAuto, hour: config.backupHour, driver: store.name, backups: backup.listBackups() });
  });
  let backupRunning = false;
  api.post('/admin/backups', auth.requireUser, auth.requireFreshPassword, rootOnly, wrap(async (req, res) => {
    if (backupRunning) return res.status(409).json({ error: 'busy' });
    backupRunning = true;
    try {
      await state.drain();
      const b = await backup.createBackup(store, { kind: 'manual', log });
      backup.pruneBackups(config.backupDir, config.backupKeepDays, log);
      const u = state.user(req.user.id);
      await state.mutate(get => ({ audit: pub.appendAudit(get('audit'), { role: 'SYSTEM', action: 'DB_BACKUP', entity: 'system', detail: `সার্ভারে ব্যাকআপ নেওয়া হয়েছে: ${b.name} (${(b.size / 1048576).toFixed(2)} MB) · ${u ? u.username : ''}` }, req.ip, req.user.id) }), req.user.id);
      res.json({ ok: true, backup: { name: b.name, size: b.size, createdAt: new Date().toISOString() } });
    } finally { backupRunning = false; }
  }));
  api.get('/admin/backups/:name', auth.requireUser, auth.requireFreshPassword, rootOnly, (req, res) => {
    const f = backup.backupPath(req.params.name);
    if (!f) return res.status(404).json({ error: 'not_found' });
    log.info('[backup] downloaded', { name: req.params.name, user: req.user.id, ip: req.ip });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(f)}"`);
    res.setHeader('Content-Length', fs.statSync(f).size);
    fs.createReadStream(f).pipe(res);
  });

  /* --- Root User: recycle bin, demo data / start afresh (server/admin.js) --- */
  const R = [auth.requireUser, auth.requireFreshPassword, rootOnly];
  api.get('/admin/bin', ...R, wrap(admin.list));
  api.post('/admin/bin/empty', ...R, wrap(admin.empty));
  api.post('/admin/bin/settings', ...R, wrap(admin.settings));
  api.post('/admin/bin/batch/restore', ...R, wrap(admin.restoreBatch));
  api.get('/admin/bin/:id', ...R, admin.one);
  api.post('/admin/bin/:id/restore', ...R, wrap(admin.restore));
  api.post('/admin/bin/:id/purge', ...R, wrap(admin.purge));
  api.get('/admin/demo', ...R, admin.demoInfo);
  api.post('/admin/demo/load', ...R, wrap(admin.loadDemo));
  api.post('/admin/demo/reset', ...R, wrap(admin.resetAll));

  /* --- online tests: start, save, submit and grade on the server (server/quiz.js) --- */
  const quiz = makeQuiz(state, log), qWin = new Window({ max: 600, windowMs: 10 * 60e3 });
  const QZ = [auth.requireUser, auth.requireFreshPassword, limit(qWin)], send = (res, r) => res.status(r.status).json(r.body);
  api.post('/quiz/:id/start', ...QZ, wrap(async (req, res) => send(res, await quiz.start(req.user.id, String(req.params.id), String(req.body?.studentId || '')))));
  api.post('/quiz/attempt/:aid/save', ...QZ, wrap(async (req, res) => send(res, await quiz.answer(req.user.id, String(req.params.aid), req.body?.answers, false))));
  api.post('/quiz/attempt/:aid/submit', ...QZ, wrap(async (req, res) => send(res, await quiz.answer(req.user.id, String(req.params.aid), req.body?.answers, true))));
  api.post('/quiz/:id/review', ...QZ, (req, res) => send(res, quiz.review(req.user.id, String(req.params.id), String(req.body?.studentId || ''))));
  api.post('/quiz/:id/results', ...QZ, wrap(async (req, res) => send(res, await quiz.results(req.user.id, String(req.params.id), req.body?.regrade === true))));

  /* --- result re-check applications (server/recheck.js) --- */
  const recheck = makeRecheck(state);
  api.post('/recheck/apply', auth.requireUser, auth.requireFreshPassword, limit(submitWin), wrap(async (req, res) => send(res, await recheck.apply(req.user.id, req.body, req.ip))));

  /* --- student's guardians: edit / link / create / unlink / primary (server/guardian.js) --- */
  const guardian = require('./guardian')(state), GD = [auth.requireUser, auth.requireFreshPassword, limit(new Window({ max: 300, windowMs: 10 * 60e3 }))];
  api.post('/guardian/save', ...GD, wrap(async (req, res) => send(res, await guardian.save(req.user.id, req.body, req.ip))));
  api.post('/guardian/unlink', ...GD, wrap(async (req, res) => send(res, await guardian.unlink(req.user.id, req.body, req.ip))));
  api.post('/guardian/primary', ...GD, wrap(async (req, res) => send(res, await guardian.primary(req.user.id, req.body, req.ip))));
  api.get('/lookup/users', auth.requireUser, (req, res) => send(res, guardian.lookupUsers(req.user.id, req.query.q)));
  api.get('/lookup/students', auth.requireUser, (req, res) => send(res, guardian.lookupStudents(req.user.id, req.query.q)));
  ['info', 'relation', 'replace', 'remove'].forEach(a => api.post(`/guardian/${a}`, ...GD, wrap(async (req, res) => send(res, await guardian[a](req.user.id, req.body, req.ip)))));

  /* --- payments confirmed on the server (server/pay.js) --- */
  const feesDesk = (req, res, next) => (pay.canVerify(state, req.user.id) ? next() : res.status(403).json({ error: 'forbidden' }));
  api.post('/pay/claims/:id/verify', auth.requireUser, auth.requireFreshPassword, feesDesk, wrap(async (req, res) => { const r = await pay.verifyClaim(state, req.params.id, { uid: req.user.id, ip: req.ip }); res.status(r.ok ? 200 : r.error === 'not_found' ? 404 : 409).json(r); }));
  api.post('/pay/claims/:id/reject', auth.requireUser, auth.requireFreshPassword, feesDesk, wrap(async (req, res) => { const r = await pay.rejectClaim(state, req.params.id, { uid: req.user.id, ip: req.ip, reason: req.body?.reason }); res.status(r.ok ? 200 : r.error === 'not_found' ? 404 : 409).json(r); }));
  api.get('/pay/config', auth.requireUser, (req, res) => res.json({ online: pay.gatewayReady(state) }));
  api.post('/pay/checkout', auth.requireUser, auth.requireFreshPassword, limit(submitWin), wrap(async (req, res) => {
    const b = req.body || {}, origin = `${req.protocol}://${req.get('host')}`;
    const r = await pay.checkout(state, { uid: req.user.id, studentId: String(b.studentId || ''), invoiceIds: b.invoiceIds, method: String(b.method || 'Card').slice(0, 20), origin, portal: b.portal });
    res.status(r.ok ? 200 : r.error === 'forbidden' ? 403 : r.error === 'not_configured' ? 503 : 409).json(r);
  }));
  api.get('/pay/status/:ref', auth.requireUser, (req, res) => { const r = pay.intentStatus(state, req.params.ref, req.user.id); res.status(r ? 200 : 404).json(r || { error: 'not_found' }); });
  api.post('/pay/webhook', limitPub, wrap(async (req, res) => { const r = await pay.webhook(state, req.rawBody || Buffer.from(JSON.stringify(req.body || {})), req.headers, { ip: req.ip, log }); res.status(r.status).json(r.body); }));

  /* --- developer information, own profile, maintenance mode, website reset (server/lib/rootops.js) --- */
  api.get('/about', (req, res) => res.json(rootops.about()));
  // Licence: Root User only (never in the public /about)
  api.get('/admin/license', auth.requireUser, rootOnly, (req, res) => res.json({ license: rootops.licenseInfo() }));
  const audit = (req, action, detail) => get => ({ audit: pub.appendAudit(get('audit'), { role: 'SYSTEM', action, entity: 'system', detail }, req.ip, req.user.id) });
  /** Own name (Bangla/English), mobile and e-mail: the Root User and roles that may edit users/system. */
  api.post('/me/profile', auth.requireUser, auth.requireFreshPassword, wrap(async (req, res) => {
    const ctx = state.context(req.user.id);
    if (!ctx.root && !ctx.perm('system', 'edit') && !ctx.perm('users', 'edit')) return res.status(403).json({ error: 'forbidden' });
    const b = req.body || {}, str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const name = str(b.name, 120), nameBn = str(b.nameBn, 120), email = str(b.email, 120).toLowerCase(), phone = asciiDigits(str(b.phone, 20)).replace(/[\s-]/g, '').replace(/^\+?88/, '');
    if (!name || !/^01[3-9]\d{8}$/.test(phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error: 'bad_request' });
    let user = null;
    await state.mutate(get => {
      const users = (get('users') || []).map(u => (u && u.id === req.user.id ? (user = { ...u, name, nameBn, phone, email }) : u));
      return user ? { users, ...audit(req, 'PROFILE_UPDATE', `${user.username} নিজের নাম, মোবাইল ও ই-মেইল হালনাগাদ করেছেন`)(get) } : {};
    }, req.user.id);
    if (!user) return res.status(404).json({ error: 'not_found' });
    const { pwHash: _, demoKey: __, ...safe } = user;
    res.json({ ok: true, user: safe });
  }));
  /** Maintenance: { site, system, message, until } — Root User only. */
  api.post('/admin/maintenance', auth.requireUser, auth.requireFreshPassword, rootOnly, wrap(async (req, res) => {
    const c = rootops.cleanMaintenance(req.body, req.user.id); if (c.error) return res.status(400).json({ error: c.error });
    const v = c.value, what = v.system ? 'সম্পূর্ণ সিস্টেম' : v.site ? 'পাবলিক ওয়েবসাইট' : '';
    await state.mutate(get => ({ maintenance: v, ...audit(req, 'MAINTENANCE', what ? `রক্ষণাবেক্ষণ মোড চালু: ${what}${v.until ? ` (শেষ ${v.until})` : ''}` : 'রক্ষণাবেক্ষণ মোড বন্ধ')(get) }), req.user.id);
    log.info('[maintenance]', { site: v.site, system: v.system, until: v.until, user: req.user.id });
    res.json({ ok: true, maintenance: v, info: rootops.maintenanceInfo(state, req.user.id) });
  }));
  /** Website design back to the defaults, after a server backup. Body: { confirm: 'ওয়েবসাইট রিসেট' }. */
  api.post('/admin/site-reset', auth.requireUser, auth.requireFreshPassword, rootOnly, wrap(async (req, res) => {
    if (String(req.body?.confirm || '').trim() !== 'ওয়েবসাইট রিসেট') return res.status(400).json({ error: 'confirm_required' });
    await state.drain();
    const b = await backup.createBackup(store, { kind: 'presite', log });
    const put = rootops.siteReset(state);
    await state.mutate(get => ({ ...put, ...audit(req, 'SITE_RESET', `ওয়েবসাইটের ডিজাইন (থিম, হিরো, হোমপেজ, মেনু, পৃষ্ঠা ও ফুটার) ডিফল্টে ফেরানো হয়েছে · আগের ব্যাকআপ: ${b.name}`)(get) }), req.user.id);
    log.warn('[site-reset]', { user: req.user.id, backup: b.name });
    res.json({ ok: true, backup: b.name, keys: Object.keys(put) });
  }));

  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  return api;
}

module.exports = { makeApi };
