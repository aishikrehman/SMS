/* Copy every state row into the configured database.

   পুরোনো SQLite ডেটা আনা (one-time import of an old Dhee SQLite file):
     npm run migrate -- --from-sqlite data/dhee.sqlite
       reads the file READ-ONLY (Node's built-in node:sqlite; the file is never changed) and writes it
       into the store configured by DB_DRIVER / MYSQL_URL (or DATABASE_URL for PostgreSQL).

   Between the two server databases:
     npm run migrate -- --from mysql --to postgres
     npm run migrate -- --from postgres --to mysql

   options: --to mysql|postgres  target for --from-sqlite (default DB_DRIVER; in "both" mode DB_PRIMARY)
            --mysql-url <mysql://user:pass@host:3306/db>   (default MYSQL_URL / MYSQL_*)
            --url <postgres-url>                           (default DATABASE_URL)
            --force           overwrite a target that already has data

   Rows keep their revision numbers; server meta is copied too. Sessions are not (users sign in again).
   Stop the server first. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { make, DRIVERS, describe } = require('./store');

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def; }

/** Read an old Dhee SQLite database read-only → { rows, meta }. */
function readSqlite(file) {
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...r) { if (String(w && w.message || w).includes('SQLite')) return; return emit.call(process, w, ...r); };
  let db;
  try { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(file, { readOnly: true }); } finally { process.emitWarning = emit; }
  try {
    let rows;
    try { rows = db.prepare('SELECT key, value, rev, updated_at, updated_by FROM app_state ORDER BY key').all(); }
    catch (e) { throw new Error(`${file} is not a Dhee SQLite database (${e.message})`); }
    rows = rows.map(r => ({ key: r.key, value: JSON.parse(r.value), rev: r.rev, updatedAt: r.updated_at, updatedBy: r.updated_by }));
    let meta = [];
    try { meta = db.prepare('SELECT key, value FROM app_meta').all().map(r => ({ key: r.key, value: JSON.parse(r.value) })); } catch (_) { }
    return { rows, meta };
  } finally { db.close(); }
}

(async () => {
  const sqliteFile = arg('from-sqlite');
  if (process.argv.includes('--from-sqlite') && !sqliteFile) { console.error('Usage: npm run migrate -- --from-sqlite <path-to-.sqlite> [--force]'); process.exit(2); }
  const from = sqliteFile ? 'sqlite-file' : String(arg('from', '')).toLowerCase();
  const to = String(arg('to', sqliteFile ? (config.driver === 'both' ? config.primary : config.driver) : '')).toLowerCase();
  if (!DRIVERS.includes(to) || (!sqliteFile && (!DRIVERS.includes(from) || from === to))) {
    console.error('Usage: npm run migrate -- --from-sqlite <file.sqlite>        (import old SQLite data into MYSQL_URL)\n'
      + '       npm run migrate -- --from mysql --to postgres         (or --from postgres --to mysql) [--force]');
    process.exit(2);
  }
  const run = require('./backup').runningServer();
  if (run && !process.argv.includes('--force')) { console.error(`The Dhee server is running (pid ${run.pid}). Stop it first.`); process.exit(1); }
  const opts = { databaseUrl: arg('url', config.databaseUrl), mysql: arg('mysql-url') ? { url: arg('mysql-url') } : undefined };
  const dst = make(to, opts);
  let src = null;
  try {
    let rows, meta;
    if (sqliteFile) {
      const file = path.resolve(process.cwd(), sqliteFile);
      if (!fs.existsSync(file)) { console.error(`SQLite file not found: ${file}`); process.exit(1); }
      ({ rows, meta } = readSqlite(file));
      console.log(`Read ${rows.length} keys from ${file} (read-only).`);
    } else {
      src = make(from, opts); await src.init();
      rows = await src.getAll(); meta = await src.allMeta();
    }
    if (!rows.length) { console.error(`Nothing to copy: the source is empty.`); process.exit(1); }
    await dst.init();
    const existing = await dst.count();
    if (existing && !process.argv.includes('--force')) { console.error(`The ${to} database [${arg('mysql-url') ? 'from --mysql-url' : describe(to)}] already has ${existing} rows. Re-run with --force to overwrite it.`); process.exit(1); }
    if (existing) await dst.wipe();
    await dst.putRows(rows);
    for (const m of meta) await dst.setMeta(m.key, m.value);
    await dst.setMeta('migrated', { at: new Date().toISOString(), from: sqliteFile ? `sqlite:${path.basename(sqliteFile)}` : from });
    const bytes = rows.reduce((s, r) => s + JSON.stringify(r.value).length, 0);
    console.log(`Copied ${rows.length} keys (${(bytes / 1048576).toFixed(1)} MB of JSON) ${sqliteFile ? 'SQLite file' : from} → ${to}.`);
    // verify
    const back = new Map((await dst.getAll()).map(r => [r.key, r]));
    const bad = rows.filter(r => { const b = back.get(r.key); return !b || b.rev !== (r.rev || 1) || JSON.stringify(b.value) !== JSON.stringify(r.value); });
    if (bad.length || back.size !== rows.length) { console.error(`Verification failed for: ${bad.map(r => r.key).join(', ') || `${back.size} of ${rows.length} keys`}`); process.exit(1); }
    const users = back.get('users'), students = back.get('students');
    console.log(`Verified: every key matches (${Array.isArray(users?.value) ? users.value.length : 0} users, ${Array.isArray(students?.value) ? students.value.length : 0} students).`);
  } catch (e) {
    console.error(`Migration failed: ${e.message}`); process.exitCode = 1;
  } finally {
    if (src) await src.close().catch(() => { });
    await dst.close().catch(() => { });
  }
})();
