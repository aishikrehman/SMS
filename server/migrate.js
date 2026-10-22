/* Copy every state row between drivers.

     npm run migrate -- --from sqlite --to postgres
     npm run migrate -- --from postgres --to sqlite
     options: --sqlite <path>   (default SQLITE_PATH or data/dhee.sqlite)
              --url <postgres-url> (default DATABASE_URL)
              --force           overwrite a target that already has data

   Rows keep their revision numbers. Sessions are not copied (users simply sign in again). */
'use strict';
const config = require('./config');
const { make } = require('./store');

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def; }

(async () => {
  const from = String(arg('from', '')).toLowerCase(), to = String(arg('to', '')).toLowerCase();
  if (!['sqlite', 'postgres'].includes(from) || !['sqlite', 'postgres'].includes(to) || from === to) {
    console.error('Usage: npm run migrate -- --from sqlite --to postgres   (or the reverse) [--force]');
    process.exit(2);
  }
  const opts = { sqlitePath: arg('sqlite') ? require('node:path').resolve(config.ROOT, arg('sqlite')) : config.sqlitePath, databaseUrl: arg('url', config.databaseUrl) };
  const src = make(from, opts), dst = make(to, opts);
  try {
    await src.init(); await dst.init();
    const rows = await src.getAll();
    if (!rows.length) { console.error(`Nothing to copy: the ${from} store is empty.`); process.exit(1); }
    const existing = await dst.count();
    if (existing && !process.argv.includes('--force')) { console.error(`The ${to} store already has ${existing} rows. Re-run with --force to overwrite.`); process.exit(1); }
    if (existing) await dst.wipe();
    await dst.putRows(rows);
    const bytes = rows.reduce((s, r) => s + JSON.stringify(r.value).length, 0);
    console.log(`Copied ${rows.length} keys (${(bytes / 1048576).toFixed(1)} MB of JSON) ${from} → ${to}.`);
    // verify
    const back = await dst.getAll();
    const bad = rows.filter(r => { const b = back.find(x => x.key === r.key); return !b || JSON.stringify(b.value) !== JSON.stringify(r.value); });
    if (bad.length) { console.error(`Verification failed for: ${bad.map(r => r.key).join(', ')}`); process.exit(1); }
    console.log('Verified: every key matches.');
  } catch (e) {
    console.error(`Migration failed: ${e.message}`); process.exit(1);
  } finally {
    await src.close().catch(() => { }); await dst.close().catch(() => { });
  }
})();
