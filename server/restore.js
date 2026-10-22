/* npm run restore -- <backup file> [--yes] [--force]

   Replaces ALL data of the configured store (DB_DRIVER) with the content of a backup made by
   `npm run backup`, the daily backup, or the admin page (.sqlite or .json.gz — either format can be
   restored into either driver). A bare file name is looked up in BACKUP_DIR.

   · Refuses while the server is running (it keeps the state in memory and would write it back).
     Stop it first (pm2 stop dhee / systemctl stop dhee / Ctrl+C). --force skips that check.
   · Takes a "-prerestore" backup of the current data first, so a wrong restore can be undone.
   · Sessions are cleared: everyone signs in again. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const config = require('./config');
const { createStore } = require('./store');
const { readBackup, createBackup, runningServer } = require('./backup');

(async () => {
  const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!arg) { console.error('Usage: npm run restore -- <backup file> [--yes]'); process.exit(2); }
  let file = path.resolve(arg);
  if (!fs.existsSync(file) && fs.existsSync(path.join(config.backupDir, arg))) file = path.join(config.backupDir, arg);
  if (!fs.existsSync(file)) { console.error(`File not found: ${arg}`); process.exit(2); }

  const run = runningServer();
  if (run && !process.argv.includes('--force')) {
    console.error(`The Dhee server is running (pid ${run.pid}${run.port ? `, port ${run.port}` : ''}). Stop it first, then run the restore again.`);
    process.exit(1);
  }

  let data;
  try { data = readBackup(file); } catch (e) { console.error(`Cannot read the backup: ${e.message}`); process.exit(1); }
  const users = data.rows.find(r => r.key === 'users');
  if (!data.rows.length || !users || !Array.isArray(users.value) || !users.value.length) { console.error('The backup has no users — refusing to restore it.'); process.exit(1); }
  console.log(`Backup: ${path.basename(file)} · ${data.rows.length} keys · ${users.value.length} users`);

  if (!process.argv.includes('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(r => rl.question(`Replace ALL current data in the ${config.driver} store with this backup? Type "yes": `, r));
    rl.close();
    if (ans.trim().toLowerCase() !== 'yes') { console.log('Cancelled.'); process.exit(1); }
  }

  const store = createStore({ log: console });
  try {
    await store.init();
    if (await store.count()) { const b = await createBackup(store, { kind: 'prerestore', log: console }); console.log(`Current data saved first: ${b.file}`); }
    await store.wipe();
    await store.putRows(data.rows);
    for (const m of data.meta) await store.setMeta(m.key, m.value);
    await store.setMeta('restored', { at: new Date().toISOString(), from: path.basename(file) });
    const back = await store.getAll();
    if (back.length !== data.rows.length) throw new Error(`verification failed: ${back.length} of ${data.rows.length} keys present`);
    console.log(`Restored ${back.length} keys into ${store.name}. Start the server again; everyone has to sign in again.`);
  } catch (e) { console.error(`Restore failed: ${e.message}`); process.exitCode = 1; }
  finally { await store.close().catch(() => { }); }
})();
