/* Sessions and passwords.
   · Opaque random session token in an httpOnly cookie; only its SHA-256 is stored (app_sessions).
   · Login follows the browser's rules (People.findLogin): username, Student ID, registration
     number, or a guardian's mobile number. Passwords are scrypt hashes (lib/password.js).
   · Password hashes change only here (own change, Root User reset, first-run setup) and in the
     OTP recovery (public.js). */
'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { hashPassword, verifyPassword, weakness } = require('./lib/password');
const { appendAudit } = require('./public');
const { institutionDefaults } = require('./defaults');
const { Guard, tooMany } = require('./lib/ratelimit');
const { asciiDigits } = require('./lib/hash');

const COOKIE = 'dhee_sid';
const PUB_COOKIE = 'dhee_pub';
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i < 0) continue; const k = part.slice(0, i).trim(); try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { } }
  return out;
}
function setCookie(req, res, name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${config.cookieSameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (config.cookieSecure === true || (config.cookieSecure === 'auto' && req.secure)) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  const prev = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

/* --- failed sign-ins: per account (LOGIN_MAX_PER_ACCOUNT failures → 1 min lock, doubling up to LOCK_MINUTES)
       and per IP address (LOGIN_MAX_PER_IP failures in 15 min → LOCK_MINUTES lock, doubling up to a day) --- */
const acctGuard = new Guard({ max: config.loginMaxPerAccount, windowMs: 15 * 60e3, lockMs: 60e3, maxLockMs: config.lockMinutes * 60e3 });
const ipGuard = new Guard({ max: config.loginMaxPerIp, windowMs: 15 * 60e3, lockMs: config.lockMinutes * 60e3, maxLockMs: 864e5 });
const acctKey = id => `acct:${asciiDigits(String(id || '')).trim().toLowerCase()}`;

/* An office-issued temporary password: a simple 6-digit number (easy to read out or send by SMS).
   It is one-time only — the account must change it at the next sign-in (mustChange), and the
   strength rule (lib/password.js weakness) applies only to the password the user then chooses. */
const tempPassword = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
/** Student / guardian sign-in switched off by the institution (featureFlags.studentAccounts / guardianAccounts === false). */
function accountsOff(state, u) {
  const f = state.get('featureFlags') || {}, roles = state.roles(u.id);
  if (!roles.length || roles.some(r => r !== 'STUDENT' && r !== 'GUARDIAN')) return false;
  return roles.every(r => (r === 'STUDENT' ? f.studentAccounts === false : f.guardianAccounts === false));
}

function makeAuth(state, store, log = console) {
  const ttl = config.sessionTtlHours * 3600e3;                 // absolute lifetime from sign-in
  const idle = Math.min(config.sessionIdleMinutes * 60e3, ttl);  // ends after this long without a request
  const nextExpiry = createdAt => new Date(Math.min(Date.now() + idle, Date.parse(createdAt) + ttl)).toISOString();

  /** Express middleware: req.user = { id, mustChange } when the cookie holds a live session. */
  async function session(req, res, next) {
    try {
      const c = parseCookies(req);
      req.pubId = c[PUB_COOKIE] && /^[A-Za-z0-9_-]{16,64}$/.test(c[PUB_COOKIE]) ? c[PUB_COOKIE] : null;
      const tok = c[COOKIE];
      if (tok) {
        const s = await store.getSession(sha(tok));
        const u = s && state.user(s.userId);
        const now = Date.now();
        if (s && Date.parse(s.expiresAt) > now && Date.parse(s.createdAt) + ttl > now && u && u.active !== false && !accountsOff(state, u)) {
          req.user = { id: s.userId, mustChange: state.mustChange(u) }; req.sessionId = s.id;
          // idle expiry slides forward, written at most once a minute
          const nx = nextExpiry(s.createdAt);
          if (Date.parse(nx) - Date.parse(s.expiresAt) > 60e3) await store.touchSession(s.id, nx);
        } else { if (s) await store.deleteSession(s.id); setCookie(req, res, COOKIE, '', { maxAge: 0 }); }
      }
      next();
    } catch (e) { next(e); }
  }
  function requireUser(req, res, next) { if (!req.user) return res.status(401).json({ error: 'login_required' }); next(); }
  /** A temporary password (issued by the office) must be replaced before anything else is allowed. */
  function requireFreshPassword(req, res, next) { if (req.user && req.user.mustChange) return res.status(403).json({ error: 'password_change_required' }); next(); }
  function ensurePubId(req, res) {
    if (!req.pubId) { req.pubId = crypto.randomBytes(18).toString('base64url'); setCookie(req, res, PUB_COOKIE, req.pubId, { maxAge: 86400 }); }
    return req.pubId;
  }

  async function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url'), now = new Date();
    await store.createSession({ id: sha(token), userId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + idle).toISOString(), ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 200) });
    setCookie(req, res, COOKIE, token, { maxAge: ttl / 1000 });
  }

  const audit = (req, action, detail, user) => state.mutate(get => ({ audit: appendAudit(get('audit'), { role: user ? 'SYSTEM' : 'PUBLIC', action, entity: 'session', detail }, req.ip, user || null) }), user || 'PUBLIC');

  /** POST /api/login { username, password } */
  async function login(req, res) {
    const b = req.body || {}, id = String(b.username || '').slice(0, 120), pw = String(b.password || '').slice(0, 512);
    if (!id || !pw) return res.status(400).json({ error: 'missing' });
    const ak = acctKey(id), wait = Math.max(ipGuard.locked(req.ip), acctGuard.locked(ak));
    if (wait) return tooMany(res, wait);
    const u = state.findLogin(id);
    const ok = await verifyPassword(pw, u && u.pwHash);   // runs the same work for unknown users
    if (!u || !ok) {
      const lockA = acctGuard.fail(ak), lockI = ipGuard.fail(req.ip);
      await audit(req, 'LOGIN_FAILED', `"${id.slice(0, 60)}"-এর লগইনের চেষ্টা ব্যর্থ${lockA || lockI ? ` · ${Math.ceil(Math.max(lockA, lockI) / 60)} মিনিটের জন্য আটকানো হয়েছে` : ''}`);
      if (lockA || lockI) { log.warn('[auth] sign-in locked', { account: id.slice(0, 60), ip: req.ip, seconds: Math.max(lockA, lockI) }); return tooMany(res, Math.max(lockA, lockI)); }
      return res.status(401).json({ error: 'invalid' });
    }
    if (u.active === false || accountsOff(state, u)) return res.status(403).json({ error: 'inactive' });
    acctGuard.success(ak);
    if (req.sessionId) await store.deleteSession(req.sessionId);
    await startSession(req, res, u.id);
    res.json({ ok: true, userId: u.id, mustChange: state.mustChange(u) });
  }

  async function logout(req, res) {
    if (req.sessionId) await store.deleteSession(req.sessionId);
    setCookie(req, res, COOKIE, '', { maxAge: 0 });
    res.json({ ok: true });
  }

  /** POST /api/password { current, next } — the signed-in user's own password. */
  async function changePassword(req, res) {
    const { current = '', next = '' } = req.body || {};
    const u = state.user(req.user.id);
    if (!u || !(await verifyPassword(String(current), u.pwHash))) return res.status(400).json({ error: 'wrong_current' });
    if (next === current) return res.status(400).json({ error: 'same' });
    const weak = weakness(next, u.username); if (weak) return res.status(400).json({ error: 'weak', message: weak });
    const h = await hashPassword(next);
    await state.mutate(get => ({
      users: (get('users') || []).map(x => { if (x.id !== u.id) return x; const y = { ...x, pwHash: h, pwDefault: false, pwChangedAt: new Date().toISOString() }; delete y.mustChange; return y; }),
      audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'PASSWORD_CHANGED', entity: 'users', detail: `${u.username || u.id}: নিজের পাসওয়ার্ড বদলেছেন; অন্য সব সেশন বন্ধ` }, req.ip, u.id),
    }), u.id);
    await store.deleteUserSessions(u.id, req.sessionId || '');   // every other device is signed out
    res.json({ ok: true });
  }

  /** POST /api/users/:id/password — Root User (or a role with system:edit) issues a temporary password. */
  async function resetPassword(req, res) {
    const me = req.user.id, ctx = state.context(me);
    // Root User, or anyone given system: edit (role permission or a per-user override) — the IT office's পাসওয়ার্ড ডেস্ক
    if (!(ctx.root || (ctx.staff && ctx.perm('system', 'edit')))) return res.status(403).json({ error: 'forbidden' });
    const u = state.user(req.params.id);
    if (!u) return res.status(404).json({ error: 'not_found' });
    if (state.isRoot(u.id) && !state.isRoot(me)) return res.status(403).json({ error: 'forbidden' });   // only the Root User resets a Root User
    const temp = tempPassword(), h = await hashPassword(temp);
    // a temporary password must be replaced at the next sign-in (enforced by requireFreshPassword)
    await state.mutate(get => ({
      users: (get('users') || []).map(x => x.id === u.id ? { ...x, pwHash: h, pwDefault: true, mustChange: u.id !== me } : x),
      audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'PASSWORD_RESET', entity: 'users', detail: `${u.username || u.id}: অস্থায়ী পাসওয়ার্ড দেওয়া হয়েছে (প্রথম লগইনে বদলাতে হবে)` }, req.ip, me),
    }), me);
    await store.deleteUserSessions(u.id, u.id === me ? (req.sessionId || '') : '');
    res.json({ ok: true, temp });
  }

  /** POST /api/setup — first run only (no user exists): institution identity + the single Root User. */
  async function setup(req, res) {
    if (state.users().length) return res.status(409).json({ error: 'already_set_up' });
    const b = req.body || {}, s = b.school || {}, r = b.root || {};
    const str = (v, n = 120) => String(v ?? '').trim().slice(0, n);
    const school = { nameBn: str(s.nameBn), name: str(s.name), type: str(s.type, 60), eiin: str(s.eiin, 12) };
    const root = { name: str(r.name), nameBn: str(r.nameBn), username: str(r.username, 20).toLowerCase(), phone: str(r.phone, 14), email: str(r.email).toLowerCase(), password: String(r.password || '') };
    const bad = [];
    if (!school.nameBn) bad.push('nameBn'); if (!school.name) bad.push('name'); if (!school.type) bad.push('type');
    if (school.eiin && !/^\d{5,8}$/.test(school.eiin)) bad.push('eiin');
    if (!root.name) bad.push('rootName');
    if (!/^[a-z0-9_.]{3,20}$/.test(root.username)) bad.push('username');
    if (!/^01[3-9]\d{8}$/.test(root.phone)) bad.push('phone');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(root.email)) bad.push('email');
    const weak = weakness(root.password, root.username); if (weak) bad.push('password');
    if (bad.length) return res.status(400).json({ error: 'invalid', fields: bad, message: weak || undefined });

    const now = new Date(), st = institutionDefaults(school, now);
    const uid = 'U1001';
    st.users = [{ id: uid, name: root.name, nameBn: root.nameBn || root.name, username: root.username, email: root.email, phone: root.phone, pwHash: await hashPassword(root.password), pwDefault: false, loginPolicy: 'v1', active: true, createdAt: now.toISOString(), createdBy: null, photo: null }];
    st.userRoles = [{ userId: uid, role: 'ADMIN' }];
    st.meta.seq = 1001;
    st.audit = appendAudit([], { role: 'SYSTEM', action: 'SETUP', entity: 'system', detail: `প্রাথমিক সেটআপ সম্পন্ন: ${school.nameBn} · রুট ব্যবহারকারী ${root.username}` }, req.ip);
    const ok = await state.setup(st, 'SETUP');
    if (!ok) return res.status(409).json({ error: 'already_set_up' });
    await store.setMeta('setup', { at: now.toISOString(), ip: req.ip });
    log.log(`[setup] institution "${school.name}" created with Root User "${root.username}"`);
    await startSession(req, res, uid);
    res.json({ ok: true, userId: uid });
  }

  return { session, requireUser, requireFreshPassword, ensurePubId, startSession, login, logout, changePassword, resetPassword, setup };
}

module.exports = { makeAuth, parseCookies };
