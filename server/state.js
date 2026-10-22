/* State service: an in-memory cache of the key-value store plus the rules for what may be read
   and written. One Node process owns the cache (run a single instance; see README).

   Reads   viewFor(uid)        → the state as that user's roles allow (server/access.js)
   Writes  applyClient(…)      → every changed key is merged record by record (server/merge.js):
                                  only operations the user's role allows are applied, and a record
                                  someone else changed since the browser's revision is not overwritten
                                  (optimistic concurrency, `revs` sent by the browser).

   Secrets that never leave the server:  users[].pwHash, the whole `otps` collection.
   Server-owned keys (client writes are ignored): otps.
   Password hashes (scrypt) are made only on the server and change only through the auth
   endpoints, with two narrow exceptions that mirror the browser code: a brand-new account may
   arrive with its initial temporary password (pwHash = "plain:<password>", hashed here, never
   stored as sent; the account must change it at first sign-in), and the one-time login-ID policy
   (LoginPolicy in js/modules/people.js) may set the standard student (registration no.) /
   guardian (mobile no.) password. */
'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { asciiDigits, hash } = require('./lib/hash');
const { hashPassword } = require('./lib/password');
const access = require('./access');
const { mergeKey, fingerprints } = require('./merge');
const bin = require('./bin');
const PLAIN = 'plain:';

/* otps: secrets · recycleBin: deleted records (Root User API only) · payIntents: online checkouts (server/pay.js)
   · maintenance: maintenance mode (POST /api/admin/maintenance, server/lib/rootops.js) */
const SERVER_OWNED = new Set(['otps', bin.KEY, 'payIntents', 'maintenance', 'quizAttempts']);   // quizAttempts: server/quiz.js
const KEY_RE = /^[A-Za-z_$][\w$]{0,63}$/;
/* Keys no client may delete. */
const PROTECTED = new Set(['audit', 'meta', 'school', 'students', 'teachers', 'invoices', 'payments', 'journal', 'marks', 'attendance', 'admissions', 'outbox', 'users', 'userRoles']);
/* Merged first: later rules check against them (a payment before the invoices it pays, …). */
const ORDER = ['users', 'userRoles', 'students', 'payments', 'payClaims', 'serviceRequests', 'invoices', 'journal'];
const HISTORY = 20;          // revisions per key whose record fingerprints are kept for merging

/** The audit log is append-only: keep every stored entry and add the client's new ones, re-chained.
    New entries carry the signed-in user and the real client IP (set by the server, not the browser). */
function mergeAudit(incoming, stored, { uid = null, roles = [], ip = '' } = {}) {
  const list = Array.isArray(stored) ? stored.slice() : [];
  if (!Array.isArray(incoming)) return list;
  const sig = e => `${e.ts}|${e.action}|${e.detail}`;   // entries are recognised by content, not by chain position
  const known = new Set(list.map(e => e && sig(e)));
  let n = 0;
  for (const e of incoming) {
    if (!e || typeof e !== 'object' || known.has(sig(e))) continue;
    if (++n > 200) break;
    const prev = list[list.length - 1];
    const role = roles.includes(e.role) || (e.role === 'SYSTEM' && uid) ? e.role : (roles[0] || 'PUBLIC');
    const ts = typeof e.ts === 'string' && Math.abs(Date.parse(e.ts) - Date.now()) < 864e5 ? e.ts : new Date().toISOString();
    const x = { seq: (prev ? prev.seq : 0) + 1, ts, userId: uid ?? e.userId ?? null, role: String(role).slice(0, 40), action: String(e.action || '').slice(0, 60), entity: String(e.entity || '').slice(0, 60), detail: String(e.detail || '').slice(0, 2000), ip: String(ip || e.ip || '').slice(0, 60), prevHash: prev ? prev.hash : '0'.repeat(14) };
    x.hash = hash(JSON.stringify([x.seq, x.ts, x.userId, x.role, x.action, x.entity, x.detail, x.ip, x.prevHash]));
    list.push(x); known.add(sig(e));
  }
  return list;
}

class State {
  constructor(store, log = console) { this.store = store; this.log = log; this.map = new Map(); this.hist = new Map(); this._q = Promise.resolve(); this.pending = 0; this.secret = 'dhee'; }

  async load() {
    const rows = await this.store.getAll();
    this.map = new Map(rows.map(r => [r.key, { value: r.value, rev: r.rev }]));
    this.hist = new Map();
    try {
      let s = await this.store.getMeta('pseudoSecret');
      if (!s) { s = crypto.randomBytes(24).toString('base64url'); await this.store.setMeta('pseudoSecret', s); }
      this.secret = s;
    } catch (_) { }
    return this;
  }
  /** Serialise writes so the cache and the database never disagree. */
  lock(fn) { this.pending++; const p = this._q.then(fn, fn).finally(() => { this.pending--; }); this._q = p.catch(() => { }); return p; }
  /** Resolves when every queued write has reached the database (graceful shutdown). */
  drain() { return this._q; }

  empty() { return this.map.size === 0; }
  get(k) { const e = this.map.get(k); return e ? e.value : undefined; }
  rev(k) { const e = this.map.get(k); return e ? e.rev : 0; }
  keys() { return [...this.map.keys()]; }
  revs() { const o = {}; for (const [k, e] of this.map) o[k] = e.rev; return o; }

  /** Write a set of keys to the store and the cache, remembering record fingerprints of the replaced revision. */
  async commit(put, by) {
    for (const k of Object.keys(put)) {
      const e = this.map.get(k); if (!e) continue;
      const h = this.hist.get(k) || new Map();
      if (!h.has(e.rev)) { h.set(e.rev, fingerprints(k, e.value)); while (h.size > HISTORY) h.delete(h.keys().next().value); }
      this.hist.set(k, h);
    }
    const revs = await this.store.putKeys(put, by);
    for (const [k, v] of Object.entries(put)) { if (v === undefined) this.map.delete(k); else this.map.set(k, { value: v, rev: revs[k] }); }
    return revs;
  }

  /* ---------- lookups used by auth & public endpoints (ports of the browser helpers) ---------- */
  users() { return this.get('users') || []; }
  user(id) { return this.users().find(u => u.id === id) || null; }
  roles(uid) { return (this.get('userRoles') || []).filter(r => r.userId === uid).map(r => r.role); }
  students() { return this.get('students') || []; }
  student(id) { return this.students().find(s => s.id === id) || null; }
  pureGuardian(u) { const r = this.roles(u.id); return r.length === 1 && r[0] === 'GUARDIAN'; }
  /** People.findLogin: username, Student ID, registration number or (guardian) mobile number. */
  findLogin(id) {
    const k = asciiDigits(String(id || '')).trim().toLowerCase(); if (!k) return null;
    const us = this.users();
    const byName = us.find(u => String(u.username || '').toLowerCase() === k); if (byName) return byName;
    const st = this.students().find(x => String(x.regNo).toLowerCase() === k || String(x.id).toLowerCase() === k);
    if (st) return this.user(st.userId);
    return us.find(u => u.phone === k && this.roles(u.id).includes('GUARDIAN') && this.pureGuardian(u)) || null;
  }
  /** Recover.find: login lookup, then e-mail. */
  findAccount(id) {
    const k = asciiDigits(String(id || '')).trim().toLowerCase();
    return this.findLogin(k) || this.users().find(u => String(u.email || '').toLowerCase() === k) || null;
  }
  /** Root User / Principal, or any role whose RBAC grants system:edit. */
  privileged(uid) {
    const roles = this.roles(uid), rbac = this.get('rbac') || {};
    return roles.some(r => r === 'ADMIN' || r === 'SUPERADMIN' || r === 'PRINCIPAL' || rbac[r]?.system?.edit === true);
  }
  isRoot(uid) { return this.roles(uid).some(r => r === 'ADMIN' || r === 'SUPERADMIN'); }
  /** Must this account replace its password before using the app? (office reset / new account, or the
      "force change" login setting for standard passwords) */
  mustChange(u) { return !!u && (u.mustChange === true || (u.pwDefault === true && (this.get('config') || {}).login?.forceChange === true)); }

  /* ---------- what the browser receives ---------- */
  context(uid) { return access.buildContext(this, uid, this.secret); }
  viewFor(uid) { return access.viewFor(this, this.context(uid)); }
  /** Only some keys (pull). */
  viewKeys(uid, keys) { const ctx = this.context(uid), out = {}; for (const k of keys) if (this.map.has(k)) out[k] = access.viewKey(this, ctx, k); return out; }
  /** Before the forced password change: the public part plus the user's own account. */
  minimalView(uid) {
    const pub = require('./public').publicView(this);
    const u = this.user(uid);
    if (u) { const { pwHash: _, demoKey: __, ...me } = u; pub.users = [...(pub.users || []).filter(x => x.id !== uid), me]; pub.userRoles = [...(pub.userRoles || []).filter(r => r.userId !== uid), ...(this.get('userRoles') || []).filter(r => r.userId === uid)]; }
    return pub;
  }

  /* ---------- writes ---------- */
  /**
   * Apply a signed-in client's changes.
   *   changes { key: value } · deletes [key] · revs { key: rev the browser started from } · ip
   * Returns { revs, ignored: [key], conflicts: [key], stale: [key], rejected: [key] }:
   *   ignored    keys with parts the user's role may not change (the rest was applied)
   *   conflicts  keys with records someone else changed meanwhile (the newer server copy was kept)
   *   stale      keys whose server value now differs from what the browser sent (it should reload them)
   *   rejected   keys refused as a whole (too large, bad name)
   */
  async applyClient(changes, deletes, uid, { revs = {}, ip = '' } = {}) {
    return this.lock(async () => {
      const ctx = this.context(uid);
      const put = {}, ignored = [], conflicts = [], stale = [], rejected = [], merged = {}, binned = [];
      const me = this.user(uid), who = { uid, name: me ? (me.username || me.name || '') : '', ip }, batch = 'B' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
      const pending = k => (k in merged ? merged[k] : this.get(k));
      const maxBytes = config.keyMaxMb * 1048576;
      const keys = Object.keys(changes || {}).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

      for (const k of keys) {
        const v = changes[k];
        if (!KEY_RE.test(k) || SERVER_OWNED.has(k)) { rejected.push(k); continue; }
        if (JSON.stringify(v).length > maxBytes) { rejected.push(k); continue; }
        const stored = this.get(k);
        if (k === 'audit') { const a = mergeAudit(v, stored, { uid, roles: ctx.roles, ip }); if (a.length !== (stored || []).length) { put[k] = a; merged[k] = a; } stale.push(k); continue; }
        if (k === 'meta') { const m = this.mergeMeta(v, stored, ctx); if (m) { put[k] = m; merged[k] = m; } if (JSON.stringify(access.viewKey(this, ctx, k, m || stored)) !== JSON.stringify(v)) stale.push(k); continue; }
        if (stored === undefined) {
          // a key the server does not have yet (a module's seeder in this browser): staff may create it
          if (ctx.staff && (ctx.root || ctx.privileged || (!access.GUARDED.has(k) && ctx.perm(access.moduleOf(k), 'edit')))) { put[k] = v; merged[k] = v; }
          else if (ctx.staff) ignored.push(k);         // learners' and teachers' browsers fill such keys locally; not worth a warning
          continue;
        }
        const rules = k === 'outbox' ? access.outboxRules(ctx) : access.rulesFor(this, ctx, k, pending);
        const shown = access.viewKey(this, ctx, k, stored);
        if (!rules) {
          if (JSON.stringify(shown) !== JSON.stringify(v)) { if (!lazyDefaults(shown, v)) ignored.push(k); stale.push(k); }
          continue;
        }
        const clientRev = revs[k];
        const sameRev = clientRev === undefined || clientRev === null || +clientRev === this.rev(k);
        const base = sameRev ? null : (this.hist.get(k)?.get(+clientRev) || null);
        const r = mergeKey(k, stored, v, { rules, base, sameRev });
        if (r.ignored) ignored.push(k);
        if (r.conflicts) conflicts.push(k);
        let value = r.value;
        if (r.changed && k === 'users') value = await this.fixUsers(value, stored, ctx);
        if (r.changed && k === 'outbox' && Array.isArray(value) && value.length > 500) value = value.slice(0, 500);
        if (r.changed) { put[k] = value; merged[k] = value; const gone = bin.removed(k, stored, value); if (gone.length) binned.push(...bin.entries(gone, k, who, batch)); }
        if (r.ignored || r.conflicts || JSON.stringify(access.viewKey(this, ctx, k, value)) !== JSON.stringify(v)) stale.push(k);
      }
      for (const k of deletes || []) {
        // only privileged users may drop a whole collection, and never the core ones
        if (!ctx.privileged || !KEY_RE.test(k) || SERVER_OWNED.has(k) || access.GUARDED.has(k) || PROTECTED.has(k) || !this.map.has(k)) { ignored.push(k); continue; }
        put[k] = undefined;
        binned.push(...bin.entries([{ kind: 'key', recId: k, record: this.get(k) }], k, who, batch));
      }
      // every removed record goes to the recycle bin (server/bin.js)
      if (binned.length) put[bin.KEY] = bin.add(this.get(bin.KEY), binned);
      const out = { revs: {}, ignored: [...new Set(ignored)], conflicts, stale: [...new Set(stale)], rejected };
      if (Object.keys(put).length) out.revs = await this.commit(put, uid);
      if (ignored.length || conflicts.length || rejected.length) this.log.warn(`[state] save by ${uid}: ignored ${out.ignored.join(',') || '-'} · conflicts ${conflicts.join(',') || '-'} · rejected ${rejected.join(',') || '-'}`);
      return out;
    });
  }

  /** meta: everyone may advance the id counter (never move it back); other fields only staff with settings:edit. */
  mergeMeta(incoming, stored, ctx) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return null;
    const cur = stored || {}, seq = +cur.seq || 1000;
    const next = ctx.staff && (ctx.root || ctx.perm('settings', 'edit') || ctx.perm('fees', 'edit')) ? { ...cur, ...incoming } : { ...cur };
    next.seq = Math.max(seq, Math.min(+incoming.seq || 0, seq + 5000));
    for (const k of ['version', 'setupAt', 'seededAt']) if (cur[k] !== undefined) next[k] = cur[k];
    return JSON.stringify(next) === JSON.stringify(cur) ? null : next;
  }

  /** Users from the browser never carry trusted password hashes: keep the stored ones, hash a new account's
      first temporary password, and honour the one-time standard login password (LoginPolicy). */
  async fixUsers(list, stored, ctx) {
    const byId = new Map((stored || []).map(u => [u.id, u]));
    return Promise.all(list.map(async u => {
      if (!u || typeof u !== 'object') return u;
      const old = byId.get(u.id);
      if (old === u) return u;                                 // untouched server copy
      const out = { ...u }, plain = typeof u.pwHash === 'string' && u.pwHash.startsWith(PLAIN) ? u.pwHash.slice(PLAIN.length) : null;
      delete out.pwHash;
      if (!old) {                                             // new account: its initial temporary password, to be changed at first sign-in
        if (plain && ctx.privileged) { out.pwHash = await hashPassword(plain); out.mustChange = true; }
        return out;
      }
      if (old.mustChange !== undefined && !ctx.root) out.mustChange = old.mustChange; else if (old.mustChange === undefined) delete out.mustChange;
      // one-time standard login ID / password (LoginPolicy.apply)
      // (an issued standard password is one-time too: it must be changed at the first sign-in)
      if (plain && ctx.privileged && !old.loginPolicy && u.loginPolicy === 'v1' && plain === this.policyPassword(u)) { out.pwHash = await hashPassword(plain); out.mustChange = true; return out; }
      if (old.pwHash !== undefined) out.pwHash = old.pwHash;
      return out;
    }));
  }
  /** The password LoginPolicy.apply gives: student → registration no.; guardian → mobile number. */
  policyPassword(u) {
    const st = this.students().find(s => s.userId === u.id);
    if (st && st.regNo && u.username === st.id) return String(st.regNo);
    if (u.phone && u.username === u.phone) return String(u.phone);
    return null;
  }

  /** Server-side change of a few keys (auth endpoints, public submissions). fn(get) returns { key: newValue }. */
  async mutate(fn, by = 'SERVER') {
    return this.lock(async () => {
      const put = await fn(k => this.get(k));
      if (!put || !Object.keys(put).length) return {};
      return this.commit(put, by);
    });
  }

  /** Replace the whole state (demo load / start afresh): keys not in `obj` are deleted. Revisions keep counting up. */
  async replaceAll(obj, by = 'SERVER') {
    return this.lock(async () => {
      const put = { ...obj };
      for (const k of this.map.keys()) if (!(k in put)) put[k] = undefined;
      const revs = await this.commit(put, by);
      this.hist = new Map();
      return revs;
    });
  }

  /** First-run setup: write a new institution, only while no user exists. Returns false if one does. */
  async setup(stateObj, by = 'SETUP') {
    return this.lock(async () => {
      if (this.users().length) return false;
      const ok = this.map.size ? (await this.store.putKeys(stateObj, by), true) : await this.store.bootstrap(stateObj, by);
      await this.load();
      return ok && this.users().length > 0;
    });
  }
}

/** Only properties were added that the browser fills in on first use (lazy defaults): not worth a warning. */
function lazyDefaults(shown, sent) {
  if (!shown || !sent || typeof shown !== 'object' || typeof sent !== 'object' || Array.isArray(shown) !== Array.isArray(sent)) return false;
  if (Array.isArray(shown)) return false;
  for (const k of Object.keys(shown)) if (!(k in sent)) return false;
  for (const k of Object.keys(sent)) if (k in shown && JSON.stringify(shown[k]) !== JSON.stringify(sent[k]) && !lazyDefaults(shown[k], sent[k])) return false;
  return true;
}

function stripUsers(users) {
  if (!Array.isArray(users)) return users;
  return users.map(u => { if (!u || typeof u !== 'object' || !('pwHash' in u)) return u; const { pwHash: _, ...rest } = u; return rest; });
}

module.exports = { State, stripUsers, KEY_RE, mergeAudit };
