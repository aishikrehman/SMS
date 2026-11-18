/* MySQL / MariaDB driver — uses the `mysql2` package (promise API, connection pool).
   Same interface as ./postgres.js (see ./index.js). Values are JSON text in LONGTEXT, utf8mb4 everywhere.

   Connection: MYSQL_URL (mysql://user:pass@host:3306/db) or MYSQL_HOST / MYSQL_PORT / MYSQL_USER /
   MYSQL_PASSWORD / MYSQL_DATABASE (see server/config.js). On init the database is created when it does
   not exist and the user may create it (CREATE DATABASE … utf8mb4); the tables come from mysql.sql.

   max_allowed_packet: one top-level key is written as one SQL statement, so the largest key must fit
   into the server's max_allowed_packet (MariaDB default 16 MB, MySQL 8 default 64 MB). The driver reads
   the value on init, warns when it is smaller than KEY_MAX_MB, and refuses an oversized key with a
   clear message instead of the server's "Got a packet bigger than 'max_allowed_packet'". Raise it in
   my.cnf / my.ini ([mysqld] max_allowed_packet=64M) or: SET GLOBAL max_allowed_packet = 67108864; */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const now = () => new Date().toISOString();
const MB = n => (n / 1048576).toFixed(1);
const HELP = 'MySQL/MariaDB-র সংযোগ তথ্য দেওয়া নেই। .env-এ MYSQL_URL দিন, যেমন MYSQL_URL=mysql://dhee:পাসওয়ার্ড@localhost:3306/dhee\n'
  + 'No MySQL/MariaDB connection is configured. Set MYSQL_URL in .env, e.g. MYSQL_URL=mysql://dhee:secret@localhost:3306/dhee\n'
  + '(or MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE). See DEPLOY.md.';

/** Turn MYSQL_URL or the separate fields into mysql2 options. */
function connOptions(c = {}) {
  let o;
  if (c.url) {
    let u;
    try { u = new URL(c.url); } catch (_) { throw new Error('MYSQL_URL is not a valid URL (expected mysql://user:pass@host:3306/db)'); }
    if (!/^(mysql|mariadb):$/.test(u.protocol)) throw new Error('MYSQL_URL must start with mysql:// (or mariadb://)');
    o = {
      host: u.hostname || 'localhost', port: +u.port || 3306,
      user: decodeURIComponent(u.username || ''), password: decodeURIComponent(u.password || ''),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      ssl: /^(1|true|required)$/i.test(u.searchParams.get('ssl') || '') ? { rejectUnauthorized: false } : undefined,
    };
  } else if (c.host || c.database || c.user) {
    o = { host: c.host || 'localhost', port: +c.port || 3306, user: c.user || '', password: c.password || '', database: c.database || '' };
  } else {
    const e = new Error(HELP); e.code = 'DHEE_NO_MYSQL_CONFIG'; throw e;
  }
  if (c.socket) o.socketPath = c.socket;
  if (c.ssl) o.ssl = { rejectUnauthorized: false };
  if (!o.database) throw new Error('No MySQL database name: put it in MYSQL_URL (…:3306/dhee) or MYSQL_DATABASE.');
  if (!/^[A-Za-z0-9_$-]{1,64}$/.test(o.database)) throw new Error(`MySQL database name "${o.database}" may only contain letters, digits, _ $ -`);
  return o;
}

class MysqlStore {
  constructor(conf = {}) { this.name = 'mysql'; this.conf = conf; this.pool = null; this.maxPacket = 0; this.log = conf.log || console; }

  async init() {
    let mysql;
    try { mysql = require('mysql2/promise'); } catch (e) { throw new Error('The "mysql2" package is not installed. Run: npm install mysql2'); }
    const o = connOptions(this.conf);
    const base = { ...o, charset: 'utf8mb4_unicode_ci', supportBigNumbers: true, dateStrings: true, connectTimeout: 15000 };
    // 1) create the database when missing (needs CREATE privilege; ignored when the user lacks it)
    let c;
    try { c = await mysql.createConnection({ ...base, database: undefined }); }
    catch (e) { throw new Error(`Cannot connect to MySQL/MariaDB at ${o.socketPath || `${o.host}:${o.port}`} as "${o.user}": ${e.message}`); }
    try {
      await c.query(`CREATE DATABASE IF NOT EXISTS \`${o.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (e) {
      if (![1044, 1045, 1227, 1142].includes(e.errno)) throw e;           // no permission: the DB must already exist
    } finally { await c.end().catch(() => { }); }
    // 2) pool + tables
    this.pool = mysql.createPool({ ...base, connectionLimit: 10, waitForConnections: true, enableKeepAlive: true });
    try { await this.pool.query('SELECT 1'); }
    catch (e) { await this.close(); throw new Error(`Cannot open MySQL database "${o.database}": ${e.message}${e.errno === 1049 ? ' — create it first (see DEPLOY.md) or give the user CREATE permission.' : ''}`); }
    const ddl = fs.readFileSync(path.join(__dirname, 'mysql.sql'), 'utf8').split(/;\s*$/m).map(s => s.trim()).filter(s => s.replace(/--.*$/gm, '').trim());
    for (const s of ddl) await this.pool.query(s);
    const [[v]] = await this.pool.query('SELECT @@max_allowed_packet AS p, VERSION() AS v');
    this.maxPacket = +v.p || 0; this.version = v.v;
    const want = (this.conf.keyMaxMb || 25) * 1048576 * 1.05;
    if (this.maxPacket && this.maxPacket < want) (this.log.warn || this.log.log).call(this.log, `[store] mysql: max_allowed_packet is ${MB(this.maxPacket)} MB, smaller than KEY_MAX_MB (${this.conf.keyMaxMb || 25} MB). A larger key will be refused. Raise it: [mysqld] max_allowed_packet=64M (my.cnf / my.ini) — see DEPLOY.md.`);
    return this;
  }

  async close() { if (this.pool) { const p = this.pool; this.pool = null; await p.end(); } }

  async tx(fn) {
    const c = await this.pool.getConnection();
    try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
    catch (e) { try { await c.rollback(); } catch (_) { } throw explain(e); }
    finally { c.release(); }
  }

  /** JSON text of one value, refused with a clear message when it cannot fit into max_allowed_packet. */
  json(key, v) {
    const s = JSON.stringify(v);
    if (this.maxPacket) {
      const bytes = Buffer.byteLength(s, 'utf8');
      if (bytes + 4096 > this.maxPacket) {
        const e = new Error(`Key "${key}" is ${MB(bytes)} MB, larger than the MySQL/MariaDB max_allowed_packet (${MB(this.maxPacket)} MB). Raise max_allowed_packet (e.g. 64M or 128M) in my.cnf / my.ini and restart the database — see DEPLOY.md.`);
        e.code = 'DHEE_PACKET_TOO_LARGE'; throw e;
      }
    }
    return s;
  }

  row(r) { return { key: r.key, value: JSON.parse(r.value), rev: r.rev, updatedAt: r.updated_at, updatedBy: r.updated_by }; }

  /* ---------- state rows ---------- */
  async count() { const [r] = await this.pool.query('SELECT COUNT(*) AS n FROM app_state'); return Number(r[0].n); }
  async getAll() { const [r] = await this.pool.query('SELECT `key`, value, rev, updated_at, updated_by FROM app_state ORDER BY `key`'); return r.map(x => this.row(x)); }
  async getKeys(keys) {
    if (!keys.length) return [];
    const [r] = await this.pool.query('SELECT `key`, value, rev, updated_at, updated_by FROM app_state WHERE `key` IN (?)', [keys]);
    const by = new Map(r.map(x => [x.key, x]));
    return keys.map(k => by.get(k)).filter(Boolean).map(x => this.row(x));
  }
  async revs() { const [r] = await this.pool.query('SELECT `key`, rev FROM app_state'); const o = {}; for (const x of r) o[x.key] = x.rev; return o; }

  /** Upsert (value !== undefined) or delete (value === undefined) several keys in one transaction. Returns {key: rev|null}. */
  async putKeys(map, by = null) {
    const ts = now();
    const vals = Object.entries(map).map(([k, v]) => [k, v === undefined ? undefined : this.json(k, v)]);   // size check before the transaction
    return this.tx(async c => {
      const out = {};
      for (const [k, s] of vals) {
        if (s === undefined) { await c.query('DELETE FROM app_state WHERE `key` = ?', [k]); out[k] = null; continue; }
        await c.query(`INSERT INTO app_state (\`key\`, value, rev, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value), rev = rev + 1, updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`, [k, s, ts, by]);
        const [r] = await c.query('SELECT rev FROM app_state WHERE `key` = ?', [k]);
        out[k] = r[0].rev;
      }
      return out;
    });
  }

  /** First-run seed: write every key only while the table is empty. Returns true when written. */
  async bootstrap(map, by = null) {
    const ts = now();
    const vals = Object.entries(map).filter(([, v]) => v !== undefined).map(([k, v]) => [k, this.json(k, v)]);
    return this.tx(async c => {
      const [r] = await c.query('SELECT COUNT(*) AS n FROM app_state FOR UPDATE');      // next-key lock: blocks a concurrent bootstrap
      if (Number(r[0].n) > 0) return false;
      for (const [k, s] of vals) await c.query('INSERT INTO app_state (`key`, value, rev, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)', [k, s, ts, by]);
      return true;
    });
  }

  /** Copy rows as they are (used by migrate, restore and by "both" mode catch-up). */
  async putRows(rows) {
    const vals = rows.map(r => [r.key, this.json(r.key, r.value), r.rev || 1, r.updatedAt || now(), r.updatedBy || null]);
    return this.tx(async c => {
      for (const v of vals) await c.query(`INSERT INTO app_state (\`key\`, value, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value), rev = VALUES(rev), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`, v);
      return rows.length;
    });
  }

  async wipe() { await this.tx(async c => { await c.query('DELETE FROM app_state'); await c.query('DELETE FROM app_sessions'); await c.query('DELETE FROM app_meta'); }); }

  /* ---------- sessions ---------- */
  async createSession(s) { await this.pool.query('INSERT INTO app_sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [s.id, s.userId, s.createdAt, s.expiresAt, s.ip || null, s.userAgent || null]); }
  async getSession(id) {
    const [r] = await this.pool.query('SELECT id, user_id, created_at, expires_at FROM app_sessions WHERE id = ?', [id]);
    const x = r[0]; return x ? { id: x.id, userId: x.user_id, createdAt: x.created_at, expiresAt: x.expires_at } : null;
  }
  async touchSession(id, expiresAt) { await this.pool.query('UPDATE app_sessions SET expires_at = ? WHERE id = ?', [expiresAt, id]); }
  async deleteSession(id) { await this.pool.query('DELETE FROM app_sessions WHERE id = ?', [id]); }
  async deleteUserSessions(userId, exceptId = '') { await this.pool.query('DELETE FROM app_sessions WHERE user_id = ? AND id <> ?', [userId, exceptId]); }
  async purgeSessions(before = now()) { await this.pool.query('DELETE FROM app_sessions WHERE expires_at < ?', [before]); }

  /* ---------- server meta ---------- */
  async getMeta(key) { const [r] = await this.pool.query('SELECT value FROM app_meta WHERE `key` = ?', [key]); return r[0] ? JSON.parse(r[0].value) : null; }
  async setMeta(key, value) {
    await this.pool.query('INSERT INTO app_meta (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)', [key, this.json(key, value), now()]);
  }
  async allMeta() { const [r] = await this.pool.query('SELECT `key`, value FROM app_meta'); return r.map(x => ({ key: x.key, value: JSON.parse(x.value) })); }

  /* ---------- health ---------- */
  async ping() { await this.pool.query('SELECT 1'); return true; }
}

/** Replace the server's packet error with an actionable one. */
function explain(e) {
  if (e && (e.errno === 1153 || e.code === 'ER_NET_PACKET_TOO_LARGE' || /max_allowed_packet/i.test(e.message || ''))) {
    const x = new Error(`MySQL/MariaDB refused the write: the data is larger than max_allowed_packet. Raise max_allowed_packet (e.g. 64M) in my.cnf / my.ini and restart the database — see DEPLOY.md. (${e.message})`);
    x.code = 'DHEE_PACKET_TOO_LARGE'; return x;
  }
  return e;
}

module.exports = MysqlStore;
module.exports.connOptions = connOptions;
module.exports.HELP = HELP;
