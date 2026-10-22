/* PostgreSQL driver — uses the optional `pg` package (npm install pulls it in as an optionalDependency).
   Same interface as ./sqlite.js. Values are stored as JSONB. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const now = () => new Date().toISOString();
const iso = v => (v instanceof Date ? v.toISOString() : v);

class PostgresStore {
  constructor({ url, ssl }) { this.name = 'postgres'; this.url = url; this.ssl = ssl; this.pool = null; }

  async init() {
    if (!this.url) throw new Error('DATABASE_URL is not set (needed for DB_DRIVER=postgres or both).');
    let pg;
    try { pg = require('pg'); } catch (e) { throw new Error('The "pg" package is not installed. Run: npm install pg'); }
    this.pool = new pg.Pool({ connectionString: this.url, ssl: this.ssl ? { rejectUnauthorized: false } : undefined, max: 10 });
    await this.pool.query(fs.readFileSync(path.join(__dirname, 'postgres.sql'), 'utf8'));
    return this;
  }

  async close() { if (this.pool) { await this.pool.end(); this.pool = null; } }

  async tx(fn) {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
    catch (e) { try { await c.query('ROLLBACK'); } catch (_) { } throw e; }
    finally { c.release(); }
  }

  row(r) { return { key: r.key, value: r.value, rev: r.rev, updatedAt: iso(r.updated_at), updatedBy: r.updated_by }; }

  /* ---------- state rows ---------- */
  async count() { const r = await this.pool.query('SELECT COUNT(*)::int AS n FROM app_state'); return r.rows[0].n; }
  async getAll() { const r = await this.pool.query('SELECT key, value, rev, updated_at, updated_by FROM app_state ORDER BY key'); return r.rows.map(x => this.row(x)); }
  async getKeys(keys) {
    if (!keys.length) return [];
    const r = await this.pool.query('SELECT key, value, rev, updated_at, updated_by FROM app_state WHERE key = ANY($1::text[])', [keys]);
    return r.rows.map(x => this.row(x));
  }
  async revs() { const r = await this.pool.query('SELECT key, rev FROM app_state'); const o = {}; for (const x of r.rows) o[x.key] = x.rev; return o; }

  async putKeys(map, by = null) {
    const ts = now();
    return this.tx(async c => {
      const out = {};
      for (const [k, v] of Object.entries(map)) {
        if (v === undefined) { await c.query('DELETE FROM app_state WHERE key = $1', [k]); out[k] = null; continue; }
        const r = await c.query(`INSERT INTO app_state (key, value, rev, updated_at, updated_by) VALUES ($1, $2::jsonb, 1, $3, $4)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, rev = app_state.rev + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
          RETURNING rev`, [k, JSON.stringify(v), ts, by]);
        out[k] = r.rows[0].rev;
      }
      return out;
    });
  }

  async bootstrap(map, by = null) {
    const ts = now();
    return this.tx(async c => {
      await c.query('LOCK TABLE app_state IN EXCLUSIVE MODE');
      const n = (await c.query('SELECT COUNT(*)::int AS n FROM app_state')).rows[0].n;
      if (n > 0) return false;
      for (const [k, v] of Object.entries(map)) if (v !== undefined) await c.query('INSERT INTO app_state (key, value, rev, updated_at, updated_by) VALUES ($1, $2::jsonb, 1, $3, $4)', [k, JSON.stringify(v), ts, by]);
      return true;
    });
  }

  async putRows(rows) {
    return this.tx(async c => {
      for (const r of rows) await c.query(`INSERT INTO app_state (key, value, rev, updated_at, updated_by) VALUES ($1, $2::jsonb, $3, $4, $5)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, rev = EXCLUDED.rev, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        [r.key, JSON.stringify(r.value), r.rev || 1, r.updatedAt || now(), r.updatedBy || null]);
      return rows.length;
    });
  }

  async wipe() { await this.tx(async c => { await c.query('DELETE FROM app_state'); await c.query('DELETE FROM app_sessions'); await c.query('DELETE FROM app_meta'); }); }

  /* ---------- sessions ---------- */
  async createSession(s) { await this.pool.query('INSERT INTO app_sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6)', [s.id, s.userId, s.createdAt, s.expiresAt, s.ip || null, s.userAgent || null]); }
  async getSession(id) {
    const r = await this.pool.query('SELECT id, user_id, created_at, expires_at FROM app_sessions WHERE id = $1', [id]);
    const x = r.rows[0]; return x ? { id: x.id, userId: x.user_id, createdAt: iso(x.created_at), expiresAt: iso(x.expires_at) } : null;
  }
  async touchSession(id, expiresAt) { await this.pool.query('UPDATE app_sessions SET expires_at = $1 WHERE id = $2', [expiresAt, id]); }
  async deleteSession(id) { await this.pool.query('DELETE FROM app_sessions WHERE id = $1', [id]); }
  async deleteUserSessions(userId, exceptId = '') { await this.pool.query('DELETE FROM app_sessions WHERE user_id = $1 AND id <> $2', [userId, exceptId]); }
  async purgeSessions(before = now()) { await this.pool.query('DELETE FROM app_sessions WHERE expires_at < $1', [before]); }

  /* ---------- server meta ---------- */
  async getMeta(key) { const r = await this.pool.query('SELECT value FROM app_meta WHERE key = $1', [key]); return r.rows[0] ? r.rows[0].value : null; }
  async allMeta() { const r = await this.pool.query('SELECT key, value FROM app_meta'); return r.rows.map(x => ({ key: x.key, value: x.value })); }
  async ping() { await this.pool.query('SELECT 1'); return true; }
  async setMeta(key, value) {
    await this.pool.query('INSERT INTO app_meta (key, value, updated_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at', [key, JSON.stringify(value), now()]);
  }
}

module.exports = PostgresStore;
