/* Store factory — picks the driver from DB_DRIVER.

   DB_DRIVER=sqlite    (default) SQLite file at SQLITE_PATH (default data/dhee.sqlite)
   DB_DRIVER=postgres  PostgreSQL at DATABASE_URL
   DB_DRIVER=both      writes go to both; reads come from DB_PRIMARY (default sqlite).
                       A failed write to the secondary is logged, never fatal.

   Store interface (every method is async):
     init() / close()
     count()                         → number of state rows
     getAll()                        → [{ key, value, rev, updatedAt, updatedBy }]
     getKeys([key])                  → same, for the given keys
     revs()                          → { key: rev }
     putKeys({ key: value }, by)     → { key: newRev }   (value === undefined deletes the key)
     bootstrap({ key: value }, by)   → true when written (only while the table is empty)
     putRows(rows)                   → copy rows verbatim (migrate / catch-up)
     wipe()                          → delete every row (state, sessions, meta)
     createSession / getSession / touchSession / deleteSession / deleteUserSessions / purgeSessions
     getMeta(key) / setMeta(key, value) / allMeta()
     ping()                          → true when the database answers (health check)
     backupTo(file)                  (SQLite only) consistent copy of the database file
*/
'use strict';
const config = require('../config');
const SqliteStore = require('./sqlite');
const PostgresStore = require('./postgres');

function make(name, opts = {}) {
  if (name === 'sqlite') return new SqliteStore({ path: opts.sqlitePath || config.sqlitePath });
  if (name === 'postgres') return new PostgresStore({ url: opts.databaseUrl || config.databaseUrl, ssl: opts.pgSsl ?? config.pgSsl });
  throw new Error(`Unknown store driver "${name}" (use sqlite or postgres)`);
}

/** Writes go to both stores; reads come from the primary. */
class BothStore {
  constructor(primary, secondary, log = console) { this.name = `both(${primary.name}+${secondary.name})`; this.p = primary; this.s = secondary; this.log = log; }
  async init() {
    await this.p.init();
    try { await this.s.init(); this.sOk = true; } catch (e) { this.sOk = false; this.log.error(`[store] secondary ${this.s.name} unavailable: ${e.message}`); }
    // Catch-up: an empty secondary gets a copy of the primary on start.
    if (this.sOk) {
      try {
        const [np, ns] = [await this.p.count(), await this.s.count()];
        if (np > 0 && ns === 0) { const rows = await this.p.getAll(); await this.s.putRows(rows); this.log.log(`[store] copied ${rows.length} rows ${this.p.name} → ${this.s.name}`); }
      } catch (e) { this.log.error(`[store] catch-up copy failed: ${e.message}`); }
    }
    return this;
  }
  async close() { await this.p.close(); try { await this.s.close(); } catch (_) { } }
  async second(what, fn) {
    if (!this.sOk) return;
    try { await fn(this.s); } catch (e) { this.log.error(`[store] secondary ${this.s.name} ${what} failed: ${e.message}`); }
  }
  count() { return this.p.count(); }
  getAll() { return this.p.getAll(); }
  getKeys(k) { return this.p.getKeys(k); }
  revs() { return this.p.revs(); }
  async putKeys(map, by) {
    const out = await this.p.putKeys(map, by);
    // keep the secondary's revision numbers identical to the primary's
    await this.second('write', async s => { const rows = []; const dels = {}; for (const [k, v] of Object.entries(map)) { if (v === undefined) dels[k] = undefined; else rows.push({ key: k, value: v, rev: out[k], updatedAt: new Date().toISOString(), updatedBy: by }); } if (rows.length) await s.putRows(rows); if (Object.keys(dels).length) await s.putKeys(dels, by); });
    return out;
  }
  async bootstrap(map, by) { const ok = await this.p.bootstrap(map, by); if (ok) await this.second('bootstrap', s => s.bootstrap(map, by)); return ok; }
  async putRows(rows) { const n = await this.p.putRows(rows); await this.second('copy', s => s.putRows(rows)); return n; }
  async wipe() { await this.p.wipe(); await this.second('wipe', s => s.wipe()); }
  async createSession(x) { await this.p.createSession(x); await this.second('session', s => s.createSession(x)); }
  getSession(id) { return this.p.getSession(id); }
  async touchSession(id, e) { await this.p.touchSession(id, e); await this.second('session', s => s.touchSession(id, e)); }
  async deleteSession(id) { await this.p.deleteSession(id); await this.second('session', s => s.deleteSession(id)); }
  async deleteUserSessions(u, x) { await this.p.deleteUserSessions(u, x); await this.second('session', s => s.deleteUserSessions(u, x)); }
  async purgeSessions(b) { await this.p.purgeSessions(b); await this.second('session', s => s.purgeSessions(b)); }
  getMeta(k) { return this.p.getMeta(k); }
  async setMeta(k, v) { await this.p.setMeta(k, v); await this.second('meta', s => s.setMeta(k, v)); }
  allMeta() { return this.p.allMeta(); }
  ping() { return this.p.ping(); }
  /** Backups come from the primary store (see server/backup.js). */
  get primary() { return this.p; }
}

/** Build the store selected by the environment (or by explicit options, used by migrate). */
function createStore(opts = {}) {
  const driver = String(opts.driver || config.driver).toLowerCase();
  if (driver === 'both') {
    const primary = String(opts.primary || config.primary).toLowerCase();
    const secondary = primary === 'sqlite' ? 'postgres' : 'sqlite';
    return new BothStore(make(primary, opts), make(secondary, opts), opts.log || console);
  }
  return make(driver, opts);
}

module.exports = { createStore, make };
