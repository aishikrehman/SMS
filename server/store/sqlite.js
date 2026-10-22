/* SQLite driver — Node's built-in node:sqlite (DatabaseSync). No native compile step.
   Implements the store interface documented in ./index.js. All methods are async so the
   PostgreSQL driver can share the same interface. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
function loadSqlite() {
  if (DatabaseSync) return DatabaseSync;
  // node:sqlite prints an ExperimentalWarning on some Node versions; silence just that one.
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...rest) { if (String(w && w.message || w).includes('SQLite')) return; return emit.call(process, w, ...rest); };
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = emit; }
  return DatabaseSync;
}

const now = () => new Date().toISOString();

class SqliteStore {
  constructor({ path: file }) { this.name = 'sqlite'; this.file = file; this.db = null; }

  async init() {
    const Db = loadSqlite();
    if (this.file !== ':memory:') fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new Db(this.file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    this.db.exec(fs.readFileSync(path.join(__dirname, 'sqlite.sql'), 'utf8'));
    const p = sql => this.db.prepare(sql);
    this.q = {
      all: p('SELECT key, value, rev, updated_at, updated_by FROM app_state ORDER BY key'),
      one: p('SELECT key, value, rev, updated_at, updated_by FROM app_state WHERE key = ?'),
      revs: p('SELECT key, rev FROM app_state'),
      count: p('SELECT COUNT(*) AS n FROM app_state'),
      upsert: p(`INSERT INTO app_state (key, value, rev, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, rev = app_state.rev + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by
                 RETURNING rev`),
      putRaw: p(`INSERT INTO app_state (key, value, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at, updated_by = excluded.updated_by`),
      del: p('DELETE FROM app_state WHERE key = ?'),
      wipe: p('DELETE FROM app_state'),
      sNew: p('INSERT INTO app_sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)'),
      sGet: p('SELECT id, user_id, created_at, expires_at FROM app_sessions WHERE id = ?'),
      sTouch: p('UPDATE app_sessions SET expires_at = ? WHERE id = ?'),
      sDel: p('DELETE FROM app_sessions WHERE id = ?'),
      sDelUser: p('DELETE FROM app_sessions WHERE user_id = ? AND id <> ?'),
      sPurge: p('DELETE FROM app_sessions WHERE expires_at < ?'),
      sWipe: p('DELETE FROM app_sessions'),
      mGet: p('SELECT value FROM app_meta WHERE key = ?'),
      mSet: p(`INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
      mWipe: p('DELETE FROM app_meta'),
    };
    return this;
  }

  async close() { if (this.db) { this.db.close(); this.db = null; } }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { try { this.db.exec('ROLLBACK'); } catch (_) { } throw e; }
  }

  row(r) { return { key: r.key, value: JSON.parse(r.value), rev: r.rev, updatedAt: r.updated_at, updatedBy: r.updated_by }; }

  /* ---------- state rows ---------- */
  async count() { return this.q.count.get().n; }
  async getAll() { return this.q.all.all().map(r => this.row(r)); }
  async getKeys(keys) { return keys.map(k => this.q.one.get(k)).filter(Boolean).map(r => this.row(r)); }
  async revs() { const o = {}; for (const r of this.q.revs.all()) o[r.key] = r.rev; return o; }

  /** Upsert (value !== undefined) or delete (value === undefined) several keys in one transaction. Returns {key: rev|null}. */
  async putKeys(map, by = null) {
    const ts = now();
    return this.tx(() => {
      const out = {};
      for (const [k, v] of Object.entries(map)) {
        if (v === undefined) { this.q.del.run(k); out[k] = null; continue; }
        out[k] = this.q.upsert.get(k, JSON.stringify(v), ts, by).rev;
      }
      return out;
    });
  }

  /** First-run seed: write every key only while the table is empty. Returns true when written. */
  async bootstrap(map, by = null) {
    const ts = now();
    return this.tx(() => {
      if (this.q.count.get().n > 0) return false;
      for (const [k, v] of Object.entries(map)) if (v !== undefined) this.q.putRaw.run(k, JSON.stringify(v), 1, ts, by);
      return true;
    });
  }

  /** Copy rows as they are (used by migrate and by "both" mode catch-up). */
  async putRows(rows) {
    return this.tx(() => { for (const r of rows) this.q.putRaw.run(r.key, JSON.stringify(r.value), r.rev || 1, r.updatedAt || now(), r.updatedBy || null); return rows.length; });
  }

  async wipe() { this.tx(() => { this.q.wipe.run(); this.q.sWipe.run(); this.q.mWipe.run(); }); }

  /* ---------- sessions ---------- */
  async createSession(s) { this.q.sNew.run(s.id, s.userId, s.createdAt, s.expiresAt, s.ip || null, s.userAgent || null); }
  async getSession(id) { const r = this.q.sGet.get(id); return r ? { id: r.id, userId: r.user_id, createdAt: r.created_at, expiresAt: r.expires_at } : null; }
  async touchSession(id, expiresAt) { this.q.sTouch.run(expiresAt, id); }
  async deleteSession(id) { this.q.sDel.run(id); }
  async deleteUserSessions(userId, exceptId = '') { this.q.sDelUser.run(userId, exceptId); }
  async purgeSessions(before = now()) { this.q.sPurge.run(before); }

  /* ---------- server meta (small JSON values: schema version, bootstrap info …) ---------- */
  async getMeta(key) { const r = this.q.mGet.get(key); return r ? JSON.parse(r.value) : null; }
  async setMeta(key, value) { this.q.mSet.run(key, JSON.stringify(value), now()); }
  async allMeta() { return this.db.prepare('SELECT key, value FROM app_meta').all().map(r => ({ key: r.key, value: JSON.parse(r.value) })); }

  /* ---------- health & backup ---------- */
  async ping() { this.q.count.get(); return true; }
  /** Consistent copy of the whole database file (VACUUM INTO works while the server keeps writing). */
  async backupTo(file) { this.db.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`); }
}

module.exports = SqliteStore;
