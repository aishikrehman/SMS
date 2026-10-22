/* Backups.

     npm run backup                    one backup now (safe while the server runs)
     npm run restore -- <file>         see server/restore.js (refuses while the server runs)

   Files in BACKUP_DIR (default backups/):
     SQLite      dhee-YYYY-MM-DD.sqlite              (VACUUM INTO: a consistent, ready-to-open copy)
     PostgreSQL  dhee-YYYY-MM-DD.json.gz             (every app_state and app_meta row, gzip JSON)
   The daily backup has the date only; backups made on request add the time and "-manual", and the copy
   taken just before a restore adds "-prerestore". Files older than BACKUP_KEEP_DAYS (default 30) are
   deleted, but the newest three are always kept. In "both" mode the primary store is backed up.
   Sessions are never restored (everyone signs in again after a restore). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const config = require('./config');

const NAME_RE = /^dhee-\d{4}-\d{2}-\d{2}(?:-\d{6})?(?:-(?:manual|prerestore|cli|predemo|prereset|presite))?\.(?:sqlite|json\.gz)$/;
const z = n => String(n).padStart(2, '0');
const dayOf = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const timeOf = (d = new Date()) => `${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
const primaryOf = store => store.primary || store;

/** Make one backup. kind: 'daily' | 'manual' | 'prerestore' | 'cli'. Returns { name, size, file }. */
async function createBackup(store, { dir = config.backupDir, kind = 'manual', log = console } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const st = primaryOf(store), d = new Date(), sqlite = st.name === 'sqlite';
  const base = kind === 'daily' ? `dhee-${dayOf(d)}` : `dhee-${dayOf(d)}-${timeOf(d)}-${kind}`;
  const name = `${base}.${sqlite ? 'sqlite' : 'json.gz'}`, file = path.join(dir, name), tmp = `${file}.part`;
  fs.rmSync(tmp, { force: true });
  try {
    if (sqlite) {
      await st.backupTo(tmp);
      const n = countSqliteRows(tmp);            // verify: the copy opens and has the state table
      if (!n) throw new Error('backup copy has no state rows');
    } else {
      const rows = await st.getAll(), meta = await st.allMeta();
      const body = JSON.stringify({ format: 'dhee-backup', version: 1, driver: st.name, createdAt: d.toISOString(), rows, meta });
      fs.writeFileSync(tmp, zlib.gzipSync(body));
    }
    fs.renameSync(tmp, file);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  const size = fs.statSync(file).size;
  log.info ? log.info(`[backup] ${name} created (${(size / 1048576).toFixed(2)} MB)`) : log.log(`[backup] ${name} created`);
  return { name, size, file };
}

function openSqliteReadOnly(file) {
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...r) { if (String(w && w.message || w).includes('SQLite')) return; return emit.call(process, w, ...r); };
  try { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(file, { readOnly: true }); } finally { process.emitWarning = emit; }
}
function countSqliteRows(file) {
  const db = openSqliteReadOnly(file);
  try { return db.prepare('SELECT COUNT(*) AS n FROM app_state').get().n; } finally { db.close(); }
}

/** Read the rows of a backup file of either format → { rows, meta }. */
function readBackup(file) {
  if (/\.sqlite$/i.test(file)) {
    const db = openSqliteReadOnly(file);
    try {
      const rows = db.prepare('SELECT key, value, rev, updated_at, updated_by FROM app_state ORDER BY key').all()
        .map(r => ({ key: r.key, value: JSON.parse(r.value), rev: r.rev, updatedAt: r.updated_at, updatedBy: r.updated_by }));
      let meta = [];
      try { meta = db.prepare('SELECT key, value FROM app_meta').all().map(r => ({ key: r.key, value: JSON.parse(r.value) })); } catch (_) { }
      return { rows, meta };
    } finally { db.close(); }
  }
  if (/\.json\.gz$/i.test(file) || /\.json$/i.test(file)) {
    const raw = fs.readFileSync(file);
    const d = JSON.parse((/\.gz$/i.test(file) ? zlib.gunzipSync(raw) : raw).toString('utf8'));
    if (d.format !== 'dhee-backup' || !Array.isArray(d.rows)) throw new Error('not a Dhee SMS backup file');
    return { rows: d.rows, meta: Array.isArray(d.meta) ? d.meta : [] };
  }
  throw new Error('unknown backup format (expected .sqlite or .json.gz)');
}

function listBackups(dir = config.backupDir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => NAME_RE.test(n)); } catch (_) { return []; }
  return names.map(name => {
    const s = fs.statSync(path.join(dir, name));
    const kind = /-manual\./.test(name) ? 'manual' : /-prerestore\./.test(name) ? 'prerestore' : /-cli\./.test(name) ? 'cli' : /-predemo\./.test(name) ? 'predemo' : /-prereset\./.test(name) ? 'prereset' : 'daily';
    return { name, size: s.size, createdAt: s.mtime.toISOString(), kind };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete backups older than keepDays; the newest three always stay. */
function pruneBackups(dir = config.backupDir, keepDays = config.backupKeepDays, log = console) {
  const list = listBackups(dir), limit = Date.now() - keepDays * 864e5;
  let n = 0;
  list.slice(3).forEach(b => { if (Date.parse(b.createdAt) < limit) { fs.rmSync(path.join(dir, b.name), { force: true }); n++; } });
  if (n) (log.info || log.log).call(log, `[backup] ${n} old backup(s) deleted (older than ${keepDays} days)`);
  return n;
}

function backupPath(name, dir = config.backupDir) {
  if (!NAME_RE.test(String(name))) return null;
  const f = path.join(dir, name);
  return fs.existsSync(f) ? f : null;
}

/** Daily backup: checked every 30 minutes; runs once a day after BACKUP_HOUR (local time). */
function scheduleDaily(store, log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    const today = dayOf();
    if (new Date().getHours() < config.backupHour) return;
    if (listBackups().some(b => b.name.startsWith(`dhee-${today}.`))) return;
    running = true;
    try { await createBackup(store, { kind: 'daily', log }); pruneBackups(config.backupDir, config.backupKeepDays, log); }
    catch (e) { log.error(`[backup] daily backup failed: ${e.message}`); }
    finally { running = false; }
  };
  const first = setTimeout(tick, 60e3); first.unref();
  const t = setInterval(tick, 30 * 60e3); t.unref();
  return () => { clearTimeout(first); clearInterval(t); };
}

/* ---------- "is the server running?" (used by restore / reset) ---------- */
const pidFile = () => path.join(path.dirname(config.sqlitePath), 'dhee-server.pid');
function writePid() { try { fs.mkdirSync(path.dirname(pidFile()), { recursive: true }); fs.writeFileSync(pidFile(), JSON.stringify({ pid: process.pid, port: config.port, startedAt: new Date().toISOString() })); } catch (_) { } }
function removePid() { try { const d = JSON.parse(fs.readFileSync(pidFile(), 'utf8')); if (d.pid === process.pid) fs.rmSync(pidFile(), { force: true }); } catch (_) { } }
function runningServer() {
  try {
    const d = JSON.parse(fs.readFileSync(pidFile(), 'utf8'));
    if (!d.pid || d.pid === process.pid) return null;
    process.kill(d.pid, 0);                                    // throws when no such process
    return d;
  } catch (e) { return e && e.code === 'EPERM' ? { pid: '?' } : null; }
}

module.exports = { createBackup, readBackup, listBackups, pruneBackups, backupPath, scheduleDaily, writePid, removePid, runningServer, pidFile, NAME_RE };

/* CLI: npm run backup */
if (require.main === module) {
  (async () => {
    const { createStore } = require('./store');
    const store = createStore({ log: console });
    try {
      await store.init();
      if (!(await primaryOf(store).count())) { console.error('The database is empty — nothing to back up.'); process.exit(1); }
      const b = await createBackup(store, { kind: 'cli', log: console });
      pruneBackups(config.backupDir, config.backupKeepDays, console);
      console.log(`Backup written: ${b.file}`);
    } catch (e) { console.error(`Backup failed: ${e.message}`); process.exitCode = 1; }
    finally { await store.close().catch(() => { }); }
  })();
}
